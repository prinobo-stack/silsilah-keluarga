import { useEffect, useRef, useState } from "react";
import { api, type OnlineUser } from "./online";
const statusLabel: Record<string, string> = {
  pending: "Menunggu admin",
  approved: "Disetujui",
  rejected: "Ditolak",
};
export function ProposalPanel({
  user,
  afterDecision,
}: {
  user: OnlineUser;
  afterDecision: () => void;
}) {
  const requestVersion = useRef(0);
  const [rows, setRows] = useState<any[]>([]),
    [review, setReview] = useState<any>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await job();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const request = ++requestVersion.current;
    setReview(null);
    setNote("");
    const r = await api("proposals");
    if (request !== requestVersion.current) return;
    setRows(r.proposals);
    setLoaded(true);
  }
  async function openReview(row: any) {
    const request = ++requestVersion.current;
    setReview(null);
    setNote("");
    const detail = await api("proposals/" + row.id);
    if (request !== requestVersion.current) return;
    if (
      detail.version < row.version ||
      (row.status !== "pending" && detail.status === "pending")
    )
      throw Error(
        "Rincian usulan belum sesuai status terbaru. Tekan Lihat usulan keluarga lalu tinjau kembali.",
      );
    setRows((current) =>
      current.map((p) =>
        p.id === detail.id
          ? {
              ...p,
              version: detail.version,
              status: detail.status,
              note: detail.note,
              base_revision: detail.base_revision,
              published_revision: detail.published_revision,
            }
          : p,
      ),
    );
    setReview(detail);
  }
  useEffect(() => {
    const show = () => void run(refresh);
    window.addEventListener("proposal-refresh", show);
    return () => window.removeEventListener("proposal-refresh", show);
  }, []);
  async function decide(action: string) {
    if (!review) return;
    await api(`proposals/${review.id}/decision`, {
      action,
      version: review.version,
      note,
    });
    setReview(null);
    setNote("");
    await refresh();
    afterDecision();
    window.dispatchEvent(new Event("proposal-changed"));
  }
  if (user.role === "viewer") return null;
  return (
    <section className="proposal-panel">
      <h2>
        {user.role === "owner"
          ? "Verifikasi perubahan anggota"
          : "Usulan perubahan saya"}
      </h2>
      <p>
        Data resmi hanya diperbarui setelah admin memeriksa dan menyetujui
        usulan. Perubahan yang diajukan bersama dikaji sebagai satu paket.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void run(refresh)}
      >
        {user.role === "owner"
          ? "Lihat usulan keluarga"
          : "Lihat status usulan"}
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {loaded && !rows.length && <p>Belum ada usulan.</p>}
      {rows.map((p) => (
        <article className="proposal-item" key={p.id}>
          <h3>
            {p.name} <span className="badge">{statusLabel[p.status]}</span>
          </h3>
          <p>
            Versi usulan {p.version} · berdasarkan revisi resmi{" "}
            {p.base_revision}
          </p>
          {p.note && <p>Catatan admin: {p.note}</p>}
          <div className="profile-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => openReview(p))}
            >
              Tinjau rincian
            </button>
            <a className="secondary" href={`/api/proposals/${p.id}/archive`}>
              Unduh salinan usulan
            </a>
          </div>
        </article>
      ))}
      {review && (
        <div className="proposal-review">
          <h3>
            Rincian usulan {review.name} · versi {review.version}
          </h3>
          {review.status === "pending" &&
            review.current_revision !== review.base_revision && (
              <p className="error-text">
                Data resmi telah berubah. Usulan ini tidak dapat disetujui
                sebelum anggota memperbaruinya.
              </p>
            )}
          {review.status === "approved" && (
            <p role="status">
              Usulan ini sudah disetujui
              {review.published_revision != null
                ? ` pada revisi resmi ${review.published_revision}`
                : ""}
              . Tidak perlu disetujui ulang.
            </p>
          )}
          {review.status === "rejected" && (
            <p role="status">
              Usulan ini sudah ditolak.
              {review.note ? ` Catatan admin: ${review.note}` : ""}
            </p>
          )}
          {review.status === "pending" ? (
            <p>
              {review.changes.length} bagian berbeda dengan data resmi saat ini.
              Periksa nama, hubungan, tanggal, identitas, foto, serta
              penghapusan sebelum menyetujui.
            </p>
          ) : (
            <p>
              {review.changes.length === 0
                ? "Isi salinan usulan sudah sama dengan data resmi saat ini."
                : `${review.changes.length} bagian berbeda antara salinan usulan dan data resmi saat ini. Data resmi dapat berubah lagi setelah keputusan admin.`}
            </p>
          )}
          {review.changes.map((c: any, i: number) => (
            <details key={i} open={review.changes.length < 4}>
              <summary>
                {c.section}: {c.name} ·{" "}
                {!c.before ? "Ditambahkan" : !c.after ? "Dihapus" : "Diubah"}
              </summary>
              <div className="proposal-compare">
                <div>
                  <strong>Sebelum</strong>
                  <FieldValues
                    before={c.before}
                    after={c.after}
                    value={c.before}
                    people={review.people ?? {}}
                  />
                </div>
                <div>
                  <strong>Usulan</strong>
                  <FieldValues
                    before={c.before}
                    after={c.after}
                    value={c.after}
                    people={review.people ?? {}}
                  />
                  {c.section === "Anggota" && c.after?.photoId && (
                    <img
                      alt={"Foto usulan " + c.name}
                      src={`/api/proposals/${review.id}/media/${c.after.photoId}`}
                    />
                  )}
                </div>
              </div>
            </details>
          ))}
          {user.role === "owner" && review.status === "pending" && (
            <>
              <label>
                Catatan keputusan
                <textarea
                  aria-label="Catatan keputusan"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Wajib diisi jika menolak usulan"
                />
              </label>
              <div className="profile-actions">
                <button
                  className="primary"
                  disabled={
                    busy || review.current_revision !== review.base_revision
                  }
                  onClick={() => void run(() => decide("approve"))}
                >
                  Setujui sebagai data resmi
                </button>
                <button
                  className="secondary"
                  disabled={busy || !note.trim()}
                  onClick={() => void run(() => decide("reject"))}
                >
                  Tolak usulan
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const fieldNames: Record<string, string> = {
  name: "Nama lengkap",
  nickname: "Nama panggilan",
  nik: "NIK",
  address: "Alamat",
  addressMode: "Sumber alamat",
  birth: "Tanggal lahir",
  birthApprox: "Perkiraan tanggal lahir",
  death: "Tanggal wafat",
  status: "Status",
  place: "Tempat lahir",
  notes: "Catatan",
  photoId: "Foto",
  deletedAt: "Dipindahkan ke Sampah",
  parentId: "Orang tua",
  childId: "Anak",
  kind: "Jenis hubungan",
  role: "Keterangan hubungan",
  olderId: "Kakak",
  youngerId: "Adik",
  members: "Pasangan",
  start: "Mulai",
  end: "Berakhir",
  title: "Judul",
  body: "Cerita",
  date: "Tanggal",
  personIds: "Anggota terkait",
  mediaIds: "Foto terkait",
  mime: "Jenis file",
  size: "Ukuran file (byte)",
  isiFotoBerubah: "Isi foto diperbarui",
};
function FieldValues({
  before,
  after,
  value,
  people,
}: {
  before: any;
  after: any;
  value: any;
  people: Record<string, string>;
}) {
  if (value === null || value === undefined)
    return <p className="muted">Tidak ada</p>;
  if (typeof value !== "object") return <p>{String(value)}</p>;
  const keys = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ].filter(
    (k) =>
      !["id", "createdAt", "updatedAt"].includes(k) &&
      JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]),
  );
  const display = (v: any, key: string): string => {
    if (v === null || v === undefined || v === "") return "Belum diisi";
    if (Array.isArray(v)) return v.map((x) => display(x, key)).join(", ");
    if (typeof v === "boolean") return v ? "Ya" : "Tidak";
    if (
      [
        "parentId",
        "childId",
        "olderId",
        "youngerId",
        "members",
        "personIds",
        "rootId",
      ].includes(key)
    )
      return people[v] ?? String(v);
    if (["status", "addressMode", "kind"].includes(key))
      return (
        (
          {
            manual: "Manual",
            auto: "Mengikuti orang tua",
            living: "Masih hidup",
            deceased: "Wafat",
            unknown: "Belum diketahui",
            biological: "Biologis",
            adoptive: "Adopsi",
          } as Record<string, string>
        )[v] ?? String(v)
      );
    return String(v);
  };
  return (
    <dl className="review-fields">
      {keys.length ? (
        keys.map((k) => (
          <div key={k}>
            <dt>{fieldNames[k] ?? k}</dt>
            <dd>{display(value[k], k)}</dd>
          </div>
        ))
      ) : (
        <p className="muted">
          Tidak ada perubahan isian; hanya waktu penyimpanan berubah.
        </p>
      )}
    </dl>
  );
}
