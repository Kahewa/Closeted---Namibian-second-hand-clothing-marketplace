import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { uploadImage, sized } from "./cloudinary.js";
import { requireAuth, claimUsername, isAdminUser } from "./auth.js";
import {
  $,
  el,
  toast,
  formatNAD,
  whatsappHref,
  normalizeUsername,
  usernameError,
  openModal,
  closeModal,
  CATEGORIES,
  CONDITIONS,
  CAROUSEL_FEE,
  PAYMENT_DETAILS,
} from "./utils.js";

const MAX_ITEMS = 30;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// sell.html?edit=<carouselId> reopens an existing, not-yet-approved drop.
const editId = new URLSearchParams(location.search).get("edit");

const adminNote = $("[data-admin-note]");
const feeAmountEls = document.querySelectorAll("[data-fee-amount]");
const rowsHost = $("[data-item-rows]");
const addItemBtn = $("[data-add-item]");
const form = $("[data-carousel-form]");
const submitBtn = $("[data-submit-carousel]");
const itemCountEl = $("[data-item-count]");
const whatsappInput = $("[data-whatsapp]");

const usernameBlock = $("[data-username-block]");
const usernameInput = $("[data-username-input]");
const usernameSave = $("[data-username-save]");

const introModal = $("[data-intro-modal]");
const payModal = $("[data-pay-modal]");

feeAmountEls.forEach((elm) => (elm.textContent = formatNAD(CAROUSEL_FEE)));

let currentUser = null;
let profile = {};
let isAdmin = false;
let rowIndex = 0;
let editing = null; // the carousel doc being edited, if any

requireAuth(async (user, loaded) => {
  currentUser = user;
  profile = loaded || {};
  isAdmin = isAdminUser(user);

  adminNote.hidden = !isAdmin;
  usernameBlock.hidden = isAdmin || !!profile.username;

  if (profile.socialLinks?.whatsapp && !whatsappInput.value) {
    whatsappInput.value = profile.socialLinks.whatsapp;
  }
  paintPaymentDetails();

  if (editId) {
    await loadForEditing();
  } else {
    // The fee explainer greets everyone arriving to build a new carousel.
    if (!isAdmin) openModal(introModal);
    if (!rowsHost.children.length) {
      addRow();
      addRow();
    }
  }
});

// ---------------------------------------------------------------------
// Edit mode — only while a carousel is still waiting for approval
// ---------------------------------------------------------------------
async function loadForEditing() {
  try {
    const snap = await getDoc(doc(db, "carousels", editId));
    if (!snap.exists()) {
      toast("That carousel doesn't exist any more.", "error");
      return;
    }
    const data = snap.data();

    if (data.sellerId !== currentUser.uid) {
      toast("That isn't your carousel.", "error");
      location.href = "index.html";
      return;
    }
    // Approved drops are locked — this is the same rule the profile page
    // uses to decide whether to show an edit button at all.
    if (data.status === "approved") {
      toast("This carousel is already live, so it can't be edited any more.", "error");
      setTimeout(() => (location.href = `profile.html?uid=${currentUser.uid}`), 1600);
      return;
    }

    editing = { id: snap.id, ...data };

    $("[data-page-eyebrow]").textContent = "edit your carousel";
    $("[data-page-title]").textContent = "Edit your carousel";
    $("[data-page-intro]").textContent =
      "Change anything you like while it's waiting for approval. Photos you leave alone stay as they are.";
    submitBtn.textContent = "Save changes";
    $("[data-post-note]").innerHTML =
      `<i class="ico ico--note" aria-hidden="true"></i> You can keep editing until this carousel is approved. Once it's live, it's locked.`;

    if (data.sellerWhatsapp) whatsappInput.value = data.sellerWhatsapp;
    (data.items || []).forEach((item) => addRow(item));
    if (!rowsHost.children.length) addRow();
  } catch (err) {
    console.error(err);
    toast("Couldn't open that carousel for editing.", "error");
  }
}

// ---------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------

document.querySelectorAll("[data-intro-close]").forEach((n) =>
  n.addEventListener("click", () => closeModal(introModal))
);
$("[data-intro-go]")?.addEventListener("click", () => closeModal(introModal));

document.querySelectorAll("[data-pay-close]").forEach((n) =>
  n.addEventListener("click", () => closeModal(payModal))
);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!introModal.hidden) closeModal(introModal);
  // The payment dialog isn't Escape-dismissable: it holds the banking
  // details for a carousel that has just been saved.
});

$("[data-pay-done]")?.addEventListener("click", () => {
  location.href = `profile.html?uid=${currentUser.uid}`;
});

$("[data-copy-ref]")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(`@${profile.username}`);
    toast("Reference copied");
  } catch {
    toast("Couldn't copy it. Write it down instead.", "error");
  }
});

