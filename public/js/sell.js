import { auth, db, storage } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js";
import { requireAuth } from "./auth.js";
import { $, el, toast, formatNAD, CATEGORIES, CONDITIONS, CAROUSEL_FEE } from "./utils.js";

const MAX_ITEMS = 30;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const feeStep = $("[data-step='fee']");
const itemsStep = $("[data-step='items']");
const payBtn = $("[data-pay-btn]");
const feeAmountEls = document.querySelectorAll("[data-fee-amount]");
const rowsHost = $("[data-item-rows]");
const addItemBtn = $("[data-add-item]");
const form = $("[data-carousel-form]");
const submitBtn = $("[data-submit-carousel]");
const itemCountEl = $("[data-item-count]");

feeAmountEls.forEach((elm) => (elm.textContent = formatNAD(CAROUSEL_FEE)));

let currentUser = null;
let paidOrderId = null;
let rowIndex = 0;

requireAuth((user) => {
  currentUser = user;
});

// ---------------------------------------------------------------------
// Step 1: the (demo) N$150 listing fee
// ---------------------------------------------------------------------
payBtn.addEventListener("click", async () => {
  payBtn.disabled = true;
  payBtn.classList.add("btn--loading");
  payBtn.textContent = "Processing…";

  try {
    const idToken = await auth.currentUser.getIdToken();
    const initiateRes = await fetch("/api/carousel-fee/initiate", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!initiateRes.ok) throw new Error((await initiateRes.json()).error || "Couldn't start the order.");
    const order = await initiateRes.json();

    // Tiny fake delay so the "processing" state actually reads as a
    // payment happening — replace this whole block with a real gateway
    // redirect/callback later. See server/routes/payments.js.
    await new Promise((resolve) => setTimeout(resolve, 900));

    const confirmRes = await fetch(`/api/carousel-fee/confirm-demo/${order.orderId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!confirmRes.ok) throw new Error((await confirmRes.json()).error || "Couldn't confirm the order.");

    paidOrderId = order.orderId;
    feeStep.hidden = true;
    itemsStep.hidden = false;
    itemsStep.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Payment received (demo) — your carousel is unlocked! ✨");

    if (!rowsHost.children.length) {
      addRow();
      addRow();
    }
  } catch (err) {
    console.error(err);
    toast(err.message || "Something went wrong. Please try again.", "error");
  } finally {
    payBtn.disabled = false;
    payBtn.classList.remove("btn--loading");
    payBtn.textContent = `Pay ${formatNAD(CAROUSEL_FEE)} (demo)`;
  }
});

// ---------------------------------------------------------------------
// Step 2: add items to the carousel
// ---------------------------------------------------------------------
function updateItemCount() {
  const count = rowsHost.children.length;
  itemCountEl.textContent = `${count} item${count === 1 ? "" : "s"} in this carousel`;
  addItemBtn.hidden = count >= MAX_ITEMS;
}

function addRow() {
  if (rowsHost.children.length >= MAX_ITEMS) return;
  const id = `item-${rowIndex++}`;

  const fileInput = el("input", { type: "file", accept: "image/*", required: true, "data-field": "image" });
  const preview = el("div", { class: "item-row__preview" }, el("span", {}, "📷"));

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast("That photo is over 8MB — try a smaller one.", "error");
      fileInput.value = "";
      return;
    }
    preview.innerHTML = "";
    preview.append(el("img", { src: URL.createObjectURL(file), alt: "Preview" }));
  });

  const categorySelect = el(
    "select",
    { required: true, "data-field": "category" },
    [el("option", { value: "", disabled: true, selected: true }, "Category"), ...CATEGORIES.map((c) => el("option", { value: c }, c))]
  );

  const conditionSelect = el(
    "select",
    { required: true, "data-field": "condition" },
    [el("option", { value: "", disabled: true, selected: true }, "Condition"), ...CONDITIONS.map((c) => el("option", { value: c }, c))]
  );

  const sizeInput = el("input", { type: "text", placeholder: "Size (e.g. M, UK 7)", required: true, maxlength: 20, "data-field": "size" });
  const storeInput = el("input", { type: "text", placeholder: "Store / brand (e.g. Mr Price)", required: true, maxlength: 40, "data-field": "store" });
  const priceInput = el("input", { type: "number", placeholder: "Price (N$)", min: "1", step: "0.01", required: true, "data-field": "price" });
  const notesInput = el("textarea", { placeholder: "Anything else buyers should know? (optional)", maxlength: 200, rows: 2, "data-field": "notes" });

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
    "✕"
  );

  const row = el("div", { class: "item-row", id }, [
    el("label", { class: "item-row__photo" }, [fileInput, preview]),
    el("div", { class: "item-row__fields" }, [
      el("div", { class: "item-row__grid" }, [categorySelect, conditionSelect, sizeInput, storeInput, priceInput]),
      notesInput,
    ]),
    removeBtn,
  ]);

  rowsHost.append(row);
  updateItemCount();
}

addItemBtn.addEventListener("click", addRow);

// ---------------------------------------------------------------------
// Submit: upload photos, write the carousel doc
// ---------------------------------------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser || !paidOrderId) {
    toast("Please pay the listing fee first.", "error");
    return;
  }
  const rows = Array.from(rowsHost.children);
  if (!rows.length) {
    toast("Add at least one item.", "error");
    return;
  }

  const drafts = [];
  for (const row of rows) {
    const get = (field) => row.querySelector(`[data-field="${field}"]`);
    const file = get("image").files?.[0];
    const category = get("category").value;
    const condition = get("condition").value;
    const size = get("size").value.trim();
    const store = get("store").value.trim();
    const price = Number(get("price").value);

    if (!file || !category || !condition || !size || !store || !price || price <= 0) {
      toast("Fill in every field (photo, category, size, store, condition, price) for each item.", "error");
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    drafts.push({ file, category, condition, size, store, price, notes: get("notes").value.trim() });
  }

  submitBtn.disabled = true;
  submitBtn.classList.add("btn--loading");
  submitBtn.textContent = "Posting your carousel…";

  try {
    const carouselRef = doc(collection(db, "carousels"));
    const items = await Promise.all(
      drafts.map(async (draft, i) => {
        const itemId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`;
        const ext = (draft.file.name.split(".").pop() || "jpg").toLowerCase();
        const storagePath = `carousels/${currentUser.uid}/${carouselRef.id}/${itemId}.${ext}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, draft.file, { contentType: draft.file.type });
        const imageURL = await getDownloadURL(storageRef);
        return {
          id: itemId,
          imageURL,
          storagePath,
          category: draft.category,
          size: draft.size,
          store: draft.store,
          condition: draft.condition,
          price: draft.price,
          notes: draft.notes,
          sold: false,
        };
      })
    );

    const userSnap = await getDoc(doc(db, "users", currentUser.uid));
    const profile = userSnap.exists() ? userSnap.data() : {};

    await setDoc(carouselRef, {
      sellerId: currentUser.uid,
      sellerName: profile.displayName || currentUser.displayName || "Closet Seller",
      sellerPhotoURL: profile.profilePicURL || "",
      orderId: paidOrderId,
      items,
      createdAt: serverTimestamp(),
    });

    toast("Your carousel is live! 🎉");
    setTimeout(() => {
      location.href = `profile.html?uid=${currentUser.uid}`;
    }, 900);
  } catch (err) {
    console.error(err);
    toast(err.message || "Couldn't post your carousel. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn--loading");
    submitBtn.textContent = "🚀 Post my carousel";
  }
});
