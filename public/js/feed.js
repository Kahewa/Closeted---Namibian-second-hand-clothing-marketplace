import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { renderCarouselCard } from "./carousel-card.js";
import { $, $all, el, CATEGORIES } from "./utils.js";

const PAGE_SIZE = 8;

const feedEl = $("[data-feed]");
const loadMoreBtn = $("[data-load-more]");
const emptyState = $("[data-empty-state]");
const chipsRow = $("[data-category-chips]");

let currentUser = null;
let lastDoc = null;
let reachedEnd = false;
let loading = false;
let activeCategory = "All";
const loadedCarousels = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

function buildChips() {
  const categories = ["All", ...CATEGORIES];
  categories.forEach((cat) => {
    const chip = el(
      "button",
      {
        class: `chip${cat === activeCategory ? " chip--active" : ""}`,
        type: "button",
        onClick: () => selectCategory(cat, chip),
      },
      cat
    );
    chipsRow.append(chip);
  });
}

function selectCategory(cat, chipEl) {
  activeCategory = cat;
  $all(".chip", chipsRow).forEach((c) => c.classList.remove("chip--active"));
  chipEl.classList.add("chip--active");
  repaintFeed();
}

function matchesCategory(carousel) {
  if (activeCategory === "All") return true;
  return (carousel.items || []).some((item) => item.category === activeCategory);
}

function repaintFeed() {
  feedEl.innerHTML = "";
  const visible = loadedCarousels.filter(matchesCategory);
  visible.forEach((carousel) => feedEl.append(renderCarouselCard(carousel, currentUser)));
  emptyState.hidden = visible.length > 0;
  if (visible.length === 0 && loadedCarousels.length > 0) {
    emptyState.querySelector("[data-empty-title]").textContent = `No ${activeCategory.toLowerCase()} dropped yet`;
    emptyState.querySelector("[data-empty-body]").textContent =
      "Try a different category, or check back soon — new closets drop all the time.";
  }
}

async function loadPage() {
  if (loading || reachedEnd) return;
  loading = true;
  loadMoreBtn.textContent = "Loading…";
  loadMoreBtn.disabled = true;

  try {
    const constraints = [orderBy("createdAt", "desc"), limit(PAGE_SIZE)];
    if (lastDoc) constraints.push(startAfter(lastDoc));
    const snap = await getDocs(query(collection(db, "carousels"), ...constraints));

    snap.forEach((docSnap) => {
      loadedCarousels.push({ id: docSnap.id, ...docSnap.data() });
    });
    lastDoc = snap.docs.at(-1) || lastDoc;
    if (snap.size < PAGE_SIZE) reachedEnd = true;

    repaintFeed();
  } catch (err) {
    console.error("Couldn't load the feed:", err);
    emptyState.hidden = false;
    emptyState.querySelector("[data-empty-title]").textContent = "Couldn't load the feed";
    emptyState.querySelector("[data-empty-body]").innerHTML =
      `Double check your Firebase config in <code>public/js/firebase-config.js</code>.<br><small>${err.message}</small>`;
  } finally {
    loading = false;
    loadMoreBtn.textContent = "Load more closets";
    loadMoreBtn.disabled = false;
    loadMoreBtn.hidden = reachedEnd;
  }
}

buildChips();
loadMoreBtn.addEventListener("click", loadPage);
loadPage();
