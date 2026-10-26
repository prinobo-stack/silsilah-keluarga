import { emptyState, type Person, type State } from "../../src/domain.ts";
export function treeFixture(): State {
  const s = emptyState();
  s.rootId = "P";
  s.persons = ["G", "P", "C", "D", "U", "V", "X", "SP"].map(
    (id) =>
      ({
        id,
        name: id,
        nickname: "",
        sex: "U",
        birth: "",
        birthApprox: false,
        death: "",
        status: "unknown",
        place: "",
        notes: "",
        photoId: null,
        deletedAt: null,
        createdAt: "2026-10-24T00:00:00Z",
        updatedAt: "2026-10-24T00:00:00Z",
      }) as Person,
  );
  s.parents = [
    ["G", "P"],
    ["G", "U"],
    ["P", "C"],
    ["C", "D"],
    ["U", "V"],
  ].map(([parentId, childId], i) => ({
    id: "l" + i,
    parentId,
    childId,
    kind: "biological",
    role: "",
  }));
  s.unions = [
    {
      id: "union",
      members: ["P", "SP"],
      status: "married",
      start: "",
      end: "",
      notes: "",
    },
  ];
  return s;
}
