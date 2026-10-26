export interface ProposalStatus {
  id: string;
  name: string;
  version: number;
  status: "pending" | "approved" | "rejected";
}
export interface ProposalAlert {
  id: string;
  proposalId: string;
  title: string;
  body: string;
  time: number;
  read: boolean;
}
export interface AlertState {
  seen: Record<string, string>;
  items: ProposalAlert[];
  initialized: boolean;
  pending: number;
}
export const emptyAlerts = (): AlertState => ({
  seen: {},
  items: [],
  initialized: false,
  pending: 0,
});
export function alertKey(userId: string, role: string) {
  return "silsilah-alerts:" + userId + ":" + role;
}
export function updateAlerts(
  previous: AlertState,
  rows: ProposalStatus[],
  role: string,
  now = Date.now(),
) {
  const seen = { ...previous.seen };
  const fresh: ProposalAlert[] = [];
  if (role === "viewer") return { state: emptyAlerts(), fresh, pending: 0 };
  for (const row of rows.slice(0, 100)) {
    if (
      !row ||
      typeof row.id !== "string" ||
      typeof row.name !== "string" ||
      !Number.isSafeInteger(row.version) ||
      !["pending", "approved", "rejected"].includes(row.status)
    )
      continue;
    const token = row.version + ":" + row.status;
    if (seen[row.id] !== token) {
      let title =
        row.status === "approved"
          ? "Usulan disetujui"
          : row.status === "rejected"
            ? "Usulan ditolak"
            : role === "owner"
              ? previous.initialized
                ? seen[row.id]
                  ? "Usulan diperbarui"
                  : "Usulan baru"
                : "Usulan menunggu"
              : "Usulan menunggu admin";
      fresh.push({
        id: row.id + ":" + token,
        proposalId: row.id,
        title,
        body:
          role === "owner"
            ? `${row.name} · versi ${row.version}`
            : `Usulan Anda · versi ${row.version}`,
        time: now,
        read: false,
      });
    }
    seen[row.id] = token;
  }
  const keep = Object.entries(seen).slice(-200);
  return {
    state: {
      initialized: true,
      pending: rows.filter((p) => p.status === "pending").length,
      seen: Object.fromEntries(keep),
      items: [
        ...fresh.reverse(),
        ...previous.items.filter((i) => !fresh.some((f) => f.id === i.id)),
      ].slice(0, 40),
    },
    fresh,
    pending: rows.filter((p) => p.status === "pending").length,
  };
}
