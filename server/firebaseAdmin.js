const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");

let adminApp = null;

if (fs.existsSync(serviceAccountPath)) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const serviceAccount = require(serviceAccountPath);
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("🔥 Firebase Admin initialized.");
} else {
  console.warn(
    "!  serviceAccountKey.json not found.\n" +
      "   The site runs fine without it: the N$150 fee is paid manually and\n" +
      "   approved from the admin dashboard, which never touches this server.\n" +
      "   What it does affect is /api/media/delete (removing a listing's photos\n" +
      "   from Cloudinary): login tokens there fall back to being read WITHOUT\n" +
      "   signature verification. Fine on localhost, never on a public URL.\n" +
      "   Add the key — README.md, 'Connect the backend' — to turn that off."
  );
}

module.exports = { admin, adminApp };
