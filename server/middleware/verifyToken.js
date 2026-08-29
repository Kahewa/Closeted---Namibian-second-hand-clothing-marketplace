const { admin, adminApp } = require("../firebaseAdmin");

// Every protected /api route expects the signed-in user's Firebase ID
// token in the Authorization header: `Authorization: Bearer <idToken>`.
// The frontend gets this token from `auth.currentUser.getIdToken()`.
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <idToken> header." });
  }

  // ---------------------------------------------------------------
  // ⚠️ LOCAL DEMO FALLBACK — active only while serviceAccountKey.json
  // is missing. It reads the uid out of the token WITHOUT verifying
  // the signature, which means a hand-crafted token could claim to be
  // anyone. That is fine for testing the flow on your own machine and
  // completely unacceptable anywhere else. Drop the service account
  // key in the project root and this path disappears on its own.
  // ---------------------------------------------------------------
  if (!adminApp) {
    const uid = uidFromUnverifiedToken(idToken);
    if (!uid) {
      return res.status(401).json({ error: "Couldn't read your login token. Try signing out and back in." });
    }
    console.warn(`⚠️  DEMO MODE: trusting an unverified token for uid ${uid} (no serviceAccountKey.json).`);
    req.uid = uid;
    req.unverified = true;
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    next();
  } catch (err) {
    res.status(401).json({ error: "Your login has expired. Please sign in again." });
  }
}

// A Firebase ID token is a JWT: header.payload.signature. This reads the
// payload only — no signature check, hence demo-only above.
function uidFromUnverifiedToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

module.exports = verifyToken;
