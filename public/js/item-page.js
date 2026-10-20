import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { gallery, buyButtons, conditionPill, itemTitle, renderItemCard, syncCartButton } from "./item-card.js";
import { $, el, formatNAD, itemImages, timeAgo, toFirestoreDate } from "./utils.js";
import { masonry } from "./masonry.js";

// item.html?id=<firestore id> — one piece, big, with similar pieces below.
const RELATED = 8;

const id = new URLSearchParams(location.search).get("id") || "";
const view = $("[data-item]");
masonry($("[data-related-grid]"));

load();

async function load() {
  try {
    const snap = id ? await getDoc(doc(db, "items", id)) : null;
    $("[data-item-loading]").hidden = true;
    if (!snap?.exists()) {
      $("[data-item-missing]").hidden = false;
      loadRelated(null);
      return;
    }
    const item = { id: snap.id, ...snap.data() };
    paint(item);
    loadRelated(item);
  } catch (err) {
    console.error("Couldn't load this piece:", err);
    $("[data-item-loading]").textContent = "Couldn't load this piece. Check your connection and refresh.";
  }
}

function paint(item) {
  const title = itemTitle(item);
  document.title = `${title} — Closeted By Grace`;

  const photos = $("[data-item-photos]");
  photos.classList.toggle("item-view__photos--sold", !!item.sold);
  photos.append(gallery(itemImages(item), title, item.size, 1200));
  if (item.sold) photos.append(el("div", { class: "carousel-card__sold-stamp" }, "SOLD"));

  $("[data-item-eyebrow]").textContent = item.category || "Pre-loved";
  $("[data-item-title]").textContent = title;
  $("[data-item-price]").textContent = formatNAD(item.price);

  const fact = (label, value) => (value ? [el("dt", {}, label), el("dd", {}, value)] : []);
  $("[data-item-facts]").append(
    ...fact("Size", item.size),
    ...fact("Brand", item.brand),
    ...(item.condition ? [el("dt", {}, "Condition"), el("dd", {}, conditionPill(item))] : []),
    ...fact("Posted", timeAgo(toFirestoreDate(item.createdAt)))
  );

  if (item.notes) {
    $("[data-item-notes]").textContent = item.notes;
    $("[data-item-notes]").hidden = false;
  }
  $("[data-item-buy]").append(buyButtons(item, { large: true }));
  view.hidden = false;
}

/**
 * Similar pieces: still for sale, same category first, newest first. If
 * that category is thin, the newest pieces from anywhere fill the rest.
 * The category query has no orderBy on purpose — equality-only queries
 * need no composite index — so it's sorted here instead.
 */
async function loadRelated(item) {
  try {
    const pool = new Map();
    const add = (snap) =>
      snap.forEach((d) => {
        const it = { id: d.id, ...d.data() };
        if (it.id !== item?.id && !it.sold && itemImages(it).length) pool.set(it.id, it);
      });

    if (item?.category) {
      add(await getDocs(query(collection(db, "items"), where("category", "==", item.category), limit(40))));
    }
    const sameCategory = [...pool.values()].sort(newestFirst);

    let picks = sameCategory.slice(0, RELATED);
    if (picks.length < RELATED) {
      add(await getDocs(query(collection(db, "items"), orderBy("createdAt", "desc"), limit(40))));
      const rest = [...pool.values()].filter((it) => !picks.includes(it)).sort(newestFirst);
      picks = [...picks, ...rest].slice(0, RELATED);
    }
    if (!picks.length) return;

    $("[data-related-title]").textContent =
      item?.category && sameCategory.length ? `More ${pluralCategory(item.category)}` : "Fresh on the feed";
    const grid = $("[data-related-grid]");
    picks.forEach((it) => grid.append(renderItemCard(it)));
    $("[data-related]").hidden = false;
  } catch (err) {
    console.warn("Couldn't load similar pieces:", err);
  }
}

const millis = (it) => toFirestoreDate(it.createdAt)?.getTime() || 0;
const newestFirst = (a, b) => millis(b) - millis(a);

function pluralCategory(cat) {
  const c = cat.toLowerCase();
  if (["pants", "shorts", "shoes", "heels", "accessories"].includes(c)) return c;
  if (c === "dress") return "dresses";
  return `${c}s`;
}

window.addEventListener("cart:change", () => {
  document.querySelectorAll("[data-cart-id]").forEach(syncCartButton);
});
