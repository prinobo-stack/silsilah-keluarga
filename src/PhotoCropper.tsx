import { useEffect, useRef, useState } from "react";

/** A square crop preview is the exact image saved, including on touch devices. */
export default function PhotoCropper({ file, confirm, cancel }: {
  file: File; confirm: (file: File) => Promise<void>; cancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1), [x, setX] = useState(50), [y, setY] = useState(50);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, loaded: ImageBitmap | undefined;
    void (async () => {
      try {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024)
          throw Error("Pilih foto JPG, PNG atau WebP maksimal 12 MB.");
        loaded = await createImageBitmap(file);
        if (!active) { loaded.close(); return; }
        if (loaded.width * loaded.height > 50_000_000) throw Error("Resolusi foto terlalu besar.");
        setBitmap(loaded);
      } catch (e) { if (active) setError((e as Error).message); }
    })();
    return () => { active = false; loaded?.close(); };
  }, [file]);
  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const ctx = canvas.current.getContext("2d")!;
    const side = Math.min(bitmap.width, bitmap.height) / zoom;
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 720, 720);
    ctx.drawImage(bitmap, (bitmap.width-side)*x/100, (bitmap.height-side)*y/100, side, side, 0, 0, 720, 720);
  }, [bitmap, zoom, x, y]);
  async function save() {
    setBusy(true); setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(b => b ? resolve(b) : reject(Error("Foto gagal dipotong.")), "image/jpeg", .9));
      await confirm(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {type: "image/jpeg"}));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="card" aria-label="Potong foto anggota">
    <h3>Potong foto anggota</h3>
    <p>Atur pembesaran dan posisi wajah. Gambar di bawah adalah hasil yang akan disimpan.</p>
    <canvas ref={canvas} width={720} height={720} style={{width:"100%", maxWidth:320, height:"auto", display:"block", borderRadius:12}} aria-label="Pratinjau hasil potong foto" />
    <label>Perbesar<input type="range" min={1} max={4} step={.05} value={zoom} onChange={e=>setZoom(Number(e.target.value))} disabled={busy} /></label>
    <label>Posisi kiri–kanan<input type="range" min={0} max={100} value={x} onChange={e=>setX(Number(e.target.value))} disabled={busy} /></label>
    <label>Posisi atas–bawah<input type="range" min={0} max={100} value={y} onChange={e=>setY(Number(e.target.value))} disabled={busy} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="secondary" disabled={busy} onClick={cancel}>Batal potong</button>{" "}
    <button type="button" className="primary" disabled={!bitmap || busy} onClick={()=>void save()}>{busy ? "Memproses…" : "Gunakan foto"}</button>
  </section>;
}
