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

const HOW_MANY = 3;
// enough recent drops to find three different sellers even if one person
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

    // how many closets each of them has. A single-field equality query
    // needs no composite index; the status filter happens in memory, so
    // pending and rejected drops aren't counted as live closets.
    const counts = await Promise.all(
      ids.map(async (uid) => {
        try {
          const mine = await getDocs(
            query(collection(db, "carousels"), where("sellerId", "==", uid), limit(100))
          );
          return mine.docs.filter((d) => d.data().status === "approved").length;
        } catch {
          return null;
        }
      })
    );

    status.hidden = true;
    row.innerHTML = "";
    picks.forEach((carousel, i) =>
      row.append(card(carousel, profiles.get(carousel.sellerId), counts[i]))
    );
  } catch (err) {
    console.error("Couldn't load the newest sellers:", err);
    status.textContent = /index/i.test(err.message)
      ? "Firestore needs its status + createdAt index for this."
      : "Couldn't load sellers right now.";
  }
}

/** A seller: their picture, how many closets they have, and a way in. */
function card(carousel, profile, closets) {
  const handle = carousel.sellerUsername || profile?.username;
  const pic = profile?.profilePicURL || carousel.sellerPhotoURL;

  const avatar = pic
    ? el("img", {
        class: "seller-card__avatar",
        src: sized(pic, 260, { square: true }),
        alt: "",
        loading: "lazy",
        decoding: "async",
      })
    : el("span", { class: "seller-card__avatar seller-card__initials" }, initials(carousel.sellerName));

  const label =
    closets === null || closets === undefined
      ? ""
      : `${closets} closet${closets === 1 ? "" : "s"}`;

  return el("article", { class: "seller-card" }, [
    avatar,
    el("p", { class: "seller-card__name" }, handle ? `@${handle}` : carousel.sellerName || "Closet Seller"),
    el("p", { class: "seller-card__meta" }, label),
    el("a", { class: "btn btn--chrome btn--sm", href: `profile.html?uid=${carousel.sellerId}` }, "View account"),
  ]);
}
