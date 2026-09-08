// The chrome that every page shares: announcement bar, masthead, footer
// and the desktop start-bar. It used to be copy-pasted into all six HTML
// files, which meant six edits to change one link. Now each page just
// declares who it is on the <body> tag:
//
//   <body data-page="sell">
//
// ...and this module builds the rest around whatever <main> it finds.
// Also folds in what nav.js and taskbar.js used to do separately.
import { watchAuthState, renderNavAuth } from "./auth.js";

// ---------------------------------------------------------------------
// Everything editable lives here.
// ---------------------------------------------------------------------
const BRAND = { first: "closet sales", second: "namibia" };

// `authOnly` items render hidden and are revealed once we know somebody is
// signed in — a profile link means nothing to a signed-out visitor.
const NAV = [
  { key: "home", href: "index.html", label: "home" },
  { key: "how", href: "how.html", label: "how it works" },
  { key: "sell", href: "sell.html", label: "sell your closet" },
  { key: "profile", href: "profile.html", label: "profile", authOnly: true },
];

const FOOTER_COLS = [
  {
    title: "shop",
    links: [
      { href: "index.html", label: "all closets" },
      { href: "shop.html", label: "view sellers" },
      { href: "sell.html", label: "sell yours" },
    ],
  },
  {
    title: "account",
    links: [
      { href: "login.html", label: "sign in" },
      { href: "login.html", label: "join now" },
      { href: "profile.html", label: "my profile" },
    ],
  },
  {
    title: "help",
    links: [
      { href: "how.html", label: "how it works" },
      { href: "profile.html", label: "contact a seller" },
    ],
  },
];

const FOOTER_SOCIALS = ["instagram", "tiktok", "facebook", "chat"];

// Per-page: which nav item is lit, and what the start-bar calls the
// "open window". `chrome: false` means the page draws its own thing.
const PAGES = {
  home: { nav: "home", window: "closets", windowIcon: "home" },
  sellers: { nav: "sellers", window: "view sellers", windowIcon: "search" },
  how: { nav: "how", window: "how it works", windowIcon: "note" },
  sell: { nav: "sell", window: "sell your closet", windowIcon: "tag" },
  profile: { nav: "profile", window: "my profile", windowIcon: "user" },
  admin: { nav: null, window: "admin dashboard.exe", windowIcon: "tools", variant: "admin" },
  login: { chrome: false, sparkles: true },
};

const SPARKLES = [
  'style="top:6%;left:-4%;"',
  'class="sparkle--sm" style="top:22%;right:-2%;animation-delay:1.4s;"',
  'class="sparkle--ink" style="top:48%;left:2%;animation-delay:2.2s;"',
  'style="top:74%;right:-5%;animation-delay:0.8s;"',
];

// ---------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------
const ico = (name, extra = "") =>
  `<i class="ico ico--${name}${extra ? " " + extra : ""}" aria-hidden="true"></i>`;

const sparkleField = () => `
  <div class="sparkle-field" aria-hidden="true">
    ${SPARKLES.map((attrs) =>
      attrs.startsWith("class") ? `<span class="sparkle ${attrs.slice(7)}></span>` : `<span class="sparkle" ${attrs}></span>`
    ).join("\n    ")}
  </div>`;

function navbar(cfg) {
  const isAdmin = cfg.variant === "admin";

  const logo = `
      <a href="${isAdmin ? "admin.html" : "index.html"}" class="logo">
        <span class="logo__closet">${BRAND.first}</span><span class="logo__bg">${BRAND.second}</span>
      </a>`;

  const iconnav = isAdmin
    ? `<nav class="iconnav"><a href="sell.html" class="iconnav__item">post a carousel</a></nav>`
    : `
      <nav class="iconnav">
        ${NAV.map(
          (item) =>
            `<a href="${item.href}" class="iconnav__item${item.key === cfg.nav ? " iconnav__item--on" : ""}"` +
            `${item.authOnly ? " data-auth-only hidden" : ""}>${item.label}</a>`
        ).join("\n        ")}
      </nav>`;

  // Three slots on the top row so the wordmark stays optically centred
  // whatever sits either side of it.
  return `
  <header class="navbar">
    <div class="navbar__top">
      <a class="navbar__icon" href="shop.html" aria-label="Search sellers">${ico("search")}</a>
      ${logo}
      <span class="navbar__icon navbar__icon--end" data-nav-auth></span>
    </div>
    ${iconnav}
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
        <div class="footer-socials" aria-hidden="true">${FOOTER_SOCIALS.map((s) => ico(s)).join("")}</div>
      </div>
      ${FOOTER_COLS.map(
        (col) => `
      <div class="footer-col">
        <p class="footer-col__title">${col.title}</p>
        ${col.links.map((l) => `<a href="${l.href}">${l.label}</a>`).join("\n        ")}
      </div>`
      ).join("")}
    </div>
    <p class="footer-bottom">let's be friends! ${ico("heart", "ico--pink")} ${BRAND.first} ${BRAND.second}</p>
  </footer>`;

const taskbar = (cfg) => `
  <div class="taskbar" aria-hidden="true">
    <span class="taskbar__start">${ico("grid")} start</span>
    <span class="taskbar__win">${ico(cfg.windowIcon || "home")} ${cfg.window}</span>
    <span class="taskbar__clock" data-taskbar-clock>--:--</span>
  </div>`;

// ---------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------
const cfg = PAGES[document.body.dataset.page] || PAGES.home;
const shell = document.querySelector(".page");

if (shell) {
  if (cfg.chrome === false) {
    /* the decorative layer is retired in this theme */
  } else {
    shell.insertAdjacentHTML("afterbegin", navbar(cfg));
    shell.insertAdjacentHTML("beforeend", footer() + taskbar(cfg));
  }
}

// the navbar's account slot, once it exists
if (cfg.chrome !== false) {
  watchAuthState((user) => {
    renderNavAuth(user);

    // signed-in-only items appear here, pointed at their own profile
    document.querySelectorAll("[data-auth-only]").forEach((node) => {
      node.hidden = !user;
      if (user && (node.getAttribute("href") || "").startsWith("profile.html")) {
        node.setAttribute("href", `profile.html?uid=${user.uid}`);
      }
    });
  });
}

// the start-bar clock (hidden by CSS below 900px, cheap enough to leave running)
const clock = document.querySelector("[data-taskbar-clock]");
if (clock) {
  const paint = () => {
    clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  paint();
  setInterval(paint, 30_000);
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
// on screen, on scroll for the rest. Cards the app builds later (the feed,
// the seller grid, the admin lists) are picked up by a MutationObserver, so
// nothing has to remember to call this.
const REVEAL = [
  ".section-title",
  ".heart-row",
  ".how-intro",
  ".how-title",
  ".how-steps li",
  ".step-card",
  ".how-cta .h2",
  ".how-cta__lead",
  ".how-cta .btn",
  ".listings-divider",
  ".seller-search",
  ".seller-count",
  ".chrome-card",
  ".glass-card",
  ".profile-header",
  ".pinned-pay",
  ".legacy-fix",
  ".danger-zone",
  ".empty-state",
  ".carousel-card",
  ".tile",
  ".review",
  ".account",
  ".item-row",
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
