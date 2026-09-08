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
import { uploadImage, sized } from "./cloudinary.js";
import { renderCarouselCard } from "./carousel-card.js";
import {
  ensureUserDoc,
  claimUsername,
  uidForUsername,
  deleteOwnAccount,
  isAdminUser,
} from "./auth.js";
import {
  $,
  el,
  toast,
  initials,
  whatsappHref,
  isValidUrl,
  normalizeUsername,
  usernameError,
  PAYMENT_DETAILS,
} from "./utils.js";

const params = new URLSearchParams(location.search);
let targetUid = params.get("uid");
const targetUsername = params.get("u");
let currentUser = null;
let profileData = null;

const loadingState = $("[data-profile-loading]");
const signedOutState = $("[data-profile-signed-out]");
const content = $("[data-profile-content]");

const avatarImg = $("[data-avatar]");
const avatarUploadBadge = $("[data-avatar-upload]");
const avatarInput = $("[data-avatar-input]");
const nameEl = $("[data-display-name]");
const usernameView = $("[data-username-view]");
const usernameEdit = $("[data-username-edit]");
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
const pinnedPay = $("[data-pinned-pay]");
const dangerZone = $("[data-danger-zone]");
const visitorWhatsappBtn = $("[data-visitor-whatsapp]");
const shareProfileBtn = $("[data-share-profile]");

const socialFields = ["instagram", "tiktok", "facebook", "whatsapp"];
const socialIcon = { instagram: "instagram", tiktok: "tiktok", facebook: "facebook", whatsapp: "chat" };
const socialLabel = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", whatsapp: "WhatsApp" };

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  // profile.html?u=grace.closet resolves the username to a uid first
  if (!targetUid && targetUsername) {
    targetUid = await uidForUsername(targetUsername);
    if (!targetUid) {
      loadingState.textContent = `No closet found for @${normalizeUsername(targetUsername)}.`;
      return;
    }
    history.replaceState({}, "", `profile.html?uid=${targetUid}`);
  }

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
  return !!(currentUser && targetUid && currentUser.uid === targetUid);
}

function paintView() {
  const owner = isOwner();

  if (profileData.profilePicURL) {
    avatarImg.src = sized(profileData.profilePicURL, 240, { square: true });
    avatarImg.hidden = false;
  } else {
    avatarImg.hidden = true;
  }
  const initialsEl = avatarImg.parentElement.querySelector("[data-avatar-initials]");
  if (initialsEl) {
    initialsEl.textContent = initials(profileData.displayName);
    initialsEl.hidden = !!profileData.profilePicURL;
  }

  nameEl.textContent = profileData.displayName || "Closet Seller";

  usernameView.textContent = profileData.username
    ? `@${profileData.username}`
    : owner
      ? "no username yet — add one so people can find you"
      : "";
  usernameEdit.value = profileData.username || "";

  bioView.textContent = profileData.bio || (owner ? "Add a bio so buyers know who they're shopping from." : "No bio yet.");
  bioEdit.value = profileData.bio || "";

  socialView.innerHTML = "";
  const links = profileData.socialLinks || {};
  const anyLinks = socialFields.some((f) => links[f]);
  if (!anyLinks) {
    socialView.append(el("p", { class: "profile-socials__empty" }, owner ? "Add your social links so people can reach you." : ""));
  }
  socialFields.forEach((field) => {
    const value = links[field];
    if (!value) return;
    const href = field === "whatsapp" ? whatsappHref(value) : isValidUrl(value) ? value : `https://${value.replace(/^https?:\/\//, "")}`;
    socialView.append(
      el("a", { class: "social-btn", href, target: "_blank", rel: "noopener noreferrer" }, [
        el("i", { class: `ico ico--${socialIcon[field]}`, "aria-hidden": "true" }),
        el("span", {}, socialLabel[field]),
      ])
    );
    const fieldInput = editFormWrap.querySelector(`[name="${field}"]`);
    if (fieldInput) fieldInput.value = value;
  });

  // Owner vs Visitor visibility: non-owners cannot edit or delete
  if (editToggleBtn) editToggleBtn.hidden = !owner;
  if (avatarUploadBadge) avatarUploadBadge.hidden = !owner;
  if (sellCta) sellCta.hidden = !owner;
  if (dangerZone) dangerZone.hidden = !owner;

  // Ensure edit form is closed and hidden for non-owners
  profileHeader.classList.remove("profile-header--editing");
  if (editFormWrap) editFormWrap.hidden = !owner;

  // Visitor WhatsApp action
  if (visitorWhatsappBtn) {
    if (!owner && links.whatsapp) {
      visitorWhatsappBtn.href = whatsappHref(
        links.whatsapp,
        `Hi ${profileData.displayName || ""}! I saw your closet on Closet Sales Namibia and wanted to enquire about your items.`
      );
      visitorWhatsappBtn.hidden = false;
    } else {
      visitorWhatsappBtn.hidden = true;
    }
  }

  // Window title update
  if (owner) {
    profileHeader.setAttribute("data-win", "MY PROFILE & BIO");
  } else {
    profileHeader.setAttribute("data-win", profileData.username ? `@${profileData.username}'S CLOSET & BIO` : "SELLER PROFILE & BIO");
  }
}

editToggleBtn?.addEventListener("click", () => {
  if (!isOwner()) return;
  profileHeader.classList.add("profile-header--editing");
  if (editFormWrap) editFormWrap.hidden = false;
});

cancelBtn?.addEventListener("click", () => {
  paintView();
  profileHeader.classList.remove("profile-header--editing");
  if (editFormWrap) editFormWrap.hidden = true;
});

