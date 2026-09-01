import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  updateProfile,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { initials, isAdminUser, normalizeUsername, usernameError } from "./utils.js";

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export { isAdminUser };

// Creates the users/{uid} profile doc the first time someone signs in.
// Safe to call on every sign-in — it's a no-op if the doc already exists.
export async function ensureUserDoc(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      // Deliberately not user.displayName / user.photoURL: signing in with
      // Google shouldn't quietly publish the name and picture off somebody's
      // Google account. They fill those in themselves.
      displayName: extra.displayName || "",
      email: user.email || "",
      username: "",
      bio: "",
      profilePicURL: "",
      socialLinks: { instagram: "", tiktok: "", facebook: "", whatsapp: "" },
      banned: false,
      createdAt: serverTimestamp(),
      ...extra,
    });
  }
  return ref;
}

// ---------------------------------------------------------------------
// Usernames
// ---------------------------------------------------------------------

/** True if nobody has claimed this username yet. */
export async function isUsernameFree(name) {
  const clean = normalizeUsername(name);
  const snap = await getDoc(doc(db, "usernames", clean));
  return !snap.exists();
}

/**
 * Claims a username for a user, releasing their previous one.
 *
 * Uniqueness comes from usernames/{name} being a real document: the rules
 * only allow `create`, so a second person claiming the same name gets a
 * permission error rather than silently overwriting. The batch keeps the
 * profile field and the claim doc from drifting apart.
 */
export async function claimUsername(uid, name, previous = "") {
  const clean = normalizeUsername(name);
  const problem = usernameError(clean);
  if (problem) throw new Error(problem);

  if (clean === normalizeUsername(previous)) return clean;

  const existing = await getDoc(doc(db, "usernames", clean));
  if (existing.exists()) {
    if (existing.data().uid === uid) return clean;
    throw new Error(`@${clean} is already taken. Try another one.`);
  }

  const batch = writeBatch(db);
  batch.set(doc(db, "usernames", clean), { uid });
  batch.set(doc(db, "users", uid), { username: clean }, { merge: true });
  if (previous) batch.delete(doc(db, "usernames", normalizeUsername(previous)));

  try {
    await batch.commit();
  } catch (err) {
    // Someone claimed it in the split second since the check above.
    if (err?.code === "permission-denied") {
      throw new Error(`@${clean} was just taken. Try another one.`);
    }
    throw err;
  }
  return clean;
}

/** Looks up the uid behind a username, or null. */
export async function uidForUsername(name) {
  const snap = await getDoc(doc(db, "usernames", normalizeUsername(name)));
  return snap.exists() ? snap.data().uid : null;
}

// ---------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------
// The platform is invite-only: accounts exist because Grace sent someone
// a link, not because they found the site. A code is readable by anyone
// holding the link, so the sign-up page can check it before showing the
// form, but only the admin can list or issue them.

/** The full sign-up link for a code, ready to paste into a message. */
export function inviteLink(code) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  return `${base}login.html?invite=${encodeURIComponent(code)}`;
}

/** Reads one invite, or null if the code doesn't exist. */
export async function readInvite(code) {
  const clean = String(code || "").trim().toLowerCase();
  if (!clean) return null;
  const snap = await getDoc(doc(db, "invites", clean));
  return snap.exists() ? { code: clean, ...snap.data() } : null;
}

/** null if the code can still be used, otherwise the reason it can't. */
export async function inviteProblem(code) {
  const invite = await readInvite(code);
  if (!invite) return "That invite link isn't valid. Ask Closet Sales Namibia for a new one.";
  if (invite.revoked) return "That invite has been cancelled. Ask for a new one.";
  if (invite.usedBy) return "That invite has already been used to make an account.";
  return null;
}

// ---------------------------------------------------------------------
// Sign in / up / out
// ---------------------------------------------------------------------

/**
 * Turns an invite into a real member: writes the profile, claims the
 * username, and burns the invite.
 *
 * All three go in one batch. The rules read the invite as it will be
 * *after* the batch commits, so a profile can only exist next to an
 * invite stamped with that same uid — that's what makes invite-only true
 * at the database rather than just hidden in the UI. It's also what makes
 * a link single-use: the second person to open it finds usedBy already
 * set, and the rules refuse to let them overwrite it.
 */
