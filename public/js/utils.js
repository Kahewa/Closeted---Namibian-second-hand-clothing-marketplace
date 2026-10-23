// Shared constants + tiny DOM/format helpers used across every page.

// The only categories a post can have — also the filter chips on the feed.
export const CATEGORIES = [
  "Shirt",
  "Top",
  "Belt",
  "Pants",
  "Skirt",
  "Shorts",
  "Dress",
  "Shoes",
  "Heels",
  "Bags",
  "Jacket",
  "Jersey",
  "Jeans",
  "Denim",
  "Accessories",
];

/**
 * A piece's categories. Pieces can have several (categories: [...]);
 * older posts have just one (category), so that becomes a list of one.
 * `category` is always kept as the first, for anything that shows one.
 */
export function itemCategories(item) {
  if (Array.isArray(item?.categories) && item.categories.length) return item.categories;
  return item?.category ? [item.category] : [];
}

export const CONDITIONS = ["New with tags", "Like new", "Good", "Fair"];

// The single admin account — the only login on the site — identified by
// its Firebase account id. Not a secret: knowing it doesn't let anyone log
// in, only the password does. Written here and in firebase/firestore.rules
// by `npm run admin:password`; the two must match.
export const ADMIN_UID = "aNHz1YdC6De9S7aS0GZqBUlBlp73";

export function isAdminUser(user) {
  return !!user && user.uid === ADMIN_UID;
}

export function formatNAD(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return "N$0";
  const fixed = n.toFixed(2);
  return `N$${fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed}`;
}

export function $(selector, scope = document) {
  return scope.querySelector(selector);
}


export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(key, value === true ? "" : value);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}


export function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const units = [
    ["yr", 31536000],
    ["mo", 2592000],
    ["wk", 604800],
    ["d", 86400],
    ["hr", 3600],
    ["min", 60],
  ];
  for (const [label, secs] of units) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count}${label} ago`;
  }
  return "just now";
}

export function toFirestoreDate(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  return null;
}

let toastHost = null;
export function toast(message, type = "info") {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    document.body.appendChild(toastHost);
  }
  const node = el("div", { class: `toast toast--${type}` }, message);
  toastHost.appendChild(node);
  requestAnimationFrame(() => node.classList.add("toast--show"));
  setTimeout(() => {
    node.classList.remove("toast--show");
    setTimeout(() => node.remove(), 250);
  }, 3400);
}

/**
 * Turns whatever a seller typed into a wa.me link.
 *
 * wa.me needs a full international number with no punctuation, but people
 * naturally write their number the local way — "081 234 5678". Sending
 * that through as-is produces a dead link, so a leading 0 is swapped for
 * Namibia's country code. Anything already written with + or 00 is
 * respected as-is, so foreign numbers still work.
 *
 * @param {string} value - the raw number a seller typed
 * @param {string} [message] - optional text to pre-fill in the chat
 * @returns {string|null} a wa.me URL, or null if it can't be a phone number
 */
export function whatsappHref(value = "", message = "") {
  let digits = String(value).replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `264${digits.slice(1)}`;

  digits = digits.replace(/\D/g, "");
  if (digits.length < 8) return null;

  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

// A post holds up to this many photos; the first is the cover.
export const MAX_PHOTOS = 5;

/**
 * Every photo of a piece as [{ url, publicId }], cover first. Posts from
 * before multi-photo only have imageURL/publicId, so those become a list
 * of one.
 */
export function itemImages(item) {
  if (Array.isArray(item?.images) && item.images.length) return item.images.filter((img) => img?.url);
  return item?.imageURL ? [{ url: item.imageURL, publicId: item.publicId || null }] : [];
}

// Selling through Closeted By Grace: one service fee per batch, by how many
// pieces are in it. Shown on sell.html and the admin's applications.
export const SELL_MIN = 5;
export const SELL_MAX = 50;
export const SELL_TIERS = [
  { from: 5, to: 10, fee: 80 },
  { from: 11, to: 20, fee: 150 },
  { from: 21, to: 30, fee: 200 },
  { from: 31, to: 40, fee: 300 },
  { from: 41, to: 50, fee: 400 },
];

/** The service fee for a batch, or null outside 5–50 pieces. */
export function sellFee(pieces) {
  const n = Number(pieces);
  return SELL_TIERS.find((t) => n >= t.from && n <= t.to)?.fee ?? null;
}

// The Local Business Feature on the home page: three poster spaces, stored
// as ads/slot1 … ads/slot3 (firebase/firestore.rules).
export const AD_SLOTS = ["slot1", "slot2", "slot3"];

// The shop's WhatsApp: every "contact us" on the site goes here — Buy now,
// Send cart, Advertise your business — and it's the default number on new
// posts in the admin.
export const SHOP_WHATSAPP = "081 809 3531";
