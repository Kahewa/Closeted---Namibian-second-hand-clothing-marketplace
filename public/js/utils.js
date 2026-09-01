// Shared constants + tiny DOM/format helpers used across every page.

export const CATEGORIES = ["Tops", "Bottoms", "Dresses & Skirts", "Outerwear", "Shoes", "Other Clothing"];

export const CONDITIONS = ["New with tags", "Like new", "Good", "Fair"];

export const CAROUSEL_FEE = 150;
export const CAROUSEL_FEE_CURRENCY = "NAD";

// The single admin account. Mirrored in firebase/firestore.rules — change
// it in both places or the dashboard and the rules will disagree.
export const ADMIN_EMAIL = "bygreys.na@gmail.com";

export function isAdminUser(user) {
  return !!user && (user.email || "").toLowerCase() === ADMIN_EMAIL;
}

// Where sellers send the N$150 listing fee. Shown in the payment dialog
// on the sell page; the reference is filled in with their username so
// payments can be matched to accounts in the admin dashboard.
export const PAYMENT_DETAILS = {
  walletNumber: "081 652 8920",
  walletLabel: "Pay2Cell or any wallet transfer",
  bank: "FNB / RMB",
  accountHolder: "Grace Shuuya",
  accountType: "Bankwise Regular Account",
  accountNumber: "62269784487",
  branchCode: "282672",
  cashWhatsapp: "0818093631",
};

// Usernames: lowercase letters, numbers, underscore and dot, 3–20 chars.
// Kept tight so they stay usable as a payment reference and in a URL.
export const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

export function normalizeUsername(value = "") {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function usernameError(value) {
  const name = normalizeUsername(value);
  if (!name) return "Pick a username.";
  if (!USERNAME_RE.test(name)) {
    return "3–20 characters, lowercase letters, numbers, dots or underscores only.";
  }
  return null;
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

export function $all(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
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

export function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "?"
  );
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

export function isValidUrl(value = "") {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------
// Opening was animated by CSS, but closing just flipped `hidden` and the
// panel vanished mid-frame. These play the exit first, then hide.

// iOS ignores `overflow: hidden` on body — the page behind a modal scrolls
// anyway, and worse, the modal scrolls with it. Pinning the body in place is
// the only thing that holds, but it throws away the scroll position, so we
// keep it and put it back on close.
let lockedScroll = 0;

function lockScroll() {
  lockedScroll = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScroll}px`;
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  window.scrollTo(0, lockedScroll);
}

export function openModal(node) {
  if (!node) return;
  node.classList.remove("modal--closing");
  node.hidden = false;
  lockScroll();
}

export function closeModal(node) {
  if (!node || node.hidden) return;

  const finish = () => {
    node.hidden = true;
    node.classList.remove("modal--closing");
    unlockScroll();
  };

  const panel = node.querySelector(".modal__panel, .lightbox__panel");
  const wantsMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  if (!panel || !wantsMotion) return finish();

  node.classList.add("modal--closing");

  // animationend is the signal, but a timeout backs it up — a modal that
  // never closes because an event didn't fire is far worse than one that
  // closes a frame early.
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    finish();
  };
  panel.addEventListener("animationend", once, { once: true });
  setTimeout(once, 400);
}
