import type { TreeEdge, TreeLineStyle } from "./domain";

/** Shared SVG geometry for the screen and vector PDF. */
export function treeEdgePath(
  edge: Pick<TreeEdge, "kind">,
  a: { x: number; y: number },
  b: { x: number; y: number },
  style: TreeLineStyle,
): string {
  const peer = edge.kind === "union" || edge.kind === "sibling";
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
