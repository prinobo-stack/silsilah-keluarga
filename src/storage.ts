import { Capacitor, registerPlugin } from "@capacitor/core";
import { emptyState, validateState, type State, type Media } from "./domain";
export const native = Capacitor.isNativePlatform();
interface Bridge {
  installUpdateFromFile(): Promise<{
    status: "cancelled" | "installer_closed";
  }>;
  load(): Promise<{ state: State | null }>;
  save(o: { state: State }): Promise<void>;
  putMedia(o: { id: string; data: string }): Promise<void>;
  getMedia(o: { id: string }): Promise<{ data: string }>;
  restore(o: { state: State; files: Record<string, string> }): Promise<void>;
  saveDocument(o: {
    name: string;
    mime: string;
    data: string;
  }): Promise<{ saved: boolean }>;
  securityStatus(): Promise<{ enabled: boolean; locked: boolean }>;
  unlock(o: { pin: string }): Promise<void>;
  setPin(o: { pin: string; oldPin: string }): Promise<void>;
  lock(): Promise<void>;
  recoverPin(): Promise<void>;
  beginPicker(): Promise<void>;
  endPicker(): Promise<void>;
}
export const bridge = registerPlugin<Bridge>("FamilyStore");
let externalPicker = false;
export const pickerActive = () => externalPicker;
export function beginPicker() {
  externalPicker = true;
  if (native) void bridge.beginPicker().catch(() => {});
}
export function endPicker() {
  setTimeout(() => {
    externalPicker = false;
    if (native) void bridge.endPicker().catch(() => {});
  }, 800);
}
let dbPromise: Promise<IDBDatabase> | undefined;
let workspace = "unselected",
  viewer = false;
export function setWorkspace(id: string, role: string) {
  if (id !== workspace) {
    void dbPromise?.then((d) => d.close());
    dbPromise = undefined;
  }
  workspace = id;
  viewer = role === "viewer";
}
export function familyBody(s: State) {
  return JSON.stringify({ ...s, settings: emptyState().settings });
}
export async function forgetWorkspace() {
  const d = await db();
  d.close();
  dbPromise = undefined;
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase("silsilah-web-" + workspace);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
export interface SyncMeta {
  revision: number;
  generation: number;
  dirty: boolean;
  pendingId?: string;
  pendingVersion?: number;
}
export async function syncSnapshot() {
  const d = await db();
  return new Promise<{ state: State; meta: SyncMeta }>((resolve, reject) => {
    const t = d.transaction("records", "readonly"),
      store = t.objectStore("records");
    const a = store.get("state"),
      b = store.get("sync");
    t.oncomplete = () =>
      resolve({
        state: a.result ?? emptyState(),
        meta: b.result ?? { revision: 0, generation: 0, dirty: false },
      });
    t.onabort = () => reject(t.error);
  });
}
async function writeFamilyState(s: State, files?: Record<string, string>) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("records", "readwrite"),
      store = t.objectStore("records");
    const old = store.get("state"),
      sync = store.get("sync");
    let denied = false;
    old.onsuccess = () => {
      const changed = familyBody(old.result ?? emptyState()) !== familyBody(s);
      if (viewer && changed) {
        denied = true;
        t.abort();
        return;
      }
      sync.onsuccess = () => {
        const meta: SyncMeta = sync.result ?? {
          revision: 0,
          generation: 0,
          dirty: false,
        };
        store.put(s, "state");
        store.put(
          {
            ...meta,
            generation: meta.generation + 1,
            dirty: meta.dirty || changed,
          },
          "sync",
        );
        if (files)
          for (const [id, data] of Object.entries(files))
            store.put(data, "media:" + id);
      };
    };
    t.oncomplete = () => resolve();
    t.onabort = () =>
      reject(
        denied ? Error("Akun ini hanya boleh melihat data keluarga.") : t.error,
      );
  });
  window.dispatchEvent(new Event("family-dirty"));
}
export async function completeSync(
  revision: number,
  generation: number,
  incoming?: { state: State; files: Record<string, string> },
  proposal?: { id: string; version: number },
) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("records", "readwrite"),
      store = t.objectStore("records");
    const r = store.get("sync"),
      old = store.get("state");
    let conflict = false;
    r.onsuccess = () => {
      old.onsuccess = () => {
        const meta: SyncMeta = r.result ?? {
          revision: 0,
          generation: 0,
          dirty: false,
        };
        if (incoming && meta.generation !== generation) {
          conflict = true;
          t.abort();
          return;
        }
        if (incoming) {
          const state = {
            ...incoming.state,
            settings: old.result?.settings ?? incoming.state.settings,
          };
          store.put(state, "state");
          for (const [id, data] of Object.entries(incoming.files))
            store.put(data, "media:" + id);
        }
        store.put(
          {
            revision,
            pendingId: proposal?.id,
            pendingVersion: proposal?.version,
            generation: meta.generation + (incoming ? 1 : 0),
            dirty: !incoming && meta.dirty && meta.generation !== generation,
          },
          "sync",
        );
      };
    };
    t.oncomplete = () => resolve();
    t.onabort = () =>
      reject(
        conflict
          ? Error(
              "Ada perubahan baru di perangkat. Sinkronisasi akan dicoba lagi.",
            )
          : t.error,
      );
  });
}

