const { admin, adminApp } = require("../firebaseAdmin");

// Every protected /api route expects the signed-in user's Firebase ID
// token in the Authorization header: `Authorization: Bearer <idToken>`.
// The frontend gets this token from `auth.currentUser.getIdToken()`.
async function verifyToken(req, res, next) {
  if (!adminApp) {
    return res.status(500).json({
      error:
        "Firebase Admin isn't configured on the server yet. Add serviceAccountKey.json — see README.md.",
    });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <idToken> header." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    next();
  } catch (err) {
    res.status(401).json({ error: "Your login has expired. Please sign in again." });
  }
}

module.exports = verifyToken;
