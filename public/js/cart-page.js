import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { sized } from "./cloudinary.js";
import { cartIds, cleanIds, keepOnly, removeFromCart, cartLink } from "./cart.js";
import { itemTitle } from "./item-card.js";
import { $, el, formatNAD, whatsappHref, SHOP_WHATSAPP } from "./utils.js";

// cart.html?items=a,b,c is a cart someone sent over WhatsApp — shown
// read-only, exactly as they picked it. Without it, this is the visitor's
// own cart from this browser.
const shared = new URLSearchParams(location.search).get("items");
const sharedIds = shared === null ? null : cleanIds(shared.split(","));

const list = $("[data-cart-list]");
const loading = $("[data-cart-loading]");
const empty = $("[data-cart-empty]");
const summary = $("[data-cart-summary]");
const sendBtn = $("[data-cart-send]");

let items = []; // [{ id, missing } | item]

if (sharedIds) {
  $("[data-cart-eyebrow]").textContent = "Shared cart";
  $("[data-cart-title]").textContent = "A Shopper's Cart";
  $("[data-cart-note]").textContent =
    "The pieces a shopper picked and sent you. Prices and sold status are live — anything sold or deleted since is flagged.";
  $("[data-cart-empty-title]").textContent = "Nothing in this cart";
  $("[data-cart-empty-body]").textContent = "The link didn't include any pieces that still exist.";
  sendBtn.hidden = true;
}

load(sharedIds || cartIds());

async function load(ids) {
  try {
    items = await Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, "items", id));
        return snap.exists() ? { id, ...snap.data() } : { id, missing: true };
      })
    );
    // the admin deleted these — they can't come back, so drop them
    if (!sharedIds) {
      keepOnly(items.filter((i) => !i.missing).map((i) => i.id));
      items = items.filter((i) => !i.missing);
    }
    paint();
  } catch (err) {
    console.error("Couldn't load the cart:", err);
    loading.textContent = "Couldn't load the cart. Check your connection and refresh.";
  }
}

function paint() {
  loading.hidden = true;
  list.innerHTML = "";
  items.forEach((item) => list.append(row(item)));

  const available = items.filter((i) => !i.missing && !i.sold);
  empty.hidden = items.length > 0;
  summary.hidden = items.length === 0;
  $("[data-cart-total]").textContent = formatNAD(available.reduce((sum, i) => sum + Number(i.price || 0), 0));

  if (!sharedIds) paintSend(available);
}

function row(item) {
  if (item.missing) {
    return el("article", { class: "review cart-row cart-row--gone" }, [
      el("div", { class: "cart-row__body" }, [
        el("p", { class: "review__seller" }, "Piece no longer listed"),
        el("p", { class: "review__meta" }, "It was deleted after this cart was sent."),
      ]),
    ]);
  }

  return el("article", { class: `review cart-row${item.sold ? " cart-row--gone" : ""}` }, [
    el("img", { class: "cart-row__thumb", src: sized(item.imageURL, 200, { square: true }), alt: "", loading: "lazy", decoding: "async" }),
    el("div", { class: "cart-row__body" }, [
      el("p", { class: "review__seller" }, itemTitle(item)),
      el("p", { class: "review__meta" }, `Size ${item.size || "—"}${item.condition ? ` · ${item.condition}` : ""}`),
      item.sold ? el("span", { class: "status-pill status-pill--rejected" }, "sold") : null,
    ]),
    el("span", { class: "cart-row__price" }, formatNAD(item.price)),
    sharedIds
      ? null
      : el(
          "button",
          {
            class: "cart-row__remove",
            type: "button",
            "aria-label": `Remove ${itemTitle(item)} from cart`,
            onClick: () => {
              removeFromCart(item.id);
              items = items.filter((i) => i.id !== item.id);
              paint();
            },
          },
          el("i", { class: "ico ico--close", "aria-hidden": "true" })
        ),
  ]);
}

/** The WhatsApp message: what they want, the total, and the cart link. */
function paintSend(available) {
  const number = SHOP_WHATSAPP;
  const lines = available.map(
    (i, n) => `${n + 1}. ${itemTitle(i)} (size ${i.size || "?"}, ${formatNAD(i.price)})`
  );
  const total = available.reduce((sum, i) => sum + Number(i.price || 0), 0);
  const message = [
    "Hi! I'd like to buy these from Closeted By Grace:",
    ...lines,
    `Total: ${formatNAD(total)}`,
    "",
    `My cart: ${cartLink(available.map((i) => i.id))}`,
  ].join("\n");

  const href = available.length && number ? whatsappHref(number, message) : null;
  sendBtn.hidden = !href;
  if (href) sendBtn.href = href;
}

// another tab added or removed something
window.addEventListener("cart:change", () => {
  if (sharedIds) return;
  const now = cartIds();
  const shown = items.map((i) => i.id);
  if (now.length !== shown.length || now.some((id) => !shown.includes(id))) load(now);
});
