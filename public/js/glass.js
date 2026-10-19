// The glass panels respond to the pointer: product cards tilt toward it
// like a physical pane, and on every glass panel the glare and the
// holographic edge follow it. One delegated listener covers everything,
// including cards the feed adds later. Mouse/trackpad only; touch screens
// and reduced-motion settings get the still version.

const SURFACES = ".item-card, .hero__tile, .folder, .auth-card";
const TILT = ".item-card";
const MAX_TILT = 7; // degrees

const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

let active = null;
let frame = 0;
let last = null;

function reset(node) {
  node.style.removeProperty("--rx");
  node.style.removeProperty("--ry");
  node.style.removeProperty("--mx");
  node.style.removeProperty("--my");
  node.style.removeProperty("--holo-angle");
  node.classList.remove("is-tilting");
}

function paint() {
  frame = 0;
  if (!active || !last) return;
  const box = active.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (last.clientX - box.left) / box.width));
  const y = Math.min(1, Math.max(0, (last.clientY - box.top) / box.height));

  active.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
  active.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  // the iridescent edge turns with the pointer's position around the centre
  active.style.setProperty("--holo-angle", `${(Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 90}deg`);

  if (active.matches(TILT)) {
    active.classList.add("is-tilting");
    active.style.setProperty("--rx", `${((0.5 - y) * MAX_TILT * 2).toFixed(2)}deg`);
    active.style.setProperty("--ry", `${((x - 0.5) * MAX_TILT * 2).toFixed(2)}deg`);
  }
}

document.addEventListener(
  "pointermove",
  (e) => {
    if (!fine.matches || calm.matches || e.pointerType === "touch") return;
    const node = e.target.closest?.(SURFACES) || null;
    if (node !== active) {
      if (active) reset(active);
      active = node;
    }
    last = e;
    if (active && !frame) frame = requestAnimationFrame(paint);
  },
  { passive: true }
);

document.addEventListener("pointerleave", () => {
  if (active) reset(active);
  active = null;
});
