import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { signUpWithEmail, signInWithEmail, signInWithGoogle } from "./auth.js";
import { $, $all, toast, isAdminUser } from "./utils.js";

const redirectTarget = new URLSearchParams(location.search).get("redirect") || "index.html";

// createUserWithEmailAndPassword signs the user in immediately, so this
// listener fires while signUpWithEmail is still writing the profile doc
// and claiming the username. Navigating away at that moment would leave
// an account with no username. `busy` holds the redirect until the whole
// sign-up finishes, and the handlers below navigate themselves.
let busy = false;

function goHome(user) {
  // The admin lands on the dashboard rather than the shopper's feed.
  location.href = isAdminUser(user) ? "admin.html" : decodeURIComponent(redirectTarget);
}

onAuthStateChanged(auth, (user) => {
  if (!user || busy) return;
  goHome(user);
});

const tabs = $all("[data-tab]");
const panels = { signin: $("[data-panel='signin']"), signup: $("[data-panel='signup']") };

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("auth-tab--active"));
    tab.classList.add("auth-tab--active");
    Object.entries(panels).forEach(([key, panel]) => {
      panel.hidden = key !== tab.dataset.tab;
    });
  });
});

$("[data-signin-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "Logging in…";
  try {
    await signInWithEmail(form.email.value.trim(), form.password.value);
  } catch (err) {
    toast(friendlyAuthError(err), "error");
    btn.disabled = false;
    btn.textContent = "Log in";
  }
});

$("[data-signup-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("button[type='submit']");
  if (form.password.value.length < 6) {
    toast("Password needs to be at least 6 characters.", "error");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Creating your closet…";
  busy = true;
  try {
    const user = await signUpWithEmail(
      form.name.value.trim(),
      form.email.value.trim(),
      form.password.value,
      form.username.value
    );
    busy = false;
    goHome(user);
  } catch (err) {
    busy = false;
    toast(friendlyAuthError(err), "error");
    btn.disabled = false;
    btn.textContent = "Sign up";
  }
});

$all("[data-google-btn]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      toast(friendlyAuthError(err), "error");
    }
  })
);

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "That email already has a closet — try logging in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email or password didn't match. Try again.";
  if (code.includes("weak-password")) return "Password needs to be at least 6 characters.";
  if (code.includes("invalid-email")) return "That email doesn't look right.";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was closed before finishing.";
  return err?.message || "Something went wrong. Please try again.";
}