// ---------------------------------------------------------------------
// Username — it doubles as the payment reference
// ---------------------------------------------------------------------
usernameSave?.addEventListener("click", async () => {
  const wanted = normalizeUsername(usernameInput.value);
  const problem = usernameError(wanted);
  if (problem) {
    toast(problem, "error");
    return;
  }

  usernameSave.disabled = true;
  usernameSave.classList.add("btn--loading");
  try {
    await claimUsername(currentUser.uid, wanted, profile.username);
    profile = { ...profile, username: wanted };
    usernameBlock.hidden = true;
    paintPaymentDetails();
    toast(`You're @${wanted}`);
  } catch (err) {
    toast(err.message || "Couldn't save that username.", "error");
  } finally {
    usernameSave.disabled = false;
    usernameSave.classList.remove("btn--loading");
  }
});

function paintPaymentDetails() {
  const d = PAYMENT_DETAILS;
  const ref = profile.username ? `@${profile.username}` : "…";
  const set = (sel, value) => {
    const node = $(sel);
    if (node) node.textContent = value;
  };

  set("[data-pay-reference]", ref);
  set("[data-pay-wallet]", d.walletNumber);
  set("[data-pay-bank]", d.bank);
  set("[data-pay-holder]", d.accountHolder);
  set("[data-pay-type]", d.accountType);
  set("[data-pay-number]", d.accountNumber);
  set("[data-pay-branch]", d.branchCode);
  set("[data-pay-cash-number]", d.cashWhatsapp);

  const cashLink = $("[data-pay-cash]");
  if (cashLink) {
    cashLink.href =
      whatsappHref(
        d.cashWhatsapp,
        `Hi! I'd like to pay my N$150 carousel fee in cash. My username is ${ref}.`
      ) || "#";
  }
}

// ---------------------------------------------------------------------
// Item rows
// ---------------------------------------------------------------------
function updateItemCount() {
  const count = rowsHost.children.length;
  itemCountEl.textContent = `${count} item${count === 1 ? "" : "s"} in this carousel`;
  addItemBtn.hidden = count >= MAX_ITEMS;
}

/** @param {object|null} existing - an item already saved on the carousel */
function addRow(existing = null) {
  if (rowsHost.children.length >= MAX_ITEMS) return;
  const id = `item-${rowIndex++}`;

  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    required: !existing,
    "data-field": "image",
  });

  const preview = el(
    "div",
    { class: "item-row__preview" },
    existing?.imageURL
      ? el("img", { src: sized(existing.imageURL, 220, { square: true }), alt: "Current photo", decoding: "async" })
      : el("i", { class: "ico ico--camera ico--lg", "aria-hidden": "true" })
  );

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast("That photo is over 8MB. Try a smaller one.", "error");
      fileInput.value = "";
      return;
    }
    preview.innerHTML = "";
    preview.append(el("img", { src: URL.createObjectURL(file), alt: "Preview" }));
  });

  const option = (value, selected) => el("option", { value, selected: selected || undefined }, value);
  const categorySelect = el("select", { required: true, "data-field": "category" }, [
    el("option", { value: "", disabled: true, selected: !existing }, "Category"),
    ...CATEGORIES.map((c) => option(c, existing?.category === c)),
  ]);
  const conditionSelect = el("select", { required: true, "data-field": "condition" }, [
    el("option", { value: "", disabled: true, selected: !existing }, "Condition"),
    ...CONDITIONS.map((c) => option(c, existing?.condition === c)),
  ]);

  const sizeInput = el("input", { type: "text", placeholder: "Size (e.g. M, UK 7)", required: true, maxlength: 20, "data-field": "size", value: existing?.size || "" });
  const storeInput = el("input", { type: "text", placeholder: "Store / brand (e.g. Mr Price)", required: true, maxlength: 40, "data-field": "store", value: existing?.store || "" });
  const priceInput = el("input", { type: "number", placeholder: "Price (N$)", min: "1", step: "0.01", required: true, "data-field": "price", value: existing?.price ?? "" });
  const notesInput = el("textarea", { placeholder: "Anything else buyers should know? (optional)", maxlength: 200, rows: 2, "data-field": "notes" });
  notesInput.value = existing?.notes || "";

  const removeBtn = el(
    "button",
    {
      class: "item-row__remove",
      type: "button",
      "aria-label": "Remove this item",
      onClick: () => {
        row.remove();
        updateItemCount();
      },
    },
    el("i", { class: "ico ico--close", "aria-hidden": "true" })
  );

  const row = el("div", { class: "item-row", id }, [
    el("label", { class: "item-row__photo" }, [fileInput, preview]),
    el("div", { class: "item-row__fields" }, [
      el("div", { class: "item-row__grid" }, [categorySelect, conditionSelect, sizeInput, storeInput, priceInput]),
      notesInput,
    ]),
    removeBtn,
  ]);

  // Remembering the saved item lets the submit handler reuse its already
  // uploaded photo when the seller doesn't pick a new file.
  row._existing = existing;

  rowsHost.append(row);
  updateItemCount();
}

