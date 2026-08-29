const crypto = require("crypto");
const express = require("express");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// Photos are uploaded straight from the browser with an unsigned preset,
// but *deleting* one requires the API secret — so it happens here, never
// client-side. Signed with plain crypto rather than pulling in the
// cloudinary SDK: it's one sha1 of a sorted param string.
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

// POST /api/media/delete   { publicIds: ["closet-bg/carousels/<uid>/…", …] }
router.post("/delete", verifyToken, async (req, res) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    return res.status(500).json({
      error: "Cloudinary isn't configured on the server. Add CLOUDINARY_* values to .env — see README.md.",
    });
  }

  const publicIds = Array.isArray(req.body?.publicIds) ? req.body.publicIds : [];
  if (!publicIds.length) {
    return res.status(400).json({ error: "No publicIds given." });
  }

  // Every path this app writes contains the uploader's uid
  // (closet-bg/carousels/<uid>/… and closet-bg/profile-pics/<uid>/…), so
  // this is what stops one signed-in user deleting someone else's photos.
  const notYours = publicIds.filter((id) => typeof id !== "string" || !id.includes(`/${req.uid}/`));
  if (notYours.length) {
    return res.status(403).json({ error: "Those images don't belong to you." });
  }

  try {
    const results = await Promise.all(publicIds.map((id) => destroy(id)));
    const failed = results.filter((r) => r.result !== "ok" && r.result !== "not found");
    if (failed.length) {
      console.warn("Some Cloudinary deletions didn't succeed:", failed);
    }
    res.json({ deleted: results.length - failed.length, failed: failed.length });
  } catch (err) {
    console.error("Cloudinary delete failed:", err);
    res.status(500).json({ error: "Couldn't delete those images." });
  }
});

async function destroy(publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`)
    .digest("hex");

  const body = new URLSearchParams({
    public_id: publicId,
    api_key: API_KEY,
    timestamp: String(timestamp),
    signature,
  });

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
    method: "POST",
    body,
  });
  return res.json();
}

module.exports = router;
