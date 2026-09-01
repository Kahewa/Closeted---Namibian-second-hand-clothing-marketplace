// Light / dark.
//
// Three states, not two: "light", "dark", and no stored choice at all, which
// means follow the phone. That last one is the default and it matters — a
// visitor who has their whole phone in dark mode should get a dark shop
// without ever finding this button.
//
// Loaded as a plain blocking script in <head>, before any of the modules, so
// the attribute is on <html> before the first paint. As a module it would be
// deferred and every dark-mode visitor would get a white flash on every page.
(function () {
  var KEY = "closet-theme";

  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (err) {
      // Safari in private mode throws on localStorage rather than returning
      // null, and a theme preference isn't worth taking the page down for.
      return null;
    }
  }

  function apply(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }

  apply(stored());

  // What the toggle should switch to: whatever isn't on screen right now.
  function showing() {
    var chosen = stored();
    if (chosen) return chosen;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  window.ClosetTheme = {
    showing: showing,
    toggle: function () {
      var next = showing() === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch (err) {
        /* the page still flips, it just won't be remembered */
      }
      apply(next);
      return next;
    },
  };
})();
