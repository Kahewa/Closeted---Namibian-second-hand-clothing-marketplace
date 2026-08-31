// The welcome card that greets someone arriving on the home page.
//
// It stays out of the way for a returning visitor: once shown, the time is
// remembered and it won't appear again for an hour. localStorage is
// per-browser and per-device, so this is a nicety rather than a guarantee —
// which is exactly the right weight for a greeting.
import { $, openModal, closeModal } from "./utils.js";

const STORAGE_KEY = "csn.welcome.shownAt";
const QUIET_PERIOD = 60 * 60 * 1000; // one hour

const modal = $("[data-welcome]");
if (modal) {
  const panel = modal.querySelector(".modal__panel");
  let lastFocused = null;

  /**
   * Storage is wrapped because a private window, blocked site data, or a
   * thumbnail renderer can all make it throw on read as well as write.
   * If we can't tell when they last visited, show the card — a greeting
   * shown twice is a smaller failure than one that never appears.
   */
  function shouldGreet() {
    try {
      const shownAt = Number(localStorage.getItem(STORAGE_KEY));
      if (!shownAt) return true;
      return Date.now() - shownAt > QUIET_PERIOD;
    } catch {
      return true;
    }
  }

  function remember() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* nothing to do — it'll simply greet them again next visit */
    }
  }

  function open() {
    lastFocused = document.activeElement;
    openModal(modal);
    remember();
    // let the entrance animation start before moving focus
    requestAnimationFrame(() => panel?.querySelector(".btn")?.focus());
  }

  function close() {
    closeModal(modal);
    lastFocused?.focus?.();
  }

  modal.querySelectorAll("[data-welcome-close]").forEach((node) =>
    node.addEventListener("click", close)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  if (shouldGreet()) {
    // a beat after paint, so it grows onto a page that's already there
    setTimeout(open, 450);
  }
}
