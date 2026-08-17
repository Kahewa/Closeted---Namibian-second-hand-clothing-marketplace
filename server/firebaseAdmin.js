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
    "⚠️  serviceAccountKey.json not found — running in DEMO MODE.\n" +
      "   The listing-fee flow is faked in memory and login tokens are\n" +
      "   NOT cryptographically verified, so anyone who can reach this\n" +
      "   server could act as any user. Fine on localhost, never online.\n" +
      "   Add the key (README.md → 'Connect the backend') and set\n" +
      "   demoMode() to false in firebase/firestore.rules to turn it off."
  );
}

module.exports = { admin, adminApp };
