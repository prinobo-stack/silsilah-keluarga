import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { treeEdgePath } from "./tree-lines";
import { treeGraph, type State, type TreeDirection } from "./domain";
export async function exportPdf(
  s: State,
  focus: string,
  direction: TreeDirection,
  depth: number,
  size: "A4" | "A3",
  landscape: boolean,
  collapsed: ReadonlySet<string> = new Set(),
) {
  const graph = treeGraph(s, focus, direction, depth, collapsed);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await (
    await fetch(new URL("./assets/DejaVuSans.ttf", import.meta.url))
  ).arrayBuffer();
  const font = await doc.embedFont(fontBytes, { subset: true });
  const dimensions = size === "A4" ? [595.28, 841.89] : [841.89, 1190.55];
  if (landscape) dimensions.reverse();
  const [w, h] = dimensions;
  const margin = 28,
    cols = landscape ? 4 : 3,
    rows = landscape ? 3 : 4,
    tileW = cols * 184,
    tileH = rows * 155;
  // Assign by card origin, with room for the entire card at each tile edge.
  const nx = Math.max(
      1,
      ...graph.nodes.map((n) => Math.floor((n.x - 40) / tileW) + 1),
    ),
    ny = Math.max(
      1,
      ...graph.nodes.map((n) => Math.floor((n.y - 50) / tileH) + 1),
    );
  const scale = Math.min(
    (w - 2 * margin) / (tileW + 156),
    (h - 150) / (tileH + 92),
  );
  const fit = (t: string, max: number, fontSize: number) => {
    let text = t;
    while (text.length && font.widthOfTextAtSize(text, fontSize) > max)
      text = text.slice(0, -1);
    return text === t ? t : text.slice(0, -1) + "…";
  };
  for (let ty = 0; ty < ny; ty++)
    for (let tx = 0; tx < nx; tx++) {
      const page = doc.addPage([w, h]);
      const pageNo = ty * nx + tx + 1;
      page.drawText(fit(s.familyName, w - 56, 17), {
        x: margin,
        y: h - 35,
        size: 17,
        font,
        color: rgb(0.08, 0.32, 0.24),
      });
      page.drawText(`Silsilah keluarga • Halaman ${pageNo} dari ${nx * ny}`, {
        x: margin,
        y: h - 53,
        size: 9,
        font,
      });
      page.drawText(
        "Kotak hijau dan garis tebal: jalur fokus • Redup: hubungan lain",
        {
          x: margin,
          y: h - 68,
          size: 8,
          font,
        },
      );
      const visible = graph.nodes.filter(
        (n) =>
          Math.floor((n.x - 40) / tileW) === tx &&
          Math.floor((n.y - 50) / tileH) === ty,
      );
      const points = new Map(graph.nodes.map((n) => [n.id, n]));
      const convert = (n: { x: number; y: number }) => ({
        x: margin + (n.x - 40 - tx * tileW) * scale,
        y: h - 90 - (n.y - 50 - ty * tileH) * scale,
      });
      for (const e of [...graph.edges].sort(
        (a, b) => Number(a.focused) - Number(b.focused),
      )) {
        const a = points.get(e.from)!,
          b = points.get(e.to)!;
        if (
          !visible.some((n) => n.id === a.id) ||
          !visible.some((n) => n.id === b.id)
        )
          continue;
        page.drawSvgPath(
          treeEdgePath(e, a, b, s.settings.treeLineStyle ?? "curve"),
          {
            x: margin - (40 + tx * tileW) * scale,
            y: h - 90 + (50 + ty * tileH) * scale,
            scale,
            borderColor: e.focused ? rgb(0, 0.58, 0.37) : rgb(0.69, 0.73, 0.71),
            borderWidth: e.focused ? 3 : 1.1,
            borderDashArray:
              e.kind === "sibling"
                ? [1, 3]
                : (e.kind === "adoptive" || e.kind === "step")
                  ? [3, 3]
                  : undefined,
          },
        );
      }
      for (const n of visible) {
        const p = s.persons.find((p) => p.id === n.id)!;
        const a = convert(n);
        page.drawRectangle({
          x: a.x,
          y: a.y - 92 * scale,
          width: 156 * scale,
          height: 92 * scale,
          color:
            n.id === focus
              ? rgb(0.73, 0.95, 0.84)
              : n.focused
                ? rgb(0.89, 1, 0.93)
                : rgb(0.95, 0.96, 0.94),
          borderColor: n.focused ? rgb(0, 0.58, 0.37) : rgb(0.77, 0.81, 0.78),
          borderWidth: n.id === focus ? 2 : n.focused ? 1.2 : 0.5,
        });
        page.drawText(fit(p.name, 146 * scale, 10 * scale), {
          x: a.x + 7 * scale,
          y: a.y - 20 * scale,
          size: 10 * scale,
          font,
        });
        page.drawText(
          `${p.birth.slice(0, 4) || "?"}${p.status === "deceased" ? " – " + (p.death.slice(0, 4) || "?") : ""}`,
          { x: a.x + 7 * scale, y: a.y - 36 * scale, size: 8 * scale, font },
        );
        const refs = new Set<number>();
        for (const e of graph.edges.filter(
          (e) => e.from === n.id || e.to === n.id,
        )) {
          const other = points.get(e.from === n.id ? e.to : e.from)!;
          const dest =
            Math.floor((other.y - 50) / tileH) * nx +
            Math.floor((other.x - 40) / tileW) +
            1;
          if (dest !== pageNo) refs.add(dest);
        }
        if (refs.size)
          page.drawText(
            fit("Sambung hal. " + [...refs].join(", "), 145 * scale, 7 * scale),
            { x: a.x + 7 * scale, y: a.y - 53 * scale, size: 7 * scale, font },
          );
      }
      page.drawText(
        "Tegak: orang tua • Putus: adopsi • Mendatar: pasangan • Titik: saudara",
        { x: margin, y: 34, size: 8, font },
      );
      page.drawText(
        `Cakupan mengikuti tampilan pohon • ${graph.nodes.length} anggota • ${graph.hiddenCount} dilipat`,
        { x: margin, y: 20, size: 8, font },
      );
    }
  return doc.save();
}
