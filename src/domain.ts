export type TreeLineStyle = "curve" | "straight" | "elbow";
export type Sex = "M" | "F" | "U";
export interface Person {
  id: string;
  name: string;
  nickname: string;
  nik?: string;
  phone?: string;
  religion?: string;
  address?: string;
  addressMode?: "auto" | "manual";
  sex: Sex;
  birth: string;
  birthApprox: boolean;
  death: string;
  status: "living" | "deceased" | "unknown";
  place: string;
  notes: string;
  photoId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
/** Resolve live addresses without copying them into descendants. Older records default to auto. */
export function resolveAddress(
  s: State,
  personId: string,
): { address: string; sourceId: string | null } {
  const people = new Map(
    s.persons.filter((p) => !p.deletedAt).map((p) => [p.id, p]),
  );
  const parents = new Map<string, string[]>();
  for (const link of s.parents) {
    if (people.has(link.parentId) && people.has(link.childId)) {
      const ids = parents.get(link.childId) ?? [];
      if (!ids.includes(link.parentId)) ids.push(link.parentId);
      parents.set(link.childId, ids);
    }
  }
  const queue = [personId],
    seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (seen.has(id)) continue;
    seen.add(id);
    const person = people.get(id);
    if (!person) continue;
    // An existing address without a mode is treated as a manual legacy value.
    if (
      person.addressMode === "manual" ||
      (person.addressMode === undefined && person.address)
    ) {
      if (id === personId || person.address?.trim())
        return { address: person.address ?? "", sourceId: id };
      continue;
    }
    queue.push(...(parents.get(id) ?? []));
  }
  return { address: "", sourceId: null };
}

