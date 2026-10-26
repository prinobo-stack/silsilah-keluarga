import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { addSibling, type Person } from "../src/domain.ts";
test("cadangan baru mempertahankan saudara dan cadangan lama diterima", async () => {
  const s = emptyState();
  s.persons = ["a", "b"].map(
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }) as Person,
  );
  const n = addSibling(s, "a", "b", "Kakak kandung");
  const r = await inspectBackup(await createBackup(n, async () => ""));
  assert.deepEqual(r.state.siblings, n.siblings);
  const old = emptyState();
  delete old.siblings;
  const z = await JSZip.loadAsync(await createBackup(old, async () => ""));
  const manifest = JSON.parse(await z.file("manifest.json")!.async("string"));
  delete manifest.counts.siblings;
  z.file("manifest.json", JSON.stringify(manifest));
  const result = await inspectBackup(
    await z.generateAsync({ type: "uint8array" }),
  );
  assert.equal(result.state.siblings, undefined);
});
import { emptyState } from "../src/domain.ts";
import { createBackup, inspectBackup } from "../src/backup.ts";
test("cadangan bolak balik lengkap termasuk foto dan kenangan", async () => {
  const s = emptyState();
  const data =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lR8AAAAASUVORK5CYII=";
  const size = Buffer.from(data.split(",")[1], "base64").length;
  s.media = [{ id: "photo", mime: "image/png", name: "Foto.png", size }];
  s.memories = [
    {
      id: "m1",
      title: "Kenangan",
      body: "Tulisan dengan aksara dan é",
      date: "2000",
      personIds: [],
      mediaIds: ["photo"],
    },
  ];
  const result = await inspectBackup(await createBackup(s, async () => data));
  assert.deepEqual(result.state, s);
  assert.equal(result.files.photo, data);
});
test("perubahan data di ZIP terdeteksi checksum", async () => {
  const zip = await JSZip.loadAsync(
    await createBackup(emptyState(), async () => ""),
  );
  zip.file("data.json", "{}");
  await assert.rejects(
    () => zip.generateAsync({ type: "uint8array" }).then(inspectBackup),
    /Checksum/,
  );
});
test("ZIP traversal dan versi mendatang ditolak", async () => {
  const zip = new JSZip();
  zip.file("../media/evil", "payload");
  zip.file("manifest.json", "{}");
  await assert.rejects(
    () => zip.generateAsync({ type: "uint8array" }).then(inspectBackup),
    /Path/,
  );
  const z = await JSZip.loadAsync(
    await createBackup(emptyState(), async () => ""),
  );
  const mf = JSON.parse(await z.file("manifest.json")!.async("string"));
  mf.format_version = 2;
  z.file("manifest.json", JSON.stringify(mf));
  await assert.rejects(
    () => z.generateAsync({ type: "uint8array" }).then(inspectBackup),
    /Versi/,
  );
});
test("foto hilang tidak menghasilkan cadangan sukses", async () => {
  const s = emptyState();
  s.media = [{ id: "missing", mime: "image/jpeg", name: "Foto", size: 100 }];
  await assert.rejects(
    () => createBackup(s, async () => ""),
    /tidak ditemukan/,
  );
});
