// NOT COMMITTED — this file is in .gitignore.
// Copy of local-config.example.js with the real project values filled in.
// Everything here still ships to the browser (it has to; the browser is
// what talks to Firebase and Cloudinary), so treat it as public — it is
// kept out of the repo by preference, not because it is a secret.
// Real secrets live in .env on the server and never reach this folder.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBTkVp63KQNOS9lJCit3qhgChEgcPu1oXg",
  // Left on the Firebase domain deliberately.
  //
  // Safari and Firefox bin storage belonging to a domain other than the one
  // on screen, which is why redirect sign-in can come back from Google
  // having forgotten why it left. The documented fix is to point this at our
  // own host and let the /__/auth/* rewrite in vercel.json proxy through to
  // Firebase — but that only works if our host actually answers those paths,
  // and while Vercel Deployment Protection is on it answers them with an SSO
  // redirect instead. Pointing this at our host before that's confirmed would
  // break Google sign-in outright rather than only on Safari.
  //
  // To switch it on: confirm https://<the site>/__/auth/handler returns
  // Firebase's page and not a redirect, then change this to
  //   location.hostname === "localhost" ? "closet-bg.firebaseapp.com" : location.host
  authDomain: "closet-bg.firebaseapp.com",
  projectId: "closet-bg",
  storageBucket: "closet-bg.firebasestorage.app",
  messagingSenderId: "611455741225",
  appId: "1:611455741225:web:1704ddf3b5cb903797db38",
};

export const CLOUDINARY_CLOUD_NAME = "sfygm3ho";
export const CLOUDINARY_UPLOAD_PRESET = "ldcel0mh";
