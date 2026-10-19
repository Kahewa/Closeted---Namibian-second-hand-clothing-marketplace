import { sized } from "./cloudinary.js";
import { addToCart, removeFromCart, inCart, MAX_CART } from "./cart.js";
import { el, toast, formatNAD, itemImages } from "./utils.js";

export const CONDITION_CLASS = {
  "New with tags": "condition-pill--new",
  "Like new": "condition-pill--likenew",
  Good: "condition-pill--good",
  Fair: "condition-pill--fair",
};

/**
 * One piece on the public feed: the photo with its price, what it is, and
 * an add-to-cart button. Checkout (WhatsApp) happens from the cart page.
 *
 * @param {object} item - { images, category, size, brand, condition,
 *   price, notes, whatsapp, sold }
 */
export function itemTitle(item) {
  return [item.brand, item.category].filter(Boolean).join(" ") || "Item";
}

export function renderItemCard(item) {
  const title = itemTitle(item);

  const media = el("div", { class: `item-card__media${item.sold ? " item-card__media--sold" : ""}` }, [
    gallery(itemImages(item), title, item.size),
    el("div", { class: "price-tag" }, [el("span", { class: "price-tag__amount" }, formatNAD(item.price))]),
    item.sold ? el("div", { class: "carousel-card__sold-stamp" }, "SOLD") : null,
  ]);

  const details = el("div", { class: "item-card__body" }, [
    el("div", { class: "item-card__line" }, [
      el("span", { class: "item-card__category" }, item.category || "Item"),
      item.condition
        ? el("span", { class: `condition-pill ${CONDITION_CLASS[item.condition] || ""}` }, item.condition)
        : null,
    ]),
    el("p", { class: "item-card__meta" }, `Size ${item.size || "—"} · ${item.brand || "No brand"}`),
    item.notes ? el("p", { class: "item-card__notes" }, item.notes) : null,
  ]);

  details.append(
    item.sold
      ? el("p", { class: "item-card__gone" }, "This piece has been sold")
      : cartButton(item.id)
  );

  return el("article", { class: "item-card" }, [media, details]);
}

/**
 * The piece's photos as a swipeable strip — scroll-snap does the swiping,
 * so it's native on phones. Dots show where you are; arrows appear on
 * devices with a mouse.
 */
function gallery(images, title, size) {
  const alt = (i) => `${title}, size ${size || "unlisted"}${images.length > 1 ? ` — photo ${i + 1} of ${images.length}` : ""}`;
  const track = el(
    "div",
    { class: "item-card__track" },
    images.map((img, i) =>
      el("img", {
        class: "item-card__img",
        src: sized(img.url, 720),
        alt: alt(i),
        loading: "lazy",
        decoding: "async",
      })
    )
  );
  if (images.length < 2) return track;

  const dots = images.map((_, i) => el("span", { class: `item-card__dot${i === 0 ? " item-card__dot--on" : ""}` }));
  const go = (step) => track.scrollBy({ left: step * track.clientWidth, behavior: "smooth" });
  let current = 0;
  track.addEventListener(
    "scroll",
    () => {
      const now = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (now === current) return;
      dots[current]?.classList.remove("item-card__dot--on");
      dots[now]?.classList.add("item-card__dot--on");
      current = now;
    },
    { passive: true }
  );

  const arrow = (dir, label) =>
    el("button", { type: "button", class: `item-card__arrow item-card__arrow--${dir}`, "aria-label": label, onClick: () => go(dir === "prev" ? -1 : 1) }, dir === "prev" ? "‹" : "›");

  return el("div", { class: "item-card__gallery" }, [
    track,
    arrow("prev", "Previous photo"),
    arrow("next", "Next photo"),
    el("div", { class: "item-card__dots", "aria-hidden": "true" }, dots),
  ]);
}

function cartButton(id) {
  const btn = el("button", {
    type: "button",
    "data-cart-id": id,
    onClick: () => {
      if (inCart(id)) {
        removeFromCart(id);
      } else if (!addToCart(id)) {
        toast(`Your cart is full (${MAX_CART} pieces max).`, "error");
      }
    },
  });
  syncCartButton(btn);
  return btn;
}

/** Repaints an add-to-cart button to match the cart. */
export function syncCartButton(btn) {
  const added = inCart(btn.dataset.cartId);
  btn.className = `btn btn--sm btn--block ${added ? "btn--outline" : "btn--primary"}`;
  btn.setAttribute("aria-pressed", String(added));
  btn.replaceChildren(
    el("i", { class: `ico ico--${added ? "check" : "shop"}`, "aria-hidden": "true" }),
    added ? " In cart" : " Add to cart"
  );
}
