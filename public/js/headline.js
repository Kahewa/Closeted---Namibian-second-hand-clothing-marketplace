// Fits the denim-patch headline (an SVG in index.html) to its text: lays
// the two lines out at 100 units per font size, then sets the viewBox to
// what they actually measure, so the drawing scales to fill its column.
// Waits for the web font, since the width depends on it.

const svg = document.querySelector("[data-denim-title]");
const SIZE = 100; // font size in SVG units
const GAP = 1.12; // line height
const PAD = 8; // room for the rim around the letters

async function fit() {
  if (!svg) return;
  try {
    await document.fonts.load(`700 ${SIZE}px Fredoka`);
  } catch {
    /* fall back to whatever font is there */
  }
  const centred = getComputedStyle(svg).getPropertyValue("--align").trim() === "center";
  const lines = [1, 2].map((n) => [...svg.querySelectorAll(`[data-line="${n}"]`)]);
  const widths = lines.map((ts) => ts[0].getComputedTextLength());
  const width = Math.max(...widths);

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
}

fit();
window.matchMedia("(max-width: 879px)").addEventListener("change", fit);
