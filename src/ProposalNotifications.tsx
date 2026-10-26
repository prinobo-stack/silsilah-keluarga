import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api, type OnlineUser } from "./online";
import {
  alertKey,
  emptyAlerts,
  updateAlerts,
  type AlertState,
} from "./proposal-alerts";
function read(key: string): AlertState {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      s &&
      typeof s.seen === "object" &&
      s.seen !== null &&
      Array.isArray(s.items)
    )
      return {
        seen: s.seen,
        items: s.items.filter((i: any) => i && typeof i.id === "string" && typeof i.title === "string" && typeof i.body === "string" && Number.isFinite(i.time) && typeof i.read === "boolean").slice(0, 40),
        initialized: !!s.initialized,
        pending: Number.isSafeInteger(s.pending) && s.pending >= 0 && s.pending <= 100 ? s.pending : 0,
      };
  } catch {}
  return emptyAlerts();
}
export function forgetProposalAlerts(user: OnlineUser) {
  window.dispatchEvent(new CustomEvent("proposal-clear", {detail:user.id}));
  try {
    localStorage.removeItem(alertKey(user.id, user.role));
  } catch {}
}
export function ProposalNotifications({
  user,
  onOpen,
}: {
  user: OnlineUser;
  onOpen: () => void;
}) {
  const key = alertKey(user.id, user.role);
  const [state, setState] = useState(() => read(key)),
    [pending, setPending] = useState(() => read(key).pending),
    [open, setOpen] = useState(false),
    [message, setMessage] = useState("");
  const current = useRef(state),
    enabled = useRef(localStorage.getItem(key + ":enabled") === "yes");
  const [opted, setOpted] = useState(enabled.current);
  const supported =
    typeof Notification !== "undefined" && "serviceWorker" in navigator;
  const save = (s: AlertState) => {
    current.current = s;
    setState(s);
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch {
      /* Alerts still work in memory. */
    }
  };
  async function deviceNotice(count: number, category?: string) {
    if (!supported || Notification.permission !== "granted" || !enabled.current)
      return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!enabled.current) return;
      if (registration?.waiting)
        registration.waiting.postMessage({ type: "activate-notifications" });
      if (registration)
        await registration.showNotification(
          category ? "Silsilah · " + category : "Silsilah · pembaruan usulan",
          {
            body: count
              ? `Ada ${count} pemberitahuan usulan keluarga. Buka aplikasi untuk melihat status.`
              : "Notifikasi usulan keluarga sudah diaktifkan.",
            tag: "silsilah-proposals-" + user.id,
            data: { type: "proposals", account: user.id },
          },
        );
    } catch {
      setMessage(
        "Notifikasi di aplikasi tetap aktif; notifikasi HP belum tersedia.",
      );
    }
  }
  useEffect(() => {
    if (user.role === "viewer") return;
    let cancelled = false,
      running = false;
    const poll = async () => {
      if (running || cancelled || !navigator.onLine) return;
      running = true;
      try {
        const response = await api("proposals");
        if (cancelled) return;
        const result = updateAlerts(
          current.current,
          response.proposals,
          user.role,
        );
        save(result.state);
        setPending(result.pending);
        if (result.fresh.length)
          void deviceNotice(
            result.fresh.length,
            result.fresh.length === 1 ? result.fresh[0].title : undefined,
          );
      } catch {
        if (!cancelled)
          setMessage(
            "Belum dapat memeriksa usulan baru. Pemberitahuan tersimpan tetap tersedia.",
          );
      } finally {
        running = false;
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 15000);
    const wake = () => {
      if (!document.hidden) void poll();
    };
    window.addEventListener("online", wake);
    window.addEventListener("proposal-changed", wake);
    document.addEventListener("visibilitychange", wake);
    const click = (e: MessageEvent) => {
      if (e.data?.type === "open-proposals" && e.data.account === user.id) {
        setOpen(true);
        onOpen();
      }
    };
    navigator.serviceWorker?.addEventListener("message", click);
    const storage = (e: StorageEvent) => {
      if (e.key === key) {
        const s = read(key);
        current.current = s;
        setState(s);
        setPending(s.pending);
      }
    };
    window.addEventListener("storage", storage);
    const clear = (e: Event) => {if ((e as CustomEvent).detail===user.id){cancelled=true;enabled.current=false;current.current=emptyAlerts();setState(emptyAlerts());setPending(0);}};
    window.addEventListener("proposal-clear",clear);
    if (new URLSearchParams(location.search).get("usulan") === "1") {
      setOpen(true);
      onOpen();
    }
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", wake);
      window.removeEventListener("proposal-changed", wake);
      document.removeEventListener("visibilitychange", wake);
      navigator.serviceWorker?.removeEventListener("message", click);
      window.removeEventListener("storage", storage);
      window.removeEventListener("proposal-clear",clear);
    };
  }, [user.id, user.role]);
  if (user.role === "viewer") return null;
  const unread = state.items.filter((i) => !i.read).length;
  return (
    <aside className="proposal-notifications" aria-label="Notifikasi usulan">
      <button
        className="secondary"
        aria-expanded={open}
        aria-label={`Notifikasi usulan (${unread} belum dibaca)`}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} /> Notifikasi{" "}
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>
      <span className="pending-count" role="status">
        {pending} usulan menunggu admin
      </span>
      {open && (
        <div className="notification-body">
          <h2>Pemberitahuan usulan</h2>
          <p className="muted">
            Status diperiksa sekitar setiap 15 detik selama halaman berjalan dan
            internet tersambung. Jika browser ditutup, pembaruan terlihat saat
            dibuka kembali.
          </p>
          <div className="profile-actions">
            <button
              className="secondary"
              onClick={() => {
                save({
                  ...current.current,
                  items: current.current.items.map((i) => ({
                    ...i,
                    read: true,
                  })),
                });
              }}
            >
              Tandai semua dibaca
            </button>
            <button className="primary" onClick={onOpen}>
              Buka daftar usulan
            </button>
          </div>
          {supported ? (
            <button
              className="secondary"
              onClick={async () => {
                if (opted) {
                  enabled.current = false;
                  setOpted(false);
                  localStorage.setItem(key + ":enabled", "no");
                  setMessage(
                    "Notifikasi HP dimatikan. Notifikasi di aplikasi tetap aktif.",
                  );
                  return;
                }
                try {
                  const permission = await Notification.requestPermission();
                  if (permission === "granted") {
                    enabled.current = true;
                    setOpted(true);
                    localStorage.setItem(key + ":enabled", "yes");
                    setMessage("Notifikasi HP diaktifkan untuk halaman ini.");
                    await deviceNotice(unread);
                  } else
                    setMessage(
                      "Izin notifikasi HP belum diberikan. Notifikasi di aplikasi tetap aktif.",
                    );
                } catch {
                  setMessage(
                    "Browser belum mendukung notifikasi HP. Notifikasi di aplikasi tetap aktif.",
                  );
                }
              }}
            >
              {opted ? "Matikan notifikasi HP" : "Aktifkan notifikasi HP"}
            </button>
          ) : (
            <p className="muted">
              Browser ini belum mendukung notifikasi HP. Pemberitahuan di
              aplikasi tetap tersedia.
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {!state.items.length && <p>Belum ada pemberitahuan usulan.</p>}
          <ul className="notification-list">
            {state.items.map((item) => (
              <li key={item.id} className={item.read ? "" : "unread"}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>{new Date(item.time).toLocaleString("id-ID")}</small>
                {!item.read && (
                  <button
                    className="secondary"
                    onClick={() =>
                      save({
                        ...current.current,
                        items: current.current.items.map((i) =>
                          i.id === item.id ? { ...i, read: true } : i,
                        ),
                      })
                    }
                  >
                    Tandai dibaca
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
