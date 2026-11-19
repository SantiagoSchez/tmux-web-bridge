// Where a tooltip goes next to what it describes: beside it, inside the screen.

/** The gap between a tip and what it describes, and between a tip and the screen's edges. */
const GAP = 8;

/**
 * A tip's top-left corner: right of the anchor, level with its top; on the left when the
 * right has no room; then moved inside the screen with a margin on every side.
 */
export function tipPosition(
  anchor: { left: number; top: number; right: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let left = anchor.right + GAP;
  if (left + size.width > viewport.width - GAP && anchor.left - GAP - size.width >= GAP) left = anchor.left - GAP - size.width;
  left = Math.max(GAP, Math.min(left, viewport.width - GAP - size.width));
  const top = Math.max(GAP, Math.min(anchor.top, viewport.height - GAP - size.height));
  return { left, top };
}
