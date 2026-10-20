// Pinterest-style board for a grid of cards: equal-width columns, each
// card only as tall as its content, the next one tucked in underneath.
//
// The grid keeps its normal left-to-right order (newest first stays in
// the top row); the trick is 1px grid rows with no row gap, and each card
// spanning as many rows as it is tall plus the gap. A ResizeObserver
// keeps that span right as photos load or the screen resizes, and new
// cards (load more, filters) are picked up as they're added.
// Without JS the grid is still a plain, aligned grid.

export function masonry(grid) {
  if (!grid || !("ResizeObserver" in window)) return;
  grid.classList.add("is-masonry");

  const gap = () => parseFloat(getComputedStyle(grid).getPropertyValue("--masonry-gap")) || 24;
  const fit = (card) => {
    // offsetHeight ignores transforms, so the hover tilt doesn't jiggle it
    card.style.setProperty("--span", Math.ceil(card.offsetHeight + gap()));
  };

  const sizes = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));
  const watch = (card) => {
    if (card.nodeType !== 1) return;
    fit(card);
    sizes.observe(card);
  };

  [...grid.children].forEach(watch);
  new MutationObserver((records) =>
    records.forEach((r) => {
      r.addedNodes.forEach(watch);
      r.removedNodes.forEach((n) => n.nodeType === 1 && sizes.unobserve(n));
    })
  ).observe(grid, { childList: true });
}
