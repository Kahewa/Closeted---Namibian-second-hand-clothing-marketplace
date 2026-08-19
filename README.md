# Closet Sales Namibia

A Y2K-styled marketplace for Namibia: people list their pre-loved clothes and
shoes as a **carousel** — one paid "drop" that can hold as many items as they
want. Each photo in the carousel is one item, with its own size, store,
condition and price. Buyers swipe through carousels in a feed, and can visit
a seller's profile to see everything they've got and how to reach them.

Built with **Node.js/Express** + **Firebase** (Auth, Firestore) and
**Cloudinary** for image hosting.

> ⚠️ **No payment gateway is connected, on purpose** — the N$150 is paid via eft

---

## How the "carousel" model works

This isn't the usual "one listing = one item with several photos of it"
marketplace. Here, **one carousel = one seller's whole closet drop**:

- A seller pays N$150 per carousel, by bank transfer, wallet or cash.
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
- Unique usernames, and a people search to find other closets
- Feed of every **approved** carousel, newest first
- Swipeable carousel with a price sticker + condition badge per item, and a
  description bar that updates as you swipe
- Sell flow: build the carousel → pay N$150 by transfer/wallet/cash →
  it goes live once the admin approves it
- Sellers can edit a carousel right up until approval, then it's locked
- Admin dashboard (one account, set in `firestore.rules` and `utils.js`):
  approve/reject payments, see the live feed, ban or delete accounts, and
  post carousels with no fee
- Owner controls: mark an item sold/unsold, delete a carousel, delete your
  own account


## What's deliberately *not* in here yet

In-app chat (buyers message sellers on WhatsApp instead),  and an automated payment gateway — the fee is confirmed by admin.
As a Namibian local, the application is still going to be used by a small population for now. As it scales, i will implement a payment gateway and  upgrade the storage. 