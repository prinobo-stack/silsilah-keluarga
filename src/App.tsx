import SheetsBackup from "./SheetsBackup";
import FamilyProfile from "./FamilyProfile";
import FamilyTimeline from "./FamilyTimeline";
import {searchMembers} from "./member-search";
import FamilyBook from "./FamilyBook";
import ProfileShare from "./ProfileShare";
import {memberFromHash} from "./profile-link";
import PrivacySettings from "./PrivacySettings";
import History from "./History";
import FamilyStats from "./FamilyStats";
import Agenda from "./Agenda";
import Kinship from "./Kinship";
import DataChecks from "./DataChecks";
import {useAppearance, AppearanceSettings} from "./Appearance";
import FamilySuggestions from "./FamilySuggestions";
import { suggestionsFor } from "./family-suggestions";
import PhotoViewer from "./PhotoViewer";
import PhotoCropper from "./PhotoCropper";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  TreePine,
  House,
  Users,
  Network,
  Ellipsis,
  Plus,
  Search,
  ArrowLeft,
  ChevronRight,
  Heart,
  ShieldCheck,
  Download,
  Upload,
  LockKeyhole,
  ImagePlus,
  Trash2,
  Pencil,
  CalendarDays,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Maximize2,
  Minimize2,
  Minus,
  X,
  BookHeart,
  Check,
  Settings2,
  Leaf,
  FileText,
  AlertCircle,
  RefreshCw,
  Link2,
} from "lucide-react";
import { App as NativeApp } from "@capacitor/app";
import {
  active,
  addParent,
  addSibling,
  siblingsOf,
  age,
  dateText,
  emptyState,
  purge,
  related,
  resolveAddress,
  treeGraph,
  upcoming,
  uuid,
  validateState,
  type TreeDirection,
  type TreeLineStyle,
  type Person,
  type State,
  type ParentLink,
  type Memory,
  type Union,
  type Media,
} from "./domain";
import {
  bridge,
  beginPicker,
  endPicker,
  pickerActive,
  getMedia,
  importPhoto,
  loadState,
  lock,
  native,
  restoreState,
  saveFile,
  saveState,
  securityStatus,
  setPin,
  unlock,
} from "./storage";
import { treeEdgePath } from "./tree-lines";
import { createBackup, inspectBackup } from "./backup";
import { scheduleBirthdays } from "./notifications";
const titles = {
  home: "Beranda",
  tree: "Pohon keluarga",
  members: "Anggota keluarga",
  settings: "Ruang keluarga",
  profile: "Profil anggota",
  memories: "Album kenangan",
  trash: "Sampah",
  checks: "Pemeriksaan data",
  kinship: "Cari hubungan keluarga",
  agenda: "Agenda keluarga",
  stats: "Statistik keluarga",
  sheetsBackup: "Backup ke Google Sheets",
  history: "Riwayat perubahan",
  privacy: "Privasi pengunjung",
  book: "Buku keluarga",
  familyProfile: "Profil keluarga besar",
  timeline: "Linimasa keluarga",
};
type Page = keyof typeof titles;
type Attach = {
  anchor: string;
  relation: "parent" | "child" | "partner" | "older" | "younger";
  kind: ParentLink["kind"];
  siblingKind?: string;
};
type Modal =
  | { type: "person"; person?: Person; attach?: Attach }
  | {
      type: "relation";
      anchor: string;
      link?: ParentLink;
      union?: Union;
      initialRelation?: Attach["relation"];
    }
  | { type: "memory"; memory?: Memory }
  | { type: "pin" }
  | { type: "pdf" }
  | { type: "update" }
  | {
      type: "confirm";
      title: string;
      message: string;
      action: () => Promise<void>;
    };
