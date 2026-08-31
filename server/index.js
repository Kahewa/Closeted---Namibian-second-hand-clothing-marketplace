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
    // Nothing here is fingerprinted — style.css keeps its name through every
    // change — so a long max-age would pin browsers to an old stylesheet
    // until it expired. `no-cache` doesn't mean "don't store": the file is
    // still cached, the browser just asks first, and an unchanged file comes
    // back as an empty 304. Cheap, and a deploy is visible immediately.
    //
    // Long-lived caching belongs here only once filenames carry a content
    // hash (style.a1b2c3.css), which would need a build step.
    setHeaders(res, filePath) {
      const immutable = /\.(woff2?|png|jpe?g|webp|avif|svg|ico)$/i.test(filePath);
      res.setHeader(
        "Cache-Control",
        immutable ? "public, max-age=604800" : "no-cache"
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
