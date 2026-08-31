import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  googleForInvite,
  claimInvite,
  inviteProblem,
} from "./auth.js";
import { $, $all, toast, isAdminUser } from "./utils.js";

const redirectTarget = new URLSearchParams(location.search).get("redirect") || "index.html";

// Signing up signs you in immediately, so the auth listener below fires
// while the profile doc and username claim are still being written — and
// mid-way through the Google flow, before we've even asked for a username.
// Navigating then would leave an account with no profile. `busy` holds the
// redirect; the handlers navigate themselves once they're finished.
let busy = false;

function goHome(user) {
  // The admin lands on the dashboard rather than the shopper's feed.
  location.href = isAdminUser(user) ? "admin.html" : decodeURIComponent(redirectTarget);
}

onAuthStateChanged(auth, (user) => {
  if (!user || busy) return;
  goHome(user);
});

// ---------------------------------------------------------------------
// Panels
//
// The card is only ever showing one of these: "ask" (how do I get in?),
// "signin", "signup" (arrived on an invite), or "username" (came in with
// Google and still owes us a handle).
// ---------------------------------------------------------------------
const panels = {
  ask: $("[data-panel='ask']"),
  signin: $("[data-panel='signin']"),
  signup: $("[data-panel='signup']"),
  username: $("[data-panel='username']"),
};

const LEADS = {
  ask: "Namibia's invite-only closet sale.",
  signin: "Log in to post and manage your closet.",
  signup: "You're invited. Set up your account below.",
  username: "One last thing before your closet exists.",
};

function showPanel(which) {
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== which;
  });
  $("[data-auth-lead]").textContent = LEADS[which];
}

$all("[data-go]").forEach((btn) =>
  btn.addEventListener("click", () => showPanel(btn.dataset.go))
);

// ---------------------------------------------------------------------
// Invite links
//
// Without a valid ?invite= code there is no way to make an account from
// this page at all. The real gate is in the Firestore rules; this decides
// what somebody sees, and tells them plainly when a link is spent.
// ---------------------------------------------------------------------
const inviteCode = new URLSearchParams(location.search).get("invite");
const inviteNote = $("[data-invite-note]");

async function openInvite() {
  if (!inviteCode) return;

  const problem = await inviteProblem(inviteCode);
  if (problem) {
    inviteNote.textContent = problem;
    inviteNote.classList.add("invite-note--bad");
    inviteNote.hidden = false;
    return;
  }

  inviteNote.textContent = "You've been invited to sell on Closet Sales Namibia.";
  inviteNote.hidden = false;
  showPanel("signup");
}

openInvite();

// ---------------------------------------------------------------------
// Log in
// ---------------------------------------------------------------------
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

$all("[data-google-btn]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      toast(friendlyAuthError(err), "error");
    }
  })
);

// ---------------------------------------------------------------------
// Sign up, with an invite in hand
// ---------------------------------------------------------------------
$("[data-signup-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("button[type='submit']");
  if (form.password.value.length < 6) {
    toast("Password needs to be at least 6 characters.", "error");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Setting up your closet…";
  busy = true;
  try {
    const user = await signUpWithEmail(
      form.name.value.trim(),
      form.email.value.trim(),
      form.password.value,
      form.username.value,
      inviteCode
    );
    busy = false;
    goHome(user);
  } catch (err) {
    busy = false;
    toast(friendlyAuthError(err), "error");
    btn.disabled = false;
    btn.textContent = "Create my account";
  }
});

// Google on an invite page. The popup only tells us an email address, so
// the username still has to be asked for before there's an account.
let googleUser = null;

$("[data-google-invite]").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  busy = true;
  try {
    const { user, needsUsername } = await googleForInvite(inviteCode);
    if (!needsUsername) {
      // already a member — this link isn't for them, but they're in
      busy = false;
      goHome(user);
      return;
    }
    googleUser = user;
    inviteNote.hidden = true;
    showPanel("username");
    $("#pick-username").focus();
  } catch (err) {
    busy = false;
    toast(friendlyAuthError(err), "error");
  } finally {
    btn.disabled = false;
  }
});

$("[data-username-form]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("button[type='submit']");
  if (!googleUser) return;

  btn.disabled = true;
  btn.textContent = "Setting up your closet…";
  try {
    await claimInvite(googleUser, form.name.value.trim(), form.username.value, inviteCode);
    busy = false;
    goHome(googleUser);
  } catch (err) {
    toast(friendlyAuthError(err), "error");
    btn.disabled = false;
    btn.textContent = "Finish setting up";
  }
});

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "That email already has a closet. Try logging in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email or password didn't match. Try again.";
  if (code.includes("weak-password")) return "Password needs to be at least 6 characters.";
  if (code.includes("invalid-email")) return "That email doesn't look right.";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was closed before finishing.";
  return err?.message || "Something went wrong. Please try again.";
}
