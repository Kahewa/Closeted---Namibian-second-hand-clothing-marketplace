import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { initials } from "./utils.js";

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

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
      bio: "",
      profilePicURL: user.photoURL || "",
      socialLinks: { instagram: "", tiktok: "", facebook: "", whatsapp: "" },
      createdAt: serverTimestamp(),
      ...extra,
    });
  }
  return ref;
}

export async function signUpWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await ensureUserDoc(cred.user, { displayName: name });
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
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

// Use on pages that require a signed-in user (like sell.html). Redirects
// to the login page — with a `redirect` param so the user lands back here
// after signing in — if nobody's signed in.
export function requireAuth(onUser) {
  return watchAuthState((user) => {
    if (!user) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.href = `login.html?redirect=${redirect}`;
    } else {
      onUser(user);
    }
  });
}

// Fills in the `[data-nav-auth]` slot that every page's navbar has.
export function renderNavAuth(user) {
  const authArea = document.querySelector("[data-nav-auth]");
  if (!authArea) return;

  if (!user) {
    authArea.innerHTML = `<a class="btn btn--chrome btn--sm" href="login.html">Log in</a>`;
    return;
  }

  authArea.innerHTML = `
    <div class="nav-user">
      <button class="nav-avatar-btn" type="button" data-nav-user-trigger aria-haspopup="true" aria-expanded="false">
        <span class="nav-avatar">${initials(user.displayName)}</span>
      </button>
      <div class="nav-user__menu" data-nav-user-menu>
        <a href="profile.html?uid=${user.uid}">👗 My profile</a>
        <a href="sell.html">🏷️ Sell your closet</a>
        <button type="button" data-logout>🚪 Log out</button>
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
