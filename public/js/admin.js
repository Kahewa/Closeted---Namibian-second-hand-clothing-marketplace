import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { requireAdmin, adminDeleteAccount, setBanned, inviteLink } from "./auth.js";
import { deleteImages, sized } from "./cloudinary.js";
import { auth } from "./firebase-config.js";
import { $, $all, el, toast, initials, formatNAD, timeAgo, toFirestoreDate } from "./utils.js";

const PAGE = 60;

const pendingList = $("[data-pending-list]");
const pendingEmpty = $("[data-pending-empty]");
const pendingLoading = $("[data-pending-loading]");
const liveList = $("[data-live-list]");
const liveEmpty = $("[data-live-empty]");
const liveLoading = $("[data-live-loading]");
const usersList = $("[data-users-list]");
const usersLoading = $("[data-users-loading]");
const accountSearch = $("[data-account-search]");

let allUsers = [];

requireAdmin(() => {
  loadPending();
  loadLive();
  loadUsers();
  loadInvites();
  findLegacyCarousels();
});

// ---------------------------------------------------------------------
// Carousels posted before `status` existed. Firestore can't query for a
// missing field, so this reads the collection and filters in the client —
// fine at this size, and it only has to be used once.
// ---------------------------------------------------------------------
let legacyDocs = [];

async function findLegacyCarousels() {
  try {
    const snap = await getDocs(query(collection(db, "carousels"), limit(300)));
    legacyDocs = snap.docs.filter((d) => !d.data().status);
    const banner = $("[data-legacy]");
    if (!legacyDocs.length) {
      banner.hidden = true;
      return;
    }
    $("[data-legacy-count]").textContent = legacyDocs.length;
    banner.hidden = false;
  } catch (err) {
    console.error("Couldn't check for older carousels:", err);
  }
}

async function stampLegacy(status) {
  if (!legacyDocs.length) return;
  const batch = writeBatch(db);
  legacyDocs.forEach((d) => batch.update(d.ref, { status }));
  try {
    await batch.commit();
    toast(`${legacyDocs.length} carousel(s) set to ${status}`);
    legacyDocs = [];
    $("[data-legacy]").hidden = true;
    refreshLists();
  } catch (err) {
    console.error(err);
    toast("Couldn't update those carousels.", "error");
  }
}

$("[data-legacy-approve]")?.addEventListener("click", () => stampLegacy("approved"));
$("[data-legacy-pending]")?.addEventListener("click", () => stampLegacy("pending"));

// ---------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------
$all("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    $all("[data-tab]").forEach((t) => t.classList.remove("admin-tab--active"));
    tab.classList.add("admin-tab--active");
    $all("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    });
  });
});

