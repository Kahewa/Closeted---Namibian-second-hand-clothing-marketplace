import { auth, db } from "./firebase-config.js";
import {
  doc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { deleteImages } from "./cloudinary.js";
import { el, initials, formatNAD, timeAgo, toFirestoreDate, toast, whatsappHref } from "./utils.js";

const CONDITION_CLASS = {
  "New with tags": "condition-pill--new",
  "Like new": "condition-pill--likenew",
  Good: "condition-pill--good",
  Fair: "condition-pill--fair",
};

/**
 * Renders one seller's carousel drop: a swipeable set of item photos,
 * each with its own price tag + condition pill, and a description bar
 * that updates as you swipe. Used on both the feed (many cards, other
 * people's) and the profile page (one seller's own, maybe with owner
 * controls).
 *
 * @param {object} carousel - { id, sellerId, sellerName, sellerPhotoURL, createdAt, items }
 * @param {import("firebase/auth").User|null} currentUser
 * @param {{ showSellerHeader?: boolean, onDeleted?: () => void }} options
 */
export function renderCarouselCard(carousel, currentUser, options = {}) {
  const { showSellerHeader = true, onDeleted } = options;
  const isOwner = currentUser && currentUser.uid === carousel.sellerId;
  const items = carousel.items || [];

  const card = el("article", { class: "carousel-card" });

  // A drop that hasn't been approved yet is only ever rendered for its own
  // seller (or the admin), so say plainly why nobody else can see it. The
  // edit button lives here too: editing is allowed right up until approval
  // and never after, so it's shown only on this banner.
  if (carousel.status && carousel.status !== "approved") {
    const pending = carousel.status === "pending";
    const note = el("div", { class: `approval-note approval-note--${carousel.status}` }, [
      el("strong", {}, [el("i", { class: `ico ico--${pending ? "hourglass" : "close"}`, "aria-hidden": "true" }), pending ? " Waiting for approval" : " Not approved"]),
      el(
        "span",
        {},
        pending
          ? " — we're checking your N$150 payment. Your carousel goes live on the feed as soon as it clears."
          : " — this carousel wasn't approved. Message us on WhatsApp if you think that's a mistake."
      ),
    ]);

    if (isOwner) {
      note.append(
        el("div", { class: "approval-note__actions" }, [
          el("a", { class: "btn btn--chrome btn--sm", href: `sell.html?edit=${carousel.id}` }, [el("i", { class: "ico ico--pencil", "aria-hidden": "true" }), " edit this carousel"]),
          el("span", { class: "approval-note__lock" }, "editable until approved"),
        ])
      );
    }

    card.append(note);
  }

  // ---- title bar -------------------------------------------------
  if (showSellerHeader) {
    const titlebar = el("header", { class: "carousel-card__titlebar" });

    const sellerLink = el(
      "a",
      { class: "carousel-card__seller", href: `profile.html?uid=${carousel.sellerId}` },
      [
        carousel.sellerPhotoURL
          ? el("img", { class: "avatar-bubble avatar-bubble--sm", src: carousel.sellerPhotoURL, alt: carousel.sellerName || "Seller" })
          : el("span", { class: "avatar-bubble avatar-bubble--sm" }, initials(carousel.sellerName)),
        el("span", { class: "carousel-card__meta" }, [
          el("span", { class: "carousel-card__name" }, carousel.sellerName || "Closet Seller"),
          el("span", { class: "carousel-card__time" }, timeAgo(toFirestoreDate(carousel.createdAt))),
        ]),
      ]
    );
    titlebar.append(sellerLink);

    if (isOwner) {
      const menuWrap = el("div", { class: "carousel-card__owner-menu" });
      const trigger = el("button", { class: "carousel-card__owner-trigger", type: "button", "aria-label": "Listing options" }, "⋯");
      const dropdown = el("div", { class: "carousel-card__owner-dropdown" }, [
        el(
          "button",
          {
            type: "button",
            onClick: async () => {
              if (!confirm("Delete this whole carousel? This can't be undone.")) return;
              await deleteCarousel(carousel);
              card.remove();
              onDeleted?.();
            },
          },
          [el("i", { class: "ico ico--trash", "aria-hidden": "true" }), " Delete listing"]
        ),
      ]);
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("carousel-card__owner-dropdown--open");
      });
      document.addEventListener("click", () => dropdown.classList.remove("carousel-card__owner-dropdown--open"));
      menuWrap.append(trigger, dropdown);
      titlebar.append(menuWrap);
    }

    card.append(titlebar);
  }

  // ---- track -------------------------------------------------------
  const track = el("div", { class: "carousel-card__track" });
  const dotsRow = el("div", { class: "carousel-card__dots" });

  items.forEach((item, index) => {
    const slide = el("div", {
      class: `carousel-card__slide${item.sold ? " carousel-card__slide--sold" : ""}`,
      "data-index": index,
    });

    slide.append(
      el("img", {
        class: "carousel-card__img",
        src: item.imageURL,
        alt: `${item.category || "Item"} — size ${item.size || "?"}`,
        loading: "lazy",
      }),
      el("div", { class: "price-tag" }, [
        el("span", { class: "price-tag__amount" }, formatNAD(item.price)),
      ])
    );

    if (item.sold) {
      slide.append(el("div", { class: "carousel-card__sold-stamp" }, "SOLD"));
    }

    if (isOwner) {
      const soldBtn = el(
        "button",
        {
          class: "carousel-card__sold-toggle",
          type: "button",
          onClick: async () => {
            await toggleSold(carousel, item.id);
            const nowSold = !item.sold;
            item.sold = nowSold;
            slide.classList.toggle("carousel-card__slide--sold", nowSold);
            const existingStamp = slide.querySelector(".carousel-card__sold-stamp");
            if (nowSold && !existingStamp) {
              slide.append(el("div", { class: "carousel-card__sold-stamp" }, "SOLD"));
            } else if (!nowSold && existingStamp) {
              existingStamp.remove();
            }
            toast(nowSold ? "Marked as sold" : "Back on the rack");
          },
        },
        item.sold ? [el("i", { class: "ico ico--undo", "aria-hidden": "true" }), " Mark unsold"] : [el("i", { class: "ico ico--check", "aria-hidden": "true" }), " Mark sold"]
      );
      slide.append(soldBtn);
    }

    track.append(slide);

    const dot = el("button", {
      class: `carousel-card__dot${index === 0 ? " carousel-card__dot--active" : ""}`,
      type: "button",
      "aria-label": `Go to item ${index + 1}`,
      onClick: () => track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" }),
    });
    dotsRow.append(dot);
  });

  const dots = Array.from(dotsRow.children);
  const conditionBadge = el("span", { class: "condition-pill" });
  const metaBar = el("div", { class: "carousel-card__meta-bar" }, [
    el("div", { class: "carousel-card__meta-line" }, [
      el("span", { class: "carousel-card__meta-size", "data-meta-size": true }),
      conditionBadge,
    ]),
    el("p", { class: "carousel-card__meta-notes", "data-meta-notes": true }),
  ]);

  function paintActive(index) {
    const item = items[index];
    if (!item) return;
    dots.forEach((d, i) => d.classList.toggle("carousel-card__dot--active", i === index));
    const sizeEl = metaBar.querySelector("[data-meta-size]");
    const notesEl = metaBar.querySelector("[data-meta-notes]");
    sizeEl.textContent = `Size ${item.size || "—"} · ${item.store || "Unlisted store"}`;
    notesEl.textContent = item.notes || "";
    notesEl.hidden = !item.notes;
    conditionBadge.textContent = item.condition || "";
    conditionBadge.className = `condition-pill ${CONDITION_CLASS[item.condition] || ""}`;
  }

  if (items.length) paintActive(0);

  if (items.length > 1 && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            paintActive(Number(entry.target.dataset.index));
          }
        });
      },
      { root: track, threshold: 0.6 }
    );
    Array.from(track.children).forEach((slideEl) => observer.observe(slideEl));
  }

  const media = el("div", { class: "carousel-card__media" }, [track]);

  if (items.length > 1) {
    const prevBtn = el(
      "button",
      {
        class: "carousel-card__arrow carousel-card__arrow--prev",
        type: "button",
        "aria-label": "Previous item",
        onClick: () => track.scrollBy({ left: -track.clientWidth, behavior: "smooth" }),
      },
      "‹"
    );
    const nextBtn = el(
      "button",
      {
        class: "carousel-card__arrow carousel-card__arrow--next",
        type: "button",
        "aria-label": "Next item",
        onClick: () => track.scrollBy({ left: track.clientWidth, behavior: "smooth" }),
      },
      "›"
    );
    media.append(prevBtn, nextBtn);
  }

  card.append(media, dotsRow, metaBar);

  // Straight into WhatsApp when the seller gave a number. Older carousels
  // posted before that field existed fall back to their profile, where the
  // socials live.
  const waLink = whatsappHref(
    carousel.sellerWhatsapp,
    `Hi${carousel.sellerName ? ` ${carousel.sellerName.split(" ")[0]}` : ""}! I saw your closet drop on Closet Sales Namibia. I'd like to enquire about a few items`
  );

  card.append(
    el("footer", { class: "carousel-card__footer" }, [
      waLink
        ? el(
            "a",
            { class: "btn btn--lime btn--sm", href: waLink, target: "_blank", rel: "noopener noreferrer" },
            [el("i", { class: "ico ico--chat", "aria-hidden": "true" }), " Message seller on WhatsApp"]
          )
        : el(
            "a",
            { class: "btn btn--outline btn--sm", href: `profile.html?uid=${carousel.sellerId}#contact` },
            [el("i", { class: "ico ico--mail", "aria-hidden": "true" }), " Message seller"]
          ),
    ])
  );

  return card;
}

async function toggleSold(carousel, itemId) {
  const items = (carousel.items || []).map((it) => (it.id === itemId ? { ...it, sold: !it.sold } : it));
  carousel.items = items;
  await updateDoc(doc(db, "carousels", carousel.id), { items });
}

async function deleteCarousel(carousel) {
  // Image cleanup is best-effort: if the server is down or Cloudinary's
  // keys are missing, the seller should still be able to take the listing
  // off the feed. Worst case a few orphaned files sit in the account.
  try {
    const idToken = await auth.currentUser.getIdToken();
    await deleteImages((carousel.items || []).map((item) => item.publicId), idToken);
  } catch (err) {
    console.warn("Couldn't delete the photos (removing the listing anyway):", err);
  }

  await deleteDoc(doc(db, "carousels", carousel.id));
  toast("Listing deleted");
}
