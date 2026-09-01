// Shows JavaScript errors on the page.
//
// There is no console on a phone. When a module fails to load, every button
// on the page silently stops working and the only symptom is "nothing
// happens" — which is impossible to act on and impossible to report. This
// turns that into a line of text you can read out.
//
// A classic script, not a module, and loaded before them: a module that
// fails at import time never runs its own error handling.
(function () {
  var shown = 0;

  function show(text) {
    if (shown > 2) return; // one broken import can cascade; don't paper the screen
    shown++;

    var bar = document.createElement("div");
    bar.setAttribute("role", "alert");
    bar.style.cssText = [
      "position:fixed", "left:0", "right:0", "top:0", "z-index:9999",
      "background:#7a1f35", "color:#fff", "padding:12px 40px 12px 14px",
      "font:500 12px/1.5 system-ui,sans-serif", "white-space:pre-wrap",
      "word-break:break-word", "box-shadow:0 2px 12px rgba(0,0,0,.4)",
    ].join(";");
    bar.textContent = text;

    var close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss");
    close.style.cssText =
      "position:absolute;top:6px;right:8px;background:none;border:none;color:#fff;font-size:22px;line-height:1;padding:4px 8px";
    close.onclick = function () {
      bar.remove();
    };
    bar.appendChild(close);

    (document.body || document.documentElement).appendChild(bar);
  }

  window.addEventListener("error", function (e) {
    // A failed <script> or module import fires an error event on the element
    // itself with no message — that's the case worth catching loudest.
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      show("Couldn't load: " + (e.target.src || e.target.href) + "\nThe page won't work until this loads.");
      return;
    }
    show((e.message || "Script error") + "\n" + (e.filename || "") + ":" + (e.lineno || "?"));
  }, true); // capture, so resource errors are seen — they don't bubble

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason;
    show("Unhandled: " + ((reason && (reason.code || reason.message)) || String(reason)));
  });
})();
