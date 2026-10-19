// Sign-in exists for one person only: the admin, with a password. Shoppers
// never log in — the feed is public and they contact the seller on
// WhatsApp.
//
// Neither the password nor the account's email is in this code
// (everything here ships to the browser). Firebase password accounts need
// an email, so the admin's is worked out from the password itself: a
// one-way hash that can't be turned back into the password. Firebase then
// checks the password. scripts/set-admin-password.js does the same
// hashing when it creates the account — keep the two in step.
import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { isAdminUser } from "./utils.js";

export { isAdminUser };

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

async function loginEmail(password) {
  const bytes = new TextEncoder().encode(`closet-admin:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 32)}@closet-bg.firebaseapp.com`;
}

export async function signInWithPassword(password) {
  await signInWithEmailAndPassword(auth, await loginEmail(password), password);
}

export async function signOutUser() {
  await signOut(auth);
}

export function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "That password isn't right.";
  if (code.includes("too-many-requests"))
    return "Too many wrong tries — wait a few minutes and try again.";
  if (code.includes("network-request-failed"))
    return "No connection — check your internet and try again.";
  if (code.includes("operation-not-allowed"))
    return "Password login is switched off — turn on Email/Password under Firebase → Authentication → Sign-in method.";
  return err?.message || "Something went wrong. Please try again.";
}
