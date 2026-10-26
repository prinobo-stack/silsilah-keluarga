import { test } from "node:test";
import assert from "node:assert/strict";
import { addSibling, siblingsOf } from "../src/domain.ts";
import {
  addParent,
  age,
  emptyState,
  purge,
  treeGraph,
  upcoming,
  validDate,
  validateState,
  type Person,
  type State,
} from "../src/domain.ts";
function person(id: string, extra: Partial<Person> = {}): Person {
  return {
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}
function family(): State {
  return {
    ...emptyState(),
    persons: ["a", "b", "c", "d"].map((id) => person(id)),
  };
}
test("kakak dan adik tanpa orang tua mempunyai arah timbal balik", () => {
  const s = addSibling(family(), "a", "b");
  assert.equal(s.parents.length, 0);
  assert.equal(siblingsOf(s, "b")[0].label, "Kakak");
  assert.equal(siblingsOf(s, "a")[0].label, "Adik");
  assert.equal(siblingsOf(s, "a")[0].personId, "b");
  const graph = treeGraph(s, "b", "both", 2);
  assert.equal(graph.nodes[0].y, graph.nodes[1].y);
  assert.equal(graph.edges[0].kind, "sibling");
});
test("saudara menolak diri sendiri duplikat putaran dan leluhur", () => {
  const s = addSibling(family(), "a", "b");
  assert.throws(() => addSibling(s, "b", "a"), /sudah ada/);
  assert.throws(() => addSibling(s, "a", "a"), /tidak valid/);
  const n = addSibling(s, "b", "c");
  assert.throws(() => addSibling(n, "c", "a"), /putaran/);
  assert.throws(() => addParent(s, "a", "b", "biological"), /Leluhur/);
});
test("urutan kakak adik mengikuti rentang tanggal dan mengizinkan kembar", () => {
  const s = family();
  s.persons[0].birth = "2000";
  s.persons[1].birth = "1999";
  assert.throws(() => addSibling(s, "a", "b"), /lebih muda/);
  s.persons[1].birth = "2000";
  assert.doesNotThrow(() => addSibling(s, "a", "b"));
});
test("saudara dari orang tua yang sama dan penghapusan tetap konsisten", () => {
  let s = addParent(family(), "a", "b", "biological");
  s = addParent(s, "a", "c", "biological");
  s.persons[1].birth = "1980";
  s.persons[2].birth = "1990";
  assert.equal(siblingsOf(s, "c")[0].label, "Kakak");
  s = addSibling(s, "b", "c");
  assert.equal(siblingsOf(s, "b").length, 1);
  assert.equal(purge(s, "b").siblings?.length, 0);
  s.persons[1].deletedAt = new Date().toISOString();
  assert.equal(siblingsOf(s, "c").length, 0);
});
test("data versi sebelumnya tanpa siblings tetap dapat dibuka", () => {
  const s = family();
  delete s.siblings;
  validateState(s);
  assert.deepEqual(siblingsOf(s, "a"), []);
});
test("tanggal parsial dan kabisat tidak dipalsukan", () => {
  for (const s of [
    "",
    "1900",
    "2000-02",
    "2000-02-29",
    "2024-02-29",
    "0099-02-28",
  ])
    assert.ok(validDate(s), s);
  for (const s of [
    "1900-02-29",
    "2025-02-29",
    "2000-13",
    "0000",
    "2020-2-1",
    "2020-04-31",
  ])
    assert.ok(!validDate(s), s);
  assert.equal(age(person("x", { birth: "1990", status: "living" })), "");
});
test("siklus panjang termasuk adopsi ditolak tanpa mutasi", () => {
  let s = family();
  s = addParent(s, "a", "b", "biological");
  s = addParent(s, "b", "c", "adoptive");
  assert.throws(() => addParent(s, "c", "a", "biological"), /putaran/);
  assert.equal(s.parents.length, 2);
  assert.throws(() => addParent(s, "a", "a", "biological"), /diri/);
  assert.throws(() => addParent(s, "a", "b", "biological"), /sudah ada/);
});
test("pasangan bukan orang tua anak secara otomatis", () => {
  let s = addParent(family(), "a", "c", "biological");
  s.unions = [
    {
      id: "u1",
      members: ["a", "b"],
      status: "married",
      start: "",
      end: "",
      notes: "",
    },
    {
      id: "u2",
      members: ["a", "d"],
      status: "unknown",
      start: "",
      end: "",
      notes: "",
    },
  ];
  validateState(s);
  assert.equal(s.parents.length, 1);
  const g = treeGraph(s, "c", "ancestors", 3);
  assert.equal(g.nodes.filter((n) => n.id === "a").length, 1);
  assert.ok(g.edges.some((e) => e.kind === "union"));
  assert.ok(!g.edges.some((e) => e.from === "b" && e.to === "c"));
});
test("hapus permanen membersihkan referensi dan akar", () => {
  const s = addParent(family(), "a", "b", "biological");
  s.rootId = "a";
  s.memories = [
    {
      id: "m",
      title: "Cerita",
      body: "",
      date: "",
      personIds: ["a", "b"],
      mediaIds: [],
    },
  ];
  const n = purge(s, "a");
  assert.equal(n.rootId, null);
  assert.equal(n.parents.length, 0);
  assert.deepEqual(n.memories[0].personIds, ["b"]);
});
test("kelahiran dan wafat parsial dibandingkan berdasarkan rentang", () => {
  let s = family();
  s.persons[0] = {
    ...s.persons[0],
    birth: "2000",
    death: "1999",
    status: "deceased",
  };
  assert.throws(() => validateState(s), /mendahului/);
  s.persons[0].death = "2000";
  assert.doesNotThrow(() => validateState(s));
});
test("pengingat 29 Februari dan anggota wafat", () => {
  const s = emptyState();
  s.persons = [
    person("leap", { birth: "2000-02-29", status: "living" }),
    person("deceased", { birth: "1900-02-28", status: "deceased" }),
    person("partial", { birth: "2000", status: "living" }),
  ];
  s.settings.leapDay = "mar1";
  const result = upcoming(s, new Date(2025, 1, 27, 12));
  assert.equal(result.length, 1);
  assert.equal(result[0].date.getMonth(), 2);
  assert.equal(result[0].date.getDate(), 1);
  assert.equal(result[0].days, 2);
});
test("graph batas node dan data besar tidak overflow stack", () => {
  const s = emptyState();
  s.persons = Array.from({ length: 2000 }, (_, i) => person("p" + i));
  s.parents = s.persons.slice(1).map((p, i) => ({
    id: "l" + i,
    parentId: "p" + i,
    childId: p.id,
    kind: "biological",
    role: "",
  }));
  validateState(s);
  const g = treeGraph(s, "p0", "descendants", 3000);
  assert.equal(g.nodes.length, 2000);
  assert.equal(g.truncated, false);
});
test("data rusak dan relasi putus ditolak", () => {
  const s = family();
  s.parents = [
    {
      id: "l",
      parentId: "missing",
      childId: "a",
      kind: "biological",
      role: "",
    },
  ];
  assert.throws(() => validateState(s), /tidak ditemukan/);
  const n = family();
  n.persons.push(n.persons[0]);
  assert.throws(() => validateState(n), /duplikat/);
});
