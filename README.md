# Closet Sales Namibia

A Y2K-styled shop feed for pre-loved clothes in Namibia. One person — the
admin — posts pieces; everyone else browses, filters by category, and asks
about a piece on WhatsApp. Shoppers never sign up or log in.

Built with **Node.js/Express** + **Firebase** (Auth for the admin login,
Firestore for the posts) and **Cloudinary** for image hosting.

---

## How it works

- **The feed** (`index.html`) shows every posted piece, newest first, as a
  photo card with its price, category, size, brand, condition and notes.
- **Filter chips** across the top narrow it to one category:
  Shirt · Top · Belt · Pants · Skirt · Shorts · Dress · Shoes · Heels ·
  Accessories. The filter is kept in the URL (`?c=Shoes`), so a filtered
  link can be shared.
- **Add to cart** on any piece. The cart (`cart.html`, the bag icon at the
  top) lives in the shopper's own browser — no account needed — and holds
  up to 30 pieces.
- **Send cart on WhatsApp** opens a chat with the posted number, pre-filled
  with each piece, the total, and a link to that exact cart
  (`cart.html?items=<id>,<id>`). Opening the link shows the pieces with
  live prices; anything sold or deleted since is flagged and left out of
  the total.
- Pieces marked **sold** stay on the feed, greyed out with a SOLD stamp.

## Admin

`admin.html` (linked as "admin login" in the footer) is the only login, and
it asks for a password only. Behind it is a Firebase Email/Password account
whose sign-in email is a one-way hash of the password, so neither the
password nor an email address appears anywhere in the code.

To set (or change) the password, run:

```sh
npm run admin:password
```

It asks for the password, creates the account in Firebase, and writes the
new account id into `public/js/utils.js` and `firebase/firestore.rules`.
Then publish the rules (Firebase Console → Firestore Database → Rules → paste
→ Publish), push, and delete the previous admin under Authentication → Users.

Once signed in you can:

- **Post a piece** — photo, category, price, size, brand/store, condition,
  WhatsApp number and optional notes. The number you last used is
  pre-filled.
- **Edit** any piece (including swapping its photo).
- **Mark sold / mark available.**
- **Delete** a piece (its photo is removed from Cloudinary too, when the
  server has the Cloudinary keys).

## Data

One Firestore collection, `items/{id}`:

```
imageURL, publicId, category, size, brand, condition, price, notes,
whatsapp, sold, createdAt
```

Anyone can read it; only the admin account can create, edit or delete
(`firebase/firestore.rules`). After changing the rules, deploy them:

```
firebase deploy --only firestore:rules
```

## Running locally

```
npm install
npm start          # http://localhost:3000
```

The browser-side Firebase and Cloudinary config lives in
`public/js/local-config.js` (copy `local-config.example.js`). Deleting
photos from Cloudinary needs `CLOUDINARY_*` values in `.env` (see
`.env.example`); everything else works without them.
