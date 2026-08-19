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

const TICKER =
  "Build Your Closet Sale · N$150 Service Fee per Closet - Unlimited Items per Closet · Message sellers on WhatsApp";

const NAV = [
  { key: "home", href: "index.html", icon: "home", label: "home" },
  { key: "shop", href: "index.html#feed-start", icon: "shirt", label: "shop" },
  { key: "sell", href: "sell.html", icon: "tag", label: "sell" },
  { key: "profile", href: "profile.html", icon: "mail", label: "profile" },
  { key: "people", href: "search.html", icon: "search", label: "people" },
];

const FOOTER_COLS = [
  {
    title: "shop",
    links: [
      { href: "index.html", label: "all closets" },
      { href: "index.html#feed-start", label: "new drops" },
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
      { href: "sell.html", label: "how selling works" },
      { href: "profile.html", label: "contact a seller" },
    ],
  },
];

const FOOTER_SOCIALS = ["instagram", "tiktok", "facebook", "chat"];

// Per-page: which nav item is lit, and what the start-bar calls the
// "open window". `chrome: false` means the page draws its own thing.
const PAGES = {
  home: { nav: "home", window: "welcome 2 my closet.html", windowIcon: "home" },
  sell: { nav: "sell", window: "sell my closet.html", windowIcon: "tag" },
  profile: { nav: "profile", window: "my profile.html", windowIcon: "mail" },
  people: { nav: "people", window: "find people.html", windowIcon: "search" },
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

const topbar = () => `
  <div class="topbar">
    <div class="ticker" aria-hidden="true">
      <div class="ticker__track">
        <span class="ticker__seg">${TICKER}</span>
        <span class="ticker__seg">${TICKER}</span>
      </div>
    </div>
    <div class="topbar__links">
      <a href="login.html">sign in</a>
      <a href="login.html">join now!</a>
    </div>
  </div>`;

function navbar(cfg) {
  const isAdmin = cfg.variant === "admin";
  const logo = `
    <a href="${isAdmin ? "admin.html" : "index.html"}" class="logo">
      <span class="logo__closet">${BRAND.first}</span><span class="logo__bg">${isAdmin ? "admin" : BRAND.second}</span>
    </a>`;

  const iconnav = isAdmin
    ? ""
    : `
    <nav class="iconnav">
      ${NAV.map(
        (item) =>
          `<a href="${item.href}" class="iconnav__item${item.key === cfg.nav ? " iconnav__item--on" : ""}">` +
          `<span>${ico(item.icon)}</span>${item.label}</a>`
      ).join("\n      ")}
    </nav>`;

  const extra = isAdmin ? `<a href="sell.html">post a carousel</a>` : "";

  return `
  <header class="navbar">
    <div class="navbar__inner">
      ${logo}
      ${iconnav}
      <nav class="navlinks">
        ${extra}
        <span data-nav-auth></span>
      </nav>
    </div>
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
    if (cfg.sparkles !== false) shell.insertAdjacentHTML("afterbegin", sparkleField());
  } else {
    shell.insertAdjacentHTML("afterbegin", sparkleField() + topbar() + navbar(cfg));
    shell.insertAdjacentHTML("beforeend", footer() + taskbar(cfg));
  }
}

// the navbar's account slot, once it exists
if (cfg.chrome !== false) {
  watchAuthState((user) => renderNavAuth(user));
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
