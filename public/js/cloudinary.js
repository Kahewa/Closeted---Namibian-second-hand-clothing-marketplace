// Image hosting — Cloudinary instead of Firebase Storage.
//
// Firebase now requires the paid Blaze plan to create a Storage bucket on
// new projects, so photos go to Cloudinary's free tier instead. Uploads go
// straight from the browser using an *unsigned upload preset*: the values
// below are public by design and carry no ability to read, delete or list
// anything. Deleting needs the API secret, which stays on the server —
// see server/routes/media.js.

// 🔑 Cloudinary Dashboard → the "Cloud name" shown at the top.
export const CLOUD_NAME = "YOUR_CLOUD_NAME";

// 🔑 Settings (gear) → Upload → Upload presets → Add upload preset,
// with "Signing Mode" set to Unsigned. Paste that preset's name here.
export const UPLOAD_PRESET = "YOUR_UNSIGNED_PRESET";

export const isCloudinaryConfigured =
  !CLOUD_NAME.startsWith("YOUR_") && !UPLOAD_PRESET.startsWith("YOUR_");

// Long edge to downscale to before uploading. Phone photos are routinely
// 4000px/5MB; nothing in this UI displays an image wider than ~560px, so
// shipping the full thing just makes sellers wait on a slow connection.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Uploads one image and returns the hosted URL plus the id needed to
 * delete it later.
 *
 * @param {File} file
 * @param {string} folder - e.g. `carousels/{uid}/{carouselId}`
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadImage(file, folder) {
  if (!isCloudinaryConfigured) {
    throw new Error(
      "Image uploads aren't configured yet — add your Cloudinary cloud name and unsigned preset to public/js/cloudinary.js."
    );
  }

  const body = new FormData();
  body.append("file", await shrinkImage(file));
  body.append("upload_preset", UPLOAD_PRESET);
  body.append("folder", `closet-bg/${folder}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    let message = `Upload failed (HTTP ${res.status}).`;
    try {
      message = JSON.parse(detail).error?.message || message;
    } catch {
      /* Cloudinary returned something that isn't JSON — keep the status. */
    }
    // The overwhelmingly common cause, worth naming outright.
    if (res.status === 400 && /preset/i.test(message)) {
      message += " Check that the preset exists and its signing mode is Unsigned.";
    }
    throw new Error(message);
  }

  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}

/**
 * Draws the image onto a canvas at a sane size and re-encodes it as JPEG.
 * Falls back to the untouched file if anything goes wrong — a slightly
 * bigger upload beats a failed one.
 */
async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_000_000) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch (err) {
    console.warn("Couldn't downscale that image, uploading it as-is:", err);
    return file;
  }
}

/**
 * Asks our own server to delete images (Cloudinary deletion needs the API
 * secret, which must never reach the browser). Best-effort: a carousel
 * still gets deleted from Firestore even if its images linger.
 */
export async function deleteImages(publicIds, idToken) {
  const ids = publicIds.filter(Boolean);
  if (!ids.length) return;

  const res = await fetch("/api/media/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ publicIds: ids }),
  });
  if (!res.ok) throw new Error(`Image cleanup failed (HTTP ${res.status}).`);
}
