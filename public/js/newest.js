// The "newest closet sellers" row.
//
// Ordered by who posted most recently, not by who signed up most recently —
// so the row reflects activity. That means reading carousels rather than
// users: walk the newest approved drops, collect distinct sellers until
// there are five, then fetch those profiles.
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  documentId,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { sized } from "./cloudinary.js";
import { $, el, initials } from "./utils.js";

const HOW_MANY = 5;
// enough recent drops to find five different sellers even if one person
// posted several in a row
const SCAN = 40;

const row = $("[data-newest]");
const status = $("[data-newest-status]");

if (row) load();

async function load() {
  try {
    const snap = await getDocs(
      query(
        collection(db, "carousels"),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc"),
        limit(SCAN)
      )
    );

    // newest first, one entry per seller
    const seen = new Set();
    const recent = [];
    snap.forEach((d) => {
      const c = d.data();
      if (!c.sellerId || seen.has(c.sellerId)) return;
      seen.add(c.sellerId);
      recent.push({ ...c, id: d.id });
    });

    const picks = recent.slice(0, HOW_MANY);
    if (!picks.length) {
      status.textContent = "No closets posted yet.";
      return;
    }

    // one batched read for the profiles, rather than one per seller
    const profiles = new Map();
    const ids = picks.map((c) => c.sellerId);
    const users = await getDocs(
      query(collection(db, "users"), where(documentId(), "in", ids.slice(0, 10)))
    );
    users.forEach((d) => profiles.set(d.id, d.data()));

    status.hidden = true;
    row.innerHTML = "";
    picks.forEach((carousel) => row.append(card(carousel, profiles.get(carousel.sellerId))));
  } catch (err) {
    console.error("Couldn't load the newest sellers:", err);
    status.textContent = /index/i.test(err.message)
      ? "Firestore needs its status + createdAt index for this."
      : "Couldn't load sellers right now.";
  }
}

/** A seller, shown through the cover of the closet they just posted. */
function card(carousel, profile) {
  const cover = (carousel.items || []).find((i) => !i.sold) || (carousel.items || [])[0];
  const handle = carousel.sellerUsername || profile?.username;
  const count = (carousel.items || []).length;

  const media = cover?.imageURL
    ? el("img", {
        class: "seller-card__img",
        src: sized(cover.imageURL, 520),
        alt: "",
        loading: "lazy",
        decoding: "async",
      })
    : el("span", { class: "seller-card__initials" }, initials(carousel.sellerName));

  return el("article", { class: "seller-card" }, [
    el("span", { class: "seller-card__media" }, [media]),
    el("p", { class: "seller-card__name" }, handle ? `@${handle}` : carousel.sellerName || "Closet Seller"),
    el("p", { class: "seller-card__meta" }, `${count} piece${count === 1 ? "" : "s"}`),
    el("a", { class: "btn btn--chrome btn--sm", href: `profile.html?uid=${carousel.sellerId}` }, "View account"),
  ]);
}
