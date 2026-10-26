import { MemberPassword } from "./AccountSettings";
import { AccountSettings } from "./AccountSettings";
import { PublicTree } from "./PublicTree";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { api, ApiError, synchronize, type OnlineUser } from "./online";
import { setWorkspace, syncSnapshot, forgetWorkspace } from "./storage";
import App from "./App";
import {
  ProposalNotifications,
  forgetProposalAlerts,
} from "./ProposalNotifications";
import { ProposalPanel } from "./ProposalPanel";

const roles = {
  owner: "Admin / pemilik",
  editor: "Anggota pengusul",
  viewer: "Lihat saja",
};
const rememberedKey = "silsilah-web-account";
const loggedOutKey = "silsilah-web-explicit-logout";
export default function OnlineGate() {
  const [user, setUser] = useState<OnlineUser | null>(null),
    [ready, setReady] = useState(false),
    [setup, setSetup] = useState(false),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [guest, setGuest] = useState(!["#masuk", "#bagikan"].includes(window.location.hash));
  function accept(u: OnlineUser) {
    localStorage.removeItem(loggedOutKey);
    setGuest(false);
    setError("");
    setWorkspace(u.id + "-" + u.role, u.role);
    setUser(u);
    localStorage.setItem(rememberedKey, JSON.stringify(u));
  }
  useEffect(() => {
    void (async () => {
      // If logout happened while offline, don't silently restore the cached
      // HttpOnly session when this page is opened again on the same device.
      if (localStorage.getItem(loggedOutKey) === "1") {
        localStorage.removeItem(rememberedKey);
        setReady(true);
        return;
      }
      try {
        const me = await api("me");
        accept(me.user);
      } catch (e) {
        if (!(e instanceof ApiError)) {
          try {
            const old = JSON.parse(
              localStorage.getItem(rememberedKey) ?? "null",
            );
            if (old?.id) accept(old);
          } catch {
            /* no cached session */
          }
        } else localStorage.removeItem(rememberedKey);
        try {
          const status = await api("status");
          setSetup(status.setupRequired);
          if (status.setupRequired) {setGuest(false);setMode("setup");setError("");}
        } catch {
          setError(
            "Server belum terhubung. Salinan offline tersedia setelah pernah masuk pada perangkat ini.",
          );
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = new FormData(e.currentTarget);
    try {
      const result = await api(mode, Object.fromEntries(d.entries()));
      const previous = JSON.parse(
        localStorage.getItem(rememberedKey) ?? "null",
      );
      setWorkspace(result.user.id + "-" + result.user.role, result.user.role);
      if (previous?.id === result.user.id && previous.role !== result.user.role)
        await forgetWorkspace();
      accept(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    const s = await syncSnapshot();
    if (
      s.meta.dirty &&
      !confirm(
        "Ada perubahan yang belum tersinkron. Cadangkan lewat Lainnya sebelum keluar. Tetap keluar dan hapus salinan offline di perangkat ini?",
      )
    )
      return;
    let serverLogout = true;
    try {
      await api("logout", {});
    } catch {
      serverLogout = false;
    }
    await forgetWorkspace();
    if (user) forgetProposalAlerts(user);
    setError(serverLogout
      ? "Anda sudah keluar dari akun."
      : "Anda sudah keluar dari perangkat ini. Server belum terjangkau, jadi sesi server akan ditutup saat Anda tersambung kembali dan keluar lagi.");
    if (!serverLogout) localStorage.setItem(loggedOutKey, "1");
    localStorage.removeItem(rememberedKey);
    setUser(null);
    setMode("login");
  }
  if (!ready)
    return (
      <div className="splash">
        <h1>Silsilah Bersama</h1>
        <p>Memeriksa akses keluarga…</p>
      </div>
    );
  if (!user && guest) return <PublicTree login={() => setGuest(false)} />;
  if (user)
    return (
      <>
        <FamilyPanel
          user={user}
          logout={logout}
          onExpired={() => {
            localStorage.removeItem(rememberedKey);
            setUser(null);
            setError("Sesi berakhir atau akses berubah. Masuk kembali.");
          }}
        />
        {user.role === "editor" && (
          <aside className="draft-banner">
            Perubahan anggota adalah usulan. Data resmi keluarga diperbarui
            setelah persetujuan admin.
          </aside>
        )}
        <App readOnly={user.role === "viewer"} />
      </>
    );
  return (
    <main className="login-page">
      <section className="card login-card">
        <span className="login-tree">♧</span>
        <h1>Silsilah Bersama</h1>
        <p>Pohon keluarga, cerita yang saling terhubung.</p>
        <button className="secondary" onClick={() => setGuest(true)}>Lihat pohon tanpa login</button>
        <h2>{setup ? "Aktifkan akun admin pertama" : "Masuk akun keluarga"}</h2>
        <form onSubmit={submit}>
          {setup && <>
            <label>Nama lengkap<input name="name" required maxLength={100} autoComplete="name" /></label>
            <label>Token aktivasi server<input name="code" type="password" required minLength={32} autoComplete="off" spellCheck={false} /></label>
            <p className="muted">Masukkan BOOTSTRAP_TOKEN yang disimpan di Netlify. Token hanya digunakan untuk mengaktifkan admin pertama.</p>
          </>}
          <label>
            Nama akun
            <input
              name="login"
              required
              minLength={3}
              maxLength={120}
              autoComplete="username"
              placeholder="contoh: priyo"
            />
          </label>
          <label>
            Kata sandi
            <input
              name="password"
              aria-label="Kata sandi"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            <small>Minimal 12 karakter.</small>
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Memproses…"
              : mode === "login"
                ? "Masuk sekarang"
                : "Aktifkan admin"}
          </button>
        </form>
        <p className="muted">
          Akun keluarga dibuat oleh admin. Salinan offline tersimpan di
          browser masing-masing akun.
        </p>
      </section>
    </main>
  );
}

function FamilyPanel({
  user,
  logout,
  onExpired,
}: {
  user: OnlineUser;
  logout: () => Promise<void>;
  onExpired: () => void;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  const openProposals = () => {
    if (panel.current) panel.current.open = true;
    window.setTimeout(() => {
      window.dispatchEvent(new Event("proposal-refresh"));
      document
        .querySelector(".proposal-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const [status, setStatus] = useState("Memeriksa sinkronisasi…"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [members, setMembers] = useState<any[]>([]),
    [audit, setAudit] = useState<any[]>([]);
  useEffect(() => {
    const open = () => {if(panel.current)panel.current.open=true;window.setTimeout(()=>document.getElementById("bagikan-keluarga")?.scrollIntoView({behavior:"smooth"}),0);};
    window.addEventListener("family-share-open",open);
    if(window.location.hash==="#bagikan")open();
    return()=>window.removeEventListener("family-share-open",open);
  }, []);
  async function sync(force = false) {
    if (document.querySelector('[role="dialog"]')) return;
    setBusy(true);
    setError("");
    try {
      setStatus(await synchronize(force));
      setConflict(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onExpired();
        return;
      }
      setError((e as Error).message);
      setStatus(
        navigator.onLine ? "Belum tersinkron" : "Offline · salinan perangkat",
      );
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      setStatus("Perubahan lokal menunggu sinkronisasi");
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (navigator.onLine && !document.hidden) void sync();
      }, 3000);
    };
    const online = () => void sync();
    const offline = () => setStatus("Offline · salinan perangkat");
    void sync();
    const interval = setInterval(() => {
      if (navigator.onLine && !document.hidden) void sync();
    }, 30000);
    window.addEventListener("family-dirty", changed);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("family-dirty", changed);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  async function action(job: () => Promise<void>) {
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
  async function loadMembers() {
    const r = await api("members");
    setMembers(r.users);
    setAudit(r.audit);
  }
  return (
    <>
      <ProposalNotifications
        key={user.id + user.role}
        user={user}
        onOpen={openProposals}
      />
      <details className="online-panel" ref={panel}>
        <summary>
          <span>
            <strong>Keluarga Bersama</strong> · {user.name}{" "}
            <small>{roles[user.role]}</small>
          </span>
          <span className="sync-status" role="status">
            {status}
          </span>
        </summary>
        <div className="online-panel-body">
          <p>
            Sinkronisasi otomatis saat halaman aktif, sekitar setiap 30 detik
            dan setelah perubahan. Jika offline, perubahan pengelola tersimpan
            di perangkat hingga tersambung kembali.
          </p>
          {user.role === "editor" && (
            <p className="proposal-note">
              Perubahan Anda merupakan usulan. Salinan perangkat dapat berisi
              perubahan yang belum disetujui. Data resmi keluarga berubah
              setelah admin menyetujuinya.
            </p>
          )}
          {user.role === "viewer" && (
            <p className="muted">
              Akun lihat saja. Kolom NIK dan alamat tidak dibagikan kepada akun
              ini.
            </p>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <div className="profile-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void sync()}
            >
              Sinkronkan sekarang
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void logout()}
            >
              Keluar akun
            </button>
          </div>
          {conflict && (
            <div className="conflict-box">
              <p>
                Salinan lokal belum dapat menjadi data resmi. Simpan salinan
                lokal sebelum mengambil data resmi terbaru; setelah itu,
                perbarui kembali usulan yang masih diperlukan. Tidak ada
                penggabungan otomatis pada versi ini.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Unduh salinan lokal, pastikan ZIP tersimpan, lalu ambil data server? Data lokal akan diganti. Untuk membandingkan dahulu, batalkan dan buat cadangan melalui Lainnya.",
                    )
                  )
                    void sync(true);
                }}
              >
                Cadangkan lokal dan ambil versi server
              </button>
            </div>
          )}
          {user.role === "owner" && (
            <section>
              <h2 id="bagikan-keluarga">Akun dan tautan keluarga</h2>
              <AccountSettings busy={busy} action={action} refresh={loadMembers} />
              <button className="secondary full" disabled={busy} onClick={() => void action(loadMembers)}>Lihat akun keluarga</button>
              {members.map((m) => (
                <div className="online-member" key={m.id}>
                  <span>
                    <strong>{m.name}</strong>
                    <small>
                      {m.login} · {roles[m.role as keyof typeof roles]}
                      {!m.active ? " · Nonaktif" : ""}
                    </small>
                  </span>
                  {m.role !== "owner" && (
                    <>
                      <MemberPassword id={m.id} name={m.name} busy={busy} action={action} />
                      <select
                        aria-label={"Peran " + m.name}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => {
                          const role = e.target.value;
                          void action(async () => {
                            await api("member", {
                              id: m.id,
                              role,
                              active: !!m.active,
                            });
                            await loadMembers();
                          });
                        }}
                      >
                        <option value="viewer">Lihat saja</option>
                        <option value="editor">Anggota pengusul</option>
                      </select>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await api("member", {
                              id: m.id,
                              role: m.role,
                              active: !m.active,
                            });
                            await loadMembers();
                          })
                        }
                      >
                        {m.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {!!audit.length && (
                <details>
                  <summary>Aktivitas terakhir</summary>
                  {audit.map((a, i) => (
                    <p className="muted" key={i}>
                      {new Date(a.at).toLocaleString("id-ID")} · {a.action}
                    </p>
                  ))}
                </details>
              )}
            </section>
          )}
          <ProposalPanel user={user} afterDecision={() => void sync()} />
          <details>
            <summary>Ganti kata sandi</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const form = e.currentTarget;
                void action(async () => {
                  await api("password", Object.fromEntries(d.entries()));
                  form.reset();
                  setStatus(
                    "Kata sandi diperbarui; perangkat lain perlu masuk kembali.",
                  );
                });
              }}
            >
              <label>
                Kata sandi lama
                <input
                  name="oldPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                />
              </label>
              <label>
                Kata sandi baru
                <input
                  name="password"
                  aria-label="Kata sandi baru"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <button className="secondary" disabled={busy}>
                Simpan kata sandi
              </button>
            </form>
          </details>
        </div>
      </details>
    </>
  );
}
