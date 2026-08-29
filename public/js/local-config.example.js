// Copy this file to `local-config.js` (same folder) and fill in your own
// values. `local-config.js` is gitignored, so your project details stay
// out of the repo.
//
// None of these are secrets in the security sense — every web app ships
// its Firebase config and Cloudinary cloud name to the browser, where
// anyone can read them. Access is controlled by the Firestore rules in
// firebase/firestore.rules and by the unsigned upload preset, not by
// keeping these values hidden. The genuine secrets (the Cloudinary API
// secret, the Firebase service account) live in .env and
// serviceAccountKey.json, which never appear in this folder.
//
// Firebase Console → Project settings → General → Your apps → SDK setup.
// Cloudinary Dashboard → cloud name, then Settings → Upload → an
// upload preset with Signing Mode set to Unsigned.

export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

export const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
export const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_PRESET";
