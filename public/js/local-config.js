// NOT COMMITTED — this file is in .gitignore.
// Copy of local-config.example.js with the real project values filled in.
// Everything here still ships to the browser (it has to; the browser is
// what talks to Firebase and Cloudinary), so treat it as public — it is
// kept out of the repo by preference, not because it is a secret.
// Real secrets live in .env on the server and never reach this folder.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBTkVp63KQNOS9lJCit3qhgChEgcPu1oXg",
  // The site's own host, not closet-bg.firebaseapp.com. Firebase parks the
  // state for a redirect sign-in on whatever this says, and Safari bins
  // storage belonging to a domain other than the one on screen — so on a
  // phone the browser came back from Google having forgotten why it left.
  // vercel.json proxies /__/auth/* through to Firebase so this can be us.
  authDomain: location.hostname === "localhost" ? "closet-bg.firebaseapp.com" : location.host,
  projectId: "closet-bg",
  storageBucket: "closet-bg.firebasestorage.app",
  messagingSenderId: "611455741225",
  appId: "1:611455741225:web:1704ddf3b5cb903797db38",
};

export const CLOUDINARY_CLOUD_NAME = "sfygm3ho";
export const CLOUDINARY_UPLOAD_PRESET = "ldcel0mh";
