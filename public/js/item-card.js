import { sized } from "./cloudinary.js";
import { addToCart, removeFromCart, inCart, MAX_CART, siteLink } from "./cart.js";
import { el, toast, formatNAD, itemImages, itemCategories, whatsappHref, SHOP_WHATSAPP } from "./utils.js";

export const CONDITION_CLASS = {
  "New with tags": "condition-pill--new",
  "Like new": "condition-pill--likenew",
  Good: "condition-pill--good",
  Fair: "condition-pill--fair",
};

export function itemTitle(item) {
  return [item.brand, item.category].filter(Boolean).join(" ") || "Item";
}

/** Where a piece's own page lives. */
export const itemHref = (item) => `item.html?id=${encodeURIComponent(item.id)}`;

export function conditionPill(item) {
  return item.condition
    ? el("span", { class: `condition-pill ${CONDITION_CLASS[item.condition] || ""}` }, item.condition)
    : null;
}

/**
 * "Buy now": a WhatsApp chat with just this piece in it, skipping the
 * cart. Null when the piece has no number buyers can reach.
 */
export function buyNowHref(item) {
  const message = [
    "Hi! I'd like to buy this from Closeted By Grace:",
    `${itemTitle(item)} (size ${item.size || "?"}, ${formatNAD(item.price)})`,
    "",
    siteLink(itemHref(item)),
  ].join("\n");
  return whatsappHref(SHOP_WHATSAPP, message);
}

/** Buy now + Add to cart, or a note once it's sold. */
export function buyButtons(item, { large = false } = {}) {
  if (item.sold) return el("p", { class: "item-card__gone" }, "This piece has been sold");
  const href = buyNowHref(item);
  return el("div", { class: `buy-row${large ? " buy-row--large" : ""}` }, [
    href
      ? el("a", { class: `btn btn--primary${large ? "" : " btn--sm"}`, href, target: "_blank", rel: "noopener noreferrer" }, [
          el("i", { class: "ico ico--chat", "aria-hidden": "true" }),
          " Buy now",
        ])
      : null,
    cartButton(item.id, large),
  ]);
}

/**
 * One piece on the feed: its photos with the price, what it is, and Buy
 * now / Add to cart. Tapping the photo or the name opens the piece's page.
 *
 * @param {object} item - { id, images, category, size, brand, condition,
 *   price, notes, whatsapp, sold }
 */
export function renderItemCard(item) {
  const title = itemTitle(item);
  const href = itemHref(item);

  const photos = gallery(itemImages(item), title, item.size);
  // a tap opens the piece; a swipe still just swipes (no click fires)
  photos.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    location.href = href;
  });

  const media = el("div", { class: `item-card__media${item.sold ? " item-card__media--sold" : ""}` }, [
    photos,
    el("div", { class: "price-tag" }, [el("span", { class: "price-tag__amount" }, formatNAD(item.price))]),
    item.sold ? el("div", { class: "carousel-card__sold-stamp" }, "SOLD") : null,
  ]);

  const details = el("div", { class: "item-card__body" }, [
    el("div", { class: "item-card__line" }, [
      el("a", { class: "item-card__category", href }, itemCategories(item).join(" · ") || "Item"),
      conditionPill(item),
    ]),
    el("p", { class: "item-card__meta" }, `Size ${item.size || "—"} · ${item.brand || "No brand"}`),
    item.notes ? el("p", { class: "item-card__notes" }, item.notes) : null,
    buyButtons(item),
  ]);

  return el("article", { class: "item-card" }, [media, details]);
}

/**
 * The piece's photos as a swipeable strip — scroll-snap does the swiping,
 * so it's native on phones. Each photo keeps its uploaded proportions, and
 * the strip's height follows whichever photo is showing. Dots show where
 * you are; arrows appear on devices with a mouse.
 */
export function gallery(images, title, size, width = 720) {
  const alt = (i) => `${title}, size ${size || "unlisted"}${images.length > 1 ? ` — photo ${i + 1} of ${images.length}` : ""}`;
  const imgs = images.map((img, i) =>
    el("img", {
      class: "item-card__img",
      src: sized(img.url, width),
      // let the browser pick a size that fits the screen: feed cards are a
      // half, third or quarter of the page wide (the product page passes a
      // bigger width and fills more of it)
      srcset: [360, 540, width].map((w) => `${sized(img.url, w)} ${w}w`).join(", "),
      sizes: width > 720 ? "(max-width: 859px) 100vw, 55vw" : "(max-width: 679px) 50vw, (max-width: 1039px) 33vw, 25vw",
      alt: alt(i),
      loading: "lazy",
      decoding: "async",
      // known size (newer uploads): the space is right before it loads
      style: img.w && img.h ? `aspect-ratio: ${img.w} / ${img.h}` : null,
    })
  );
  const track = el("div", { class: "item-card__track" }, imgs);
  if (images.length < 2) return track;

  let current = 0;
  const fit = () => {
    const h = imgs[current]?.offsetHeight;
    if (h) track.style.height = `${h}px`;
  };
  imgs.forEach((img) => img.addEventListener("load", fit));
  // also catches the first layout and any change in card width
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(track);

  const dots = images.map((_, i) => el("span", { class: `item-card__dot${i === 0 ? " item-card__dot--on" : ""}` }));
  const go = (step) => track.scrollBy({ left: step * track.clientWidth, behavior: "smooth" });
  track.addEventListener(
    "scroll",
    () => {
      const now = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (now === current) return;
      dots[current]?.classList.remove("item-card__dot--on");
      dots[now]?.classList.add("item-card__dot--on");
      current = now;
      fit();
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

function cartButton(id, large = false) {
  const btn = el("button", {
    type: "button",
    "data-cart-id": id,
    "data-size": large ? "lg" : "sm",
    onClick: () => {
      if (inCart(id)) {
        removeFromCart(id);
      } else if (!addToCart(id)) {
        toast(`Your cart is full (${MAX_CART} pieces max).`, "error");
      } else {
        toast("Added to your cart");
      }
    },
  });
  syncCartButton(btn);
  return btn;
}

/** Repaints an add-to-cart button to match the cart. */
export function syncCartButton(btn) {
  const added = inCart(btn.dataset.cartId);
  btn.className = `btn btn--outline${btn.dataset.size === "lg" ? "" : " btn--sm"}${added ? " is-added" : ""}`;
  btn.setAttribute("aria-pressed", String(added));
  btn.replaceChildren(
    el("i", { class: `ico ico--${added ? "check" : "shop"}`, "aria-hidden": "true" }),
    added ? " In cart" : " Add to cart"
  );
}
