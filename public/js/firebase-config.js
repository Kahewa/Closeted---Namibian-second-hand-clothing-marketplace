// Firebase client SDK, loaded straight from Google's CDN — no npm install
// or bundler needed for the frontend. This one file is the only place
// that talks to the Firebase *project*; everything else imports the
// ready-made `auth` / `db` / `storage` instances from here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js";

// 🔑 Replace with YOUR project's config — Firebase Console → Project
// settings → General → "Your apps" → SDK setup and configuration.
// This is safe to keep public/client-side; it is not a secret key.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const FIREBASE_SDK_VERSION = "12.17.1";
