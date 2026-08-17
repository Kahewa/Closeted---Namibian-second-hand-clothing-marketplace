import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { uploadImage } from "./cloudinary.js";
import { renderCarouselCard } from "./carousel-card.js";
import { ensureUserDoc } from "./auth.js";
import { $, el, toast, initials, whatsappHref, isValidUrl } from "./utils.js";

const params = new URLSearchParams(location.search);
let targetUid = params.get("uid");
let currentUser = null;
let profileData = null;

const loadingState = $("[data-profile-loading]");
const signedOutState = $("[data-profile-signed-out]");
const content = $("[data-profile-content]");

const avatarImg = $("[data-avatar]");
const avatarUploadLabel = $("[data-avatar-upload]");
const avatarInput = $("[data-avatar-input]");
const nameEl = $("[data-display-name]");
const bioView = $("[data-bio-view]");
const bioEdit = $("[data-bio-edit]");
const socialView = $("[data-social-view]");
const editFormWrap = $("[data-edit-form]");
const editToggleBtn = $("[data-edit-toggle]");
const saveBtn = $("[data-save-profile]");
const cancelBtn = $("[data-cancel-edit]");
const profileHeader = $("[data-profile-header]");
const listingsHost = $("[data-listings]");
const listingsEmpty = $("[data-listings-empty]");
const sellCta = $("[data-sell-cta]");

const socialFields = ["instagram", "tiktok", "facebook", "whatsapp"];
const socialIcon = { instagram: "📸", tiktok: "🎵", facebook: "📘", whatsapp: "💬" };
const socialLabel = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", whatsapp: "WhatsApp" };

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!targetUid) {
    if (!user) {
      loadingState.hidden = true;
      signedOutState.hidden = false;
      return;
    }
    targetUid = user.uid;
    history.replaceState({}, "", `profile.html?uid=${targetUid}`);
  }
  await loadProfile();
});

async function loadProfile() {
  try {
    let snap = await getDoc(doc(db, "users", targetUid));

    // Viewing your own profile with no users/{uid} doc means the one that
    // should have been written at sign-up never landed — create it now
    // rather than dead-ending on "this closet doesn't exist".
    if (!snap.exists() && currentUser && currentUser.uid === targetUid) {
      await ensureUserDoc(currentUser);
      snap = await getDoc(doc(db, "users", targetUid));
    }

    if (!snap.exists()) {
      loadingState.textContent = "This closet doesn't exist (yet).";
      return;
    }
    profileData = snap.data();
    paintView();
    loadingState.hidden = true;
    content.hidden = false;
    loadListings();
  } catch (err) {
    console.error(err);
    loadingState.innerHTML = `Couldn't load this profile.<br><small>${err.message}</small>`;
  }
}

function isOwner() {
  return currentUser && currentUser.uid === targetUid;
}

function paintView() {
  if (profileData.profilePicURL) {
    avatarImg.src = profileData.profilePicURL;
    avatarImg.hidden = false;
  } else {
    avatarImg.hidden = true;
  }
  avatarImg.parentElement.querySelector("[data-avatar-initials]").textContent = initials(profileData.displayName);
  avatarImg.parentElement.querySelector("[data-avatar-initials]").hidden = !!profileData.profilePicURL;

  nameEl.textContent = profileData.displayName || "Closet Seller";
  bioView.textContent = profileData.bio || (isOwner() ? "Add a bio so buyers know who they're shopping from." : "No bio yet.");
  bioEdit.value = profileData.bio || "";

  socialView.innerHTML = "";
  const links = profileData.socialLinks || {};
  const anyLinks = socialFields.some((f) => links[f]);
  if (!anyLinks) {
    socialView.append(el("p", { class: "profile-socials__empty" }, isOwner() ? "Add your social links so people can reach you." : ""));
  }
  socialFields.forEach((field) => {
    const value = links[field];
    if (!value) return;
    const href = field === "whatsapp" ? whatsappHref(value) : isValidUrl(value) ? value : `https://${value.replace(/^https?:\/\//, "")}`;
    socialView.append(
      el("a", { class: "social-btn", href, target: "_blank", rel: "noopener noreferrer" }, [
        el("span", {}, socialIcon[field]),
        el("span", {}, socialLabel[field]),
      ])
    );
    editFormWrap.querySelector(`[name="${field}"]`).value = value;
  });

  if (isOwner()) {
    editToggleBtn.hidden = false;
    avatarUploadLabel.hidden = false;
    sellCta.hidden = false;
  } else {
    editToggleBtn.hidden = true;
    avatarUploadLabel.hidden = true;
    sellCta.hidden = true;
  }
}

editToggleBtn?.addEventListener("click", () => {
  profileHeader.classList.add("profile-header--editing");
});
cancelBtn?.addEventListener("click", () => {
  paintView();
  profileHeader.classList.remove("profile-header--editing");
});

saveBtn?.addEventListener("click", async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const socialLinks = {};
    socialFields.forEach((field) => {
      socialLinks[field] = editFormWrap.querySelector(`[name="${field}"]`).value.trim();
    });
    await updateDoc(doc(db, "users", targetUid), {
      bio: bioEdit.value.trim().slice(0, 280),
      socialLinks,
    });
    profileData = { ...profileData, bio: bioEdit.value.trim().slice(0, 280), socialLinks };
    paintView();
    profileHeader.classList.remove("profile-header--editing");
    toast("Profile updated ✨");
  } catch (err) {
    console.error(err);
    toast("Couldn't save your profile. Please try again.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 Save changes";
  }
});

avatarInput?.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  if (!file || !isOwner()) return;
  if (file.size > 5 * 1024 * 1024) {
    toast("That photo is over 5MB — try a smaller one.", "error");
    return;
  }
  try {
    avatarUploadLabel.classList.add("avatar-upload--busy");
    const { url } = await uploadImage(file, `profile-pics/${targetUid}`);
    await updateDoc(doc(db, "users", targetUid), { profilePicURL: url });
    profileData.profilePicURL = url;
    paintView();
    toast("Profile picture updated ✨");
  } catch (err) {
    console.error(err);
    toast(err.message || "Couldn't upload that photo. Please try again.", "error");
  } finally {
    avatarUploadLabel.classList.remove("avatar-upload--busy");
  }
});

async function loadListings() {
  try {
    const snap = await getDocs(
      query(collection(db, "carousels"), where("sellerId", "==", targetUid), orderBy("createdAt", "desc"))
    );
    listingsHost.innerHTML = "";
    if (snap.empty) {
      listingsEmpty.hidden = false;
      listingsEmpty.querySelector("[data-listings-empty-body]").textContent = isOwner()
        ? "You haven't dropped a carousel yet — your closet is waiting."
        : "Nothing listed yet — check back soon.";
      return;
    }
    listingsEmpty.hidden = true;
    snap.forEach((docSnap) => {
      const carousel = { id: docSnap.id, ...docSnap.data() };
      listingsHost.append(renderCarouselCard(carousel, currentUser, { onDeleted: loadListings }));
    });
  } catch (err) {
    console.error(err);
    listingsEmpty.hidden = false;
    listingsEmpty.querySelector("[data-listings-empty-body]").innerHTML =
      `Couldn't load listings.<br><small>${err.message}</small>` +
      (err.message?.includes("index")
        ? "<br><small>Firestore needs a one-time composite index for this query — open your browser console and click the link Firebase printed there, or deploy <code>firebase/firestore.indexes.json</code>.</small>"
        : "");
  }
}