// ---------------------------------------------------------------------
// carousels awaiting approval
// ---------------------------------------------------------------------
async function loadPending() {
  try {
    const snap = await getDocs(
      query(
        collection(db, "carousels"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(PAGE)
      )
    );
    pendingLoading.hidden = true;
    pendingList.innerHTML = "";
    $("[data-count-pending]").textContent = snap.size;
    pendingEmpty.hidden = snap.size > 0;

    snap.forEach((docSnap) => {
      pendingList.append(reviewRow({ id: docSnap.id, ...docSnap.data() }, true));
    });
  } catch (err) {
    console.error(err);
    pendingLoading.innerHTML = indexHint(err);
  }
}

async function loadLive() {
  try {
    const snap = await getDocs(
      query(
        collection(db, "carousels"),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc"),
        limit(PAGE)
      )
    );
    liveLoading.hidden = true;
    liveList.innerHTML = "";
    liveEmpty.hidden = snap.size > 0;
    snap.forEach((docSnap) => {
      liveList.append(reviewRow({ id: docSnap.id, ...docSnap.data() }, false));
    });
  } catch (err) {
    console.error(err);
    liveLoading.innerHTML = indexHint(err);
  }
}

/** One carousel, with its photos, payment reference and the action buttons. */
function reviewRow(carousel, isPending) {
  const items = carousel.items || [];
  const total = items.reduce((sum, it) => sum + Number(it.price || 0), 0);

  const thumbs = el(
    "div",
    { class: "review__thumbs" },
    items.slice(0, 8).map((it) =>
      el("img", { class: "review__thumb", src: sized(it.imageURL, 200), alt: it.category || "item", loading: "lazy", decoding: "async" })
    )
  );

  const actions = el("div", { class: "review__actions" });

  if (isPending) {
    actions.append(
      el(
        "button",
        {
          class: "btn btn--primary btn--sm",
          type: "button",
          onClick: async (e) => setStatus(e.target, carousel, "approved"),
        },
        [el("i", { class: "ico ico--check", "aria-hidden": "true" }), " approve"]
      ),
      el(
        "button",
        {
          class: "btn btn--outline btn--sm",
          type: "button",
          onClick: async (e) => setStatus(e.target, carousel, "rejected"),
        },
        [el("i", { class: "ico ico--close", "aria-hidden": "true" }), " reject"]
      )
    );
  } else {
    actions.append(
      el(
        "button",
        {
          class: "btn btn--outline btn--sm",
          type: "button",
          onClick: async (e) => setStatus(e.target, carousel, "pending"),
        },
        [el("i", { class: "ico ico--undo", "aria-hidden": "true" }), " pull down"]
      )
    );
  }

  actions.append(
    el(
      "a",
      { class: "btn btn--chrome btn--sm", href: `profile.html?uid=${carousel.sellerId}`, target: "_blank" },
      "view seller"
    ),
    el(
      "button",
      {
        class: "btn btn--chrome btn--sm",
        type: "button",
        onClick: async (e) => removeCarousel(e.target, carousel),
      },
      [el("i", { class: "ico ico--trash", "aria-hidden": "true" }), " delete"]
    )
  );

  return el("article", { class: "review", "data-carousel": carousel.id }, [
    el("div", { class: "review__head" }, [
      el("div", {}, [
        el("p", { class: "review__seller" }, carousel.sellerName || "Closet Seller"),
        el(
          "p",
          { class: "review__meta" },
          `${carousel.sellerUsername ? "@" + carousel.sellerUsername + " · " : ""}${items.length} item${
            items.length === 1 ? "" : "s"
          } · ${formatNAD(total)} total · ${timeAgo(toFirestoreDate(carousel.createdAt))}`
        ),
      ]),
      el("span", { class: `status-pill status-pill--${carousel.status || "pending"}` }, carousel.status || "pending"),
    ]),
    el("p", { class: "review__ref" }, [
      el("span", { class: "review__ref-label" }, "payment reference"),
      el("strong", {}, carousel.paymentRef || carousel.sellerUsername || "none yet"),
    ]),
    thumbs,
    actions,
  ]);
}

async function setStatus(btn, carousel, status) {
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "carousels", carousel.id), { status });
    toast(
      status === "approved" ? "Approved, it's live now" : status === "rejected" ? "Rejected" : "Pulled down"
    );
    refreshLists();
  } catch (err) {
    console.error(err);
    toast("Couldn't update that listing.", "error");
    btn.disabled = false;
  }
}

async function removeCarousel(btn, carousel) {
  if (!confirm("Delete this carousel and its photos? This can't be undone.")) return;
  btn.disabled = true;
  try {
    // Best-effort image cleanup — the listing still goes even if the
    // server or Cloudinary keys aren't available.
    try {
      const idToken = await auth.currentUser.getIdToken();
      await deleteImages((carousel.items || []).map((i) => i.publicId), idToken);
    } catch (err) {
      console.warn("Image cleanup failed (deleting the listing anyway):", err);
    }
    await deleteDoc(doc(db, "carousels", carousel.id));
    toast("Carousel deleted");
    refreshLists();
  } catch (err) {
    console.error(err);
    toast("Couldn't delete that carousel.", "error");
    btn.disabled = false;
  }
}

function refreshLists() {
  pendingLoading.hidden = false;
  pendingLoading.textContent = "Loading…";
  liveLoading.hidden = false;
  liveLoading.textContent = "Loading…";
  loadPending();
  loadLive();
}

// ---------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------
async function loadUsers() {
  try {
    const snap = await getDocs(query(collection(db, "users"), limit(300)));
    allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    allUsers.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    usersLoading.hidden = true;
    $("[data-count-users]").textContent = allUsers.length;
    paintUsers();
  } catch (err) {
    console.error(err);
    usersLoading.textContent = `Couldn't load accounts: ${err.message}`;
  }
}

