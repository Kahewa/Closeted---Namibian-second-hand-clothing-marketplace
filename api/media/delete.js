// POST /api/media/delete   { publicIds: ["closet-bg/carousels/<uid>/…", …] }
//
// Deleting from Cloudinary needs the API secret, which can never reach the
// browser — so it happens here, in a Vercel serverless function. Mirrors
// server/routes/media.js, which serves the same path when the Express app
// is running locally.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   FIREBASE_PROJECT_ID
const crypto = require("node:crypto");

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// Google rotates these keys; the response says how long they're good for.
let certCache = { certs: null, expiresAt: 0 };

async function googleCerts() {
  if (certCache.certs && Date.now() < certCache.expiresAt) return certCache.certs;

  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("Couldn't fetch Google's signing certificates.");
  const certs = await res.json();

  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  certCache = {
    certs,
    expiresAt: Date.now() + (maxAge ? Number(maxAge[1]) : 3600) * 1000,
  };
  return certs;
}

const fromBase64Url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verifies a Firebase ID token properly — signature against Google's public
 * certificates, plus the issuer/audience/expiry claims.
 *
 * The Express version falls back to reading the uid without checking the
 * signature when no service account is present. That is fine on localhost
 * and unacceptable here: a forged token could name any uid and delete that
 * person's photos. So this path always verifies.
 *
 * @returns {Promise<string>} the verified uid
 */
async function verifyIdToken(idToken, projectId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed token.");

  const header = JSON.parse(fromBase64Url(parts[0]).toString("utf8"));
  const payload = JSON.parse(fromBase64Url(parts[1]).toString("utf8"));
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm.");

  const certs = await googleCerts();
  const pem = certs[header.kid];
  if (!pem) throw new Error("Token signed with an unknown key.");

  const publicKey = new crypto.X509Certificate(pem).publicKey;
  const signed = crypto
    .createVerify("RSA-SHA256")
    .update(`${parts[0]}.${parts[1]}`)
    .verify(publicKey, fromBase64Url(parts[2]));
  if (!signed) throw new Error("Token signature doesn't check out.");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error("Token has expired.");
  if (payload.iat > now + 300) throw new Error("Token was issued in the future.");
  if (payload.aud !== projectId) throw new Error("Token is for a different project.");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Token has the wrong issuer.");
  }

  const uid = payload.sub || payload.user_id;
  if (!uid) throw new Error("Token carries no user id.");
  return uid;
}

async function destroy(publicId, { cloudName, apiKey, apiSecret }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: new URLSearchParams({
      public_id: publicId,
      api_key: apiKey,
      timestamp: String(timestamp),
      signature,
    }),
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!cloudName || !apiKey || !apiSecret || !projectId) {
    return res.status(500).json({
      error:
        "Image cleanup isn't configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET and FIREBASE_PROJECT_ID in the Vercel project settings.",
    });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <idToken> header." });
  }

  let uid;
  try {
    uid = await verifyIdToken(idToken, projectId);
  } catch (err) {
    console.warn("Rejected a token:", err.message);
    return res.status(401).json({ error: "Your login couldn't be verified. Sign in again." });
  }

  // Vercel parses JSON bodies itself, but a string can still arrive.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const publicIds = Array.isArray(body?.publicIds) ? body.publicIds : [];
  if (!publicIds.length) return res.status(400).json({ error: "No publicIds given." });
  if (publicIds.length > 60) return res.status(400).json({ error: "Too many images in one request." });

  // Every path this app writes contains the uploader's uid
  // (closet-bg/carousels/<uid>/… and closet-bg/profile-pics/<uid>/…), so
  // this is what stops one signed-in user deleting someone else's photos.
  const notYours = publicIds.filter((id) => typeof id !== "string" || !id.includes(`/${uid}/`));
  if (notYours.length) {
    return res.status(403).json({ error: "Those images don't belong to you." });
  }

  try {
    const results = await Promise.all(
      publicIds.map((id) => destroy(id, { cloudName, apiKey, apiSecret }))
    );
    const failed = results.filter((r) => r.result !== "ok" && r.result !== "not found");
    if (failed.length) console.warn("Some Cloudinary deletions didn't succeed:", failed);
    return res.status(200).json({ deleted: results.length - failed.length, failed: failed.length });
  } catch (err) {
    console.error("Cloudinary delete failed:", err);
    return res.status(500).json({ error: "Couldn't delete those images." });
  }
};
