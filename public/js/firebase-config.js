// Firebase client SDK, loaded straight from Google's CDN — no npm install
// or bundler needed for the frontend. This one file is the only place
// that talks to the Firebase *project*; everything else imports the
// ready-made `auth` / `db` instances from here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
// No Firebase Storage import: creating a bucket needs the paid Blaze plan,
// so images live on Cloudinary instead — see public/js/cloudinary.js.

// 🔑 Replace with YOUR project's config — Firebase Console → Project
// settings → General → "Your apps" → SDK setup and configuration.
// This is safe to keep public/client-side; it is not a secret key.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "closet-bg.firebaseapp.com",
  projectId: "closet-bg",
  storageBucket: "closet-bg.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Every value above still starting with YOUR_ means nobody has pasted a
// real config in yet. Without this check the app fails deep inside the
// SDK with errors like "auth/api-key-not-valid", which look like bugs in
// the app rather than a missing setup step.
export const isFirebaseConfigured = !Object.values(firebaseConfig).some(
  (value) => typeof value === "string" && value.startsWith("YOUR_")
);

if (!isFirebaseConfigured) {
  console.warn(
    "%cCloset.bg — Firebase isn't configured yet.",
    "font-weight:bold",
    "\nPaste your project's config into public/js/firebase-config.js."
  );
  showSetupBanner();
}

function showSetupBanner() {
  const paint = () => {
    if (document.querySelector("[data-firebase-setup-banner]")) return;
    const banner = document.createElement("div");
    banner.setAttribute("data-firebase-setup-banner", "");
    banner.style.cssText = [
      "position:fixed",
      "left:16px",
      "right:16px",
      "bottom:16px",
      "z-index:200",
      "margin:0 auto",
      "max-width:520px",
      "background:#101017",
      "color:#fff",
      "border-radius:20px",
      "padding:16px 18px",
      "font:500 13px/1.5 'DM Sans',system-ui,sans-serif",
      "box-shadow:0 20px 46px rgba(38,48,105,.35)",
    ].join(";");
    banner.innerHTML = `
      <strong style="font-size:14px;">Firebase isn't connected yet</strong><br />
      Log in, uploads and the feed stay empty until you paste your project's
      config into <code style="background:rgba(255,255,255,.14);padding:1px 5px;border-radius:5px;">public/js/firebase-config.js</code>.
      <button type="button" aria-label="Dismiss"
        style="position:absolute;top:10px;right:12px;color:#fff;font-size:18px;line-height:1;background:none;border:none;cursor:pointer;">×</button>
    `;
    banner.querySelector("button").addEventListener("click", () => banner.remove());
    document.body.appendChild(banner);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint, { once: true });
  } else {
    paint();
  }
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const FIREBASE_SDK_VERSION = "12.17.1";
