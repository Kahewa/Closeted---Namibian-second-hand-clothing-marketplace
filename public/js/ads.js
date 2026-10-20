import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { sized } from "./cloudinary.js";
import { $, el, whatsappHref, AD_SLOTS } from "./utils.js";

// The hero's Local Business Feature: three poster spaces. A filled one
// opens a pop-up with the business's description and WhatsApp; an empty
// one opens the advertising prices, with a WhatsApp button to the shop
// (the same chat as the "Advertise your business" patch, once feed.js has
// found the number).

const slotsEl = $("[data-ad-slots]");
const modal = $("[data-ad-modal]");
const priceModal = $("[data-adprice-modal]");
const advertiseLink = () => $("[data-advertise]");

paintEmpty();
load();

function paintEmpty() {
  slotsEl.replaceChildren(...AD_SLOTS.map(() => emptySlot()));
}

async function load() {
  try {
    const ads = await Promise.all(
      AD_SLOTS.map(async (id) => {
        const snap = await getDoc(doc(db, "ads", id));
        return snap.exists() && snap.data().imageURL ? { id, ...snap.data() } : null;
      })
    );
    slotsEl.replaceChildren(...ads.map((ad) => (ad ? posterSlot(ad) : emptySlot())));
  } catch (err) {
    console.warn("Couldn't load the featured businesses:", err);
  }
}

function emptySlot() {
  const slot = el("button", { type: "button", class: "biz-slot biz-slot--empty" }, [
    el("i", { class: "ico ico--plus", "aria-hidden": "true" }),
    el("span", {}, "Advertise your business here"),
  ]);
  slot.addEventListener("click", openPricing);
  return slot;
}

function posterSlot(ad) {
  const label = ad.name ? `${ad.name} — see details` : "Featured business — see details";
  const slot = el("button", { type: "button", class: "biz-slot", "aria-label": label }, [
    el("img", { src: sized(ad.imageURL, 480), alt: "", loading: "lazy", decoding: "async" }),
  ]);
  slot.addEventListener("click", () => openAd(ad));
  return slot;
}

function openAd(ad) {
  $("[data-ad-modal-img]").src = sized(ad.imageURL, 900);
  $("[data-ad-modal-img]").alt = ad.name ? `${ad.name} poster` : "Business poster";
  $("[data-ad-modal-title]").textContent = ad.name || "Featured business";
  $("[data-ad-modal-desc]").textContent = ad.description || "";
  const wa = $("[data-ad-modal-wa]");
  const href = whatsappHref(ad.whatsapp, `Hi! I saw your business on Closeted By Grace.`);
  wa.hidden = !href;
  if (href) {
    wa.href = href;
    $("[data-ad-modal-wa-label]").textContent = `WhatsApp ${ad.whatsapp}`;
  }
  show(modal);
}

// the "Advertise your business" patch shows the same prices first
advertiseLink()?.addEventListener("click", (e) => {
  e.preventDefault();
  openPricing();
});

function openPricing() {
  const link = advertiseLink();
  const wa = $("[data-adprice-wa]");
  const href = link?.dataset.ready ? link.href : null;
  wa.hidden = !href;
  if (href) wa.href = href;
  show(priceModal);
}

const show = (dialog) => (typeof dialog.showModal === "function" ? dialog.showModal() : dialog.setAttribute("open", ""));
const hide = (dialog) => (typeof dialog.close === "function" ? dialog.close() : dialog.removeAttribute("open"));

[
  [modal, "[data-ad-close]"],
  [priceModal, "[data-adprice-close]"],
].forEach(([dialog, closer]) => {
  $(closer).addEventListener("click", () => hide(dialog));
  // a click on the dimmed backdrop (the dialog itself, outside its content) closes it
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) hide(dialog);
  });
});
