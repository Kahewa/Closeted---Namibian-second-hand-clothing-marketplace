# CLOSET.bg

A Y2K-styled marketplace for Namibia: people list their pre-loved clothes and
shoes as a **carousel** — one paid "drop" that can hold as many items as they
want. Each photo in the carousel is one item, with its own size, store,
condition and price. Buyers swipe through carousels in a feed, and can visit
a seller's profile to see everything they've got and how to reach them.

Built with **Node.js/Express** + **Firebase** (Auth, Firestore, Storage).

> ⚠️ **No payment gateway is connected yet, on purpose** — the N$150
> carousel fee is fully mocked so you can see and test the whole app first.
> See [Payments](#payments-currently-mocked) below for exactly where to plug
> in a real one later.

---

## How the "carousel" model works

This isn't the usual "one listing = one item with several photos of it"
marketplace. Here, **one carousel = one seller's whole closet drop**:

- A seller pays N$150 once to unlock a carousel.
- They add as many items as they like — **each photo is a separate item**,
  with its own category, size, store/brand, condition and price.
- Buyers swipe through the carousel; the size/store/condition/price shown at
  the bottom updates as they swipe to match whichever photo is on screen.
- When the seller's closet is cleared out (or they've got more to sell),
  they pay N$150 again to drop a new carousel.

## Feature list

- Email/password + Google sign-in (Firebase Auth)
- Profiles: picture, bio, Instagram/TikTok/Facebook/WhatsApp links — public,
  viewable by anyone
