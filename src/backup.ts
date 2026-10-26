import JSZip from "jszip";
import { validateState, type State } from "./domain";
const MAX = 100 * 1024 * 1024;
export async function digest(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export interface Manifest {
  format_version: 1;
  app_version: string;
  exported_at: string;
  counts: {
    persons: number;
    siblings?: number;
    parents: number;
    unions: number;
    memories: number;
  };
  files: { path: string; bytes: number; sha256: string }[];
}
function base64(bytes: Uint8Array) {
  let str = "";
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
function decode(data: string) {
  return Uint8Array.from(atob(data.split(",")[1]), (c) => c.charCodeAt(0));
}
export async function createBackup(
  state: State,
  readMedia: (id: string) => Promise<string>,
) {
  validateState(state);
  const zip = new JSZip();
  const entries: { path: string; bytes: Uint8Array }[] = [
    {
      path: "data.json",
      bytes: new TextEncoder().encode(JSON.stringify(state)),
    },
  ];
  for (const m of state.media) {
    const data = await readMedia(m.id);
    if (!data)
      throw Error("Foto " + m.name + " tidak ditemukan. Cadangan dibatalkan.");
    const bytes = decode(data);
    if (bytes.length !== m.size) throw Error("Ukuran foto tidak cocok.");
    entries.push({ path: "media/" + m.id, bytes });
  }
  if (entries.reduce((a, e) => a + e.bytes.length, 0) > MAX)
    throw Error("Cadangan melebihi batas 100 MB versi ini.");
  const manifest: Manifest = {
    format_version: 1,
    app_version: "0.2.1",
    exported_at: new Date().toISOString(),
    counts: {
      persons: state.persons.length,
      siblings: state.siblings?.length ?? 0,
      parents: state.parents.length,
      unions: state.unions.length,
      memories: state.memories.length,
    },
    files: [],
  };
  for (const e of entries) {
    manifest.files.push({
      path: e.path,
      bytes: e.bytes.length,
      sha256: await digest(e.bytes),
    });
    zip.file(e.path, e.bytes);
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });
}
export async function inspectBackup(bytes: Uint8Array) {
  if (bytes.length > 64 * 1024 * 1024)
    throw Error("Berkas cadangan maksimal 64 MB terkompresi.");
  const zip = await JSZip.loadAsync(bytes);
  const all = Object.values(zip.files).filter((f) => !f.dir);
  if (all.length > 20002) throw Error("Jumlah berkas terlalu banyak.");
  let total = 0;
  for (const f of all) {
    const original =
      (f as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ??
      f.name;
    if (
      original !== f.name ||
      !/^((manifest|data)\.json|media\/[A-Za-z0-9-]{1,64})$/.test(f.name)
    )
      throw Error("Path berkas cadangan tidak aman.");
    const size = (f as unknown as { _data: { uncompressedSize: number } })._data
      ?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0 || (total += size) > MAX)
      throw Error("Hasil ekstraksi melebihi 100 MB.");
    if (f.name === "manifest.json" && size > 4 * 1024 * 1024)
      throw Error("Manifest terlalu besar.");
  }
  const mf = zip.file("manifest.json");
  if (!mf) throw Error("Manifest tidak ditemukan.");
  const manifest: Manifest = JSON.parse(await mf.async("string"));
  if (
    manifest.format_version !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== all.length - 1
  )
    throw Error("Versi atau daftar cadangan tidak valid.");
  const extracted = new Map<string, Uint8Array>();
  for (const e of manifest.files) {
    if (
      !e ||
      typeof e.path !== "string" ||
      e.path === "manifest.json" ||
      extracted.has(e.path) ||
      !Number.isSafeInteger(e.bytes) ||
      e.bytes < 0 ||
      e.bytes > MAX ||
      typeof e.sha256 !== "string"
    )
      throw Error("Manifest tidak valid.");
    const f = zip.file(e.path);
    if (!f) throw Error("Berkas cadangan kurang lengkap.");
    const content = await f.async("uint8array");
    if (content.length !== e.bytes || (await digest(content)) !== e.sha256)
      throw Error("Checksum tidak cocok. Berkas berubah atau rusak.");
    extracted.set(e.path, content);
  }
  const raw = extracted.get("data.json");
  if (!raw) throw Error("Data keluarga tidak ditemukan.");
  const state: State = JSON.parse(new TextDecoder().decode(raw));
  validateState(state);
  if (
    !manifest.counts ||
    manifest.counts.persons !== state.persons.length ||
    manifest.counts.parents !== state.parents.length ||
    manifest.counts.unions !== state.unions.length ||
    manifest.counts.memories !== state.memories.length ||
    (manifest.counts.siblings !== undefined &&
      manifest.counts.siblings !== (state.siblings?.length ?? 0))
  )
    throw Error("Jumlah data tidak cocok.");
  const files: Record<string, string> = {};
  for (const m of state.media) {
    const content = extracted.get("media/" + m.id);
    if (!content || content.length !== m.size)
      throw Error("Foto tidak lengkap.");
    const jpeg = content[0] === 255 && content[1] === 216;
    const png =
      content[0] === 137 &&
      content[1] === 80 &&
      content[2] === 78 &&
      content[3] === 71;
    const webp =
      new TextDecoder().decode(content.subarray(0, 4)) === "RIFF" &&
      new TextDecoder().decode(content.subarray(8, 12)) === "WEBP";
    if (!(m.mime === "image/jpeg" ? jpeg : m.mime === "image/png" ? png : webp))
      throw Error("Isi foto tidak sesuai format.");
    files[m.id] = `data:${m.mime};base64,${base64(content)}`;
  }
  if (extracted.size !== state.media.length + 1)
    throw Error("Ada berkas tambahan yang tidak dirujuk.");
  return { state, files, manifest };
}