export interface ParentLink {
  id: string;
  parentId: string;
  childId: string;
  kind: "biological" | "adoptive" | "step";
  role: string;
}
export interface SiblingLink {
  id: string;
  olderId: string;
  youngerId: string;
  notes: string;
}
export interface Union {
  id: string;
  members: [string, string];
  status: "married" | "divorced" | "separated" | "unknown";
  start: string;
  end: string;
  notes: string;
}
export interface Media {
  id: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
  name: string;
  size: number;
}
export interface Memory {
  id: string;
  title: string;
  body: string;
  date: string;
  personIds: string[];
  mediaIds: string[];
}
export interface FamilyEvent {
  id: string; title: string; date: string; time: string; location: string; notes: string;
}
export interface State {
  schemaVersion: 1;
  familyName: string;
  rootId: string | null;
  persons: Person[];
  parents: ParentLink[];
  siblings?: SiblingLink[];
  unions: Union[];
  media: Media[];
  memories: Memory[];
  events?: FamilyEvent[];
  settings: {
    treeLineStyle?: TreeLineStyle;
    reminders: boolean;
    hour: number;
    leapDay: "feb28" | "mar1";
    lastBackup: string | null;
  };
}
export const uuid = () => crypto.randomUUID();
export function emptyState(): State {
  return {
    schemaVersion: 1,
    familyName: "Keluarga Besarku",
    rootId: null,
    persons: [],
    parents: [],
    siblings: [],
    unions: [],
    media: [],
    memories: [],
    settings: { reminders: false, hour: 8, leapDay: "feb28", lastBackup: null },
  };
}
export const active = (s: State) => s.persons.filter((p) => !p.deletedAt);
export function validDate(s: string): boolean {
  if (s === "") return true;
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (y < 1 || y > 9999) return false;
  if (m === undefined) return true;
  if (m < 1 || m > 12) return false;
  if (d === undefined) return true;
  return (
    d >= 1 && d <= new Date(Date.UTC(y < 100 ? y + 400 : y, m, 0)).getUTCDate()
  );
}
export function dateText(s: string) {
  if (!s) return "Belum diketahui";
  if (s.length === 4) return s;
  if (s.length === 7)
    return new Date(s + "-01T12:00:00").toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });
  return new Date(s + "T12:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function bounds(s: string): [string, string] {
  return [
    s.length === 4 ? s + "-01-01" : s.length === 7 ? s + "-01" : s,
    s.length === 4 ? s + "-12-31" : s.length === 7 ? s + "-31" : s,
  ];
}
export function age(p: Person, now = new Date()): string {
  if (p.birth.length !== 10 || p.birthApprox) return "";
  const end =
    p.status === "deceased"
      ? p.death.length === 10
        ? new Date(p.death + "T12:00:00")
        : null
      : p.status === "living"
        ? now
        : null;
  if (!end) return "";
  const b = new Date(p.birth + "T12:00:00");
  let n = end.getFullYear() - b.getFullYear();
  if (
    end.getMonth() < b.getMonth() ||
    (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())
  )
    n--;
  return n < 0 ? "" : `${n} tahun`;
}
export function validateState(s: State): void {
  if (!s || s.schemaVersion !== 1) throw Error("Versi data tidak didukung.");
  if (
    typeof s.familyName !== "string" ||
    !s.familyName.trim() ||
    s.familyName.length > 120
  )
    throw Error("Nama keluarga harus diisi, maksimal 120 karakter.");
  for (const key of [
    "persons",
    "parents",
    "unions",
    "media",
    "memories",
  ] as const) {
    if (!Array.isArray(s[key]) || s[key].length > 20000)
      throw Error("Struktur atau jumlah data tidak valid.");
  }
  const ids = (rows: { id: string }[]) => {
    const out = new Set<string>();
    for (const x of rows) {
      if (
        !x ||
        typeof x.id !== "string" ||
        !/^[a-zA-Z0-9-]{1,64}$/.test(x.id) ||
        out.has(x.id)
      )
        throw Error("ID data duplikat atau tidak valid.");
      out.add(x.id);
    }
    return out;
  };
  if (
    s.settings?.treeLineStyle !== undefined &&
    !["curve", "straight", "elbow"].includes(s.settings.treeLineStyle)
  )
    throw Error("Model garis pohon tidak valid.");
  if (s.events !== undefined) {
    if (!Array.isArray(s.events) || s.events.length > 20000) throw Error("Daftar agenda tidak valid.");
    ids(s.events);
    for (const e of s.events) {
      if (typeof e.title !== "string" || !e.title.trim() || e.title.length > 160 ||
          typeof e.date !== "string" || e.date.length !== 10 || !validDate(e.date) ||
          typeof e.time !== "string" || (e.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) ||
          typeof e.location !== "string" || e.location.length > 500 ||
          typeof e.notes !== "string" || e.notes.length > 5000) throw Error("Isian agenda keluarga tidak valid.");
    }
  }
  const people = ids(s.persons),
    media = ids(s.media);
  ids(s.parents);
  ids(s.unions);
  ids(s.memories);
  if (
    s.siblings !== undefined &&
    (!Array.isArray(s.siblings) || s.siblings.length > 20000)
  )
    throw Error("Data saudara tidak valid.");
  ids(s.siblings ?? []);
  const txt = (v: unknown, max = 10000) =>
    typeof v === "string" && v.length <= max;
  for (const p of s.persons) {
    if ((p.phone !== undefined && !txt(p.phone, 40)) || (p.religion !== undefined && !txt(p.religion, 100))) throw Error("Nomor HP atau agama anggota tidak valid.");
    if (
      p.nik !== undefined &&
      (typeof p.nik !== "string" ||
        (p.nik !== "" && !/^[0-9]{16}$/.test(p.nik)))
    )
      throw Error("NIK harus kosong atau tepat 16 angka.");
    if (
      (p.address !== undefined && !txt(p.address, 1000)) ||
      (p.addressMode !== undefined &&
        !["auto", "manual"].includes(p.addressMode))
    )
      throw Error("Alamat anggota tidak valid.");
    if (
      !txt(p.name, 160) ||
      !p.name.trim() ||
      !txt(p.nickname, 160) ||
      !txt(p.notes) ||
      !txt(p.place, 300) ||
      !["M", "F", "U"].includes(p.sex) ||
      !["living", "deceased", "unknown"].includes(p.status) ||
      typeof p.birthApprox !== "boolean" ||
      !validDate(p.birth) ||
      !validDate(p.death) ||
      !txt(p.createdAt, 40) ||
      !txt(p.updatedAt, 40) ||
      (p.deletedAt !== null &&
        (!txt(p.deletedAt, 40) || isNaN(Date.parse(p.deletedAt))))
    )
      throw Error("Biodata atau tanggal anggota tidak valid.");
    if (p.birth && p.death && bounds(p.death)[1] < bounds(p.birth)[0])
      throw Error("Tanggal wafat mendahului kelahiran.");
    if (p.status !== "deceased" && p.death)
      throw Error("Tanggal wafat hanya untuk anggota yang wafat.");
    if (p.photoId !== null && !media.has(p.photoId))
      throw Error("Foto profil tidak ditemukan.");
  }
  if (s.rootId !== null && !people.has(s.rootId))
    throw Error("Akar keluarga tidak ditemukan.");
  const edges = new Map<string, string[]>(),
    pairs = new Set<string>();
  for (const l of s.parents) {
    if (!people.has(l.parentId) || !people.has(l.childId))
      throw Error("Anggota hubungan tidak ditemukan.");
    if (l.parentId === l.childId)
      throw Error("Seseorang tidak dapat menjadi orang tua dirinya sendiri.");
    if (!["biological", "adoptive", "step"].includes(l.kind) || !txt(l.role, 80))
      throw Error("Jenis hubungan tidak valid.");
    const k = [l.parentId, l.childId, l.kind].join("|");
    if (pairs.has(k)) throw Error("Hubungan orang tua sudah ada.");
    pairs.add(k);
    edges.set(l.parentId, [...(edges.get(l.parentId) || []), l.childId]);
  }
  // Iterative topological sort also handles graphs too deep for the JS call stack.
  const incoming = new Map([...people].map((id) => [id, 0]));
  for (const children of edges.values())
    for (const c of children) incoming.set(c, incoming.get(c)! + 1);
  const queue = [...people].filter((id) => incoming.get(id) === 0);
  let n = 0;
  for (let i = 0; i < queue.length; i++) {
    n++;
    for (const c of edges.get(queue[i]) || []) {
      incoming.set(c, incoming.get(c)! - 1);
      if (incoming.get(c) === 0) queue.push(c);
    }
  }
  if (n !== people.size)
    throw Error(
      "Hubungan membentuk putaran silsilah. Periksa kembali orang tua dan anak.",
    );
  for (const u of s.unions) {
    if (
      !Array.isArray(u.members) ||
      u.members.length !== 2 ||
      u.members[0] === u.members[1] ||
      u.members.some((id) => !people.has(id))
    )
      throw Error("Pasangan harus dua anggota yang berbeda.");
    if (
      !["married", "divorced", "separated", "unknown"].includes(u.status) ||
      !validDate(u.start) ||
      !validDate(u.end) ||
      !txt(u.notes)
    )
      throw Error("Data pasangan tidak valid.");
    if (u.start && u.end && bounds(u.end)[1] < bounds(u.start)[0])
      throw Error("Akhir hubungan mendahului awal hubungan.");
  }
  for (const m of s.media)
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(m.mime) ||
      !txt(m.name, 200) ||
      !Number.isSafeInteger(m.size) ||
      m.size < 1 ||
      m.size > 12 * 1024 * 1024
    )
      throw Error("Media tidak valid.");
  for (const m of s.memories)
    if (
      !txt(m.title, 160) ||
      !m.title.trim() ||
      !txt(m.body) ||
      !validDate(m.date) ||
      !Array.isArray(m.personIds) ||
      !Array.isArray(m.mediaIds) ||
      new Set(m.personIds).size !== m.personIds.length ||
      new Set(m.mediaIds).size !== m.mediaIds.length ||
      m.personIds.some((id) => !people.has(id)) ||
      m.mediaIds.some((id) => !media.has(id))
    )
      throw Error("Kenangan atau tautan medianya tidak valid.");
  const c = s.settings;
  const siblingPairs = new Set<string>(),
    order = new Map<string, string[]>();
  for (const l of s.siblings ?? []) {
    if (
      !people.has(l.olderId) ||
      !people.has(l.youngerId) ||
      l.olderId === l.youngerId ||
      !txt(l.notes, 80)
    )
      throw Error("Hubungan kakak atau adik tidak valid.");
    const key = [l.olderId, l.youngerId].sort().join("|");
    if (siblingPairs.has(key))
      throw Error(
        "Hubungan saudara sudah ada. Hapus atau perbaiki hubungan lama.",
      );
    siblingPairs.add(key);
    const declaredKind = /^Saudara (kandung|tiri|seayah|seibu)(?:$| ·)/.exec(l.notes)?.[1];
    if (declaredKind) {
      const left = new Set(s.parents.filter(p => p.childId === l.olderId && p.kind === "biological").map(p => p.parentId));
      const right = new Set(s.parents.filter(p => p.childId === l.youngerId && p.kind === "biological").map(p => p.parentId));
      const common = [...left].filter(id => right.has(id)).length;
      if (declaredKind === "tiri" && common) throw Error("Saudara yang berbagi orang tua kandung bukan saudara tiri.");
      if (left.size >= 2 && right.size >= 2 && ((declaredKind === "kandung" && common !== 2) || (["seayah", "seibu"].includes(declaredKind) && common !== 1))) throw Error("Jenis saudara tidak sesuai dengan data orang tua kandung.");
    }
    const a = s.persons.find((p) => p.id === l.olderId)!,
      b = s.persons.find((p) => p.id === l.youngerId)!;
    if (
      a.birth &&
      b.birth &&
      !a.birthApprox &&
      !b.birthApprox &&
      bounds(a.birth)[0] > bounds(b.birth)[1]
    )
      throw Error(
        "Tanggal lahir kakak lebih muda daripada adik. Periksa pilihan hubungan.",
      );
    const reaches = (from: string, to: string) => {
      const visited = new Set<string>(),
        queue = [from];
      for (let i = 0; i < queue.length; i++) {
        const n = queue[i];
        if (n === to) return true;
        if (visited.has(n)) continue;
        visited.add(n);
        queue.push(...(edges.get(n) ?? []));
      }
      return false;
    };
    if (reaches(l.olderId, l.youngerId) || reaches(l.youngerId, l.olderId))
      throw Error(
        "Leluhur dan keturunannya tidak dapat dicatat sebagai kakak atau adik.",
      );
    order.set(l.olderId, [...(order.get(l.olderId) ?? []), l.youngerId]);
  }
  const degrees = new Map([...people].map((id) => [id, 0]));
  for (const list of order.values())
    for (const id of list) degrees.set(id, degrees.get(id)! + 1);
  const ready = [...people].filter((id) => degrees.get(id) === 0);
  for (let i = 0; i < ready.length; i++)
    for (const id of order.get(ready[i]) ?? []) {
      degrees.set(id, degrees.get(id)! - 1);
      if (degrees.get(id) === 0) ready.push(id);
    }
  if (ready.length !== people.size)
    throw Error("Urutan kakak dan adik membentuk putaran.");
  if (
    !c ||
    typeof c.reminders !== "boolean" ||
    !Number.isInteger(c.hour) ||
    c.hour < 0 ||
    c.hour > 23 ||
    !["feb28", "mar1"].includes(c.leapDay) ||
    (c.lastBackup !== null &&
      (!txt(c.lastBackup, 40) || isNaN(Date.parse(c.lastBackup))))
  )
    throw Error("Pengaturan tidak valid.");
}
export function related(s: State, id: string) {
  const live = new Set(active(s).map((p) => p.id));
  return {
    parents: s.parents.filter((l) => l.childId === id && live.has(l.parentId)),
    children: s.parents.filter((l) => l.parentId === id && live.has(l.childId)),
    unions: s.unions.filter(
      (u) => u.members.includes(id) && u.members.every((m) => live.has(m)),
    ),
  };
}
export function addParent(
  s: State,
  parentId: string,
  childId: string,
  kind: ParentLink["kind"],
  role = "",
): State {
  const next = {
    ...s,
    parents: [...s.parents, { id: uuid(), parentId, childId, kind, role }],
  };
  validateState(next);
  return next;
}
export function addSibling(
  s: State,
  olderId: string,
  youngerId: string,
  notes = "",
): State {
  const next = {
    ...s,
    siblings: [
      ...(s.siblings ?? []),
      { id: uuid(), olderId, youngerId, notes },
    ],
  };
  validateState(next);
  return next;
}
export function siblingsOf(s: State, id: string) {
  const rows: {
      personId: string;
      label: string;
      linkId: string | null;
      notes: string;
    }[] = [],
    seen = new Set<string>();
  for (const l of s.siblings ?? []) {
    if (l.olderId !== id && l.youngerId !== id) continue;
    const other = l.olderId === id ? l.youngerId : l.olderId;
    if (!s.persons.some((p) => p.id === other && !p.deletedAt)) continue;
    rows.push({
      personId: other,
      label: l.olderId === id ? "Adik" : "Kakak",
      linkId: l.id,
      notes: l.notes,
    });
    seen.add(other);
  }
  const parents = new Set(
    s.parents.filter((l) => l.childId === id && l.kind === "biological").map((l) => l.parentId),
  );
  const self = s.persons.find((p) => p.id === id);
  for (const l of s.parents) {
    if (l.kind !== "biological" || l.childId === id || !parents.has(l.parentId) || seen.has(l.childId))
      continue;
    const p = s.persons.find((p) => p.id === l.childId && !p.deletedAt);
    if (!p) continue;
    let label = "Saudara";
    if (self?.birth && p.birth && !self.birthApprox && !p.birthApprox) {
      if (bounds(p.birth)[1] < bounds(self.birth)[0]) label = "Kakak";
      else if (bounds(p.birth)[0] > bounds(self.birth)[1]) label = "Adik";
    }
    rows.push({
      personId: p.id,
      label,
      linkId: null,
      notes: "Berbagi orang tua kandung; jenis saudara belum dikonfirmasi",
    });
    seen.add(p.id);
  }
  return rows;
}
export function purge(s: State, id: string): State {
  const next = {
    ...s,
    persons: s.persons.filter((p) => p.id !== id),
    parents: s.parents.filter((l) => l.parentId !== id && l.childId !== id),
    siblings: (s.siblings ?? []).filter(
      (l) => l.olderId !== id && l.youngerId !== id,
    ),
    unions: s.unions.filter((u) => !u.members.includes(id)),
    memories: s.memories.map((m) => ({
      ...m,
      personIds: m.personIds.filter((x) => x !== id),
    })),
    rootId: s.rootId === id ? null : s.rootId,
  };
  validateState(next);
  return next;
}
export function upcoming(s: State, now = new Date()) {
  return active(s)
    .filter((p) => p.status === "living" && p.birth.length === 10)
    .map((p) => {
      const [, m, d] = p.birth.split("-").map(Number);
      const year = now.getFullYear();
      const occurrence = (y: number) => {
        const leap = new Date(y, 1, 29).getMonth() === 1;
        if (m === 2 && d === 29 && !leap)
          return new Date(
            y,
            s.settings.leapDay === "mar1" ? 2 : 1,
            s.settings.leapDay === "mar1" ? 1 : 28,
            s.settings.hour,
          );
        return new Date(y, m - 1, d, s.settings.hour);
      };
      let date = occurrence(year);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (date < today) date = occurrence(year + 1);
      const days = Math.round(
        (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
          Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
          86400000,
      );
      return { person: p, date, days };
    })
    .sort((a, b) => a.days - b.days);
}
export type TreeDirection = "all" | "both" | "ancestors" | "descendants";
export interface TreeNode {
  id: string;
  personId: string;
  x: number;
  y: number;
  label: string;
  childCount: number;
  collapsed: boolean;
  focused: boolean;
}
export interface TreeEdge {
  from: string;
  to: string;
  kind: "biological" | "adoptive" | "step" | "union" | "sibling";
  focused: boolean;
}
/** depth=0 means all generations. Collapse changes the view, never the data. */
export function treeGraph(
  s: State,
  focus: string,
  direction: TreeDirection,
  depth: number,
  collapsed: ReadonlySet<string> = new Set(),
) {
  const people = active(s),
    byId = new Map(people.map((p) => [p.id, p]));
  const children = new Map<string, string[]>(),
    parents = new Map<string, string[]>();
  const parentLinks = s.parents.filter(
    (l) => byId.has(l.parentId) && byId.has(l.childId),
  );
  for (const l of parentLinks) {
    children.set(l.parentId, [...(children.get(l.parentId) ?? []), l.childId]);
    parents.set(l.childId, [...(parents.get(l.childId) ?? []), l.parentId]);
  }
  const nodes: TreeNode[] = [],
    edges: TreeEdge[] = [];
  const empty = {
    nodes,
    edges,
    width: 600,
    height: 400,
    truncated: false,
    hiddenCount: 0,
    totalNodes: 0,
  };
  if (!byId.has(focus)) return empty;
  const collect = (
    start: string,
    links: Map<string, string[]>,
    limit: number,
  ) => {
    const distances = new Map<string, number>([[start, 0]]),
      queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i],
        d = distances.get(id)!;
      if (limit > 0 && d >= limit) continue;
      for (const next of links.get(id) ?? [])
        if (!distances.has(next)) {
          distances.set(next, d + 1);
          queue.push(next);
        }
    }
    return new Set(distances.keys());
  };
  const ancestors = collect(focus, parents, depth),
    descendants = collect(focus, children, depth);
  const primary = new Set<string>(
    direction === "all"
      ? byId.keys()
      : direction === "ancestors"
        ? ancestors
        : direction === "descendants"
          ? descendants
          : [...ancestors, ...descendants],
  );
  const siblingRows =
    direction === "both" || direction === "all" ? siblingsOf(s, focus) : [];
  if (direction === "both")
    for (const row of siblingRows) primary.add(row.personId);
  const visible = new Set(primary),
    unions = s.unions.filter((u) => u.members.every((id) => byId.has(id)));
  // Only spouses of actual scope members are context; do not recursively pull in unrelated branches.
  for (const u of unions)
    if (u.members.some((id) => primary.has(id)))
      for (const id of u.members) visible.add(id);
  const totalNodes = visible.size;
  if (direction !== "ancestors" && collapsed.size) {
    const protect =
      direction === "descendants"
        ? new Set([focus])
        : collect(focus, parents, 0);
    const hidden = new Set<string>(),
      queue: string[] = [];
    for (const id of collapsed) queue.push(...(children.get(id) ?? []));
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (hidden.has(id) || protect.has(id)) continue;
      hidden.add(id);
      queue.push(...(children.get(id) ?? []));
    }
    for (const id of hidden) if (!protect.has(id)) visible.delete(id);
    // Hide context-only spouses when their scope member is hidden.
    for (const id of [...visible])
      if (
        !primary.has(id) &&
        !unions.some(
          (u) =>
            u.members.includes(id) &&
            u.members.some((other) => primary.has(other) && visible.has(other)),
        )
      )
        visible.delete(id);
  }
  // Topological generations keep every parent above its children, including shared ancestors.
  const degree = new Map(
    people.map((p) => [p.id, parents.get(p.id)?.length ?? 0]),
  );
  const order = people.filter((p) => degree.get(p.id) === 0).map((p) => p.id);
  for (let i = 0; i < order.length; i++)
    for (const child of children.get(order[i]) ?? []) {
      degree.set(child, degree.get(child)! - 1);
      if (degree.get(child) === 0) order.push(child);
    }
  const generations = new Map<string, number>();
  for (const id of order) {
    let generation = 0;
    for (const parent of parents.get(id) ?? [])
      generation = Math.max(generation, (generations.get(parent) ?? 0) + 1);
    generations.set(id, generation);
  }
  // A spouse with unknown ancestry can share the known partner's generation.
  const seeds = new Map<string, number>();
  const peers = [
    ...unions.map((u) => u.members),
    ...(s.siblings ?? []).map((l) => [l.olderId, l.youngerId]),
  ];
  for (const pair of peers) {
    if (!pair.every((id) => byId.has(id))) continue;
    const known = pair.find((id) => (parents.get(id)?.length ?? 0) > 0),
      unknown = pair.find((id) => (parents.get(id)?.length ?? 0) === 0);
    if (known && unknown && !collect(unknown, children, 0).has(known))
      seeds.set(
        unknown,
        Math.max(seeds.get(unknown) ?? 0, generations.get(known) ?? 0),
      );
  }
  if (seeds.size)
    for (const id of order) {
      let generation = seeds.get(id) ?? 0;
      for (const parent of parents.get(id) ?? [])
        generation = Math.max(generation, (generations.get(parent) ?? 0) + 1);
      generations.set(id, generation);
    }
  const focusGeneration = generations.get(focus) ?? 0,
    levels = new Map<string, number>();
  for (const id of visible)
    levels.set(id, (generations.get(id) ?? 0) - focusGeneration);
  for (const u of unions)
    if (u.members.every((id) => visible.has(id))) {
      const known = u.members.find((id) => primary.has(id));
      if (known)
        for (const id of u.members)
          if (!primary.has(id)) levels.set(id, levels.get(known)!);
    }
  if (direction === "both")
    for (const row of siblingRows)
      if (
        visible.has(row.personId) &&
        !ancestors.has(row.personId) &&
        !descendants.has(row.personId)
      )
        levels.set(row.personId, 0);
  let min = 0,
    max = 0;
  for (const l of levels.values()) {
    min = Math.min(min, l);
    max = Math.max(max, l);
  }
  // Keep each family's descendants within its own horizontal interval.
  // Same-generation spouses form one layout unit; shared children still remain one person.
  const representative = new Map([...visible].map((id) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (representative.get(root)! !== root) root = representative.get(root)!;
    while (id !== root) {
      const next = representative.get(id)!;
      representative.set(id, root);
      id = next;
    }
    return root;
  };
  for (const u of unions) {
    const [a, b] = u.members;
    if (visible.has(a) && visible.has(b) && levels.get(a) === levels.get(b))
      representative.set(find(b), find(a));
  }
  type Unit = {
    id: string;
    members: string[];
    level: number;
    children: Unit[];
    width: number;
    left: number;
  };
  const units = new Map<string, Unit>();
  for (const id of visible) {
    const key = find(id);
    if (!units.has(key))
      units.set(key, {
        id: key,
        members: [],
        level: levels.get(id)!,
        children: [],
        width: 0,
        left: 0,
      });
    units.get(key)!.members.push(id);
  }
  const owners = new Map<string, Unit>();
  for (const l of parentLinks) {
    if (!visible.has(l.parentId) || !visible.has(l.childId)) continue;
    const parent = units.get(find(l.parentId))!,
      child = units.get(find(l.childId))!;
    if (parent === child || parent.level >= child.level) continue;
    const current = owners.get(child.id);
    if (!current || parent.level > current.level) owners.set(child.id, parent);
  }
  for (const unit of units.values()) owners.get(unit.id)?.children.push(unit);
  const sortedUnits = [...units.values()].sort((a, b) => a.level - b.level);
  const branchGap = 76,
    memberStep = 184;
  for (const unit of [...sortedUnits].reverse()) {
    const ownWidth = unit.members.length * memberStep - 28;
    const descendantsWidth =
      unit.children.reduce((sum, c) => sum + c.width, 0) +
      Math.max(0, unit.children.length - 1) * branchGap;
    unit.width = Math.max(ownWidth, descendantsWidth);
  }
  const roots = sortedUnits.filter((u) => !owners.has(u.id));
  let nextLeft = 40;
  for (const root of roots) {
    root.left = nextLeft;
    nextLeft += root.width + 110;
  }
  // Iterative positioning supports long lineages without recursive stack growth.
  const placement = [...roots];
  for (let i = 0; i < placement.length; i++) {
    const unit = placement[i];
    const ownWidth = unit.members.length * memberStep - 28;
    const ownLeft = unit.left + (unit.width - ownWidth) / 2;
    unit.members.forEach((id, index) =>
      nodes.push({
        id,
        personId: id,
        x: ownLeft + index * memberStep,
        y: 50 + (unit.level - min) * 155,
        label: byId.get(id)!.name,
        focused: ancestors.has(id) || descendants.has(id),
        childCount: new Set(children.get(id) ?? []).size,
        collapsed: collapsed.has(id),
      }),
    );
    const childWidth =
      unit.children.reduce((sum, c) => sum + c.width, 0) +
      Math.max(0, unit.children.length - 1) * branchGap;
    let left = unit.left + (unit.width - childWidth) / 2;
    for (const child of unit.children) {
      child.left = left;
      left += child.width + branchGap;
      placement.push(child);
    }
  }
  const width = Math.max(600, nextLeft - 110 + 40);
  for (const l of parentLinks)
    if (visible.has(l.parentId) && visible.has(l.childId))
      edges.push({
        from: l.parentId,
        to: l.childId,
        kind: l.kind,
        focused:
          (ancestors.has(l.parentId) && ancestors.has(l.childId)) ||
          (descendants.has(l.parentId) && descendants.has(l.childId)),
      });
  for (const u of unions)
    if (u.members.every((id) => visible.has(id)))
      edges.push({
        from: u.members[0],
        to: u.members[1],
        kind: "union",
        focused: false,
      });
  for (const row of siblingRows)
    if (row.linkId && visible.has(row.personId))
      edges.push({
        from: focus,
        to: row.personId,
        kind: "sibling",
        focused: false,
      });
  return {
    nodes,
    edges,
    width,
    height: (max - min + 1) * 155 + 65,
    truncated: false,
    hiddenCount: totalNodes - visible.size,
    totalNodes,
  };
}