- Feed of every seller's carousels, newest first, with a category filter
  (platform is scoped to clothing + shoes — categories are a fixed list, not
  free text, so the feed can't drift into other kinds of items)
- Swipeable carousel with a price tag + condition badge per item, and a
  description bar that updates as you swipe
- Sell flow: pay the (demo) fee → add items → carousel goes live
- Owner controls: mark an item sold/unsold, delete a whole carousel
- Node/Express backend for the listing-fee order flow, ready for a real
  payment webhook later

## What's deliberately *not* in here yet

Kept out to stay focused on "does this look and feel right" — see
[Ideas for later](#ideas-for-later) if you want to plan ahead:
in-app chat/messaging, search, reviews/ratings, push or email
notifications, an admin/moderation dashboard.

---

## Project structure

```
closet-na/
├── server/                  Express app (Node.js)
│   ├── index.js             entrypoint — serves public/ + mounts /api
│   ├── firebaseAdmin.js     Admin SDK bootstrap
│   ├── middleware/verifyToken.js
│   └── routes/payments.js   the mocked N$150 order flow
├── firebase/
│   ├── firestore.rules
│   └── storage.rules
├── public/                  the whole frontend — plain HTML/CSS/JS, no build step
│   ├── login.html / index.html (feed) / sell.html / profile.html
│   ├── css/style.css
│   └── js/                  firebase-config, auth, nav, feed, sell, profile, carousel-card, utils
├── package.json
├── .env.example
└── serviceAccountKey.json   ← you add this (see below), never committed
```

The frontend talks to Firebase **directly from the browser** (Auth,
Firestore, Storage) using the Firebase client SDK loaded from Google's CDN —
there's no bundler, so you can open any `public/js/*.js` file and read it
top to bottom. Express's only job right now is serving those static files
and running the listing-fee order flow.

---

## Setup

### 1. Prerequisites

- Node.js 18+
- A free [Firebase](https://console.firebase.google.com) project

### 2. Create your Firebase project

1. In the [Firebase Console](https://console.firebase.google.com), create a
   new project (Google Analytics is optional, you don't need it).
2. **Authentication** → Sign-in method → enable **Email/Password**, and
   **Google** if you want the Google button to work.
3. **Firestore Database** → Create database → start in production mode
   (we're supplying real rules, see step 5).
4. **Storage** → Get started (same default bucket is fine).
5. **Project settings → General → Your apps** → click the `</>` (web) icon,
   register an app, and copy the `firebaseConfig` object it gives you.

### 3. Connect the frontend

Open `public/js/firebase-config.js` and paste your config in:

```js
const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  storageBucket: "…",
  messagingSenderId: "…",
  appId: "…",
};
```

This is safe to leave in client-side code — it's not a secret key, it just
tells the browser which Firebase project to talk to. Firestore/Storage
*security* comes from the rules in step 5, not from hiding this config.

### 4. Connect the backend

**Project settings → Service accounts → Generate new private key** downloads
a JSON file. Rename it `serviceAccountKey.json` and put it in the project
root (next to `package.json`). It's already in `.gitignore` — this file is a
real secret, never commit or share it.

### 5. Deploy the security rules

Easiest with the [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
firebase init firestore storage   # point it at firebase/firestore.rules and firebase/storage.rules, use your existing project
firebase deploy --only firestore:rules,storage
```

Or just paste the contents of `firebase/firestore.rules` and
`firebase/storage.rules` into their respective **Rules** tabs in the
Firebase Console.

### 6. Run it

```bash
npm install
cp .env.example .env
npm run dev      # or: npm start
```

Open **http://localhost:3000**. Sign up, click "Sell", pay the (demo) fee,
add a couple of items, and they'll show up in the feed.

> The UI will render even before you've done any of the above — try
> `npm install && npm start` right now if you just want to see the look and
> feel. Sign-in and the feed just won't do anything until steps 2–5 are done.

---

## Payments (currently mocked)

`server/routes/payments.js` creates a `carouselOrders` document per attempt
and — instead of charging anyone — immediately flips it to `paid_demo`. The
Firestore rules require an order to be `paid_demo`, owned by the same user,
before a carousel can be created, so the *shape* of a real pay-to-list flow
is already in place.

When you're ready to take real money:

1. Replace the body of `POST /api/carousel-fee/initiate` with a real
   checkout call to your provider (DPO Group and PayToday are common in
   Namibia; Flutterwave covers the wider region; mobile money payout is
   another option) and return whatever redirect/reference it gives you.
2. Replace `POST /api/carousel-fee/confirm-demo/:orderId` with a **webhook**
   route that provider calls once money has actually moved — never trust
   the browser to say a payment succeeded.
3. Update the "Pay N$150 (demo)" button copy in `sell.html` once it's real.

---

## Data model

**`users/{uid}`**
`displayName`, `email`, `bio`, `profilePicURL`, `socialLinks: { instagram, tiktok, facebook, whatsapp }`, `createdAt`

**`carouselOrders/{orderId}`** — server-write-only
`sellerId`, `amount` (150), `currency` ("NAD"), `status` ("pending" | "paid_demo"), `createdAt`, `paidAt`

**`carousels/{carouselId}`**
`sellerId`, `sellerName`, `sellerPhotoURL` (both copied from the profile at
post time — editing your profile later won't rewrite older listings; a
Cloud Function to fan that out would be a nice v2), `orderId`, `createdAt`,
`items: [{ id, imageURL, storagePath, category, size, store, condition, price, notes, sold }]`

Categories are fixed to: Tops, Bottoms, Dresses & Skirts, Outerwear, Shoes,
Other Clothing — see `CATEGORIES` in `public/js/utils.js`.

### One-time Firestore index

The profile page queries a seller's own carousels (`where sellerId ==` +
`orderBy createdAt`), which needs a composite index. The **first** time you
load a profile with listings, check your terminal / the browser console —
Firestore throws an error with a direct link to auto-create it. Click it,
wait about a minute, reload. This is normal, one-time, and only Firestore
telling you it needs the index, not a bug.

---

## Ideas for later

- Real payments (see above)
- In-app messaging instead of "contact via social links"
- Search, and saved/favourited items
- Seller ratings or a simple trust signal
- Push/email notification when an item sells
- Image compression on upload (currently uploads the original file)