saveBtn?.addEventListener("click", async () => {
  if (!isOwner()) {
    toast("You can only edit your own profile.", "error");
    return;
  }
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const wantedName = normalizeUsername(usernameEdit.value);
    if (wantedName && wantedName !== (profileData.username || "")) {
      const problem = usernameError(wantedName);
      if (problem) throw new Error(problem);
      await claimUsername(targetUid, wantedName, profileData.username);
      profileData.username = wantedName;
    }

    const socialLinks = {};
    socialFields.forEach((field) => {
      const fieldInput = editFormWrap.querySelector(`[name="${field}"]`);
      socialLinks[field] = fieldInput ? fieldInput.value.trim() : "";
    });
    await updateDoc(doc(db, "users", targetUid), {
      bio: bioEdit.value.trim().slice(0, 280),
      socialLinks,
    });
    profileData = { ...profileData, bio: bioEdit.value.trim().slice(0, 280), socialLinks };
    paintView();
    profileHeader.classList.remove("profile-header--editing");
    if (editFormWrap) editFormWrap.hidden = true;
    toast("Profile updated");
  } catch (err) {
    console.error(err);
    toast(err.message || "Couldn't save your profile. Please try again.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="ico ico--check" aria-hidden="true"></i> Save changes';
  }
});

avatarInput?.addEventListener("change", async () => {
  if (!isOwner()) {
    toast("You can only change your own profile photo.", "error");
    return;
  }
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast("That photo is over 5MB — try a smaller one.", "error");
    return;
  }
  try {
    avatarUploadBadge?.classList.add("avatar-upload-badge--busy");
    const { url } = await uploadImage(file, `profile-pics/${targetUid}`);
    await updateDoc(doc(db, "users", targetUid), { profilePicURL: url });
    profileData.profilePicURL = url;
    paintView();
    toast("Profile picture updated");
  } catch (err) {
    console.error(err);
    toast(err.message || "Couldn't upload that photo. Please try again.", "error");
  } finally {
    avatarUploadBadge?.classList.remove("avatar-upload-badge--busy");
  }
});

shareProfileBtn?.addEventListener("click", async () => {
  const shareUrl = location.href;
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      toast("Closet profile link copied to clipboard!");
    } else {
      toast("Profile URL: " + shareUrl);
    }
  } catch (_) {
    toast("Profile URL: " + shareUrl);
  }
});

// ---------------------------------------------------------------------
// Delete my account
// ---------------------------------------------------------------------
$("[data-delete-account]")?.addEventListener("click", async () => {
  if (!isOwner() || !currentUser) return;
  if (!confirm("Delete your account, your username and all of your carousels? This can't be undone.")) return;
  if (!confirm("Really delete everything? Last chance.")) return;

  try {
    await deleteOwnAccount(currentUser);
    alert("Your account has been deleted. Take care.");
    location.href = "index.html";
  } catch (err) {
    console.error(err);
    // Firebase refuses to delete an auth account on a stale session.
    if (err?.code === "auth/requires-recent-login") {
      toast("For security, log out and back in, then delete again.", "error");
    } else {
      toast(err.message || "Couldn't delete your account.", "error");
    }
  }
});

// ---------------------------------------------------------------------
// Pinned payment details — shown to the owner while anything is pending
// ---------------------------------------------------------------------
function paintPinnedPayment(waitingCount) {
  if (!isOwner() || waitingCount < 1) {
    pinnedPay.hidden = true;
    return;
  }

  const d = PAYMENT_DETAILS;
  const ref = profileData.username ? `@${profileData.username}` : "— set a username —";
  const set = (sel, value) => {
    const node = pinnedPay.querySelector(sel);
    if (node) node.textContent = value;
  };

  set("[data-approval-count]", waitingCount);
  set("[data-pinned-ref]", ref);
  set("[data-pay-wallet]", d.walletNumber);
  set("[data-pay-bank]", d.bank);
  set("[data-pay-holder]", d.accountHolder);
  set("[data-pay-type]", d.accountType);
  set("[data-pay-number]", d.accountNumber);
  set("[data-pay-branch]", d.branchCode);
  set("[data-pay-cash-number]", d.cashWhatsapp);

  const cash = pinnedPay.querySelector("[data-pay-cash]");
  if (cash) {
    cash.href =
      whatsappHref(
        d.cashWhatsapp,
        `Hi! I'd like to pay my N$150 carousel fee in cash. My username is ${ref}.`
      ) || "#";
  }

  pinnedPay.hidden = false;
}

// ---------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------
async function loadListings() {
  try {
    const snap = await getDocs(
      query(collection(db, "carousels"), where("sellerId", "==", targetUid), orderBy("createdAt", "desc"))
    );

    // Only the owner (and the admin) see drops that aren't approved yet.
    const canSeeAll = isOwner() || isAdminUser(currentUser);
    const carousels = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => canSeeAll || (c.status || "approved") === "approved");

    // Anything unpaid keeps the banking details pinned to the top of the
    // page, so the seller never has to hunt for where to send the money.
    const waiting = carousels.filter((c) => c.status === "pending").length;
    paintPinnedPayment(waiting);

    listingsHost.innerHTML = "";
    if (!carousels.length) {
      listingsEmpty.hidden = false;
      listingsEmpty.querySelector("[data-listings-empty-body]").textContent = isOwner()
        ? "You haven't dropped a carousel yet — your closet is waiting."
        : "Nothing listed yet — check back soon.";
      return;
    }
    listingsEmpty.hidden = true;
    carousels.forEach((carousel) => {
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