function paintUsers() {
  const term = (accountSearch.value || "").trim().toLowerCase();
  const rows = allUsers.filter(
    (u) =>
      !term ||
      (u.displayName || "").toLowerCase().includes(term) ||
      (u.username || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term)
  );

  usersList.innerHTML = "";
  if (!rows.length) {
    usersList.append(el("p", { class: "muted text-center" }, "No accounts match that."));
    return;
  }

  rows.forEach((u) => {
    const avatar = u.profilePicURL
      ? el("img", { class: "avatar-bubble avatar-bubble--sm", src: sized(u.profilePicURL, 72, { square: true }), alt: "", loading: "lazy", decoding: "async" })
      : el("span", { class: "avatar-bubble avatar-bubble--sm" }, initials(u.displayName));

    const actions = el("div", { class: "account__actions" }, [
      el("a", { class: "btn btn--chrome btn--sm", href: `profile.html?uid=${u.uid}`, target: "_blank" }, "view"),
      el(
        "button",
        {
          class: "btn btn--outline btn--sm",
          type: "button",
          onClick: async (e) => toggleBan(e.target, u),
        },
        u.banned ? "unban" : "ban"
      ),
      el(
        "button",
        {
          class: "btn btn--chrome btn--sm",
          type: "button",
          onClick: async (e) => wipeAccount(e.target, u),
        },
        [el("i", { class: "ico ico--trash", "aria-hidden": "true" }), " delete"]
      ),
    ]);

    usersList.append(
      el("div", { class: "account" }, [
        avatar,
        el("div", { class: "account__who" }, [
          el("p", { class: "account__name" }, [
            u.displayName || "Closet Seller",
            u.banned ? el("span", { class: "status-pill status-pill--rejected" }, "banned") : null,
            u.deleted ? el("span", { class: "status-pill status-pill--pending" }, "deleted") : null,
          ]),
          el("p", { class: "account__meta" }, `${u.username ? "@" + u.username + " · " : ""}${u.email || ""}`),
        ]),
        actions,
      ])
    );
  });
}

accountSearch?.addEventListener("input", paintUsers);

async function toggleBan(btn, user) {
  btn.disabled = true;
  try {
    await setBanned(user.uid, !user.banned);
    user.banned = !user.banned;
    toast(user.banned ? "Account banned" : "Account unbanned");
    paintUsers();
  } catch (err) {
    console.error(err);
    toast("Couldn't change that account.", "error");
    btn.disabled = false;
  }
}

async function wipeAccount(btn, user) {
  if (
    !confirm(
      `Delete ${user.displayName || "this account"}?\n\n` +
        "This removes their listings and profile details and blocks them from coming back. " +
        "Their login itself can only be removed from the Firebase console."
    )
  ) {
    return;
  }
  btn.disabled = true;
  try {
    const removed = await adminDeleteAccount(user.uid);
    Object.assign(user, { deleted: true, banned: true, username: "", displayName: "Deleted account" });
    toast(`Account wiped (${removed} carousel${removed === 1 ? "" : "s"} removed)`);
    paintUsers();
    refreshLists();
  } catch (err) {
    console.error(err);
    toast("Couldn't delete that account.", "error");
    btn.disabled = false;
  }
}


// ---------------------------------------------------------------------
// Invites
//
// Accounts only exist because an invite was sent, so this is the front
// door. A code is a short random string used as the document id: short
// enough to read out over the phone, random enough that guessing one is
// hopeless, and unique because Firestore refuses a second create on the
// same id.
// ---------------------------------------------------------------------
const invitesList = $("[data-invites-list]");
const invitesLoading = $("[data-invites-loading]");
const invitesEmpty = $("[data-invites-empty]");

// no 0/o/1/l/i — these get read aloud and typed by hand
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

let allInvites = [];

async function loadInvites() {
  if (!invitesList) return;
  try {
    const snap = await getDocs(query(collection(db, "invites"), limit(300)));
    allInvites = snap.docs.map((d) => ({ code: d.id, ...d.data() }));
    // newest first, and anything still waiting to be used above the rest
    allInvites.sort((a, b) => {
      const used = Number(Boolean(a.usedBy)) - Number(Boolean(b.usedBy));
      if (used) return used;
      return (toFirestoreDate(b.createdAt)?.getTime() || 0) - (toFirestoreDate(a.createdAt)?.getTime() || 0);
    });
    invitesLoading.hidden = true;
    $("[data-count-invites]").textContent = allInvites.filter((i) => !i.usedBy && !i.revoked).length;
    paintInvites();
  } catch (err) {
    console.error(err);
    invitesLoading.textContent = `Couldn't load invites: ${err.message}`;
  }
}

function paintInvites() {
  invitesList.innerHTML = "";
  invitesEmpty.hidden = allInvites.length > 0;
  allInvites.forEach((invite) => invitesList.append(inviteRow(invite)));
}

