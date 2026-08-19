import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { renderCarouselCard } from "./carousel-card.js";
import { $ } from "./utils.js";

const PAGE_SIZE = 8;

const feedEl = $("[data-feed]");
const loadMoreBtn = $("[data-load-more]");
const emptyState = $("[data-empty-state]");

let currentUser = null;
let lastDoc = null;
let reachedEnd = false;
let loading = false;
const loadedCarousels = [];

// The feed starts loading before Firebase has resolved who's signed in, so
// once it does, repaint — that's what makes a seller's own "mark sold" and
// "delete" controls appear on their cards.
onAuthStateChanged(auth, (user) => {
  const changed = (currentUser?.uid || null) !== (user?.uid || null);
  currentUser = user;
  if (changed && loadedCarousels.length) repaintFeed();
});

function repaintFeed() {
  feedEl.innerHTML = "";
  loadedCarousels.forEach((carousel) => feedEl.append(renderCarouselCard(carousel, currentUser)));
  emptyState.hidden = loadedCarousels.length > 0;
}

async function loadPage() {
  if (loading || reachedEnd) return;
  loading = true;
  loadMoreBtn.textContent = "Loading…";
  loadMoreBtn.disabled = true;

  try {
    // Only approved drops reach the feed. Pending ones are visible to
    // their own seller on their profile, and to the admin dashboard.
    const constraints = [
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE),
    ];
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
    emptyState.querySelector("[data-empty-body]").innerHTML = /index/i.test(err.message)
      ? `Firestore needs a one-time index (status + createdAt). Open the browser console and click the link Firebase printed, or deploy <code>firebase/firestore.indexes.json</code>.<br><small>${err.message}</small>`
      : `Double check your config in <code>public/js/local-config.js</code>.<br><small>${err.message}</small>`;
  } finally {
    loading = false;
    loadMoreBtn.textContent = "Load more closets";
    loadMoreBtn.disabled = false;
    loadMoreBtn.hidden = reachedEnd;
  }
}

loadMoreBtn.addEventListener("click", loadPage);
loadPage();