function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Avatar({
  person,
  photos,
  size = "",
}: {
  person: Person;
  photos: Record<string, string>;
  size?: string;
}) {
  const photo = person.photoId && photos[person.photoId];
  return (
    <span className={"avatar " + size + " " + person.sex}>
      {photo ? (
        <img src={photo} alt={"Foto " + person.name} />
      ) : (
        <span>
          {person.name
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,select,button,textarea")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const items = el?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="dialog-heading">
          <h2>{title}</h2>
          <IconButton label="Tutup dialog" onClick={close}>
            <X />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
function ErrorText({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="form-error">
      <AlertCircle size={18} />
      {error}
    </p>
  ) : null;
}
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        inputMode="numeric"
        placeholder="YYYY atau YYYY-MM-DD"
        value={value}
        maxLength={10}
        onChange={(e) => onChange(e.target.value)}
      />
      <small>
        Boleh kosong, tahun saja, tahun-bulan, atau tanggal lengkap.
      </small>
    </label>
  );
}
function FormActions({ cancel, busy }: { cancel: () => void; busy: boolean }) {
  return (
    <div className="form-actions">
      <button
        type="button"
        className="secondary"
        onClick={cancel}
        disabled={busy}
      >
        Batal
      </button>
      <button className="primary" disabled={busy}>
        <Check size={17} />
        {busy ? "Menyimpan…" : "Simpan"}
      </button>
    </div>
  );
}
function newPerson(): Person {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name: "",
    nickname: "",
    nik: "",
    phone: "",
    religion: "",
    address: "",
    addressMode: "auto",
    sex: "U",
    birth: "",
    birthApprox: false,
    death: "",
    status: "unknown",
    place: "",
    notes: "",
    photoId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
function PersonEditor({
  state,
  person,
  attach,
  commit,
  close,
  photos,
  onPhoto,
}: {
  state: State;
  person?: Person;
  attach?: Attach;
  commit: (s: State) => Promise<void>;
  close: () => void;
  photos: Record<string, string>;
  onPhoto: (id: string, data: string) => void;
}) {
  const [pendingFamily, setPendingFamily] = useState<{state:State; childId:string; parentId:string} | null>(null);
  const [p, setP] = useState<Person>(() =>
    person ? { ...person } : newPerson(),
  );
  const [media, setMedia] = useState<Media[]>([]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const cropPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (cropFile) cropPanel.current?.scrollIntoView({block:"start"}); }, [cropFile]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (key: keyof Person, value: unknown) =>
    setP((v) => ({ ...v, [key]: value }));
  const initialPerson = useRef(p);
  const changed = cropFile !== null || JSON.stringify(p) !== JSON.stringify(initialPerson.current);
  const addressState: State = {
    ...state,
    persons: [...state.persons.filter((v) => v.id !== p.id), p],
    parents:
      attach?.relation === "child"
        ? [
            ...state.parents,
            {
              id: "address-preview",
              parentId: attach.anchor,
              childId: p.id,
              kind: attach.kind,
              role: "",
            },
          ]
        : state.parents,
  };
  const resolvedAddress = resolveAddress(addressState, p.id);
  const autoAddress =
    p.addressMode !== "manual" && !(p.addressMode === undefined && p.address);
  const addressSource = state.persons.find(
    (v) => v.id === resolvedAddress.sourceId,
  );
  const cancel = () => {
    if (
      !changed ||
      window.confirm("Tutup formulir dan buang perubahan yang belum disimpan?")
    )
      close();
  };
  async function photo(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await importPhoto(file);
      setMedia((m) => [...m, result.media]);
      onPhoto(result.media.id, result.data);
      update("photoId", result.media.id);
      setCropFile(null);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (cropFile) { setError("Tekan Gunakan foto atau Batal potong sebelum menyimpan."); return; }
    setBusy(true);
    setError("");
    try {
      const saved = {
        ...p,
        name: p.name.trim(),
        nickname: p.nickname.trim(),
        nik: (p.nik ?? "").trim(),
        phone: (p.phone ?? "").trim(),
        religion: (p.religion ?? "").trim(),
        address: p.addressMode === "auto" ? "" : (p.address ?? "").trim(),
        death: p.status === "deceased" ? p.death : "",
        updatedAt: new Date().toISOString(),
      };
      let next: State = {
        ...state,
        media: [...state.media, ...media.filter((m) => m.id === saved.photoId)],
        persons: person
          ? state.persons.map((old) => (old.id === p.id ? saved : old))
          : [...state.persons, saved],
        rootId: state.rootId ?? saved.id,
      };
      if (attach) {
        if (attach.relation === "older" || attach.relation === "younger")
          next = addSibling(
            next,
            attach.relation === "older" ? saved.id : attach.anchor,
            attach.relation === "older" ? attach.anchor : saved.id,
            attach.siblingKind ? "Saudara " + attach.siblingKind : "",
          );
        else if (attach.relation === "partner")
          next = {
            ...next,
            unions: [
              ...next.unions,
              {
                id: uuid(),
                members: [attach.anchor, saved.id],
                status: "unknown",
                start: "",
                end: "",
                notes: "",
              },
            ],
          };
        else
          next = addParent(
            next,
            attach.relation === "parent" ? saved.id : attach.anchor,
            attach.relation === "parent" ? attach.anchor : saved.id,
            attach.kind,
          );
      }
      validateState(next);
      if (attach && (attach.relation === "child" || attach.relation === "parent")) {
        const parentId = attach.relation === "child" ? attach.anchor : saved.id;
        const childId = attach.relation === "child" ? saved.id : attach.anchor;
        if (suggestionsFor(next, parentId, childId).length) { setPendingFamily({state:next,parentId,childId}); return; }
      }
      await commit(next);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (pendingFamily) return <Dialog title="Saran hubungan keluarga" close={() => setPendingFamily(null)}><FamilySuggestions state={pendingFamily.state} childId={pendingFamily.childId} items={suggestionsFor(pendingFamily.state,pendingFamily.parentId,pendingFamily.childId)} commit={async next => { await commit(next); close(); }} close={() => setPendingFamily(null)} /></Dialog>;
  return (
    <Dialog title={person ? "Edit anggota" : "Tambah anggota"} close={cancel}>
      <form onSubmit={submit}>
        {cropFile && <div ref={cropPanel}><PhotoCropper key={cropFile.name + cropFile.lastModified} file={cropFile} confirm={async (file) => { await photo(file); }} cancel={() => setCropFile(null)} /></div>}
        <div className="photo-input">
          <Avatar
            person={p.name ? p : { ...p, name: "?" }}
            photos={photos}
            size="large"
          />
          <label className="upload-button">
            <ImagePlus size={18} />
            Pilih foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setCropFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
              disabled={busy}
            />
          </label>
          {p.photoId && photos[p.photoId] && <button type="button" className="secondary" disabled={busy} onClick={() => {
            void fetch(photos[p.photoId!]).then(r => r.blob()).then(blob => setCropFile(new File([blob], "foto-anggota.jpg", {type:blob.type || "image/jpeg"}))).catch(() => setError("Foto belum dapat dibuka. Pilih ulang dari galeri."));
          }}>Potong foto</button>}
          {p.photoId && (
            <button
              type="button"
              className="text-button"
              onClick={() => update("photoId", null)}
            >
              Hapus foto
            </button>
          )}
        </div>
        <label>
          Nama lengkap <span className="required">*</span>
          <input
            required
            maxLength={160}
            value={p.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Nama anggota keluarga"
          />
        </label>
        <label>
          NIK
          <input
            type="text"
            inputMode="numeric"
            maxLength={16}
            pattern="[0-9]{16}"
            value={p.nik ?? ""}
            onChange={(e) => update("nik", e.target.value)}
            placeholder="16 angka, boleh dikosongkan"
          />
        </label>
        <div className="form-grid">
          <label>
            Agama
            <input maxLength={100} value={p.religion ?? ""}
              onChange={(e) => update("religion", e.target.value)}
              placeholder="Agama, boleh dikosongkan" />
          </label>
          <label>
            Nomor HP
            <input type="tel" autoComplete="tel" maxLength={40}
              value={p.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="Contoh: 0812 3456 7890" />
          </label>
        </div>
        <label>
          Alamat
          <textarea
            aria-label="Alamat"
            rows={3}
            maxLength={1000}
            value={autoAddress ? resolvedAddress.address : (p.address ?? "")}
            onChange={(e) =>
              setP((v) => ({
                ...v,
                address: e.target.value,
                addressMode: "manual",
              }))
            }
            placeholder="Alamat anggota keluarga"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={autoAddress}
            onChange={(e) =>
              setP((v) => ({
                ...v,
                addressMode: e.target.checked ? "auto" : "manual",
                address: e.target.checked ? "" : resolvedAddress.address,
              }))
            }
          />
          Ikuti alamat orang tua otomatis
        </label>
        <p className="muted">
          {autoAddress
            ? resolvedAddress.address
              ? `Mengikuti alamat ${addressSource?.name ?? "orang tua"}. Perubahan alamat sumber ikut diterapkan.`
              : "Alamat akan mengikuti setelah orang tua yang memiliki alamat ditautkan."
            : "Alamat manual tetap dipakai meskipun alamat orang tua berubah."}{" "}
          Mengetik alamat akan beralih ke manual. Jika alamat orang tua berbeda,
          dipakai sumber terdekat yang tersedia sesuai urutan hubungan; Anda
          dapat mengubahnya manual.
        </p>
        <div className="form-grid">
          <label>
            Nama panggilan
            <input
              maxLength={160}
              value={p.nickname}
              onChange={(e) => update("nickname", e.target.value)}
            />
          </label>
          <label>
            Jenis kelamin
            <select
              value={p.sex}
              onChange={(e) => update("sex", e.target.value)}
            >
              <option value="U">Belum diketahui</option>
              <option value="M">Laki-laki</option>
              <option value="F">Perempuan</option>
            </select>
          </label>
        </div>
        <DateField
          label="Tanggal lahir"
          value={p.birth}
          onChange={(v) => update("birth", v)}
        />
        <label className="check-label">
          <input
            type="checkbox"
            checked={p.birthApprox}
            onChange={(e) => update("birthApprox", e.target.checked)}
          />
          Tanggal lahir merupakan perkiraan
        </label>
        <label>
          Tempat lahir
          <input
            value={p.place}
            maxLength={300}
            onChange={(e) => update("place", e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Status"
            value={p.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="unknown">Belum diketahui</option>
            <option value="living">Masih hidup</option>
            <option value="deceased">Sudah wafat</option>
          </select>
        </label>
        {p.status === "deceased" && (
          <DateField
            label="Tanggal wafat"
            value={p.death}
            onChange={(v) => update("death", v)}
          />
        )}
        <label>
          Catatan keluarga
          <textarea
            rows={3}
            maxLength={10000}
            value={p.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </label>
        {attach && (
          <p className="muted">
            Anggota baru akan ditautkan sebagai{" "}
            {attach.relation === "parent"
              ? "orang tua"
              : attach.relation === "child"
                ? "anak"
                : attach.relation === "older"
                  ? "kakak"
                  : attach.relation === "younger"
                    ? "adik"
                    : "pasangan"}{" "}
            dari {state.persons.find((x) => x.id === attach.anchor)?.name}.
          </p>
        )}
        <ErrorText error={error} />
        <FormActions cancel={cancel} busy={busy} />
      </form>
    </Dialog>
  );
}
function RelationEditor({
  state,
  anchor,
  commit,
  close,
  create,
  link,
  union,
  initialRelation,
}: {
  state: State;
  anchor: string;
  commit: (s: State) => Promise<void>;
  close: () => void;
  create: (a: Attach) => void;
  link?: ParentLink;
  union?: Union;
  initialRelation?: Attach["relation"];
}) {
  const [pendingFamily, setPendingFamily] = useState<{state:State; childId:string; parentId:string} | null>(null);
  const [relation, setRelation] = useState<Attach["relation"]>(
      union
        ? "partner"
        : link?.parentId === anchor
          ? "child"
          : (initialRelation ?? "parent"),
    ),
    [member, setMember] = useState(
      union?.members.find((id) => id !== anchor) ??
        (link ? (link.parentId === anchor ? link.childId : link.parentId) : ""),
    ),
    [kind, setKind] = useState<ParentLink["kind"]>(link?.kind ?? "biological"),
    [status, setStatus] = useState<Union["status"]>(union?.status ?? "unknown"),
    [start, setStart] = useState(union?.start ?? ""),
    [end, setEnd] = useState(union?.end ?? ""),
    [role, setRole] = useState(union?.notes ?? link?.role ?? ""),
    [siblingKind, setSiblingKind] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const name = state.persons.find((p) => p.id === anchor)?.name;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let next: State;
      if (relation === "older" || relation === "younger") {
        next = addSibling(
          state,
          relation === "older" ? member : anchor,
          relation === "older" ? anchor : member,
          [siblingKind ? "Saudara " + siblingKind : "", role].filter(Boolean).join(" · "),
        );
      } else if (relation === "partner") {
        if (
          state.unions.some(
            (u) =>
              u.id !== union?.id &&
              u.members.includes(anchor) &&
              u.members.includes(member),
          ) &&
          !confirm(
            "Relasi pasangan ini sudah ada. Catat sebagai pernikahan atau hubungan yang berbeda?",
          )
        )
          return;
        next = {
          ...state,
          unions: [
            ...state.unions.filter((u) => u.id !== union?.id),
            {
              id: union?.id ?? uuid(),
              members: [anchor, member],
              status,
              start,
              end,
              notes: role,
            },
          ],
        };
      } else {
        const parent = relation === "parent" ? member : anchor,
          child = relation === "parent" ? anchor : member;
        if (
          kind === "biological" &&
          state.parents.filter(
            (l) =>
              l.id !== link?.id &&
              l.childId === child &&
              l.kind === "biological",
          ).length >= 2 &&
          !confirm(
            "Anggota ini sudah memiliki dua orang tua biologis. Tetap tambahkan?",
          )
        )
          return;
        next = addParent(
          { ...state, parents: state.parents.filter((l) => l.id !== link?.id) },
          parent,
          child,
          kind,
          role,
        );
        const p = state.persons.find((p) => p.id === parent)!,
          c = state.persons.find((p) => p.id === child)!;
        if (p.birth && c.birth) {
          const gap = Number(c.birth.slice(0, 4)) - Number(p.birth.slice(0, 4));
          if (
            (gap < 12 || gap > 65) &&
            !confirm(
              "Selisih tahun lahir orang tua dan anak tidak lazim. Tetap simpan?",
            )
          )
            return;
        }
      }
      validateState(next);
      if (relation === "child" || relation === "parent") {
        const parentId = relation === "child" ? anchor : member;
        const childId = relation === "child" ? member : anchor;
        if (suggestionsFor(next, parentId, childId).length) { setPendingFamily({state:next,parentId,childId}); return; }
      }
      await commit(next);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (pendingFamily) return <Dialog title="Saran hubungan keluarga" close={() => setPendingFamily(null)}><FamilySuggestions state={pendingFamily.state} childId={pendingFamily.childId} items={suggestionsFor(pendingFamily.state,pendingFamily.parentId,pendingFamily.childId)} commit={async next => { await commit(next); close(); }} close={() => setPendingFamily(null)} /></Dialog>;
  return (
    <Dialog
      title={link || union ? "Edit hubungan" : "Tambahkan hubungan"}
      close={close}
    >
      <form onSubmit={submit}>
        <p>
          Hubungan terhadap <strong>{name}</strong>
        </p>
        <label>
          Jenis hubungan
          <select
            value={relation}
            disabled={!!link || !!union}
            onChange={(e) => setRelation(e.target.value as Attach["relation"])}
          >
            <option value="parent">Orang tua dari {name}</option>
            <option value="child">Anak dari {name}</option>
            <option value="partner">Pasangan dari {name}</option>
            <option value="older">Kakak dari {name}</option>
            <option value="younger">Adik dari {name}</option>
          </select>
        </label>
        <label>
          Pilih anggota yang sudah ada
          <select
            required
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="">Pilih anggota</option>
            {active(state)
              .filter((p) => p.id !== anchor)
              .sort((a, b) => a.name.localeCompare(b.name, "id"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.birth ? " · " + p.birth : ""}
                </option>
              ))}
          </select>
        </label>
        {!link && !union && (
          <button
            type="button"
            className="secondary full"
            onClick={() => create({ anchor, relation, kind, siblingKind })}
          >
            <Plus size={16} />
            Buat anggota baru dan tautkan
          </button>
        )}
        {relation === "older" || relation === "younger" ? (
          <><label>Jenis saudara<select value={siblingKind} onChange={e=>setSiblingKind(e.target.value)}><option value="">Belum diketahui</option><option value="kandung">Kandung</option><option value="tiri">Tiri</option><option value="seayah">Seayah</option><option value="seibu">Seibu</option></select></label><p className="muted">Hubungan saudara dicatat tanpa otomatis menyalin orang tua. Kandung: ayah dan ibu sama; seayah/seibu: satu orang tua kandung sama; tiri: tidak berbagi orang tua kandung.</p></>
        ) : relation !== "partner" ? (
          <label>
            Hubungan anak
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ParentLink["kind"])}
            >
              <option value="biological">Biologis</option>
              <option value="adoptive">Anak angkat</option>
              <option value="step">Anak tiri</option>
            </select>
          </label>
        ) : (
          <>
            <label>
              Status pasangan
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Union["status"])}
              >
                <option value="unknown">Belum diketahui</option>
                <option value="married">Menikah</option>
                <option value="divorced">Bercerai</option>
                <option value="separated">Berpisah</option>
              </select>
            </label>
            <DateField
              label="Awal hubungan"
              value={start}
              onChange={setStart}
            />
            <DateField label="Akhir hubungan" value={end} onChange={setEnd} />
          </>
        )}
        <label>
          {relation === "partner" ? "Catatan" : "Peran atau keterangan"}
          <input
            value={role}
            maxLength={relation === "partner" ? 1000 : 80}
            placeholder={
              relation === "partner"
                ? "Keterangan hubungan"
                : "Contoh: ayah, ibu, orang tua angkat"
            }
            onChange={(e) => setRole(e.target.value)}
          />
        </label>
        <ErrorText error={error} />
        <FormActions cancel={close} busy={busy} />
      </form>
    </Dialog>
  );
}
function MemoryEditor({
  state,
  memory,
  commit,
  close,
  onPhoto,
}: {
  state: State;
  memory?: Memory;
  commit: (s: State) => Promise<void>;
  close: () => void;
  onPhoto: (id: string, data: string) => void;
}) {
  const [m, setM] = useState<Memory>(() =>
      memory
        ? structuredClone(memory)
        : {
            id: uuid(),
            title: "",
            body: "",
            date: "",
            personIds: [],
            mediaIds: [],
          },
    ),
    [media, setMedia] = useState<Media[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const r = await importPhoto(file);
        setMedia((v) => [...v, r.media]);
        setM((v) => ({ ...v, mediaIds: [...v.mediaIds, r.media.id] }));
        onPhoto(r.media.id, r.data);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await commit({
        ...state,
        media: [...state.media, ...media],
        memories: memory
          ? state.memories.map((x) => (x.id === m.id ? m : x))
          : [...state.memories, m],
      });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={memory ? "Edit kenangan" : "Tambah kenangan"} close={close}>
      <form onSubmit={submit}>
        <label>
          Judul kenangan
          <input
            required
            maxLength={160}
            value={m.title}
            onChange={(e) => setM({ ...m, title: e.target.value })}
          />
        </label>
        <DateField
          label="Tanggal kejadian"
          value={m.date}
          onChange={(v) => setM({ ...m, date: v })}
        />
        <label>
          Cerita keluarga
          <textarea
            rows={5}
            maxLength={10000}
            value={m.body}
            onChange={(e) => setM({ ...m, body: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Anggota dalam kenangan</legend>
          <div className="checkbox-list">
            {active(state).map((p) => (
              <label className="check-label" key={p.id}>
                <input
                  type="checkbox"
                  checked={m.personIds.includes(p.id)}
                  onChange={(e) =>
                    setM({
                      ...m,
                      personIds: e.target.checked
                        ? [...m.personIds, p.id]
                        : m.personIds.filter((x) => x !== p.id),
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="upload-button">
          <ImagePlus size={18} />
          Tambahkan foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        <p className="muted">
          {m.mediaIds.length} foto terlampir. Maksimal 8 foto per pemilihan.
        </p>
        {m.mediaIds.map((id, i) => (
          <button
            type="button"
            key={id}
            className="text-button"
            onClick={() =>
              setM({ ...m, mediaIds: m.mediaIds.filter((x) => x !== id) })
            }
          >
            Hapus foto {i + 1}
          </button>
        ))}
        <ErrorText error={error} />
        <FormActions cancel={close} busy={busy} />
      </form>
    </Dialog>
  );
}
function PinEditor({ close, done }: { close: () => void; done: () => void }) {
  const [old, setOld] = useState(""),
    [pin, setNew] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void securityStatus().then((x) => setEnabled(x.enabled));
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (pin !== confirmation) throw Error("Konfirmasi PIN tidak sama.");
      await setPin(pin, old);
      done();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Kunci PIN" close={close}>
      <form onSubmit={submit}>
        <p>
          PIN mengunci akses aplikasi. PIN tidak mengenkripsi cadangan yang
          diekspor.
        </p>
        <p className="muted">
          Jika lupa PIN, gunakan kunci layar HP untuk mengatur ulang. Bila HP
          tidak memiliki kunci layar, pemulihan memerlukan cadangan setelah data
          aplikasi direset.
        </p>
        {enabled && (
          <label>
            PIN saat ini
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              maxLength={6}
              value={old}
              onChange={(e) => setOld(e.target.value)}
            />
          </label>
        )}
        <label>
          PIN baru 6 angka
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setNew(e.target.value)}
          />
          <small>Kosongkan untuk menonaktifkan PIN.</small>
        </label>
        <label>
          Ulangi PIN baru
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <ErrorText error={error} />
        <FormActions cancel={close} busy={busy} />
      </form>
    </Dialog>
  );
}
export default function App({ readOnly = false, publicView = false }: { readOnly?: boolean; publicView?: boolean } = {}) {
  const [memberSex,setMemberSex] = useState("all");
  const [memberPlace,setMemberPlace] = useState("");
  const [memberAddress,setMemberAddress] = useState("");
  const [statsCategory, setStatsCategory] = useState("all");
  const appearance = useAppearance();
  const [viewPhoto, setViewPhoto] = useState<{src:string;name:string}|null>(null);
  const [state, setState] = useState<State | null>(null),
    [page, setPage] = useState<Page>(publicView ? "tree" : "home"),
    [selected, setSelected] = useState<string | null>(null),
    [modal, rawSetModal] = useState<Modal | null>(null),
    [photos, setPhotos] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [pin, setPinInput] = useState(""),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  function setModal(value: Modal | null) {
    if (
      readOnly &&
      value &&
      ["person", "relation", "memory"].includes(value.type)
    ) {
      setNotice("Akun ini hanya boleh melihat data keluarga.");
      return;
    }
    rawSetModal(value);
  }
  const busyRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentState = useRef(state);
  currentState.current = state;
  const currentModal = useRef(modal);
  currentModal.current = modal;
  const [direction, setDirection] = useState<TreeDirection>("both"),
    [depth, setDepth] = useState(0),
    [scale, setScale] = useState(1),
    [pdfSize, setPdfSize] = useState<"A4" | "A3">("A4"),
    [landscape, setLandscape] = useState(true);
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(
    () => new Set(),
  );
  const [treeSearch, setTreeSearch] = useState("");
  const touches = useRef(new Map<number, {x: number; y: number}>());
  const pinch = useRef<{distance: number; scale: number; x: number; y: number} | null>(null);
  const gestureMoved = useRef(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const treeScreenRef = useRef<HTMLDivElement>(null);
  const [treeFullscreen, setTreeFullscreen] = useState(false);
  const [deceasedColor, setDeceasedColor] = useState(() => {
    try {
      const value = localStorage.getItem("silsilah-deceased-color");
      return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#fce4ec";
    } catch { return "#fce4ec"; }
  });
  function changeDeceasedColor(value: string) {
    setDeceasedColor(value);
    try { localStorage.setItem("silsilah-deceased-color", value); } catch { /* Session preference remains usable. */ }
  }
  function deceasedStyle(status: Person["status"]) {
    return status === "deceased" ? { backgroundColor: deceasedColor, color: "#202020" } : undefined;
  }
  async function toggleTreeFullscreen() {
    if (treeFullscreen) {
      setTreeFullscreen(false);
      if (document.fullscreenElement === treeScreenRef.current) {
        try { await document.exitFullscreen(); } catch { /* CSS mode has already closed. */ }
      }
      return;
    }
    setTreeFullscreen(true);
    try { await treeScreenRef.current?.requestFullscreen?.(); } catch { /* Use viewport-filling mode when native fullscreen is unavailable. */ }
  }
  useEffect(() => {
    const onChange = () => setTreeFullscreen(document.fullscreenElement === treeScreenRef.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTreeFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    if (!treeFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [treeFullscreen]);
  useEffect(() => {
    if (page !== "tree") {
      setTreeFullscreen(false);
      if (document.fullscreenElement === treeScreenRef.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    }
  }, [page]);
  const nameTap = useRef<{id: string; timer: ReturnType<typeof setTimeout>} | null>(null);
  useEffect(() => () => { if (nameTap.current) clearTimeout(nameTap.current.timer); }, []);
  function tapTreeName(p: Person) {
    if (nameTap.current?.id === p.id) {
      clearTimeout(nameTap.current.timer);
      nameTap.current = null;
      if (!readOnly) setModal({type: "person", person: p});
      else openPerson(p.id);
      return;
    }
    if (nameTap.current) clearTimeout(nameTap.current.timer);
    nameTap.current = {id: p.id, timer: setTimeout(() => {
      nameTap.current = null;
      focusTreePerson(p.id);
    }, 500)};
  }
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const linkedProfile = useRef(memberFromHash(window.location.hash));
  const linkedProfileOpened = useRef(false);
  const missingProfileNotified = useRef(false);
  useEffect(() => {
    if (!state || !linkedProfile.current || linkedProfileOpened.current) return;
    const p = active(state).find(p => p.id === linkedProfile.current);
    if (p) {
      linkedProfileOpened.current = true;
      setSelected(p.id);setPage("profile");setNotice("");
    } else if (!missingProfileNotified.current) {
      missingProfileNotified.current = true;
      setNotice("Profil pada tautan belum ditemukan di data yang tersedia. Tunggu sinkronisasi; profil mungkin telah dihapus atau tidak tersedia untuk akun ini.");
    }
  }, [state]);
  useEffect(() => {
    const follow = () => {
      linkedProfile.current = memberFromHash(window.location.hash);
      linkedProfileOpened.current = false;missingProfileNotified.current = false;
      void hydrate();
    };
    window.addEventListener("hashchange",follow);
    return () => window.removeEventListener("hashchange",follow);
  }, []);
  async function hydrate() {
    setLoading(true);
    setError("");
    try {
      const sec = await securityStatus();
      if (sec.locked) {
        setLocked(true);
        return;
      }
      const s = await loadState();
      setState(s);
      setSelected((v) =>
        v && active(s).some((p) => p.id === v)
          ? v
          : (s.rootId ?? active(s)[0]?.id ?? null),
      );
      setLocked(false);
      const images: Record<string, string> = {};
      for (const m of s.media) {
        try {
          images[m.id] = await getMedia(m);
        } catch {
          /* A missing image is reported when backup is attempted. */
        }
      }
      setPhotos(images);
      void scheduleBirthdays(s).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void hydrate();
    const refreshed = () => void hydrate();
    window.addEventListener("family-refreshed", refreshed);
    const handle = () => {
      if (document.hidden && !busyRef.current && !pickerActive()) {
        void lock()
          .then(() => securityStatus())
          .then((s) => {
            if (s.enabled) {
              setLocked(true);
              setPinInput("");
              setPhotos({});
            }
          });
      }
    };
    document.addEventListener("visibilitychange", handle);
    const pick = (e: Event) => {
      if ((e.target as HTMLElement).matches("input[type=file]")) beginPicker();
    };
    const picked = () => {
      if (pickerActive()) endPicker();
    };
    document.addEventListener("click", pick, true);
    document.addEventListener("change", picked, true);
    document.addEventListener("cancel", picked, true);
    window.addEventListener("focus", picked);
    let clean: () => void = () => {};
    if (native) {
      void NativeApp.addListener("appStateChange", async ({ isActive }) => {
        if (
          !isActive &&
          !busyRef.current &&
          !pickerActive() &&
          !pickerActive()
        ) {
          await lock();
          const s = await securityStatus();
          if (s.enabled) {
            setLocked(true);
            setPinInput("");
            setPhotos({});
          }
        }
        if (isActive && !busyRef.current && !pickerActive()) {
          const s = await securityStatus();
          if (s.locked) setLocked(true);
        }
      }).then((h) => (clean = () => void h.remove()));
    }
    return () => {
      window.removeEventListener("family-refreshed", refreshed);
      document.removeEventListener("visibilitychange", handle);
      document.removeEventListener("click", pick, true);
      document.removeEventListener("change", picked, true);
      document.removeEventListener("cancel", picked, true);
      window.removeEventListener("focus", picked);
      clean();
    };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    if (!state) return;
    const list = active(state);
    if (!selected || !list.some((p) => p.id === selected))
      setSelected(
        list.find((p) => p.id === state.rootId)?.id ?? list[0]?.id ?? null,
      );
  }, [state, selected]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!native) return;
    let clean: () => void = () => {};
    void NativeApp.addListener("backButton", () => {
      if (currentModal.current) {
        if (
          confirm("Tutup dialog? Perubahan yang belum disimpan akan dibuang.")
        )
          setModal(null);
      } else if (page !== "home") setPage("home");
      else void NativeApp.minimizeApp();
    }).then((h) => (clean = () => void h.remove()));
    return () => clean();
  }, [page]);
  async function commit(next: State) {
    validateState(next);
    const used = new Set<string>();
    next.persons.forEach((p) => {
      if (p.photoId) used.add(p.photoId);
    });
    if(next.familyProfile?.coverPhotoId)used.add(next.familyProfile.coverPhotoId);
    next.memories.forEach((m) => m.mediaIds.forEach((id) => used.add(id)));
    const cleaned = {
      ...next,
      media: next.media.filter((m) => used.has(m.id)),
    };
    await saveState(cleaned);
    setState(cleaned);
    currentState.current = cleaned;
    void scheduleBirthdays(cleaned).catch(() => {});
    setNotice("Perubahan tersimpan di perangkat.");
  }
  async function run(job: () => Promise<void>) {
    if (busyRef.current) return;
    setBusy(true);
    busyRef.current = true;
    setError("");
    try {
      await job();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  const onPhoto = (id: string, data: string) =>
    setPhotos((v) => ({ ...v, [id]: data }));
  const [treeFocusRequest, setTreeFocusRequest] = useState(0);
  function focusTreePerson(id: string) {
    setTreeFocusRequest((v) => v + 1);
    setSelected(id);
    setDirection("both");
    setDepth(0);
    setCollapsedBranches(new Set());
    setScale(1);
  }
  function openPerson(id: string) {
    setSelected(id);
    setPage("profile");
    setQuery("");
  }
  function confirmAction(
    title: string,
    message: string,
    action: () => Promise<void>,
  ) {
    setModal({ type: "confirm", title, message, action });
  }
  async function backup() {
    if (!state) return;
    await run(async () => {
      const data = await createBackup(state, async (id) => {
        const m = state.media.find((m) => m.id === id)!;
        return getMedia(m);
      });
      const saved = await saveFile(
        "Silsilah_" + new Date().toISOString().slice(0, 10) + ".silsilah.zip",
        "application/zip",
        data,
      );
      if (saved) {
        const latest = currentState.current ?? state;
        await commit({
          ...latest,
          settings: {
            ...latest.settings,
            lastBackup: new Date().toISOString(),
          },
        });
        setNotice(
          native
            ? "Cadangan lengkap berhasil disimpan."
            : "Unduhan cadangan dimulai. Pastikan berkas tersimpan di folder Unduhan.",
        );
      } else setNotice("Penyimpanan cadangan dibatalkan.");
    });
  }
  async function importBackup(file?: File) {
    if (!file) return;
    if (readOnly) {
      setError("Akun ini hanya boleh melihat data keluarga.");
      return;
    }
    await run(async () => {
      if (file.size > 64 * 1024 * 1024)
        throw Error("Cadangan terkompresi maksimal 64 MB.");
      const prepared = await inspectBackup(
        new Uint8Array(await file.arrayBuffer()),
      );
      const when = new Date(prepared.manifest.exported_at).toLocaleString(
        "id-ID",
      );
      confirmAction(
        "Pulihkan cadangan",
        `${prepared.state.familyName}: ${prepared.state.persons.length} anggota dan ${prepared.state.media.length} foto. Dibuat ${when}. Ini MENGGANTI seluruh data di aplikasi. Pastikan cadangan data saat ini sudah diekspor.`,
        async () => {
          await restoreState(prepared.state, prepared.files);
          setState(prepared.state);
          setPhotos(prepared.files);
          setSelected(
            prepared.state.rootId ?? active(prepared.state)[0]?.id ?? null,
          );
          setPage("home");
          await scheduleBirthdays(prepared.state).catch(() => {});
          setNotice("Data dan foto berhasil dipulihkan.");
        },
      );
    });
  }
  const people = state ? active(state) : [];
  const person = people.find((p) => p.id === selected);
  const graph = useMemo(
    () =>
      state && selected
        ? treeGraph(state, selected, direction, depth, collapsedBranches)
        : null,
    [state, selected, direction, depth, collapsedBranches],
  );
  const graphPoints = useMemo(
    () => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []),
    [graph],
  );
  const peopleById = useMemo(
    () => new Map(state ? active(state).map((p) => [p.id, p]) : []),
    [state],
  );
  function toggleBranch(id: string) {
    setCollapsedBranches((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function centerTree() {
    setScale(1);
    requestAnimationFrame(() => {
      const el = treeRef.current,
        n = graphPoints.get(selected ?? "");
      if (el && n)
        el.scrollTo({
          left: Math.max(0, n.x + 78 - el.clientWidth / 2),
          top: Math.max(0, n.y + 46 - el.clientHeight / 2),
          behavior: "smooth",
        });
    });
  }
  function fitTree() {
    const el = treeRef.current;
    if (!el || !graph) return;
    const next = Math.max(
      0.0001,
      Math.min(
        1,
        (el.clientWidth - 12) / graph.width,
        (el.clientHeight - 12) / graph.height,
      ),
    );
    setScale(next);
    requestAnimationFrame(() => el.scrollTo({ left: 0, top: 0 }));
  }
  useEffect(() => {
    setCollapsedBranches(new Set());
  }, [selected]);
  useEffect(() => {
    if (page === "tree")
      requestAnimationFrame(() => {
        if (direction === "all") fitTree();
        else centerTree();
      });
  }, [selected, direction, page, treeFocusRequest]);
  const birthdays = useMemo(() => (state ? upcoming(state) : []), [state]);
  if (loading)
    return (
      <div className="splash">
        <TreePine size={52} />
        <h1>Silsilah Keluargaku</h1>
        <p>Membuka cerita keluarga…</p>
      </div>
    );
  if (locked)
    return (
      <div className="splash">
        <div className="brand-mark">
          <TreePine size={34} />
        </div>
        <h1>Selamat datang kembali</h1>
        <p>Masukkan PIN untuk membuka keluarga Anda.</p>
        <form
          className="unlock-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await unlock(pin);
              setPinInput("");
              await hydrate();
            });
          }}
        >
          <label>
            PIN 6 angka
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={pin}
              onChange={(e) => setPinInput(e.target.value)}
            />
          </label>
          <ErrorText error={error} />
          <button className="primary full" disabled={busy}>
            <LockKeyhole size={18} />
            Buka aplikasi
          </button>
          {native && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void run(async () => {
                  await bridge.recoverPin();
                  await hydrate();
                })
              }
            >
              Lupa PIN · gunakan kunci layar HP
            </button>
          )}
        </form>
      </div>
    );
  if (!state)
    return (
      <div className="splash">
        <AlertCircle />
        <h1>Data belum dapat dibuka</h1>
        <ErrorText error={error} />
        <button className="primary" onClick={() => void hydrate()}>
          Coba lagi
        </button>
      </div>
    );
  const filtered = searchMembers(state,{query,status:filter,sex:memberSex,place:publicView?"":memberPlace,address:publicView?"":memberAddress});
  const personRow = (p: Person, subtitle?: string, action?: ReactNode) => (
    <div className="member-row" key={p.id} style={deceasedStyle(p.status)}>
      <button className="member-main" onClick={() => openPerson(p.id)}>
        <Avatar person={p} photos={photos} />
        <span>
          <strong>{p.name}</strong>
          <small>{subtitle ?? (p.nickname || dateText(p.birth))}</small>
        </span>
      </button>
      {action ?? <ChevronRight size={18} className="muted" />}
    </div>
  );
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => setPage(publicView ? "tree" : "home")}>
          <span className="brand-mark">
            <TreePine size={24} />
          </span>
          <span>
            Silsilah<span className="brand-sub">Keluargaku</span>
          </span>
        </button>
        <span className="device-badge">
          <span /> {native ? "Offline di HP" : "Web keluarga"}
        </span>
        {!publicView && <IconButton
          label="Pengaturan keluarga"
          onClick={() => setPage("settings")}
        >
          <Settings2 size={21} />
        </IconButton>}
      </header>
      {!native && !publicView && (
        <div className="preview-banner">
          Salinan offline web · Sinkronisasi melalui menu Keluarga Bersama.
        </div>
      )}
      <main className={"main page-" + page}>
        <div className="page-heading">
          {["profile", "memories", "trash"].includes(page) ? (
            <IconButton
              label="Kembali"
              onClick={() =>
                setPage(page === "profile" ? "members" : "settings")
              }
            >
              <ArrowLeft />
            </IconButton>
          ) : null}
          <div>
            <p className="eyebrow">SIMPAN CERITA · SAMBUNG KELUARGA</p>
            <h1>{titles[page]}</h1>
          </div>
          {page === "members" && (
            <button
              className="primary compact"
              onClick={() => setModal({ type: "person" })}
            >
              <Plus size={18} />
              <span>Anggota</span>
            </button>
          )}
        </div>
        {error && (
          <div className="global-error" role="alert">
            <AlertCircle size={19} />
            <span>{error}</span>
            <IconButton label="Tutup pesan error" onClick={() => setError("")}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {page === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="hero-label">
                  <Leaf size={14} /> RUANG KELUARGA ANDA
                </span>
                <h2>{state.familyName}</h2>
                <p>
                  Setiap nama punya cerita.
                  <br />
                  Rawat akarnya, kenali cabangnya.
                </p>
                <button
                  className="light-button"
                  onClick={() => {
                    setPage("tree");
                    if (!selected) setSelected(people[0]?.id ?? null);
                  }}
                >
                  Lihat silsilah <ChevronRight size={17} />
                </button>
              </div>
              <div className="tree-art" aria-hidden="true">
                <span className="art-root">
                  <TreePine size={52} />
                </span>
                <span className="art-leaf leaf-one">
                  <Heart size={22} />
                </span>
                <span className="art-leaf leaf-two">
                  <Users size={26} />
                </span>
                <span className="art-leaf leaf-three">
                  <Leaf size={24} />
                </span>
                <svg viewBox="0 0 210 210">
                  <path
                    d="M105 160 V65 M105 115 H45 V75 M105 95 H170 V50"
                    fill="none"
                    stroke="#bad7b7"
                    strokeWidth="2"
                  />
                  <circle cx="105" cy="168" r="8" fill="#d6b77a" />
                </svg>
              </div>
            </section>
            <div className="stats-grid">
              <div className="stat-card">
                <Users />
                <div>
                  <strong>{people.length}</strong>
                  <span>Anggota keluarga</span>
                </div>
              </div>
              <div className="stat-card">
                <Heart />
                <div>
                  <strong>
                    {
                      state.unions.filter((u) =>
                        u.members.every((id) =>
                          people.some((p) => p.id === id),
                        ),
                      ).length
                    }
                  </strong>
                  <span>Relasi pasangan</span>
                </div>
              </div>
            </div>
            <div className="quick-actions">
              <button
                disabled={readOnly}
                className="primary"
                onClick={() => setModal({ type: "person" })}
              >
                <Plus size={19} />
                Tambah anggota
              </button>
              <button className="secondary" onClick={() => setPage("members")}>
                <Search size={19} />
                Cari keluarga
              </button>
            </div>
            {!publicView && <Agenda state={state} commit={commit} readOnly={readOnly} compact openAgenda={() => setPage("agenda")} openPerson={openPerson} />}
            {!publicView && <FamilyStats state={state} compact openStats={(category) => {setStatsCategory(category);setPage("stats");}} openPerson={openPerson} />}
            <div className="home-grid">
              <section className="card">
                <div className="section-heading">
                  <h2>
                    <CalendarDays size={19} />
                    Ulang tahun terdekat
                  </h2>
                  <span className="badge">Keluarga</span>
                </div>
                {birthdays.length ? (
                  birthdays
                    .slice(0, 3)
                    .map((e) =>
                      personRow(
                        e.person,
                        dateText(e.person.birth),
                        <span className="birthday-tag">
                          {e.days === 0 ? "Hari ini" : `${e.days} hari lagi`}
                        </span>,
                      ),
                    )
                ) : (
                  <div className="empty-small">
                    <CalendarDays size={28} />
                    <p>Belum ada ulang tahun tercatat.</p>
                    <small>
                      Isi tanggal lahir lengkap dan status masih hidup.
                    </small>
                  </div>
                )}
              </section>
              <section className="card roots-card">
                <span className="round-icon">
                  <BookHeart />
                </span>
                <h2>Kenangan yang menyatukan</h2>
                <p>
                  Simpan foto dan cerita agar generasi berikutnya ikut mengenal
                  keluarga.
                </p>
                <button
                  className="text-button"
                  onClick={() => setPage("memories")}
                >
                  Buka album kenangan <ChevronRight size={16} />
                </button>
              </section>
            </div>
            <section className="backup-strip">
              <ShieldCheck size={27} />
              <div>
                <strong>Jaga cerita keluarga tetap aman</strong>
                <p>
                  {state.settings.lastBackup
                    ? "Cadangan terakhir " +
                      new Date(state.settings.lastBackup).toLocaleDateString(
                        "id-ID",
                      )
                    : "Belum ada cadangan. Simpan salinannya di luar aplikasi."}
                </p>
              </div>
              <button
                onClick={() => void backup()}
                disabled={busy}
                className="text-button"
              >
                Cadangkan <ChevronRight size={17} />
              </button>
            </section>
            {people.length === 0 && (
              <section className="onboarding-note">
                <h2>Mulai dari satu orang</h2>
                <p>
                  Tambahkan diri Anda atau anggota tertua yang diketahui. Orang
                  tua, pasangan, dan anak dapat dihubungkan sesudahnya.
                </p>
              </section>
            )}
          </>
        )}
        {page === "members" && (
          <>
            <div className="search-box">
              <Search size={20} />
              <input
                aria-label="Cari anggota keluarga"
                placeholder={publicView?"Cari nama atau nama panggilan…":"Cari nama, panggilan, atau tempat lahir…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filter-row">
              {[
                ["all", "Semua"],
                ["living", "Masih hidup"],
                ["deceased", "Wafat"],
                ["unknown", "Belum diketahui"],
              ].map(([v, t]) => (
                <button
                  key={v}
                  className={"chip " + (filter === v ? "selected" : "")}
                  onClick={() => setFilter(v)}
                >
                  {t}
                </button>
              ))}
            </div>
            <details className="card"><summary>Pencarian lebih lengkap</summary><div className="form-grid"><label>Jenis kelamin<select value={memberSex} onChange={e=>setMemberSex(e.target.value)}><option value="all">Semua</option><option value="M">Laki-laki</option><option value="F">Perempuan</option><option value="U">Belum diketahui</option></select></label>{!publicView&&<><label>Tempat lahir<input value={memberPlace} onChange={e=>setMemberPlace(e.target.value)} placeholder="Contoh: Salatiga"/></label><label>Alamat (termasuk alamat mengikuti orang tua)<input value={memberAddress} onChange={e=>setMemberAddress(e.target.value)} placeholder="Ketik sebagian alamat"/></label></>}</div><button type="button" className="secondary" onClick={()=>{setQuery("");setFilter("all");setMemberSex("all");setMemberPlace("");setMemberAddress("");}}>Reset semua pencarian</button></details>
            <p className="list-count">{filtered.length} anggota ditemukan</p>
            <section className="card member-list">
              {filtered.slice(0, 200).map((p) => personRow(p))}
              {!filtered.length && (
                <Empty
                  icon={<Users />}
                  title="Belum ada anggota"
                  text="Tambahkan anggota pertama atau ubah pencarian Anda."
                />
              )}
              {filtered.length > 200 && (
                <p className="muted">
                  Menampilkan 200 hasil pertama. Persempit nama pada pencarian.
                </p>
              )}
            </section>
          </>
        )}
        {page === "tree" && (
          <>
            <section className="tree-controls">
              <label>
                Cari anggota pada pohon
                <input aria-label="Cari anggota pada pohon" placeholder="Ketik nama anggota…" value={treeSearch} onChange={e => setTreeSearch(e.target.value)} />
              </label>
              {treeSearch.trim() && <div className="tree-search-results" role="list" aria-label="Hasil pencarian anggota">
                {people.filter(p => (p.name + " " + (p.nickname ?? "")).toLocaleLowerCase("id").includes(treeSearch.trim().toLocaleLowerCase("id"))).slice(0, 30).map(p => <button className="secondary full" key={p.id} onClick={() => { focusTreePerson(p.id); setTreeSearch(""); }}>{p.name}{p.nickname ? ` (${p.nickname})` : ""}</button>)}
                {!people.some(p => (p.name + " " + (p.nickname ?? "")).toLocaleLowerCase("id").includes(treeSearch.trim().toLocaleLowerCase("id"))) && <p role="status">Anggota tidak ditemukan.</p>}
              </div>}
            </section>
            {graph?.nodes.length ? (
              <>
                <p className="muted" role="status">
                  Menampilkan {graph.nodes.length} dari {graph.totalNodes}{" "}
                  anggota dalam cakupan
                  {graph.hiddenCount > 0
                    ? ` · ${graph.hiddenCount} dilipat`
                    : ""}
                  .
                </p>
                <div ref={treeScreenRef} className={"tree-screen" + (treeFullscreen ? " is-fullscreen" : "")}>
                <div
                  className="tree-viewport"
                  ref={treeRef}
                  onPointerDown={(e) => {
                    const el = treeRef.current!;
                    touches.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
                    if (touches.current.size === 1) gestureMoved.current = false;
                    if (!(e.target as Element).closest("[data-node]") || touches.current.size > 1) el.setPointerCapture(e.pointerId);
                    if (touches.current.size === 2) {
                      const [a,b] = [...touches.current.values()];
                      const rect = el.getBoundingClientRect();
                      pinch.current = {distance: Math.max(1, Math.hypot(a.x-b.x,a.y-b.y)), scale,
                        x: (el.scrollLeft+(a.x+b.x)/2-rect.left)/scale,
                        y: (el.scrollTop+(a.y+b.y)/2-rect.top)/scale};
                      gestureMoved.current = true; drag.current = null;
                    } else if (touches.current.size === 1) {
                      drag.current = {x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};
                    }
                  }}
                  onPointerMove={(e) => {
                    if (!touches.current.has(e.pointerId)) return;
                    touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
                    const el = treeRef.current!;
                    if (pinch.current && touches.current.size === 2) {
                      const [a,b] = [...touches.current.values()], base = pinch.current;
                      const next = Math.min(3,Math.max(0.0001,base.scale*Math.hypot(a.x-b.x,a.y-b.y)/base.distance));
                      const rect = el.getBoundingClientRect();
                      setScale(next);
                      requestAnimationFrame(() => {el.scrollLeft=base.x*next-((a.x+b.x)/2-rect.left);el.scrollTop=base.y*next-((a.y+b.y)/2-rect.top);});
                    } else if (drag.current) {
                      const d=drag.current;
                      if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>6) gestureMoved.current=true;
                      el.scrollLeft=d.left-(e.clientX-d.x);el.scrollTop=d.top-(e.clientY-d.y);
                    }
                  }}
                  onPointerUp={(e) => { touches.current.delete(e.pointerId); pinch.current=null; drag.current=null; }}
                  onPointerCancel={(e) => { touches.current.delete(e.pointerId); pinch.current=null; drag.current=null; }}
                  onClickCapture={(e) => {if(gestureMoved.current){e.preventDefault();e.stopPropagation();}}}
                >
                  <svg
                    width={graph.width * scale}
                    height={graph.height * scale}
                    viewBox={`0 0 ${graph.width} ${graph.height}`}
                    aria-label="Bagan silsilah keluarga"
                  >
                    {[...graph.edges]
                      .sort((a, b) => Number(a.focused) - Number(b.focused))
                      .map((edge, i) => {
                        const a = graphPoints.get(edge.from)!,
                          b = graphPoints.get(edge.to)!;
                        const partner =
                          edge.kind === "union" || edge.kind === "sibling";
                        return (
                          <path
                            key={i}
                            data-focus-path={edge.focused ? "true" : "false"}
                            d={treeEdgePath(
                              edge,
                              a,
                              b,
                              state.settings.treeLineStyle ?? "curve",
                            )}
                            fill="none"
                            stroke={
                              edge.focused
                                ? "#00a86b"
                                : edge.kind === "sibling"
                                  ? "#b3bdcc"
                                  : partner
                                    ? "#cbbfb5"
                                    : "#bac5be"
                            }
                            strokeWidth={edge.focused ? 3.5 : 1.4}
                            strokeOpacity={edge.focused ? 1 : 0.65}
                            strokeLinecap="round"
                            strokeDasharray={
                              edge.kind === "sibling"
                                ? "2 4"
                                : (edge.kind === "adoptive" || edge.kind === "step")
                                  ? "6 4"
                                  : undefined
                            }
                          />
                        );
                      })}
                    {graph.nodes.map((n) => {
                      const p = peopleById.get(n.id)!;
                      return (
                        <g key={n.id}>
                          <g
                            data-node="true"
                            data-focus-card={n.focused ? "true" : "false"}
                            transform={`translate(${n.x},${n.y})`}
                            role="button"
                            tabIndex={0}
                            aria-label={"Fokus silsilah " + p.name}
                            onClick={(e) => { e.stopPropagation(); tapTreeName(p); }}
                            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            style={{touchAction: "manipulation", userSelect: "none"}}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                focusTreePerson(p.id);
                              }
                            }}
                          >
                            <rect
                              width="156"
                              height="92"
                              rx="14"
                              fill={
                                p.status === "deceased"
                                  ? deceasedColor
                                  : p.id === selected
                                  ? "#b9f1d6"
                                  : n.focused
                                    ? "#e2ffed"
                                    : "var(--appearance-surface, #f1f3f0)"
                              }
                              stroke={
                                p.id === selected
                                  ? "#087548"
                                  : n.focused
                                    ? "#00a86b"
                                    : "#d5dcd6"
                              }
                              strokeWidth={
                                p.id === selected ? 3 : n.focused ? 2 : 1
                              }
                            />
                            <circle
                              cx="28"
                              cy="28"
                              r="17"
                              fill={p.sex === "F" ? "#f2e5de" : "#dfe9e2"}
                            />
                            <text
                              x="28"
                              y="33"
                              textAnchor="middle"
                              fill="#345747"
                              fontSize="12"
                              fontWeight="600"
                            >
                              {p.name
                                .split(" ")
                                .slice(0, 2)
                                .map((w) => w[0])
                                .join("")}
                            </text>
                            {p.photoId && photos[p.photoId] && (
                              <>
                                <defs>
                                  <clipPath id={"photo-" + p.id}>
                                    <circle cx="28" cy="28" r="17" />
                                  </clipPath>
                                </defs>
                                <image
                                  href={photos[p.photoId]}
                                  x="11"
                                  y="11"
                                  width="34"
                                  height="34"
                                  preserveAspectRatio="xMidYMid slice"
                                  clipPath={"url(#photo-" + p.id + ")"}
                                />
                              </>
                            )}
                            <text x="53" y="28" fill="#263e32" fontSize="10">
                              {p.id === selected
                                ? "FOKUS"
                                : n.focused
                                  ? "JALUR FOKUS"
                                  : "KELUARGA"}
                            </text>
                            <text
                              x="12"
                              y="60"
                              fill="#203b2e"
                              fontSize="12"
                              fontWeight="600"
                            >
                              {p.name.length > 20
                                ? p.name.slice(0, 18) + "…"
                                : p.name}
                            </text>
                            <text x="12" y="79" fill={p.status === "deceased" ? "#202020" : "#748275"} fontSize="11">
                              {p.birth.slice(0, 4) || "?"}
                              {p.status === "deceased"
                                ? " – " + (p.death.slice(0, 4) || "?") + " · Wafat"
                                : ""}
                            </text>
                          </g>
                          {n.childCount > 0 && direction !== "ancestors" && (
                            <g
                              data-node="true"
                              transform={`translate(${n.x + 140},${n.y + 18})`}
                              role="button"
                              tabIndex={0}
                              aria-label={
                                (n.collapsed ? "Buka" : "Tutup") +
                                " keturunan " +
                                p.name
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBranch(p.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleBranch(p.id);
                                }
                              }}
                            >
                              <title>
                                {n.collapsed ? "Buka" : "Tutup"} {n.childCount}{" "}
                                anak dan keturunannya
                              </title>
                              <rect
                                x="-22"
                                y="-22"
                                width="44"
                                height="44"
                                fill="transparent"
                              />
                              <circle r="14" fill="#16634a" />
                              <path
                                d={n.collapsed ? "M-5 0H5M0 -5V5" : "M-5 0H5"}
                                fill="none"
                                stroke="white"
                                strokeWidth="2"
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="tree-toolbar">
                  <span className="muted">Cubit dua jari untuk zoom · geser bagan</span>
                  <button type="button" className="secondary" aria-label={treeFullscreen ? "Keluar layar penuh" : "Layar penuh"} aria-pressed={treeFullscreen} onClick={() => void toggleTreeFullscreen()}>
                    {treeFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    {treeFullscreen ? "Keluar" : "Layar penuh"}
                  </button>
                  <IconButton
                    label="Perkecil bagan"
                    onClick={() => setScale((s) => Math.max(0.0001, s / 1.4))}
                  >
                    <ZoomOut />
                  </IconButton>
                  <IconButton label="Pusatkan bagan" onClick={centerTree}>
                    <LocateFixed />
                  </IconButton>
                  <IconButton
                    label="Sesuaikan seluruh bagan ke layar"
                    onClick={fitTree}
                  >
                    <Maximize2 />
                  </IconButton>
                  <IconButton
                    label="Perbesar bagan"
                    onClick={() => setScale((s) => Math.min(3, s * 1.4))}
                  >
                    <ZoomIn />
                  </IconButton>
                </div>
                <div className="status-legend"><span style={{backgroundColor: deceasedColor}} /> Sudah wafat</div>
                </div>
                <button
                  className="secondary full"
                  onClick={() => selected && openPerson(selected)}
                >
                  Buka profil fokus
                </button>
                <button
                  className="secondary full"
                  onClick={() => setModal({ type: "pdf" })}
                >
                  <Download size={18} />
                  Ekspor cakupan ini ke PDF
                </button>
                <p className="muted">
                  Gunakan tombol + atau − pada kartu untuk membuka atau menutup
                  keturunan. Ketuk dua kali nama untuk membuka edit profil. Ketuk sekali untuk menampilkan jalur leluhur dan
                  keturunannya. Gunakan tombol Buka profil fokus untuk melihat
                  profil. Pasangan dan saudara dapat tampil sebagai konteks.
                </p>
                <div className="branch-actions">
                  <button
                    className="secondary"
                    disabled={direction === "ancestors"}
                    onClick={() => {
                      setDepth(0);
                      setCollapsedBranches(new Set());
                    }}
                  >
                    <Maximize2 size={17} />
                    Buka semua keturunan
                  </button>
                  <button
                    className="secondary"
                    disabled={direction === "ancestors"}
                    onClick={() =>
                      setCollapsedBranches(
                        new Set(
                          direction === "all"
                            ? people
                                .filter((p) =>
                                  state.parents.some(
                                    (l) => l.parentId === p.id,
                                  ),
                                )
                                .map((p) => p.id)
                            : selected
                              ? [selected]
                              : [],
                        ),
                      )
                    }
                  >
                    <Minimize2 size={17} />
                    Tutup keturunan
                  </button>
                </div>
                <p className="muted">
                  Kotak hijau dan garis terang tebal: jalur leluhur dan
                  keturunan fokus. Garis redup: hubungan lain.
                </p>
                <p className="legend">
                  <span /> Orang tua <i /> Adopsi <b /> Pasangan{" "}
                  <i
                    style={{ borderColor: "#6786ab", borderTopStyle: "dotted" }}
                  />{" "}
                  Saudara
                </p>


              </>
            ) : (
              <Empty
                icon={<Network />}
                title="Pohon keluarga menunggu cerita Anda"
                text="Tambahkan anggota terlebih dahulu untuk melihat silsilah."
                action={
                  <button
                    disabled={readOnly}
                    className="primary"
                    onClick={() => setModal({ type: "person" })}
                  >
                    <Plus size={18} />
                    Tambah anggota
                  </button>
                }
              />
            )}
            <section className="tree-controls tree-settings">
              <div className="form-grid">
                <label>
                  Tampilan pohon
                  <select
                    aria-label="Tampilan pohon"
                    value={direction}
                    onChange={(e) => {
                      setDirection(e.target.value as TreeDirection);
                      setCollapsedBranches(new Set());
                      if (e.target.value === "all") setDepth(0);
                    }}
                  >
                    <option value="all">Seluruh keluarga</option>
                    <option value="both">Leluhur dan keturunan</option>
                    <option value="ancestors">Leluhur</option>
                    <option value="descendants">Keturunan</option>
                  </select>
                </label>
                <label>
                  Generasi
                  <select
                    aria-label="Jumlah generasi"
                    disabled={direction === "all"}
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                  >
                    <option value={0}>Semua generasi</option>
                    {[1, 2, 3, 4, 5, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} tingkat dari fokus
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Model garis jalur
                <select
                  aria-label="Model garis jalur"
                  value={state.settings.treeLineStyle ?? "curve"}
                  disabled={busy}
                  onChange={(e) => {
                    const treeLineStyle = e.target.value as TreeLineStyle;
                    void run(() =>
                      commit({
                        ...state,
                        settings: { ...state.settings, treeLineStyle },
                      }),
                    );
                  }}
                >
                  <option value="curve">Lengkung</option>
                  <option value="straight">Lurus</option>
                  <option value="elbow">Siku</option>
                </select>
              </label>
            </section>
          </>
        )}
        {page === "profile" && person && (
          <>
            <section className="card profile-top" style={deceasedStyle(person.status)}>
              {person.status === "deceased" && <span className="badge">Sudah wafat</span>}
              {person.photoId && photos[person.photoId] ? <button type="button" className="profile-photo-button" aria-label={"Perbesar foto " + person.name} onClick={() => setViewPhoto({src:photos[person.photoId!],name:person.name})}><Avatar person={person} photos={photos} size="large" /></button> : <Avatar person={person} photos={photos} size="large" />}
              {viewPhoto && <PhotoViewer src={viewPhoto.src} name={viewPhoto.name} close={() => setViewPhoto(null)} />}
              <h2>{person.name}</h2>
              <p>
                {person.nickname ? person.nickname + " · " : ""}
                {person.sex === "M"
                  ? "Laki-laki"
                  : person.sex === "F"
                    ? "Perempuan"
                    : "Jenis kelamin belum diketahui"}
              </p>
              {age(person) && (
                <span className="badge">
                  {age(person)}
                  {person.status === "deceased" ? " saat wafat" : ""}
                </span>
              )}
              <div className="profile-actions">
                <button
                  disabled={readOnly}
                  className="secondary"
                  onClick={() => setModal({ type: "person", person })}
                >
                  <Pencil size={17} />
                  Edit profil
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setSelected(person.id);
                    setPage("tree");
                  }}
                >
                  <Network size={18} />
                  Lihat pohon
                </button>
              </div>
            </section>
            <section className="card">
              {publicView && <p>Anda melihat profil publik. Biodata pribadi hanya tersedia sesuai hak akses akun keluarga.</p>}
              <ProfileShare key={person.id} id={person.id} name={person.name} />
              <h2>Biodata</h2>
              <dl className="biodata">
                <div>
                  <dt>NIK</dt>
                  <dd>{person.nik || "Belum diisi"}</dd>
                </div>
                <div><dt>Agama</dt><dd>{person.religion || "Belum diisi"}</dd></div>
                <div><dt>Nomor HP</dt><dd>{person.phone || "Belum diisi"}</dd></div>
                <div>
                  <dt>Alamat</dt>
                  <dd className="preserve">
                    {resolveAddress(state, person.id).address || "Belum diisi"}
                  </dd>
                </div>
                <div>
                  <dt>Sumber alamat</dt>
                  <dd>
                    {person.addressMode === "manual" ||
                    (person.addressMode === undefined && person.address)
                      ? "Diisi manual"
                      : "Mengikuti orang tua otomatis"}
                  </dd>
                </div>

                <div>
                  <dt>Tanggal lahir</dt>
                  <dd>
                    {person.birthApprox ? "Sekitar " : ""}
                    {dateText(person.birth)}
                  </dd>
                </div>
                <div>
                  <dt>Tempat lahir</dt>
                  <dd>{person.place || "Belum diketahui"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {person.status === "living"
                      ? "Masih hidup"
                      : person.status === "deceased"
                        ? "Sudah wafat"
                        : "Belum diketahui"}
                  </dd>
                </div>
                {person.status === "deceased" && (
                  <div>
                    <dt>Tanggal wafat</dt>
                    <dd>{dateText(person.death)}</dd>
                  </div>
                )}
                {person.notes && (
                  <div>
                    <dt>Catatan</dt>
                    <dd className="preserve">{person.notes}</dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>
                  <Link2 size={19} />
                  Hubungan keluarga
                </h2>
                <button
                  disabled={readOnly}
                  className="text-button"
                  onClick={() =>
                    setModal({ type: "relation", anchor: person.id })
                  }
                >
                  <Plus size={17} />
                  Hubungkan
                </button>
              </div>
              {(["parents", "unions", "children"] as const).map((group) => {
                const relations = related(state, person.id);
                return (
                  <div className="relation-group" key={group}>
                    <h3>
                      {group === "parents"
                        ? "Orang tua"
                        : group === "children"
                          ? "Anak"
                          : "Pasangan"}
                    </h3>
                    {group === "unions"
                      ? relations.unions.map((u) => {
                          const other = people.find(
                            (p) =>
                              p.id === u.members.find((id) => id !== person.id),
                          )!;
                          return personRow(
                            other,
                            `${{ married: "Menikah", divorced: "Bercerai", separated: "Berpisah", unknown: "Status belum diketahui" }[u.status]}${u.start ? " · " + dateText(u.start) : ""}${u.end ? " s.d. " + dateText(u.end) : ""}${u.notes ? " · " + u.notes : ""}`,
                            <>
                              <IconButton
                                label={"Edit hubungan pasangan " + other.name}
                                onClick={() =>
                                  setModal({
                                    type: "relation",
                                    anchor: person.id,
                                    union: u,
                                  })
                                }
                              >
                                <Pencil size={16} />
                              </IconButton>
                              <IconButton
                                label={"Hapus hubungan pasangan " + other.name}
                                onClick={() =>
                                  confirmAction(
                                    "Hapus hubungan pasangan",
                                    "Hanya hubungan yang dihapus. Biodata kedua anggota tetap tersimpan.",
                                    async () =>
                                      commit({
                                        ...state,
                                        unions: state.unions.filter(
                                          (x) => x.id !== u.id,
                                        ),
                                      }),
                                  )
                                }
                              >
                                <X size={17} />
                              </IconButton>
                            </>,
                          );
                        })
                      : relations[group].map((l) => {
                          const p = people.find(
                            (p) =>
                              p.id ===
                              (group === "parents" ? l.parentId : l.childId),
                          )!;
                          return personRow(
                            p,
                            (l.kind === "step" ? "Tiri" : l.kind === "adoptive" ? "Adopsi" : "Kandung") +
                              (l.role ? " · " + l.role : ""),
                            <>
                              <IconButton
                                label={"Edit hubungan dengan " + p.name}
                                onClick={() =>
                                  setModal({
                                    type: "relation",
                                    anchor: person.id,
                                    link: l,
                                  })
                                }
                              >
                                <Pencil size={16} />
                              </IconButton>
                              <IconButton
                                label={"Hapus hubungan dengan " + p.name}
                                onClick={() =>
                                  confirmAction(
                                    "Hapus hubungan",
                                    "Biodata anggota tetap tersimpan. Hanya tautan orang tua dan anak ini yang dihapus.",
                                    async () =>
                                      commit({
                                        ...state,
                                        parents: state.parents.filter(
                                          (x) => x.id !== l.id,
                                        ),
                                      }),
                                  )
                                }
                              >
                                <X size={17} />
                              </IconButton>
                            </>,
                          );
                        })}
                    {relations[group].length === 0 && (
                      <p className="muted">Belum dicatat.</p>
                    )}
                  </div>
                );
              })}
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>Kakak dan adik</h2>
                <button
                  disabled={readOnly}
                  className="text-button"
                  onClick={() =>
                    setModal({
                      type: "relation",
                      anchor: person.id,
                      initialRelation: "older",
                    })
                  }
                >
                  <Plus size={17} />
                  Tambah saudara
                </button>
              </div>
              {siblingsOf(state, person.id).map((row) =>
                personRow(
                  people.find((p) => p.id === row.personId)!,
                  row.label + (row.notes ? " · " + row.notes : ""),
                  row.linkId ? (
                    <IconButton
                      label={
                        "Hapus hubungan saudara " +
                        people.find((p) => p.id === row.personId)!.name
                      }
                      onClick={() =>
                        confirmAction(
                          "Hapus hubungan saudara",
                          "Biodata tetap tersimpan. Hubungan yang berasal dari orang tua yang sama masih dapat ditampilkan.",
                          async () =>
                            commit({
                              ...state,
                              siblings: (state.siblings ?? []).filter(
                                (l) => l.id !== row.linkId,
                              ),
                            }),
                        )
                      }
                    >
                      <X size={17} />
                    </IconButton>
                  ) : undefined,
                ),
              )}
              {siblingsOf(state, person.id).length === 0 && (
                <p className="muted">Belum ada kakak atau adik yang dicatat.</p>
              )}
            </section>
            <div className="profile-bottom">
              <button
                className="secondary"
                onClick={() =>
                  void run(async () => {
                    await commit({ ...state, rootId: person.id });
                    setNotice("Anggota ditetapkan sebagai akar awal keluarga.");
                  })
                }
              >
                <TreePine size={18} />
                Jadikan akar awal
              </button>
              <button
                disabled={readOnly}
                className="danger-text"
                onClick={() =>
                  confirmAction(
                    "Pindahkan anggota ke Sampah",
                    `${person.name} beserta hubungan aktifnya akan disembunyikan. Anda dapat memulihkannya dari Sampah.`,
                    async () => {
                      await commit({
                        ...state,
                        persons: state.persons.map((p) =>
                          p.id === person.id
                            ? { ...p, deletedAt: new Date().toISOString() }
                            : p,
                        ),
                      });
                      setPage("members");
                    },
                  )
                }
              >
                <Trash2 size={18} />
                Pindahkan ke Sampah
              </button>
            </div>
          </>
        )}
        {page === "memories" && (
          <>
            <button
              disabled={readOnly}
              className="primary"
              onClick={() => setModal({ type: "memory" })}
            >
              <Plus size={18} />
              Tambah kenangan
            </button>
            <div className="memories-grid">
              {state.memories.map((m) => (
                <article className="card memory-card" key={m.id}>
                  {m.mediaIds.length > 0 && (
                    <div className="memory-photos">
                      {m.mediaIds.map((id) =>
                        photos[id] ? (
                          <img
                            key={id}
                            src={photos[id]}
                            alt={"Foto kenangan " + m.title}
                          />
                        ) : (
                          <span key={id} className="muted">
                            Foto tidak tersedia
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  <p className="eyebrow">{dateText(m.date)}</p>
                  <h2>{m.title}</h2>
                  <p className="preserve">{m.body}</p>
                  <div className="memory-tags">
                    {m.personIds.map((id) => {
                      const p = people.find((p) => p.id === id);
                      return p ? (
                        <button
                          className="chip"
                          key={id}
                          onClick={() => openPerson(id)}
                        >
                          {p.name}
                        </button>
                      ) : null;
                    })}
                  </div>
                  <div className="section-heading">
                    <button
                      className="text-button"
                      onClick={() => setModal({ type: "memory", memory: m })}
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                    <button
                      className="danger-text"
                      onClick={() =>
                        confirmAction(
                          "Hapus kenangan",
                          "Cerita dan tautan foto kenangan ini akan dihapus permanen. Foto yang masih dipakai anggota lain tetap disimpan.",
                          async () =>
                            commit({
                              ...state,
                              memories: state.memories.filter(
                                (x) => x.id !== m.id,
                              ),
                            }),
                        )
                      }
                    >
                      <Trash2 size={16} />
                      Hapus
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!state.memories.length && (
              <Empty
                icon={<BookHeart />}
                title="Cerita keluarga belum ditulis"
                text="Mulai dengan foto kebersamaan atau cerita tentang orang terkasih."
              />
            )}
          </>
        )}
        {page === "familyProfile" && !publicView && <FamilyProfile state={state} photos={photos} onPhoto={onPhoto} commit={commit} readOnly={readOnly} />}
        {page === "timeline" && !publicView && <FamilyTimeline state={state} openPerson={openPerson} />}
        {page === "book" && !publicView && <FamilyBook state={state} photos={photos} />}
        {page === "sheetsBackup" && !publicView && <SheetsBackup />}
        {page === "privacy" && !publicView && <PrivacySettings />}
        {page === "history" && !publicView && <History />}
        {page === "stats" && !publicView && <FamilyStats state={state} initialCategory={statsCategory} openPerson={openPerson} />}
        {page === "agenda" && !publicView && <Agenda state={state} commit={commit} readOnly={readOnly} openPerson={openPerson} />}
        {page === "kinship" && !publicView && <Kinship state={state} openPerson={openPerson} />}
        {page === "checks" && !publicView && <DataChecks state={state} openPerson={openPerson} />}
        {page === "settings" && (
          <>
            <AppearanceSettings appearance={appearance} />
            <section className="card"><SettingRow icon={<BookHeart />} title="Profil keluarga besar" text="Sejarah, asal-usul, tokoh pendahulu, dan sampul" onClick={() => setPage("familyProfile")} /><SettingRow icon={<CalendarDays />} title="Linimasa keluarga" text="Urutan kelahiran, pernikahan, wafat, dan peristiwa keluarga" onClick={() => setPage("timeline")} /></section>
            <section className="card"><SettingRow icon={<BookHeart />} title="Buku keluarga" text="Baca buku keluarga di aplikasi atau unduh PDF" onClick={() => setPage("book")} /></section>
            <section className="card"><SettingRow icon={<ShieldCheck />} title="Privasi pengunjung" text="Atur foto, nama panggilan, dan akses publik · khusus admin" onClick={() => setPage("privacy")} /></section>
            <section className="card"><SettingRow icon={<BookHeart />} title="Backup ke Google Sheets" text="Salin data resmi ke spreadsheet · khusus admin" onClick={() => setPage("sheetsBackup")} /></section>
            <section className="card"><SettingRow icon={<ShieldCheck />} title="Riwayat perubahan" text="Catatan server tentang revisi, usulan, dan akun · khusus admin" onClick={() => setPage("history")} /></section>
            <section className="card"><SettingRow icon={<Users />} title="Statistik keluarga" text="Ringkasan anggota, usia, dan kelengkapan data" onClick={() => {setStatsCategory("all");setPage("stats");}} /></section>
            <section className="card"><SettingRow icon={<CalendarDays />} title="Agenda keluarga" text="Ulang tahun, pernikahan, dan acara keluarga" onClick={() => setPage("agenda")} /></section>
            <section className="card"><SettingRow icon={<Network />} title="Cari hubungan keluarga" text="Pilih dua anggota untuk melihat sebutan dan jalur hubungannya" onClick={() => setPage("kinship")} /></section>
            <section className="card"><SettingRow icon={<Users />} title="Pemeriksaan data" text="Tinjau kemungkinan ganda, tanggal, dan hubungan yang belum lengkap" onClick={() => setPage("checks")} /></section>
            <section className="card">
              <h2>Warna anggota yang sudah wafat</h2>
              <p>Warna berlaku pada pohon, daftar anggota, dan profil. Disimpan di browser perangkat ini.</p>
              <label>Pilih warna <input type="color" value={deceasedColor} onChange={e => changeDeceasedColor(e.target.value)} /></label>
              <div className="deceased-preview" style={{backgroundColor: deceasedColor}}>Contoh anggota · Sudah wafat</div>
              <button type="button" className="secondary" onClick={() => changeDeceasedColor("#fce4ec")}>Kembalikan merah muda</button>
            </section>
            <section className="card"><SettingRow icon={<Users />} title="Bagikan tautan keluarga" text="Tautan untuk pengunjung dan anggota keluarga" onClick={() => { window.dispatchEvent(new Event("family-share-open")); }} /></section>
            <section className="card">
              <h2>Identitas keluarga</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void run(async () =>
                    commit({
                      ...state,
                      familyName: String(data.get("familyName")).trim(),
                    }),
                  );
                }}
              >
                <label>
                  Nama keluarga besar
                  <input
                    name="familyName"
                    defaultValue={state.familyName}
                    required
                    maxLength={120}
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  <Check size={17} />
                  Simpan nama
                </button>
              </form>
            </section>
            <section className="card">
              <h2>Data dan cadangan</h2>
              <p className="muted">
                {native
                  ? "Data tersimpan di memori internal HP."
                  : "Salinan offline tersimpan di browser akun ini."}{" "}
                Menghapus aplikasi dapat menghapus data. Simpan cadangan secara
                berkala.
              </p>
              <SettingRow
                icon={<Download />}
                title="Cadangkan seluruh data"
                text="Anggota, hubungan, cerita dan foto dalam satu ZIP"
                onClick={() => void backup()}
              />
              <SettingRow
                icon={<Upload />}
                title="Pulihkan cadangan"
                text="Ganti data saat ini dari berkas cadangan"
                onClick={() => fileInput.current?.click()}
              />
              <input
                ref={fileInput}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => {
                  void importBackup(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <SettingRow
                icon={<FileText />}
                title="Ekspor bagan PDF"
                text="Pilihan A4 atau A3 dengan sambungan halaman"
                onClick={() => setModal({ type: "pdf" })}
              />
              <p className="backup-date">
                Cadangan terakhir:{" "}
                {state.settings.lastBackup
                  ? new Date(state.settings.lastBackup).toLocaleString("id-ID")
                  : "Belum pernah"}
              </p>
            </section>
            <section className="card">
              <h2>Keamanan dan pengingat</h2>
              <SettingRow
                icon={<LockKeyhole />}
                title="Atur PIN aplikasi"
                text="PIN 6 angka untuk mengunci akses"
                onClick={() => setModal({ type: "pin" })}
              />
              <SettingRow
                icon={<ShieldCheck />}
                title="Kunci sekarang"
                text="Berlaku jika PIN sudah diaktifkan"
                onClick={() =>
                  void run(async () => {
                    await lock();
                    const s = await securityStatus();
                    if (s.enabled) setLocked(true);
                    else setNotice("Aktifkan PIN terlebih dahulu.");
                  })
                }
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={state.settings.reminders}
                  disabled={busy}
                  onChange={(e) => {
                    const next = {
                      ...state,
                      settings: {
                        ...state.settings,
                        reminders: e.target.checked,
                      },
                    };
                    void run(async () => {
                      await commit(next);
                      await scheduleBirthdays(next, true);
                      setNotice(
                        native
                          ? "Pengaturan pengingat disimpan."
                          : "Pengingat notifikasi tersedia di APK Android.",
                      );
                    });
                  }}
                />
                Pengingat ulang tahun di HP
              </label>
              <div className="form-grid">
                <label>
                  Jam pengingat
                  <select
                    value={state.settings.hour}
                    onChange={(e) =>
                      void run(async () =>
                        commit({
                          ...state,
                          settings: {
                            ...state.settings,
                            hour: Number(e.target.value),
                          },
                        }),
                      )
                    }
                  >
                    {Array.from({ length: 24 }, (_, n) => (
                      <option key={n} value={n}>
                        {String(n).padStart(2, "0")}.00
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  29 Februari saat bukan kabisat
                  <select
                    value={state.settings.leapDay}
                    onChange={(e) =>
                      void run(async () =>
                        commit({
                          ...state,
                          settings: {
                            ...state.settings,
                            leapDay: e.target.value as "feb28" | "mar1",
                          },
                        }),
                      )
                    }
                  >
                    <option value="feb28">28 Februari</option>
                    <option value="mar1">1 Maret</option>
                  </select>
                </label>
              </div>
              <small>
                Notifikasi mengikuti izin dan pengaturan baterai HP. Waktu
                pengiriman tidak dijamin tepat.
              </small>
            </section>
            <section className="card">
              <SettingRow
                icon={<BookHeart />}
                title="Album kenangan"
                text={`${state.memories.length} cerita keluarga`}
                onClick={() => setPage("memories")}
              />
              <SettingRow
                icon={<Trash2 />}
                title="Sampah anggota"
                text="Pulihkan anggota atau hapus permanen"
                onClick={() => setPage("trash")}
              />
            </section>
            <p className="app-version">
              Silsilah Keluargaku · Versi web 0.2.3
              <br />
              Dibuat untuk menyambung cerita keluarga.
            </p>
          </>
        )}
        {page === "trash" && (
          <section className="card">
            <p className="muted">
              Anggota tidak dihapus otomatis. Periksa kembali setelah 30 hari.
              Hapus permanen juga menghapus seluruh hubungan anggota tersebut.
            </p>
            {state.persons
              .filter((p) => p.deletedAt)
              .map((p) => (
                <div className="trash-row" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      Dipindah{" "}
                      {new Date(p.deletedAt!).toLocaleDateString("id-ID")}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      void run(async () => {
                        await commit({
                          ...state,
                          persons: state.persons.map((x) =>
                            x.id === p.id ? { ...x, deletedAt: null } : x,
                          ),
                        });
                        setSelected(p.id);
                      })
                    }
                  >
                    <RefreshCw size={16} />
                    Pulihkan
                  </button>
                  <IconButton
                    label={"Hapus permanen " + p.name}
                    onClick={() =>
                      confirmAction(
                        "Hapus permanen",
                        `${p.name} dan seluruh hubungannya akan dihapus. Tindakan ini tidak dapat dibatalkan tanpa cadangan.`,
                        async () => commit(purge(state, p.id)),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </IconButton>
                </div>
              ))}
            {!state.persons.some((p) => p.deletedAt) && (
              <Empty
                icon={<Trash2 />}
                title="Sampah kosong"
                text="Anggota yang dihapus sementara akan muncul di sini."
              />
            )}
          </section>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Navigasi utama">
        {(
          [
            ["home", House, "Beranda"],
            ["tree", Network, "Pohon"],
            ["members", Users, "Anggota"],
            ["settings", Ellipsis, "Lainnya"],
          ] as const
        ).filter(([key]) => !publicView || key === "tree" || key === "members").map(([key, Icon, label]) => (
          <button
            key={key}
            className={
              page === key ||
              (key === "members" && page === "profile") ||
              (key === "settings" && ["memories", "trash"].includes(page))
                ? "active"
                : ""
            }
            onClick={() => setPage(key)}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          Memproses…
        </div>
      )}
      {modal?.type === "person" && (
        <PersonEditor
          state={state}
          person={modal.person}
          attach={modal.attach}
          commit={commit}
          close={() => setModal(null)}
          photos={photos}
          onPhoto={onPhoto}
        />
      )}
      {modal?.type === "relation" && (
        <RelationEditor
          state={state}
          anchor={modal.anchor}
          initialRelation={modal.initialRelation}
          link={modal.link}
          union={modal.union}
          commit={commit}
          close={() => setModal(null)}
          create={(attach) => setModal({ type: "person", attach })}
        />
      )}
      {modal?.type === "memory" && (
        <MemoryEditor
          state={state}
          memory={modal.memory}
          commit={commit}
          close={() => setModal(null)}
          onPhoto={onPhoto}
        />
      )}
      {modal?.type === "pin" && (
        <PinEditor
          close={() => setModal(null)}
          done={() => setNotice("Pengaturan PIN berhasil disimpan.")}
        />
      )}
      {modal?.type === "confirm" && (
        <Dialog title={modal.title} close={() => !busy && setModal(null)}>
          <p>{modal.message}</p>
          <div className="form-actions">
            <button
              className="secondary"
              onClick={() => setModal(null)}
              disabled={busy}
            >
              Batal
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await modal.action();
                  setModal(null);
                })
              }
            >
              Ya, lanjutkan
            </button>
          </div>
        </Dialog>
      )}
      {modal?.type === "pdf" && (
        <Dialog title="Ekspor bagan PDF" close={() => setModal(null)}>
          <p>
            Cakupan mengikuti anggota, arah dan kedalaman pilihan di halaman
            Pohon.
          </p>
          <label>
            Fokus anggota
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Pilih anggota</option>
              {people.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {direction === "all"
              ? "Seluruh keluarga"
              : direction === "both"
                ? "Leluhur dan keturunan"
                : direction === "ancestors"
                  ? "Leluhur"
                  : "Keturunan"}{" "}
            ·{" "}
            {depth === 0 || direction === "all"
              ? "Semua generasi"
              : `${depth} tingkat`}{" "}
            · {graph?.nodes.length ?? 0} anggota terlihat
          </p>
          <label>
            Ukuran kertas
            <select
              value={pdfSize}
              onChange={(e) => setPdfSize(e.target.value as "A4" | "A3")}
            >
              <option>A4</option>
              <option>A3</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={landscape}
              onChange={(e) => setLandscape(e.target.checked)}
            />
            Orientasi mendatar
          </label>
          <p className="muted">
            Bagan besar dibagi beberapa halaman. Setiap kartu mencantumkan
            halaman sambungannya.
          </p>
          <button
            className="primary full"
            disabled={!selected || busy}
            onClick={() =>
              void run(async () => {
                if (!selected) return;
                const { exportPdf } = await import("./pdf");
                const bytes = await exportPdf(
                  state,
                  selected,
                  direction,
                  depth,
                  pdfSize,
                  landscape,
                  collapsedBranches,
                );
                const saved = await saveFile(
                  "Silsilah_Keluarga.pdf",
                  "application/pdf",
                  bytes,
                );
                setNotice(
                  saved ? "PDF selesai dibuat." : "Penyimpanan PDF dibatalkan.",
                );
                if (saved) setModal(null);
              })
            }
          >
            <Download size={18} />
            Simpan PDF
          </button>
        </Dialog>
      )}
      {modal?.type === "update" && (
        <Dialog title="Update aplikasi" close={() => !busy && setModal(null)}>
          <p>
            Versi terpasang: <strong>0.2.3</strong>
          </p>
          <p>
            Unduh APK pembaruan terlebih dahulu, lalu pilih berkasnya di sini.
            Android akan meminta konfirmasi pemasangan.
          </p>
          <p className="muted">
            Cadangkan data sebelum memperbarui. Aplikasi lama tidak perlu
            dihapus. Menu ini memasang berkas lokal, belum memeriksa versi
            terbaru di internet.
          </p>
          <button
            className="secondary full"
            disabled={busy}
            onClick={() => void backup()}
          >
            <Download size={18} />
            Cadangkan data dahulu
          </button>
          <ErrorText error={error} />
          <button
            className="primary full"
            style={{ marginTop: 14 }}
            disabled={busy || !native}
            onClick={() =>
              void run(async () => {
                const result = await bridge.installUpdateFromFile();
                if (result.status === "cancelled")
                  setNotice("Pemilihan pembaruan dibatalkan.");
                else
                  setNotice(
                    "Pemasang Android ditutup. Periksa versi setelah pembaruan.",
                  );
              })
            }
          >
            <RefreshCw size={18} />
            Pilih APK pembaruan
          </button>
          {!native && (
            <p className="muted">
              Pemasangan pembaruan tersedia dalam APK Android.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function SettingRow({
  icon,
  title,
  text,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className="setting-row" onClick={onClick}>
      <span className="setting-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}
