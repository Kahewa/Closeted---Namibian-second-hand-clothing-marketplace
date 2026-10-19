// The shopper's cart: a list of item ids kept in this browser.
//
// There are no shopper accounts, so the cart can't live in Firestore —
// and it doesn't need to. When they check out, the ids travel in the link
// sent over WhatsApp (cart.html?items=a,b,c), which is all the admin needs
// to open exactly that cart. localStorage can be unavailable (private
// windows, blocked site data), so every access is wrapped and an
// in-memory copy keeps the cart working for the rest of the visit.

const KEY = "csn.cart";

// The site's public address (SITE_URL in local-config.js), so a cart link
// sent from a test copy on localhost still opens the live site. Without
// it, links use whatever address this page is on.
let siteUrl = location.origin;
try {
  const local = await import("./local-config.js");
  if (/^https?:\/\//.test(local.SITE_URL || "") && !local.SITE_URL.includes("YOUR-")) siteUrl = local.SITE_URL.replace(/\/+$/, "");
} catch {
  /* no local-config.js — stay on this page's address */
}
export const MAX_CART = 30;

// Firestore auto-ids are 20 letters/digits; anything else in a link is junk.
const ID_RE = /^[A-Za-z0-9]{1,40}$/;

let memory = read();

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? cleanIds(parsed) : [];
  } catch {
    return [];
  }
}

function write(ids) {
  memory = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* kept in memory for this visit */
  }
  window.dispatchEvent(new CustomEvent("cart:change"));
}

export function cleanIds(ids) {
  return [...new Set(ids.filter((id) => typeof id === "string" && ID_RE.test(id)))].slice(0, MAX_CART);
}

export const cartIds = () => [...memory];
export const inCart = (id) => memory.includes(id);

export function addToCart(id) {
  if (inCart(id)) return true;
  if (memory.length >= MAX_CART) return false;
  write([...memory, id]);
  return true;
}

export function removeFromCart(id) {
  write(memory.filter((x) => x !== id));
}

/** Drops ids whose items no longer exist (deleted by the admin). */
export function keepOnly(ids) {
  const keep = memory.filter((id) => ids.includes(id));
  if (keep.length !== memory.length) write(keep);
}

/** The link the admin follows from WhatsApp to see this exact cart. */
export function cartLink(ids = memory) {
  return `${siteUrl}/cart.html?items=${ids.join(",")}`;
}

// another tab changed the cart
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  memory = read();
  window.dispatchEvent(new CustomEvent("cart:change"));
});