addItemBtn.addEventListener("click", () => addRow());

// ---------------------------------------------------------------------
// Post / save
// ---------------------------------------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  if (!isAdmin && !profile.username) {
    usernameBlock.hidden = false;
    usernameInput.focus();
    toast("Pick a username first. It's the reference you pay with.", "error");
    return;
  }

  const rows = Array.from(rowsHost.children);
  if (!rows.length) {
    toast("Add at least one item.", "error");
    return;
  }

  const whatsapp = whatsappInput.value.trim();
  if (!whatsappHref(whatsapp)) {
    toast("Add a WhatsApp number so buyers can reach you (e.g. 081 234 5678).", "error");
    whatsappInput.focus();
    return;
  }

  const drafts = [];
  for (const row of rows) {
    const get = (field) => row.querySelector(`[data-field="${field}"]`);
    const file = get("image").files?.[0];
    const kept = row._existing;
    const category = get("category").value;
    const condition = get("condition").value;
    const size = get("size").value.trim();
    const store = get("store").value.trim();
    const price = Number(get("price").value);

    if ((!file && !kept) || !category || !condition || !size || !store || !price || price <= 0) {
      toast("Fill in every field (photo, category, size, store, condition, price) for each item.", "error");
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    drafts.push({ file, kept, category, condition, size, store, price, notes: get("notes").value.trim() });
  }

  submitBtn.disabled = true;
  submitBtn.classList.add("btn--loading");
  const busyLabel = editing ? "Saving changes…" : "Posting your carousel…";
  submitBtn.textContent = busyLabel;

  try {
    const carouselRef = editing ? doc(db, "carousels", editing.id) : doc(collection(db, "carousels"));

    const items = await Promise.all(
      drafts.map(async (draft, i) => {
        // Only upload when there's a new file; otherwise keep the photo
        // that's already on Cloudinary.
        let imageURL = draft.kept?.imageURL;
        let publicId = draft.kept?.publicId;
        if (draft.file) {
          const uploaded = await uploadImage(
            draft.file,
            `carousels/${currentUser.uid}/${carouselRef.id}`
          );
          imageURL = uploaded.url;
          publicId = uploaded.publicId;
        }

        return {
          id: draft.kept?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`),
          imageURL,
          publicId,
          category: draft.category,
          size: draft.size,
          store: draft.store,
          condition: draft.condition,
          price: draft.price,
          notes: draft.notes,
          sold: draft.kept?.sold || false,
        };
      })
    );

    const fresh = await getDoc(doc(db, "users", currentUser.uid));
    const latest = fresh.exists() ? fresh.data() : profile;

    if (editing) {
      // status is deliberately not written here — the rules reject any
      // seller update that changes it.
      await updateDoc(carouselRef, { items, sellerWhatsapp: whatsapp });
      toast("Changes saved");
      setTimeout(() => (location.href = `profile.html?uid=${currentUser.uid}`), 900);
    } else {
      await setDoc(carouselRef, {
        sellerId: currentUser.uid,
        sellerName: latest.displayName || currentUser.displayName || "Closet Seller",
        sellerUsername: latest.username || "",
        sellerPhotoURL: latest.profilePicURL || "",
        sellerWhatsapp: whatsapp,
        status: isAdmin ? "approved" : "pending",
        paymentRef: latest.username ? `@${latest.username}` : "",
        items,
        createdAt: serverTimestamp(),
      });

      if (isAdmin) {
        toast("Your carousel is live!");
        setTimeout(() => (location.href = `profile.html?uid=${currentUser.uid}`), 900);
      } else {
        // Saved — now show where to send the money.
        paintPaymentDetails();
        openModal(payModal);
      }
    }

    if (whatsapp !== latest.socialLinks?.whatsapp) {
      try {
        await updateDoc(doc(db, "users", currentUser.uid), { "socialLinks.whatsapp": whatsapp });
      } catch (err) {
        console.warn("Couldn't save the number to your profile (carousel still saved):", err);
      }
    }
  } catch (err) {
    console.error(err);
    // "Missing or insufficient permissions" on its own tells the seller
    // nothing, so name the two things that actually cause it.
    const denied = err?.code === "permission-denied" || /insufficient permissions/i.test(err?.message || "");
    toast(
      denied
        ? "Firestore turned that down. Either this account is banned, or the security rules need redeploying (firebase deploy --only firestore:rules)."
        : err.message || "Couldn't save your carousel. Please try again.",
      "error"
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn--loading");
    submitBtn.textContent = editing ? "Save changes" : "Post my carousel";
  }
});
