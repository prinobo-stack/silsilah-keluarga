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

test("arah ke kanan menempatkan generasi pada kolom dan saudara pada baris terpisah", () => {
  let s = addParent(family(), "a", "b", "biological");
  s = addParent(s, "a", "c", "biological");
  s = addParent(s, "b", "d", "biological");
  const horizontal = treeGraph(s, "b", "all", 0, new Set(), "right");
  const vertical = treeGraph(s, "b", "all", 0);
  assert.deepEqual(horizontal.edges, vertical.edges);
  const nodes = new Map(horizontal.nodes.map((node) => [node.id, node]));
  const a = nodes.get("a")!, b = nodes.get("b")!, c = nodes.get("c")!, d = nodes.get("d")!;
  assert.ok(a.x + 156 < b.x && b.x + 156 < d.x);
  assert.equal(b.x, c.x);
  assert.ok(Math.abs(b.y - c.y) > 92);
  for (const node of horizontal.nodes) {
    assert.ok(node.x >= 40 && node.x + 156 <= horizontal.width);
    assert.ok(node.y >= 50 && node.y + 92 <= horizontal.height);
  }
});

test("urutan kelahiran satu keluarga stabil saat fokus berganti, termasuk pohon publik", async () => {
  const {publicFamily} = await import("../server/public-family.ts");
  let s = family();
  s.persons.push(person("pasangan", {birth: "1950"}), person("kembar"));
  s.persons.find(p => p.id === "d")!.birth = "1980";
  s.persons.find(p => p.id === "b")!.birth = "2000-04-18";
  s.persons.find(p => p.id === "kembar")!.birth = "2000-04-18";
  for (const id of ["b", "c", "kembar", "d"]) s = addParent(s, "a", id, "biological");
  s = addSibling(s, "kembar", "b");
  s.unions.push({id:"u", members:["b","pasangan"], status:"married", start:"", end:"", notes:""});
  const guest = publicFamily(s);
  assert.ok(guest.persons.every(p => p.birth === ""));
  const expected = ["d", "kembar", "b", "c"];
  for (const state of [s, guest]) {
    for (const orientation of ["right","down"] as const) {
      for (const focus of ["a", ...expected]) {
        const {nodes} = treeGraph(state, focus, "both", 0, new Set(), orientation);
        const axis = orientation === "right" ? "y" : "x";
        const siblings = nodes.filter(n => expected.includes(n.id)).sort((a,b) => a[axis] - b[axis]);
        assert.deepEqual(siblings.map(n => n.id), expected);
      }
    }
  }
});

test("hubungan kakak-adik tanpa orang tua atau tanggal tetap berurutan", () => {
  let s = addSibling(family(), "c", "a");
  s = addSibling(s, "a", "b");
  for (const orientation of ["right", "down"] as const) {
    for (const focus of ["a", "b", "c"]) {
      const {nodes} = treeGraph(s, focus, "both", 0, new Set(), orientation);
      const axis = orientation === "right" ? "y" : "x";
      const ids = nodes.sort((a,b) => a[axis] - b[axis]).map(n => n.id);
      assert.deepEqual(ids, ["c","a","b"].filter(id => ids.includes(id)));
    }
  }
});

test("kakak tanpa orang tua terlihat sebelum adik dalam cabang yang sama", () => {
  const s = addSibling(addParent(family(), "a", "b", "biological"), "c", "b");
  const {nodes, edges} = treeGraph(s, "b", "both", 0);
  assert.ok(nodes.find(n => n.id === "c")!.x < nodes.find(n => n.id === "b")!.x);
  assert.ok(!edges.some(e => e.from === "a" && e.to === "c"));
});