export async function claimInvite(user, name, username, inviteCode) {
  const clean = normalizeUsername(username);
  const problem = usernameError(clean);
  if (problem) throw new Error(problem);

  const inviteIssue = await inviteProblem(inviteCode);
  if (inviteIssue) throw new Error(inviteIssue);
  const code = String(inviteCode).trim().toLowerCase();

  if (!(await isUsernameFree(clean))) throw new Error(`@${clean} is already taken. Try another one.`);

  const batch = writeBatch(db);
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    displayName: (name || "").trim(),   // optional; the site falls back to the username
    email: user.email || "",
    username: clean,
    inviteCode: code,
    bio: "",
    profilePicURL: "",
    socialLinks: { instagram: "", tiktok: "", facebook: "", whatsapp: "" },
    banned: false,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "usernames", clean), { uid: user.uid });
  batch.update(doc(db, "invites", code), { usedBy: user.uid, usedAt: serverTimestamp() });

  try {
    await batch.commit();
  } catch (err) {
    if (err?.code === "permission-denied") {
      throw new Error(`@${clean} was just taken, or that link was used a moment ago.`);
    }
    throw err;
  }
}

export async function signUpWithEmail(name, email, password, username, inviteCode) {
  const clean = normalizeUsername(username);
  const problem = usernameError(clean);
  if (problem) throw new Error(problem);

  const inviteIssue = await inviteProblem(inviteCode);
  if (inviteIssue) throw new Error(inviteIssue);

  if (!(await isUsernameFree(clean))) throw new Error(`@${clean} is already taken. Try another one.`);

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  await claimInvite(cred.user, name, clean, inviteCode);
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  // A profile is what makes someone a member, and only an invite creates
  // one. Somebody who has an auth login but no profile was never invited
  // (or was removed), so they're signed straight back out rather than
  // left in a half-working state.
  await requireMembership(cred.user);
  return cred.user;
}

// Popup first, redirect only as a rescue.
//
// The obvious reading is that popups are for desktops and redirects are for
// phones. On iOS it's the other way round. signInWithRedirect parks the
// state for the round trip on the Firebase domain, and Safari partitions
// storage belonging to any domain other than the one on screen — so the
// browser comes back from Google having forgotten why it left. A popup
// hands the answer back over postMessage and never touches that storage,
// which is why it survives where the redirect doesn't.
//
// What popups genuinely can't do is open inside Instagram's and Facebook's
// in-app browsers, which is where a good share of our sellers arrive from.
// Those throw, and that's what the redirect is kept around for.
function canRetryWithRedirect(err) {
  const code = err?.code || "";
  return (
    code.includes("popup-blocked") ||
    code.includes("operation-not-supported-in-this-environment") ||
    code.includes("web-storage-unsupported") ||
    code.includes("internal-error")
  );
}

/**
 * Starts Google sign-in. Returns the user, or null when the browser is on
 * its way out to Google — in which case the answer arrives on the next page
 * load via googleRedirectUser().
 *
 * `validated` skips re-checking an invite the caller has already checked.
 * That await matters more than it looks: iOS only allows a popup opened in
 * the same tick as the tap that asked for it, and anything awaited first
 * spends the gesture.
 */
export async function startGoogle(inviteCode = "", { validated = false } = {}) {
  if (inviteCode && !validated) {
    const issue = await inviteProblem(inviteCode);
    if (issue) throw new Error(issue);
  }

  const provider = new GoogleAuthProvider();
  // Phones get shared. Signing in silently as whoever used Google last is
  // worse than one more tap.
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    if (!canRetryWithRedirect(err)) throw err;
    await signInWithRedirect(auth, provider);
    return null;
  }
}

/** The user coming back from a redirect sign-in, or null on a normal load. */
export async function googleRedirectUser() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (err) {
    // A failed redirect shouldn't take the whole page down with it
    console.error("Google redirect sign-in failed:", err);
    throw err;
  }
}

/**
 * What to do with somebody Google just handed us. A profile is what makes
 * a member, and only an invite creates one, so no profile means they were
 * never invited — unless they're holding a live invite right now.
 */
export async function afterGoogle(user) {
  if (isAdminUser(user)) {
    await ensureUserDoc(user);
    return { member: true };
  }
  const profile = await loadProfile(user.uid);
  return { member: Boolean(profile) };
}

export async function signOutUser() {
  await signOut(auth);
}

/** Reads the profile doc; used for ban and username checks. */
export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// ---------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------

/**
 * Deletes the signed-in user's own account: their carousels, their
 * username claim, their profile doc, then the Firebase Auth user itself.
 *
 * Firebase requires a recent login before deleting an auth account; if
 * the session is stale it throws `auth/requires-recent-login`, which the
 * caller turns into a "sign in again" message.
 */
export async function deleteOwnAccount(user) {
  const profile = await loadProfile(user.uid);

  const mine = await getDocs(
    query(collection(db, "carousels"), where("sellerId", "==", user.uid), limit(300))
  );
  const batch = writeBatch(db);
  mine.forEach((d) => batch.delete(d.ref));
  if (profile?.username) batch.delete(doc(db, "usernames", profile.username));
  batch.delete(doc(db, "users", user.uid));
  await batch.commit();

  await deleteUser(user);
}

