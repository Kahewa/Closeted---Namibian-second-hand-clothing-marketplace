// The chrome that every page shares: masthead and footer. It used to be
// copy-pasted into every HTML file, which meant an edit per page to change
// one link. Now each page just
// declares who it is on the <body> tag:
//
//   <body data-page="admin">
//
// ...and this module builds the rest around whatever <main> it finds.
import { cartIds } from "./cart.js";
import "./glass.js";

// ---------------------------------------------------------------------
// Everything editable lives here.
// ---------------------------------------------------------------------
const BRAND = { first: "Closeted", second: "by Grace" };

// The footer's one link; the logo already leads back to the feed.
const FOOTER_LINKS = [{ href: "admin.html", label: "admin login" }];

// Per-page: the links under the wordmark, whether the cart button shows,
// whether there's a back button, and whether the category filters sit in
// the header (feed.js fills them). The feed needs no links — the logo
// leads back to it.
const PAGES = {
  home: { links: [], cart: true, filters: true },
  cart: { links: [], cart: true, back: true },
  item: { links: [], cart: true, back: true },
  sell: { links: [], cart: true, back: true },
  buy: { links: [], cart: true, back: true },
  admin: { links: [{ href: "index.html", label: "view the feed" }], logoHref: "admin.html" },
};

// ---------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------
// The cart button's icon: a 3D shopping basket (assets/cart.webp, cut out
// of its background so the page shows through the holes).
const CART_3D = `<img class="cart-3d" src="assets/cart.webp" alt="" width="180" height="192" decoding="async" />`;

const ico = (name, extra = "") =>
  `<i class="ico ico--${name}${extra ? " " + extra : ""}" aria-hidden="true"></i>`;

function navbar(cfg) {
  const links = cfg.links.length
    ? `
    <nav class="iconnav">
      ${cfg.links.map((l) => `<a href="${l.href}" class="iconnav__item">${l.label}</a>`).join("\n      ")}
    </nav>`
    : "";

  // on wide screens the filter pills sit in the top row between logo and
  // cart; narrower, CSS wraps them onto a row of their own underneath
  const filters = cfg.filters
    ? `
      <div class="filter-bar navbar__filters" role="group" aria-label="Filter by category" data-filters></div>`
    : "";

  return `
  <header class="navbar">
    <div class="navbar__top">
      ${
        cfg.back
          ? `<a class="navbar__icon navbar__back" href="index.html" aria-label="Back to the shop" data-back>${ico("back")}</a>`
          : ""
      }
      <a href="${cfg.logoHref || "index.html"}" class="logo">
        <span class="logo__closet">${BRAND.first}</span><span class="logo__bg">${BRAND.second}</span>
      </a>${filters}
      ${cfg.cart ? `<a class="navbar__icon navbar__cart" href="cart.html" data-cart-link>${CART_3D}<span class="navbar__cart-count" data-cart-count hidden></span></a>` : ""}
    </div>${links}
  </header>`;
}

const footer = () => `
  <footer class="site-footer">
    <div class="footer-cols">
      <div class="footer-brand">
        <p class="footer-brand__name">${BRAND.first}<br />${BRAND.second}</p>
        <p class="footer-brand__sub">
          © ${new Date().getFullYear()} Closeted By Grace.<br />Made for Namibia's secondhand fashion scene
        </p>
      </div>
      <div class="footer-col">
        ${FOOTER_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("\n        ")}
      </div>
    </div>
    <p class="footer-bottom">let's be friends! ${ico("heart", "ico--pink")} ${BRAND.first.toLowerCase()} ${BRAND.second.toLowerCase()}</p>
  </footer>`;

// ---------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------
const cfg = PAGES[document.body.dataset.page] || PAGES.home;
const shell = document.querySelector(".page");

if (shell) {
  shell.insertAdjacentHTML("afterbegin", navbar(cfg));
  shell.insertAdjacentHTML("beforeend", footer());
}

// Back: if they came from a page on this site, step back to it (the feed
// keeps its filter and scroll position that way); from a WhatsApp link or a
// fresh tab there's nothing to go back to, so it goes to the shop.
document.querySelector("[data-back]")?.addEventListener("click", (e) => {
  let fromHere = false;
  try {
    fromHere = !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    /* no usable referrer */
  }
  if (fromHere && history.length > 1) {
    e.preventDefault();
    history.back();
  }
});

