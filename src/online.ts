import { rebaseApproved } from "./storage";
import { createBackup, inspectBackup } from "./backup";
import { syncSnapshot, completeSync, getMedia, saveFile } from "./storage";

export interface OnlineUser {
  id: string;
  name: string;
  login: string;
  role: "owner" | "editor" | "viewer";
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api(path: string, data?: unknown): Promise<any> {
  const res = await fetch("/api/" + path, {
    credentials: "same-origin",
    cache: "no-store",
    ...(data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(res.status || 502,"Sambungan server belum tersedia. Periksa server Termux dan alamat keluarga terbaru.");
  const value = await res.json();
  if (!res.ok)
    throw new ApiError(res.status, value.error ?? "Permintaan gagal.");
  return value;
}
let pending: Promise<string> | undefined;
export function synchronize(forcePull = false): Promise<string> {
  return (pending ??= sync(forcePull).finally(() => {
    pending = undefined;
  }));
}
async function sync(forcePull: boolean): Promise<string> {
  const local = await syncSnapshot();
  const remote = await api("revision");
  let revision = remote.revision;
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw Error("Revisi server tidak valid.");
  let approvedPull = false;
  if (local.meta.pendingId && !forcePull) {
    const p = await api("proposals/" + local.meta.pendingId + "/status");
    if (p.status === "rejected")
      throw new ApiError(
        409,
        "Usulan ditolak admin: " +
          p.note +
          ". Salinan usulan tetap ada di perangkat. Cadangkan lalu ambil data resmi untuk melanjutkan.",
      );
    if (p.status === "pending" && revision !== local.meta.revision)
      throw new ApiError(
        409,
        "Data resmi sudah berubah saat usulan menunggu. Cadangkan salinan lokal lalu ambil versi server dan perbarui usulan.",
      );
    if (p.status === "pending" && !local.meta.dirty)
      return "Usulan menunggu persetujuan admin";
    if (p.status === "approved") {
      if (revision < p.published_revision)
        return "Disetujui admin · menunggu data resmi terbaru";
      if (local.meta.dirty) {
        if (
          revision !== p.published_revision ||
          p.version !== local.meta.pendingVersion
        )
          throw new ApiError(
            409,
            "Ada perubahan lain setelah persetujuan. Cadangkan perubahan lokal lalu ambil data resmi.",
          );
        await rebaseApproved(revision, local.meta.pendingId);
        local.meta.revision = revision;
      } else approvedPull = true;
    }
  }
  if (forcePull && (local.meta.dirty || local.meta.pendingId)) {
    const bytes = await createBackup(local.state, async (id) =>
      getMedia(local.state.media.find((m) => m.id === id)!),
    );
    await saveFile(
      "Silsilah_Salinan_Sebelum_Konflik.zip",
      "application/zip",
      bytes,
    );
  }
  if (forcePull || !local.meta.dirty) {
    if (forcePull || approvedPull || revision !== local.meta.revision) {
      const response = await fetch("/api/snapshot", {
        cache: "no-store",
        credentials: "same-origin",
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        const e = await response.json();
        throw new ApiError(
          response.status,
          e.error ?? "Data resmi tidak dapat diambil.",
        );
      }
      revision = Number(response.headers.get("X-Family-Revision"));
      if (!Number.isSafeInteger(revision))
        throw Error("Revisi snapshot tidak valid.");
      const prepared = await inspectBackup(
        new Uint8Array(await response.arrayBuffer()),
      );
      if (document.querySelector('[role="dialog"]'))
        throw Error("Tutup formulir dahulu sebelum mengambil pembaruan.");
      await completeSync(revision, local.meta.generation, {
        state: prepared.state,
        files: prepared.files,
      });
      window.dispatchEvent(new Event("family-refreshed"));
    }
    return "Tersinkron · revisi " + revision;
  }
  if (revision !== local.meta.revision)
    throw new ApiError(
      409,
      "Ada perubahan dari perangkat lain. Data lokal belum dikirim dan tetap tersimpan. Cadangkan salinan lokal lalu ambil versi server untuk melanjutkan.",
    );
  const bytes = await createBackup(local.state, async (id) =>
    getMedia(local.state.media.find((m) => m.id === id)!),
  );
  const sent = await fetch("/api/snapshot?baseRevision=" + encodeURIComponent(String(revision)), {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/zip",
      "If-Match": String(revision),
    },
    body: new Blob([new Uint8Array(bytes).buffer]),
    signal: AbortSignal.timeout(60000),
  });
  const result = await sent.json();
  if (!sent.ok)
    throw new ApiError(sent.status, result.error ?? "Sinkronisasi gagal.");
  await completeSync(
    result.revision,
    local.meta.generation,
    undefined,
    result.proposalId
      ? { id: result.proposalId, version: result.proposalVersion }
      : undefined,
  );
  window.dispatchEvent(new Event("proposal-changed"));
  if (result.proposalId) return "Usulan terkirim · menunggu persetujuan admin";
  return "Tersinkron · revisi " + result.revision;
}