/**
 * Admin removal. Wipes the person's listings and profile details but
 * KEEPS the users/{uid} doc as a tombstone with banned:true — deleting it
 * outright would let them sign in again and have ensureUserDoc quietly
 * recreate a fresh profile, undoing the ban. Their Firebase Auth login
 * still exists; removing that needs the Admin SDK on the server.
 */
export async function adminDeleteAccount(uid) {
  const profile = await loadProfile(uid);

  const theirs = await getDocs(
    query(collection(db, "carousels"), where("sellerId", "==", uid), limit(300))
  );
  const batch = writeBatch(db);
  theirs.forEach((d) => batch.delete(d.ref));
  if (profile?.username) batch.delete(doc(db, "usernames", profile.username));
  batch.set(
    doc(db, "users", uid),
    {
      displayName: "Deleted account",
      username: "",
      bio: "",
      profilePicURL: "",
      socialLinks: { instagram: "", tiktok: "", facebook: "", whatsapp: "" },
      banned: true,
      deleted: true,
    },
    { merge: true }
  );
  await batch.commit();
  return theirs.size;
}

export async function setBanned(uid, banned) {
  await setDoc(doc(db, "users", uid), { banned }, { merge: true });
}

// ---------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------

// Use on pages that require a signed-in user (like sell.html). Redirects
// to the login page — with a `redirect` param so the user lands back here
// after signing in — if nobody's signed in. Banned users are bounced to
// the feed rather than being left in a broken half-working state.
export function requireAuth(onUser) {
  return watchAuthState(async (user) => {
    if (!user) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.href = `login.html?redirect=${redirect}`;
      return;
    }
    const profile = await loadProfile(user.uid);
    if (profile?.banned) {
      location.href = "index.html?banned=1";
      return;
    }
    onUser(user, profile);
  });
}

/** Use on admin.html — anyone who isn't the admin gets sent home. */
export function requireAdmin(onAdmin) {
  return watchAuthState((user) => {
    if (!user) {
      location.href = "login.html?redirect=" + encodeURIComponent("admin.html");
      return;
    }
    if (!isAdminUser(user)) {
      location.href = "index.html";
      return;
    }
    onAdmin(user);
  });
}

// Fills in the `[data-nav-auth]` slot that every page's navbar has.
export function renderNavAuth(user) {
  const authArea = document.querySelector("[data-nav-auth]");
  if (!authArea) return;

  if (!user) {
    // an icon rather than a button, to balance the search icon opposite
    authArea.innerHTML =
      `<a href="login.html" aria-label="Log in">` +
      `<i class="ico ico--user" aria-hidden="true"></i></a>`;
    return;
  }

  const avatar = user.photoURL
    ? `<img class="avatar-bubble" src="${user.photoURL}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="avatar-bubble">${initials(user.displayName)}</span>`;

  const adminLink = isAdminUser(user)
    ? `<a href="admin.html"><i class="ico ico--tools"></i> Admin dashboard</a>`
    : `<a href="sell.html"><i class="ico ico--tag"></i> Sell your closet</a>`;

  authArea.innerHTML = `
    <div class="nav-user">
      <button class="nav-avatar-btn" type="button" data-nav-user-trigger aria-haspopup="true" aria-expanded="false" aria-label="Account menu">
        ${avatar}
      </button>
      <div class="nav-user__menu" data-nav-user-menu>
        <a href="profile.html?uid=${user.uid}"><i class="ico ico--user"></i> My profile</a>
        ${adminLink}
        <a href="shop.html"><i class="ico ico--search"></i> View sellers</a>
        <button type="button" data-logout><i class="ico ico--close"></i> Log out</button>
      </div>
    </div>
  `;

  const trigger = authArea.querySelector("[data-nav-user-trigger]");
  const menu = authArea.querySelector("[data-nav-user-menu]");
  const closeMenu = () => {
    menu.classList.remove("nav-user__menu--open");
    trigger.setAttribute("aria-expanded", "false");
  };
  trigger.addEventListener("pointerdown", (e) => e.stopPropagation());
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("nav-user__menu--open");
    trigger.setAttribute("aria-expanded", String(open));
  });
  // pointerdown, not click: a tap on plain page furniture never reaches
  // document as a click in iOS Safari, so the menu would stay stuck open.
  document.addEventListener("pointerdown", closeMenu);

  authArea.querySelector("[data-logout]").addEventListener("click", async () => {
    await signOutUser();
    location.href = "index.html";
  });
}
