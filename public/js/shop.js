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
import { $, el, formatNAD } from "./utils.js";

const PAGE_SIZE = 18;

const grid = $("[data-shop-grid]");
const loading = $("[data-shop-loading]");
const empty = $("[data-shop-empty]");
const moreBtn = $("[data-shop-more]");
const modal = $("[data-shop-modal]");
const detail = $("[data-shop-detail]");

let currentUser = null;
let lastDoc = null;
let reachedEnd = false;
let busy = false;
const loaded = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

// ---------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------
async function loadPage() {
  if (busy || reachedEnd) return;
  busy = true;
  moreBtn.disabled = true;

  try {
    const constraints = [
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE),
    ];
    if (lastDoc) constraints.push(startAfter(lastDoc));

    const snap = await getDocs(query(collection(db, "carousels"), ...constraints));
    snap.forEach((docSnap) => {
      const carousel = { id: docSnap.id, ...docSnap.data() };
      loaded.push(carousel);
      grid.append(tile(carousel));
    });

    lastDoc = snap.docs.at(-1) || lastDoc;
    if (snap.size < PAGE_SIZE) reachedEnd = true;

    loading.hidden = true;
    empty.hidden = loaded.length > 0;
    moreBtn.hidden = reachedEnd || loaded.length === 0;
  } catch (err) {
    console.error("Couldn't load the shop:", err);
    loading.innerHTML = /index/i.test(err.message)
      ? `Firestore needs its status + createdAt index. Deploy <code>firebase/firestore.indexes.json</code>.<br><small>${err.message}</small>`
      : `Couldn't load closets.<br><small>${err.message}</small>`;
  } finally {
    busy = false;
    moreBtn.disabled = false;
  }
}

/** One small square in the grid: cover photo + a line of detail. */
function tile(carousel) {
  const items = carousel.items || [];
  const cover = items.find((it) => !it.sold) || items[0];
  const cheapest = items.length ? Math.min(...items.map((it) => Number(it.price) || 0)) : 0;
  const allSold = items.length > 0 && items.every((it) => it.sold);

  const button = el(
    "button",
    {
      class: "tile",
      type: "button",
      "aria-label": `Open ${carousel.sellerName || "this"} closet — ${items.length} items`,
      onClick: () => openCloset(carousel),
    },
    [
      el("span", { class: "tile__media" }, [
        cover?.imageURL
          ? el("img", { class: "tile__img", src: cover.imageURL, alt: "", loading: "lazy" })
          : el("span", { class: "tile__img tile__img--none" }),
        el("span", { class: "tile__count" }, `${items.length}`),
        allSold ? el("span", { class: "tile__sold" }, "sold out") : null,
      ]),
      el("span", { class: "tile__meta" }, [
        el("span", { class: "tile__who" }, carousel.sellerUsername ? `@${carousel.sellerUsername}` : carousel.sellerName || "closet"),
        el("span", { class: "tile__price" }, items.length ? `from ${formatNAD(cheapest)}` : ""),
      ]),
    ]
  );

  return button;
}

// ---------------------------------------------------------------------
// Lightbox — the full swipeable carousel for one closet
// ---------------------------------------------------------------------
function openCloset(carousel) {
  detail.innerHTML = "";
  detail.append(renderCarouselCard(carousel, currentUser, { onDeleted: () => closeCloset() }));
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  detail.querySelector(".carousel-card")?.focus?.();
}

function closeCloset() {
  modal.hidden = true;
  detail.innerHTML = "";
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-shop-close]").forEach((node) =>
  node.addEventListener("click", closeCloset)
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeCloset();
});

moreBtn.addEventListener("click", loadPage);
loadPage();
