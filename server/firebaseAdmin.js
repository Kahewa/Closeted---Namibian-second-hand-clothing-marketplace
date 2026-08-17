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
    "⚠️  serviceAccountKey.json not found in the project root.\n" +
      "   The site will still run, but the /api/carousel-fee routes (the\n" +
      "   N$150 listing fee flow) will return an error until you add it.\n" +
      "   See README.md → 'Connect your Firebase project'."
  );
}

module.exports = { admin, adminApp };
