// Fits the denim-patch headline (an SVG in index.html) to its text: lays
// the two lines out at 100 units per font size, then sets the viewBox to
// what they actually measure, so the drawing scales to fill its column.
//
// It stays hidden until the measurement is made in the real font. On a
// slow first visit Fredoka can arrive after this script runs; measuring
// the fallback font then would leave the headline the wrong size, so it
// waits for Fredoka and measures again whenever fonts finish loading.
// (index.html gives the SVG opacity="0", a starting viewBox and its font
// size as attributes, so it's safe even before the stylesheet arrives.)

const svg = document.querySelector("[data-denim-title]");
const SIZE = 100; // font size in SVG units
const GAP = 1.12; // line height
const PAD = 8; // room for the rim around the letters
const FONT = `700 ${SIZE}px Fredoka`;

function fit(force = false) {
  if (!svg) return;
  // not the real font yet: stay hidden, the font listeners below call again
  if (!force && document.fonts && !document.fonts.check(FONT)) return;

  const centred = getComputedStyle(svg).getPropertyValue("--align").trim() === "center";
  const lines = [1, 2].map((n) => [...svg.querySelectorAll(`[data-line="${n}"]`)]);
  const widths = lines.map((ts) => ts[0].getComputedTextLength());
  const width = Math.max(...widths);
  if (!width) return;

  lines.forEach((ts, i) => {
    const x = centred ? PAD + (width - widths[i]) / 2 : PAD;
    const y = PAD + SIZE * 0.92 + i * SIZE * GAP;
    ts.forEach((t) => {
      t.setAttribute("x", x);
      t.setAttribute("y", y);
    });
  });
  svg.setAttribute("viewBox", `0 0 ${width + PAD * 2} ${SIZE * (1 + GAP) + PAD * 2}`);
  svg.classList.add("is-ready");
  svg.removeAttribute("opacity");
}

fit();
const refit = () => fit();
document.fonts?.load(FONT).then(refit, refit);
document.fonts?.ready.then(refit);
document.fonts?.addEventListener("loadingdone", refit);
// if the font never arrives at all, show it in the fallback font rather
// than not at all
setTimeout(() => svg && !svg.classList.contains("is-ready") && fit(true), 6000);
window.matchMedia("(max-width: 879px)").addEventListener("change", refit);
