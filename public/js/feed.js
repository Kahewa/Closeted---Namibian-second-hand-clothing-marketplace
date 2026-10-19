import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { renderItemCard, syncCartButton } from "./item-card.js";
import { $, el, CATEGORIES } from "./utils.js";

// How many matching pieces to show per "load more". Firestore is asked for
// pages in the same order and the category is filtered here in the
// browser — at this catalogue size that's cheaper than maintaining a
// composite index per filter, and it keeps "newest first" exact.
const PAGE_SIZE = 24;

const feedEl = $("[data-feed]");
const filterBar = $("[data-filters]");
const loadMoreBtn = $("[data-load-more]");
const emptyState = $("[data-empty-state]");

const loaded = [];
let lastDoc = null;
let reachedEnd = false;
let loading = false;
let shown = PAGE_SIZE;

// ?c=Shoes keeps a filter across reloads and makes it shareable.
let active = CATEGORIES.includes(new URLSearchParams(location.search).get("c"))
  ? new URLSearchParams(location.search).get("c")
  : "";

// ---------------------------------------------------------------------
// filter chips
// ---------------------------------------------------------------------
function paintFilters() {
  filterBar.innerHTML = "";
  ["", ...CATEGORIES].forEach((cat) => {
    filterBar.append(
      el(
        "button",
        {
          type: "button",
          class: `filter-chip${cat === active ? " filter-chip--on" : ""}`,
          "aria-pressed": String(cat === active),
          onClick: () => setFilter(cat),
        },
        cat || "All"
      )
    );
  });
}

function setFilter(cat) {
  active = cat;
  shown = PAGE_SIZE;
  const url = new URL(location.href);
  if (cat) url.searchParams.set("c", cat);
  else url.searchParams.delete("c");
  history.replaceState(null, "", url);
  paintFilters();
  fill();
}

// ---------------------------------------------------------------------
// data
// ---------------------------------------------------------------------
const matches = () => loaded.filter((item) => !active || item.category === active);

async function fetchPage() {
  const constraints = [orderBy("createdAt", "desc"), limit(PAGE_SIZE * 2)];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(collection(db, "items"), ...constraints));
  snap.forEach((d) => loaded.push({ id: d.id, ...d.data() }));
  lastDoc = snap.docs.at(-1) || lastDoc;
  if (snap.size < PAGE_SIZE * 2) reachedEnd = true;
}

/** Fetches until there are enough matches to show, or nothing's left. */
async function fill() {
  if (loading) return;
  loading = true;
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = "Loading…";

  try {
    while (matches().length < shown && !reachedEnd) await fetchPage();
    paint();
  } catch (err) {
    console.error("Couldn't load the feed:", err);
    emptyState.hidden = false;
    emptyState.querySelector("[data-empty-title]").textContent = "Couldn't load the feed";
    emptyState.querySelector("[data-empty-body]").textContent =
      "Check your connection and refresh the page.";
  } finally {
    loading = false;
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Load more";
  }
}

function paint() {
  const list = matches();
  feedEl.innerHTML = "";
  list.slice(0, shown).forEach((item) => feedEl.append(renderItemCard(item)));

  emptyState.hidden = list.length > 0;
  emptyState.querySelector("[data-empty-title]").textContent = active
    ? `No ${active.toLowerCase()} right now`
    : "Nothing posted yet";
  emptyState.querySelector("[data-empty-body]").textContent = active
    ? "Try another category, or check back soon."
    : "New pieces are on the way. Check back soon.";

  loadMoreBtn.hidden = list.length <= shown && reachedEnd;
}

// one listener for every card, rather than one per card per repaint
window.addEventListener("cart:change", () => {
  feedEl.querySelectorAll("[data-cart-id]").forEach(syncCartButton);
});

loadMoreBtn.addEventListener("click", () => {
  shown += PAGE_SIZE;
  fill();
});

paintFilters();
fill();