export async function rebaseApproved(revision: number, pendingId: string) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("records", "readwrite"),
      store = t.objectStore("records"),
      r = store.get("sync");
    r.onsuccess = () => {
      const meta = r.result as SyncMeta;
      if (meta?.pendingId === pendingId)
        store.put(
          {
            ...meta,
            revision,
            pendingId: undefined,
            pendingVersion: undefined,
          },
          "sync",
        );
    };
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
}
function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("silsilah-web-" + workspace, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("records");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function read<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("records", "readonly");
    const r = t.objectStore("records").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function write(key: string, value: unknown) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction("records", "readwrite");
    t.objectStore("records").put(value, key);
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error ?? Error("Penyimpanan gagal."));
  });
}
export async function loadState() {
  const s = native ? (await bridge.load()).state : await read<State>("state");
  if (!s) return emptyState();
  validateState(s);
  return s;
}
export async function saveState(s: State) {
  validateState(s);
  if (native) await bridge.save({ state: s });
  else await writeFamilyState(s);
}
export async function putMedia(m: Media, data: string) {
  if (native) await bridge.putMedia({ id: m.id, data: data.split(",")[1] });
  else await write("media:" + m.id, data);
}
export async function getMedia(m: Media) {
  if (native)
    return `data:${m.mime};base64,${(await bridge.getMedia({ id: m.id })).data}`;
  return (await read<string>("media:" + m.id)) ?? "";
}
export async function restoreState(s: State, files: Record<string, string>) {
  validateState(s);
  if (native) {
    await bridge.restore({
      state: s,
      files: Object.fromEntries(
        Object.entries(files).map(([id, v]) => [id, v.split(",")[1]]),
      ),
    });
    return;
  }
  await writeFamilyState(s, files);
}
export async function saveFile(
  name: string,
  mime: string,
  bytes: Uint8Array,
): Promise<boolean> {
  if (native) {
    const data = await blobData(
      new Blob([new Uint8Array(bytes).buffer], { type: mime }),
    );
    return (await bridge.saveDocument({ name, mime, data: data.split(",")[1] }))
      .saved;
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return true;
}
export function blobData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("Tidak dapat membaca berkas."));
    r.readAsDataURL(blob);
  });
}
export async function importPhoto(
  file: File,
): Promise<{ media: Media; data: string }> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw Error("Pilih foto JPG, PNG atau WebP maksimal 12 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 50_000_000) {
    bitmap.close();
    throw Error("Resolusi foto terlalu besar.");
  }
  const ratio = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Foto gagal diproses."))),
      "image/jpeg",
      0.85,
    ),
  );
  const media: Media = {
    id: crypto.randomUUID(),
    mime: "image/jpeg",
    name: file.name.slice(0, 190),
    size: blob.size,
  };
  const data = await blobData(blob);
  await putMedia(media, data);
  return { media, data };
}
// Browser PIN is for preview only. Android enforces access in the native bridge.
let previewLocked = true;
const securityKey = "security";
async function derive(pin: string, salt: Uint8Array) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const raw = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt).buffer,
      iterations: 210000,
      hash: "SHA-256",
    },
    k,
    256,
  );
  return Array.from(new Uint8Array(raw))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function securityStatus() {
  if (native) return bridge.securityStatus();
  const r = await read<{ hash: string }>(securityKey);
  return { enabled: !!r, locked: !!r && previewLocked };
}
export async function lock() {
  if (native) await bridge.lock();
  previewLocked = true;
}
export async function unlock(pin: string) {
  if (native) return bridge.unlock({ pin });
  const r = await read<{
    salt: number[];
    hash: string;
    attempts: number;
    until: number;
  }>(securityKey);
  if (!r) return;
  if (Date.now() < r.until)
    throw Error("Tunggu 30 detik sebelum mencoba lagi.");
  if ((await derive(pin, new Uint8Array(r.salt))) !== r.hash) {
    r.attempts++;
    if (r.attempts >= 5) {
      r.until = Date.now() + 30000;
      r.attempts = 0;
    }
    await write(securityKey, r);
    throw Error("PIN tidak sesuai.");
  }
  r.attempts = 0;
  r.until = 0;
  await write(securityKey, r);
  previewLocked = false;
}
export async function setPin(pin: string, oldPin: string) {
  if (native) return bridge.setPin({ pin, oldPin });
  const r = await read(securityKey);
  if (r) await unlock(oldPin);
  if (pin && !/^\d{6}$/.test(pin)) throw Error("Gunakan PIN 6 angka.");
  if (!pin) {
    await write(securityKey, null);
    previewLocked = false;
    return;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await write(securityKey, {
    salt: [...salt],
    hash: await derive(pin, salt),
    attempts: 0,
    until: 0,
  });
  previewLocked = false;
}
