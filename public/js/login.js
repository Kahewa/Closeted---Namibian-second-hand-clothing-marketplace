import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  signUpWithEmail,
  signInWithEmail,
  startGoogle,
  googleRedirectUser,
  afterGoogle,
  claimInvite,
  inviteProblem,
  signOutUser,
} from "./auth.js";
import { $, $all, toast, isAdminUser } from "./utils.js";

const redirectTarget = new URLSearchParams(location.search).get("redirect") || "index.html";

// Signing up signs you in immediately, so the auth listener below fires
// while the profile doc and username claim are still being written — and
// mid-way through the Google flow, before we've even asked for a username.
// Navigating then would leave an account with no profile.
//
// It starts held, not open: on a phone Google sends the browser away and
// back, so a page load can already be carrying a signed-in user who still
// owes us a username. Nothing redirects until boot() has looked.
let busy = true;

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

// Real links, intercepted — not buttons.
//
// Switching panels in place is nicer, but if this listener ever fails to
// attach (a module that didn't load, an error earlier in the file) a button
// leaves the sign-in form with no way to reach it at all. As links they
// still navigate, and ?mode= below opens the right panel on arrival, so the
// worst case is a page reload rather than a locked door.
$all("[data-go]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    showPanel(el.dataset.go);
  })
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

// iOS only permits a popup opened in the same tick as the tap. openInvite()
// has already vetted this code on page load, so the click handler must not
// await that check again — the await is what costs us the popup.
let inviteOk = false;

async function openInvite() {
  if (!inviteCode) return;

  const problem = await inviteProblem(inviteCode);
  if (problem) {
    inviteNote.textContent = problem;
    inviteNote.classList.add("invite-note--bad");
    inviteNote.hidden = false;
    return;
  }

  inviteOk = true;
  inviteNote.textContent = "You've been invited to sell on Closet Sales Namibia.";
  inviteNote.hidden = false;
  showPanel("signup");
}

// Nothing on this page is trustworthy until we know whether the browser is
// coming back from Google. Do that first, then let the page behave normally.
(async function boot() {
  try {
    const user = await googleRedirectUser();
    if (user) {
      await openInvite();
      await handleGoogleUser(user);
      return;
    }
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  }

  busy = false;
  if (auth.currentUser) {
    goHome(auth.currentUser);
    return;
  }

  await openInvite();

  // An invite decides the panel on its own; otherwise honour ?mode=.
  if (!inviteOk && new URLSearchParams(location.search).get("mode") === "signin") {
    showPanel("signin");
  }
})();

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
    // Navigate here rather than leaning on the auth listener: it's held
    // shut while boot() settles the Google redirect, and a login that
    // landed in that window would otherwise just sit there.
    const user = await signInWithEmail(form.email.value.trim(), form.password.value);
    busy = false;
    goHome(user);
  } catch (err) {
    toast(friendlyAuthError(err), "error");
    btn.disabled = false;
    btn.textContent = "Log in";
  }
});

// Whoever Google gives us, however they got here: already a member, or an
// invite in hand and one username short, or not welcome yet.
let googleUser = null;

async function handleGoogleUser(user) {
  const { member } = await afterGoogle(user);

  if (member) {
    busy = false;
    goHome(user);
    return;
  }

  if (inviteCode && !(await inviteProblem(inviteCode))) {
    googleUser = user;
    inviteNote.hidden = true;
    showPanel("username");
    $("#pick-username").focus();
    return;                       // busy stays held; they aren't done
  }

  await signOutUser();
  busy = false;
  showPanel("ask");
  toast("That Google account hasn't been invited yet. Ask us for a link to join.", "error");
}

$all("[data-google-btn], [data-google-invite]").forEach((btn) => {
  const label = btn.innerHTML;

  function restore(message) {
    btn.disabled = false;
    btn.innerHTML = label;
    busy = false;
    if (message) toast(message, "error");
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Taking you to Google…";
    busy = true;

    try {
      const forInvite = btn.hasAttribute("data-google-invite");
      const user = await startGoogle(forInvite ? inviteCode : "", { validated: inviteOk });

      if (user) {
        await handleGoogleUser(user);
        restore();
        return;
      }

      // null means a phone: signInWithRedirect resolves before the browser
      // actually leaves, so if we're still here in a moment it never went.
      // Without this the button just sits there disabled and the whole thing
      // looks like a dead tap.
      setTimeout(() => {
        if (!document.hidden) {
          restore(
            "Couldn't reach Google sign-in. Check this address is in " +
              "Firebase's authorised domains, and that the site isn't behind " +
              "Vercel's deployment protection. Email and password works either way."
          );
        }
      }, 4000);
    } catch (err) {
      restore(friendlyAuthError(err));
    }
  });
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
  if (code.includes("popup-blocked")) return "Your browser blocked the Google window. Allow pop-ups for this site, or use email and password.";
  // The three that look identical from the outside — a dead button — but
  // each need a different thing fixed, so each says which.
  if (code.includes("unauthorized-domain"))
    return "This web address isn't on Firebase's authorised domains list, so Google won't sign anyone in from it. Add it in Firebase Console → Authentication → Settings.";
  if (code.includes("operation-not-allowed"))
    return "Google sign-in isn't switched on for this project. Enable it in Firebase Console → Authentication → Sign-in method.";
  if (code.includes("network-request-failed"))
    return "Couldn't reach Firebase. Check the connection and try again.";
  return err?.message || "Something went wrong. Please try again.";
}
