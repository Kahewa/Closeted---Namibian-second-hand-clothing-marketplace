require("dotenv").config();

const path = require("path");
const express = require("express");

const paymentsRouter = require("./routes/payments");
const mediaRouter = require("./routes/media");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// The whole frontend is plain static HTML/CSS/JS — Firebase Auth,
// Firestore and Storage are called directly from the browser via the
// Firebase client SDK, so this server's only real job is the N$150
// listing-fee flow below (and, eventually, real payment webhooks).
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    // The HTML is revalidated every time so a deploy is picked up at once;
    // CSS/JS/images are fingerprint-free, so a week with revalidation keeps
    // repeat visits cheap without serving stale code after a change.
    setHeaders(res, filePath) {
      res.setHeader(
        "Cache-Control",
        filePath.endsWith(".html") ? "no-cache" : "public, max-age=604800, must-revalidate"
      );
    },
  })
);

app.use("/api/carousel-fee", paymentsRouter);
app.use("/api/media", mediaRouter);

// Anything else (typos, stray links) just goes back to the feed rather
// than showing a bare 404 — this isn't a client-side-routed SPA, every
// real page is its own .html file already served above.
app.use((req, res) => {
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`✨ Closet Sales Namibia is running at http://localhost:${PORT}`);
});
