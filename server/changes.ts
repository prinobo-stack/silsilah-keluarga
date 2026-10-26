import type { State } from "../src/domain.ts";
import { createHash } from "node:crypto";
type Snapshot = { state: State; files: Record<string, string> };
export function proposalChanges(before: Snapshot, after: Snapshot) {
  const changes: {
    section: string;
    name: string;
    before: unknown;
    after: unknown;
  }[] = [];
  const name = (id: string) =>
    after.state.persons.find((p) => p.id === id)?.name ??
    before.state.persons.find((p) => p.id === id)?.name ??
    id;
  for (const key of ["familyName", "rootId"] as const)
    if (before.state[key] !== after.state[key])
      changes.push({
        section: "Identitas keluarga",
        name: key,
        before: before.state[key],
        after: after.state[key],
      });
  for (const [key, label] of [
    ["persons", "Anggota"],
    ["parents", "Orang tua-anak"],
    ["siblings", "Kakak-adik"],
    ["unions", "Pasangan"],
    ["memories", "Cerita"],
    ["media", "Foto"],
  ] as const) {
    const a = new Map<string, any>(
      (before.state[key] ?? []).map((row) => [row.id, row]),
    );
    const b = new Map<string, any>(
      (after.state[key] ?? []).map((row) => [row.id, row]),
    );
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const old = a.get(id) ?? null,
        current = b.get(id) ?? null;
      const digest = (s: Snapshot) =>
        createHash("sha256")
          .update(s.files[id] ?? "")
          .digest("hex");
      const binaryChanged = key === "media" && digest(before) !== digest(after);
      if (JSON.stringify(old) === JSON.stringify(current) && !binaryChanged)
        continue;
      const row = current ?? old;
      const title =
        key === "persons"
          ? row.name
          : key === "parents"
            ? `${name(row.parentId)} → ${name(row.childId)}`
            : key === "siblings"
              ? `${name(row.olderId)} / ${name(row.youngerId)}`
              : key === "unions"
                ? row.members.map(name).join(" & ")
                : (row.title ?? row.name ?? id);
      changes.push({
        section: label,
        name: title,
        before: old,
        after: binaryChanged ? { ...current, isiFotoBerubah: true } : current,
      });
    }
  }
  return changes;
}
