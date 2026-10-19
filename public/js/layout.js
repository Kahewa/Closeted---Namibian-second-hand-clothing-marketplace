// The chrome that every page shares: masthead and footer. It used to be
// copy-pasted into every HTML file, which meant an edit per page to change
// one link. Now each page just
// declares who it is on the <body> tag:
//
//   <body data-page="admin">
//
// ...and this module builds the rest around whatever <main> it finds.
import { cartIds } from "./cart.js";

// ---------------------------------------------------------------------
// Everything editable lives here.
// ---------------------------------------------------------------------
const BRAND = { first: "closet sales", second: "namibia" };

// The footer's one link; the logo already leads back to the feed.
const FOOTER_LINKS = [{ href: "admin.html", label: "admin login" }];

// Per-page: the links under the wordmark, and whether the cart button
// shows. The feed needs no links — the logo leads back to it.
const PAGES = {
  home: { links: [], cart: true },
  cart: { links: [], cart: true },
  admin: { links: [{ href: "index.html", label: "view the feed" }], logoHref: "admin.html" },
};

// ---------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------
const ico = (name, extra = "") =>
  `<i class="ico ico--${name}${extra ? " " + extra : ""}" aria-hidden="true"></i>`;

function navbar(cfg) {
  const links = cfg.links.length
    ? `
    <nav class="iconnav">
      ${cfg.links.map((l) => `<a href="${l.href}" class="iconnav__item">${l.label}</a>`).join("\n      ")}
    </nav>`
    : "";

  return `
  <header class="navbar">
    <div class="navbar__top${cfg.cart ? "" : " navbar__top--solo"}">
      ${cfg.cart ? `<span aria-hidden="true"></span>` : ""}
      <a href="${cfg.logoHref || "index.html"}" class="logo">
        <span class="logo__closet">${BRAND.first}</span><span class="logo__bg">${BRAND.second}</span>
      </a>
      ${cfg.cart ? `<a class="navbar__icon navbar__cart" href="cart.html" data-cart-link>${ico("shop")}<span class="navbar__cart-count" data-cart-count hidden></span></a>` : ""}
    </div>${links}
  </header>`;
}

const footer = () => `
  <footer class="site-footer">
    <div class="footer-cols">
      <div class="footer-brand">
        <p class="footer-brand__name">${BRAND.first}<br />${BRAND.second}</p>
        <p class="footer-brand__sub">
          © ${new Date().getFullYear()} Closet Sales Namibia.<br />Made for Namibia's secondhand fashion scene
        </p>
      </div>
      <div class="footer-col">
        ${FOOTER_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("\n        ")}
      </div>
    </div>
    <p class="footer-bottom">let's be friends! ${ico("heart", "ico--pink")} ${BRAND.first} ${BRAND.second}</p>
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
