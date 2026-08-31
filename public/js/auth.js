import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
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
      displayName: user.displayName || extra.displayName || "Closet Seller",
      email: user.email || "",
      username: "",
      bio: "",
      profilePicURL: user.photoURL || "",
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
    throw new Error(`@${clean} is already taken — try another.`);
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
      throw new Error(`@${clean} was just taken — try another.`);
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
// Sign in / up / out
// ---------------------------------------------------------------------

export async function signUpWithEmail(name, email, password, username) {
  const clean = normalizeUsername(username);
  const problem = usernameError(clean);
  if (problem) throw new Error(problem);
  if (!(await isUsernameFree(clean))) throw new Error(`@${clean} is already taken — try another.`);

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await ensureUserDoc(cred.user, { displayName: name });
  await claimUsername(cred.user.uid, clean);
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  // Repairs accounts whose users/{uid} doc never landed — e.g. someone
  // signed up before the Firestore rules were deployed.
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  await ensureUserDoc(cred.user);
  return cred.user;
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
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("nav-user__menu--open");
    trigger.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", closeMenu);

  authArea.querySelector("[data-logout]").addEventListener("click", async () => {
    await signOutUser();
    location.href = "index.html";
  });
}
