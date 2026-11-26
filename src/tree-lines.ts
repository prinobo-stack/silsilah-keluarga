import type { TreeEdge, TreeLineStyle, TreeOrientation } from "./domain";

/** Shared SVG geometry for the screen and vector PDF. */
export function treeEdgePath(
  edge: Pick<TreeEdge, "kind">,
  a: { x: number; y: number },
  b: { x: number; y: number },
  style: TreeLineStyle,
  orientation: TreeOrientation = "down",
): string {
  const peer = edge.kind === "union" || edge.kind === "sibling";
  if (orientation === "right") {
    if (peer) {
      const downward = a.y <= b.y;
      return `M${a.x + 78},${a.y + (downward ? 92 : 0)} L${b.x + 78},${b.y + (downward ? 0 : 92)}`;
    }
    const ax = a.x + 156, ay = a.y + 46, bx = b.x, by = b.y + 46;
    const middle = (ax + bx) / 2;
    if (style === "straight") return `M${ax},${ay} L${bx},${by}`;
    return style === "elbow"
      ? `M${ax},${ay} H${middle} V${by} H${bx}`
      : `M${ax},${ay} C${middle},${ay} ${middle},${by} ${bx},${by}`;
  }
  const rightward = a.x <= b.x;
  const ax = a.x + (peer ? (rightward ? 156 : 0) : 78);
  const ay = a.y + (peer ? 46 : 92);
  const bx = b.x + (peer ? (rightward ? 0 : 156) : 78);
  const by = b.y + (peer ? 46 : 0);
  if (peer || style === "straight") return `M${ax},${ay} L${bx},${by}`;
  const middle = (ay + by) / 2;
  return style === "elbow"
    ? `M${ax},${ay} V${middle} H${bx} V${by}`
    : `M${ax},${ay} C${ax},${middle} ${bx},${middle} ${bx},${by}`;
}
