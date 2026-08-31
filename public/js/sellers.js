// The seller directory: a search box with everyone's closet beneath it.
//
// Sellers are loaded once and filtered in the browser. That's deliberate —
// Firestore can only do prefix matching on a field, so a server-side search
// for "sales" would never find "@closetsales". At this size one read of the
// collection is cheaper than a query per keystroke, and it lets the match
// run anywhere in the name.
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { $, el, initials, normalizeUsername } from "./utils.js";
import { sized } from "./cloudinary.js";

const MAX_SELLERS = 300;

const form = $("[data-seller-form]");
const input = $("[data-seller-input]");
const grid = $("[data-seller-grid]");
const status = $("[data-seller-status]");
const countEl = $("[data-seller-count]");

let sellers = [];

load();

async function load() {
  try {
    const snap = await getDocs(query(collection(db, "users"), limit(MAX_SELLERS)));

    sellers = snap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => u.username && !u.deleted && !u.banned)
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

    status.hidden = true;
    paint(sellers);
  } catch (err) {
    console.error("Couldn't load sellers:", err);
    status.hidden = false;
    status.textContent = `Couldn't load sellers right now: ${err.message}`;
  }
}

function paint(list) {
  grid.innerHTML = "";
  countEl.textContent = list.length
    ? `${list.length} seller${list.length === 1 ? "" : "s"}`
    : "";

  if (!list.length) {
    status.hidden = false;
    status.textContent = "No sellers match that name.";
    return;
  }
  status.hidden = true;
  list.forEach((seller) => grid.append(tile(seller)));
}

/** One seller, as a pinned card. */
function tile(seller) {
  const media = el("span", { class: "tile__media" }, [
    seller.profilePicURL
      ? el("img", { class: "tile__img", src: sized(seller.profilePicURL, 560, { square: true }), alt: "", loading: "lazy", decoding: "async" })
      : el("span", { class: "tile__initials" }, initials(seller.displayName)),
  ]);

  return el("a", { class: "tile", href: `profile.html?uid=${seller.uid}` }, [
    media,
    el("span", { class: "tile__meta" }, [
      el(
        "span",
        { class: "tile__who" },
        seller.displayName || (seller.username ? `@${seller.username}` : "Closet Seller")
      ),
      el("span", { class: "tile__price" }, `@${seller.username}`),
    ]),
  ]);
}

function search(term) {
  const q = normalizeUsername(term);
  if (!q) return paint(sellers);

  const matches = sellers.filter(
    (u) =>
      (u.username || "").includes(q) ||
      (u.displayName || "").toLowerCase().includes(q)
  );
  paint(matches);
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  search(input.value);
});
// filter as they type, so the grid answers immediately
input?.addEventListener("input", () => search(input.value));

// deep link: shop.html?q=grace
const preset = new URLSearchParams(location.search).get("q");
if (preset && input) input.value = preset;