// the cart button's count, kept current as pieces are added or removed
const cartLinkEl = document.querySelector("[data-cart-link]");
if (cartLinkEl) {
  const paintCount = () => {
    const n = cartIds().length;
    const badge = cartLinkEl.querySelector("[data-cart-count]");
    badge.textContent = n;
    badge.hidden = n === 0;
    cartLinkEl.setAttribute("aria-label", n ? `Cart, ${n} piece${n === 1 ? "" : "s"}` : "Cart, empty");
  };
  paintCount();
  window.addEventListener("cart:change", paintCount);
}

// ---------------------------------------------------------------------
// Smooth navigation & intelligent prefetching
// ---------------------------------------------------------------------
// When navigating between pages, prefetch target documents on hover/touch
// and glide the current page out before navigating so transitions feel
// completely fluid and instant across both desktop and mobile devices.
const wantsMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

// In-memory cache set to avoid duplicate prefetch requests
const prefetchedUrls = new Set();
function prefetchUrl(urlStr) {
  if (!urlStr || prefetchedUrls.has(urlStr)) return;
  try {
    const u = new URL(urlStr, location.href);
    if (u.origin !== location.origin) return;
    if (u.pathname === location.pathname && u.search === location.search) return;
    prefetchedUrls.add(urlStr);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = u.href;
    document.head.appendChild(link);
  } catch (_) {}
}

// Prefetch on hover or mobile touchstart
document.addEventListener("mouseover", (e) => {
  const link = e.target.closest?.("a[href]");
  if (link) prefetchUrl(link.getAttribute("href"));
}, { passive: true });

document.addEventListener("touchstart", (e) => {
  const link = e.target.closest?.("a[href]");
  if (link) prefetchUrl(link.getAttribute("href"));
}, { passive: true });

if (wantsMotion) {
  document.addEventListener("click", (e) => {
    // Leave default handling for modified clicks, non-left clicks, or cancelled events
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.target.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;

    // In-page anchor navigation on the same page should scroll, not reload
    if (url.pathname === location.pathname && url.hash) return;
    // Same exact URL with no changes
    if (url.href === location.href) return;

    e.preventDefault();
    document.documentElement.classList.add("is-leaving");
    document.body.classList.add("is-leaving");

    setTimeout(() => {
      location.href = url.href;
    }, 150);

    // Safety fallback in case navigation is delayed or aborted
    setTimeout(() => {
      document.documentElement.classList.remove("is-leaving");
      document.body.classList.remove("is-leaving");
    }, 2500);
  });

  // Returning through the back/forward button restores the page cleanly
  window.addEventListener("pageshow", () => {
    document.documentElement.classList.remove("is-leaving");
    document.body.classList.remove("is-leaving");
  });
}

// ---------------------------------------------------------------------
// Slide-in reveals
// ---------------------------------------------------------------------
// Everything of substance starts slightly low and transparent, then slides
// into place as it enters the viewport — on first paint for what's already
// on screen, on scroll for the rest. Cards the app builds later (the feed
// grid, the admin list) are picked up by a MutationObserver, so
// nothing has to remember to call this.
const REVEAL = [
  ".section-title",
  ".heart-row",
  ".chrome-card",
  ".glass-card",
  ".empty-state",
  ".review",
  ".item-card",
  ".filter-bar",
  ".post-form",
  ".footer-cols > div",
].join(",");

const revealMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

if (revealMotion && "IntersectionObserver" in window) {
  const seen = new WeakSet();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
  );

  function watch(node) {
    if (seen.has(node)) return;
    seen.add(node);
    node.classList.add("reveal");

    // a short stagger down each group, so a row of cards arrives in
    // sequence rather than all at once
    const siblings = node.parentElement ? [...node.parentElement.children] : [];
    const index = siblings.indexOf(node);
    if (index > 0) node.style.transitionDelay = `${Math.min(index, 6) * 70}ms`;

    observer.observe(node);
  }

  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches?.(REVEAL)) watch(root);
    root.querySelectorAll?.(REVEAL).forEach(watch);
  };

  scan(document.body);

  // whatever the page scripts add later gets the same treatment
  new MutationObserver((records) =>
    records.forEach((r) => r.addedNodes.forEach(scan))
  ).observe(document.body, { childList: true, subtree: true });
}