function inviteRow(invite) {
  const used = Boolean(invite.usedBy);
  const dead = used || invite.revoked;
  const link = inviteLink(invite.code);

  const state = invite.revoked
    ? el("span", { class: "invite-pill invite-pill--dead" }, "cancelled")
    : used
    ? el("span", { class: "invite-pill invite-pill--used" }, "used")
    : el("span", { class: "invite-pill" }, "waiting to be used");

  const who = used ? (allUsers.find((u) => u.uid === invite.usedBy) || null) : null;

  const meta = [];
  if (invite.note) meta.push(invite.note);
  if (who) meta.push(who.username ? `@${who.username}` : who.displayName || "an account");
  const created = toFirestoreDate(invite.createdAt);
  if (created) meta.push(`made ${timeAgo(created)}`);

  const actions = el("div", { class: "invite-row__actions" });

  if (!dead) {
    const copyBtn = el("button", { class: "btn btn--primary btn--sm", type: "button" }, "Copy link");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast("Invite link copied. Paste it into a message.", "success");
      } catch {
        toast("Couldn't copy it. Select the link and copy it by hand.", "error");
      }
    });

    const waBtn = el("a", {
      class: "btn btn--outline btn--sm",
      href: `https://wa.me/?text=${encodeURIComponent(
        `Hi! Here's your invite to sell on Closet Sales Namibia. Set up your account here: ${link}`
      )}`,
      target: "_blank",
      rel: "noopener",
    }, "Send on WhatsApp");

    const killBtn = el("button", { class: "btn btn--outline btn--sm", type: "button" }, "Cancel");
    killBtn.addEventListener("click", () => revokeInvite(killBtn, invite));

    actions.append(copyBtn, waBtn, killBtn);
  } else {
    const delBtn = el("button", { class: "btn btn--outline btn--sm", type: "button" }, "Remove");
    delBtn.addEventListener("click", () => deleteInvite(delBtn, invite));
    actions.append(delBtn);
  }

  return el("article", { class: `invite-row${dead ? " invite-row--dead" : ""}` }, [
    el("div", { class: "invite-row__main" }, [
      el("p", { class: "invite-row__code" }, [el("code", {}, invite.code), state]),
      el("p", { class: "invite-row__link" }, dead ? meta.join(" · ") || "no notes" : link),
      meta.length && !dead ? el("p", { class: "invite-row__meta" }, meta.join(" · ")) : null,
    ].filter(Boolean)),
    actions,
  ]);
}

// One button: mint a code, copy the link, show it. Clicking again renews
// it — a fresh single-use link for the next person, so the admin never has
// to think about which link went where.
$("[data-invite-create]")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const noteField = $("[data-invite-for]");
  const latest = $("[data-invite-latest]");
  const label = btn.innerHTML;

  btn.disabled = true;
  try {
    const code = newCode();
    await setDoc(doc(db, "invites", code), {
      note: (noteField.value || "").trim(),
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || "",
      usedBy: null,
      revoked: false,
    });
    noteField.value = "";

    const link = inviteLink(code);
    latest.textContent = link;
    latest.hidden = false;

    try {
      await navigator.clipboard.writeText(link);
      toast("New link copied. Paste it to whoever you're inviting.", "success");
    } catch {
      // clipboard is blocked on insecure origins and in some browsers
      toast("Link created. Copy it from the row below.", "success");
    }

    btn.innerHTML = '<i class="ico ico--check" aria-hidden="true"></i> Copied, generate another';
    setTimeout(() => {
      btn.innerHTML = label;
    }, 2600);

    await loadInvites();
  } catch (err) {
    console.error(err);
    toast(`Couldn't create the invite: ${err.message}`, "error");
    btn.innerHTML = label;
  } finally {
    btn.disabled = false;
  }
});

async function revokeInvite(btn, invite) {
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "invites", invite.code), { revoked: true });
    toast("That link won't work any more.", "success");
    await loadInvites();
  } catch (err) {
    toast(`Couldn't cancel it: ${err.message}`, "error");
    btn.disabled = false;
  }
}

async function deleteInvite(btn, invite) {
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "invites", invite.code));
    await loadInvites();
  } catch (err) {
    toast(`Couldn't remove it: ${err.message}`, "error");
    btn.disabled = false;
  }
}

/** Firestore refuses these queries until the composite index exists. */
function indexHint(err) {
  const base = `Couldn't load: ${err.message}`;
  return /index/i.test(err.message)
    ? `${base}<br><small>Firestore needs a one-time index (status + createdAt). Open the browser console and click the link Firebase printed, or deploy <code>firebase/firestore.indexes.json</code>.</small>`
    : base;
}
