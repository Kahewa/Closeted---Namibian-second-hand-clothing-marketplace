const express = require("express");
const { admin, adminApp } = require("../firebaseAdmin");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

const CAROUSEL_FEE_AMOUNT = 150;
const CAROUSEL_FEE_CURRENCY = "NAD";

/**
 * ⚠️  NO REAL PAYMENT GATEWAY IS CONNECTED YET — this whole file is a
 * placeholder so the rest of the app (and the Firestore security rules,
 * which require a "paid_demo" order before a carousel can be created)
 * can be built and tested end to end.
 *
 * When you're ready to take real money, this is the file to change:
 *   1. POST /initiate should create the order the same way, but then
 *      kick off a real checkout with your provider (e.g. DPO Group,
 *      PayToday, Flutterwave, or a mobile money payout) and return
 *      whatever redirect URL / reference the client needs.
 *   2. Replace POST /confirm-demo with a webhook route that your
 *      payment provider calls once the money has actually landed —
 *      never trust the browser to tell you a payment succeeded.
 */

// POST /api/carousel-fee/initiate
// Creates a pending N$150 order for the signed-in user.
router.post("/initiate", verifyToken, async (req, res) => {
  // No service account → no Admin SDK → we can't write carouselOrders.
  // Hand back a throwaway order so the UI can carry on. Pair this with
  // demoMode() in firestore.rules, which skips the paid-order check.
  if (!adminApp) {
    return res.json({
      orderId: `demo-${req.uid}-${Date.now()}`,
      sellerId: req.uid,
      amount: CAROUSEL_FEE_AMOUNT,
      currency: CAROUSEL_FEE_CURRENCY,
      status: "pending",
      demo: true,
    });
  }

  try {
    const db = admin.firestore();
    const orderRef = db.collection("carouselOrders").doc();

    const order = {
      sellerId: req.uid,
      amount: CAROUSEL_FEE_AMOUNT,
      currency: CAROUSEL_FEE_CURRENCY,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: null,
    };

    await orderRef.set(order);
    res.json({ orderId: orderRef.id, ...order, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error("Failed to create carousel order:", err);
    res.status(500).json({ error: "Couldn't start a new listing order. Please try again." });
  }
});

// POST /api/carousel-fee/confirm-demo/:orderId
// DEMO ONLY. Flips an order straight to "paid_demo" so the listing flow
// can be tested with no real payment gateway wired up. Delete this route
// (and replace it with real webhook verification) before launch.
router.post("/confirm-demo/:orderId", verifyToken, async (req, res) => {
  if (!adminApp) {
    return res.json({ orderId: req.params.orderId, status: "paid_demo", demo: true });
  }

  try {
    const db = admin.firestore();
    const orderRef = db.collection("carouselOrders").doc(req.params.orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderSnap.data();
    if (order.sellerId !== req.uid) {
      return res.status(403).json({ error: "This order doesn't belong to you." });
    }

    if (order.status !== "paid_demo") {
      await orderRef.update({
        status: "paid_demo",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const updatedSnap = await orderRef.get();
    res.json({ orderId: orderRef.id, ...updatedSnap.data() });
  } catch (err) {
    console.error("Failed to confirm carousel order:", err);
    res.status(500).json({ error: "Couldn't confirm that order. Please try again." });
  }
});

module.exports = router;
