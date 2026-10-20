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
import { masonry } from "./masonry.js";
import { $, el, whatsappHref, CATEGORIES } from "./utils.js";

// How many matching pieces to show per "load more". Firestore is asked for
// pages in the same order and the categories are filtered here in the
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

// The chosen categories (none = everything). ?c=Dress,Shoes keeps them
// across reloads and makes a filtered feed shareable.
const active = new Set(
  (new URLSearchParams(location.search).get("c") || "").split(",").filter((c) => CATEGORIES.includes(c))
);

// ---------------------------------------------------------------------
// filters
//
// Wide screens: the category pills sit in the top bar; tapping one turns
// it on or off, "All" clears them. Phones (and anywhere the pills don't
// fit): a "Filter items" button opens a glass side panel with the same
// choices, and what's chosen shows in the top bar as tags with an ×.
// CSS decides which of the two is visible.
// ---------------------------------------------------------------------
function toggle(cat) {
  if (!cat) active.clear();
  else if (active.has(cat)) active.delete(cat);
  else active.add(cat);
  filtersChanged();
}

function filtersChanged({ scroll = true } = {}) {
  shown = PAGE_SIZE;
  const url = new URL(location.href);
  if (active.size) url.searchParams.set("c", [...active].join(","));
  else url.searchParams.delete("c");
  history.replaceState(null, "", url);
  paintFilters();
  // the hero hides while filtering (see paintFilters), so the results start
  // at the top of the page: go there to show them
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  fill();
}

const chip = (cat, extraClass = "") =>
  el(
    "button",
    {
      type: "button",
      class: `filter-chip${extraClass}${(cat ? active.has(cat) : !active.size) ? " filter-chip--on" : ""}`,
      "aria-pressed": String(cat ? active.has(cat) : !active.size),
      onClick: () => toggle(cat),
    },
    cat || "All"
  );

// --- phones: the "Filter items" button and the chosen-filter tags ----------
const strip = el("div", { class: "filter-strip" });
const openBtn = el(
  "button",
  { type: "button", class: "filter-open", "aria-haspopup": "dialog", onClick: () => openDrawer() },
  [
    el("span", {
      class: "filter-open__icon",
      "aria-hidden": "true",
      html: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    }),
    "Filter items",
  ]
);
const tags = el("div", { class: "filter-tags", "aria-live": "polite" });
strip.append(openBtn, tags);
filterBar.after(strip);

// --- the side panel ---------------------------------------------------------
const drawerList = el("div", { class: "filter-drawer__list", role: "group", "aria-label": "Categories" });
const drawer = el(
  "aside",
  { class: "filter-drawer", role: "dialog", "aria-modal": "true", "aria-labelledby": "filter-drawer-title", tabindex: "-1" },
  [
    el("div", { class: "filter-drawer__head" }, [
      el("h2", { class: "filter-drawer__title", id: "filter-drawer-title" }, "Filter items"),
      el(
        "button",
        { type: "button", class: "filter-drawer__close", "aria-label": "Close filters", onClick: () => closeDrawer() },
        el("i", { class: "ico ico--close", "aria-hidden": "true" })
      ),
    ]),
    el("p", { class: "filter-drawer__hint" }, "Pick as many as you like."),
    drawerList,
    el("div", { class: "filter-drawer__foot" }, [
      el("button", { type: "button", class: "btn btn--outline btn--sm", onClick: () => toggle("") }, "Clear all"),
      el("button", { type: "button", class: "btn btn--primary btn--sm", onClick: () => closeDrawer() }, "Done"),
    ]),
  ]
);
const backdrop = el("div", { class: "filter-backdrop", onClick: () => closeDrawer() });
document.body.append(backdrop, drawer);

const drawerOpen = () => document.body.classList.contains("filters-open");
function openDrawer() {
  document.body.classList.add("filters-open");
  drawer.focus({ preventScroll: true });
}
function closeDrawer() {
  if (!drawerOpen()) return;
  document.body.classList.remove("filters-open");
  openBtn.focus({ preventScroll: true });
  // show the results once they're done choosing
  const browse = document.getElementById("browse");
  if (browse && browse.getBoundingClientRect().top > window.innerHeight * 0.5) {
    browse.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
});

function paintFilters() {
  // wide screens: pills in the top bar
  filterBar.replaceChildren(...["", ...CATEGORIES].map((cat) => chip(cat)));
  // the side panel: the same choices, bigger
  drawerList.replaceChildren(...["", ...CATEGORIES].map((cat) => chip(cat, " filter-chip--drawer")));
  // phones: a tag in the top bar for each chosen category
  tags.replaceChildren(
    ...[...active].map((cat) =>
      el(
        "button",
        { type: "button", class: "filter-tag", "aria-label": `Remove ${cat} filter`, onClick: () => toggle(cat) },
        [cat, el("span", { class: "filter-tag__x", "aria-hidden": "true" }, "×")]
      )
    )
  );
  openBtn.classList.toggle("filter-open--on", active.size > 0);
  // while any filter is on, the hero steps aside so the results come first
  document.body.classList.toggle("is-filtering", active.size > 0);
}

// ---------------------------------------------------------------------
// data
// ---------------------------------------------------------------------
const matches = () => loaded.filter((item) => !active.size || active.has(item.category));

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

// "Advertise your business": a WhatsApp chat with the shop, on the same
// number the listings use (the newest post's), so it's never hard-coded.
const advertise = $("[data-advertise]");
function paintAdvertise() {
  if (!advertise || advertise.dataset.ready) return;
  const number = loaded.find((item) => whatsappHref(item.whatsapp))?.whatsapp;
  const href = number && whatsappHref(number, "Hi! I'd like to advertise my business on Closeted By Grace.");
  if (!href) return;
  advertise.href = href;
  advertise.dataset.ready = "1";
}

function paint() {
  paintAdvertise();
  const list = matches();
  feedEl.innerHTML = "";
  list.slice(0, shown).forEach((item) => feedEl.append(renderItemCard(item)));

  emptyState.hidden = list.length > 0;
  emptyState.querySelector("[data-empty-title]").textContent = active.size
    ? `No ${[...active].map((c) => c.toLowerCase()).join(" or ")} right now`
    : "Nothing posted yet";
  emptyState.querySelector("[data-empty-body]").textContent = active.size
    ? "Try other categories, or check back soon."
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

masonry(feedEl);
paintFilters();
fill();
