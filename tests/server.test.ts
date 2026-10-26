import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createFamilyServer } from "../server/app.ts";
import { createBackup, inspectBackup } from "../src/backup.ts";
import { treeFixture } from "./fixtures/tree.ts";

test("server keluarga menegakkan akun publik privasi revisi dan pencabutan akses", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "silsilah-server-test-"));
  const app = await createFamilyServer({
    database: process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost/test",
    origin: "http://localhost",
    bootstrapToken: "test-activation-only",
    staticDir: join(process.cwd(), "dist"),
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const url = "http://127.0.0.1:" + (app.address() as any).port;
  const req = (
    path: string,
    data?: unknown,
    cookie = "",
    method = data === undefined ? "GET" : "POST",
    headers: Record<string, string> = {},
  ) =>
    fetch(url + "/api/" + path, {
      method,
      headers: {
        Origin: "http://localhost",
        Cookie: cookie,
        ...(data === undefined
          ? {}
          : {
              "Content-Type":
                data instanceof Uint8Array
                  ? "application/zip"
                  : "application/json",
            }),
        ...headers,
      },
      body:
        data === undefined
          ? undefined
          : data instanceof Uint8Array
            ? new Blob([new Uint8Array(data).buffer])
            : JSON.stringify(data),
    });
  const account = {
    name: "Pemilik",
    login: "pemilik",
    password: "kata-sandi-uji-123",
    code: "test-activation-only",
  };
  let owner = "",
    viewer = "",
    editor = "",
    viewerId = "";
  try {
    await t.test("aktivasi terlindungi dan sesi HttpOnly", async () => {
      assert.equal((await req("me")).status, 401);
      assert.equal(
        (await req("setup", { ...account, code: "wrong" })).status,
        403,
      );
      const result = await req("setup", account);
      assert.equal(result.status, 201);
      owner = result.headers.get("set-cookie")!.split(";")[0];
      assert.match(result.headers.get("set-cookie")!, /HttpOnly/);
      assert.equal(
        (await req("setup", { ...account, login: "other" })).status,
        409,
      );
      assert.equal(
        (
          await req("login", {
            login: "pemilik",
            password: "salah-tapi-panjang",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await req("invites", { role: "viewer" }, owner, "POST", {
            Origin: "https://evil.invalid",
          })
        ).status,
        403,
      );
    });
    await t.test("hanya admin membuat akun tanpa kode; sesi admin tetap sama", async () => {
      assert.equal((await req("members", {name:"Ditolak",login:"ditolak",password:account.password})).status,401);
      let r=await req("members",{name:"Pembaca",login:"pembaca",password:account.password},owner);
      assert.equal(r.status,201);assert.equal(r.headers.get("set-cookie"),null);
      viewerId=(await r.json()).user.id;
      assert.equal((await req("member",{id:viewerId,role:"viewer",active:true},owner)).status,200);
      r=await req("login",{login:"pembaca",password:account.password});viewer=r.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await req("members",{name:"Bukan admin",login:"bukanadmin",password:account.password},viewer)).status,403);
      assert.equal((await req("members",{name:"Pemilik palsu",login:"palsu",password:account.password,role:"owner"},owner)).status,400);
      assert.equal((await req("members",{name:"Pengelola",login:"pengelola",password:account.password},owner)).status,201);
      r=await req("login",{login:"pengelola",password:account.password});editor=r.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await req("invites",{role:"editor"},owner)).status,410);
      assert.equal((await req("join",{login:"baru",password:account.password,code:"lama"})).status,410);
      assert.equal((await req("me",undefined,owner)).status,200);
      assert.equal((await req("members",{name:"Duplikat",login:"pengelola",password:account.password},owner)).status,409);
    });
    const state = treeFixture();
    state.persons[0].nik = "0123456789012345";
    state.persons[0].address = "Alamat privat";
    state.persons[0].addressMode = "manual";
    const archive = await createBackup(state, async () => "");
    await t.test(
      "data valid diunggah dengan revisi dan pembaca tidak dapat menulis",
      async () => {
        assert.equal(
          (await req("snapshot", archive, viewer, "PUT", { "If-Match": "0" }))
            .status,
          403,
        );
        const sent = await req("snapshot", archive, owner, "PUT", {
          "If-Match": "0",
        });
        assert.equal(sent.status, 200);
        assert.equal((await sent.json()).revision, 1);
        assert.equal(
          (await req("snapshot", archive, owner, "PUT", { "If-Match": "0" }))
            .status,
          409,
        );
        assert.equal(
          (
            await req("snapshot", new Uint8Array([1, 2, 3]), editor, "PUT", {
              "If-Match": "1",
            })
          ).status,
          400,
        );
        const submitted = await req("snapshot", archive, editor, "PUT", {
          "If-Match": "1",
        });
        assert.equal(submitted.status, 202);
        const proposal = await submitted.json();
        assert.equal(
          (await req("snapshot", undefined, owner)).headers.get(
            "x-family-revision",
          ),
          "1",
        );
        assert.equal(
          (
            await req(
              "proposals/" + proposal.proposalId + "/decision",
              { action: "approve", version: proposal.proposalVersion },
              editor,
            )
          ).status,
          403,
        );
        const detail = await (
          await req("proposals/" + proposal.proposalId, undefined, owner)
        ).json();
        const decision = await req(
          "proposals/" + proposal.proposalId + "/decision",
          { action: "approve", version: detail.version },
          owner,
        );
        assert.equal(decision.status, 200);
        assert.equal((await decision.json()).revision, 2);
      },
    );
    await t.test(
      "NIK dan alamat tidak pernah dikirim kepada pembaca",
      async () => {
        const own = await req("snapshot", undefined, owner),
          view = await req("snapshot", undefined, viewer);
        assert.equal(own.headers.get("x-family-revision"), "2");
        const full = await inspectBackup(
          new Uint8Array(await own.arrayBuffer()),
        );
        const redacted = await inspectBackup(
          new Uint8Array(await view.arrayBuffer()),
        );
        assert.equal(full.state.persons[0].nik, state.persons[0].nik);
        assert.equal(redacted.state.persons[0].nik, "");
        assert.equal(redacted.state.persons[0].address, "");
        assert.equal(redacted.state.persons[0].addressMode, "manual");
      },
    );
    await t.test("pengunjung hanya memperoleh pohon publik dan tidak dapat mengubah data", async()=>{
      const r=await req("public/snapshot");assert.equal(r.status,200);
      const pub=await inspectBackup(new Uint8Array(await r.arrayBuffer()));
      assert.ok(pub.state.persons.length>0);
      assert.ok(pub.state.persons.every(p=>!p.nik&&!p.address&&!p.notes&&!p.birth&&!p.place));
      assert.equal(pub.state.memories.length,0);
      assert.equal((await req("snapshot",archive,"","PUT",{"If-Match":"1"})).status,401);
      assert.equal((await req("proposals")).status,401);
      assert.equal((await req("members")).status,401);
    });
    await t.test("dua kiriman bersamaan tidak saling menimpa", async () => {
      const statuses = await Promise.all([
        req("snapshot", archive, owner, "PUT", { "If-Match": "2" }),
        req("snapshot", archive, owner, "PUT", { "If-Match": "2" }),
      ]);
      assert.deepEqual(statuses.map((r) => r.status).sort(), [200, 409]);
    });
    await t.test(
      "usulan berubah perlu ditinjau ulang, penolakan dan revisi basi tidak dipublikasikan",
      async () => {
        const draft = structuredClone(state);
        draft.persons[0].name = "Usulan nama baru";
        const zip = await createBackup(draft, async () => "");
        const first = await (
          await req("snapshot", zip, editor, "PUT", { "If-Match": "3" })
        ).json();
        const second = await (
          await req("snapshot", zip, editor, "PUT", { "If-Match": "3" })
        ).json();
        assert.equal(first.proposalId, second.proposalId);
        assert.equal(second.proposalVersion, first.proposalVersion + 1);
        assert.equal(
          (
            await req(
              "proposals/" + first.proposalId + "/decision",
              { action: "approve", version: first.proposalVersion },
              owner,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await req(
              "proposals/" + first.proposalId + "/status",
              undefined,
              viewer,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await req(
              "proposals/" + first.proposalId + "/decision",
              {
                action: "reject",
                version: second.proposalVersion,
                note: "Nama belum sesuai dokumen",
              },
              owner,
            )
          ).status,
          200,
        );
        assert.equal(
          (await req("snapshot", undefined, owner)).headers.get(
            "x-family-revision",
          ),
          "3",
        );
        const latest = await (
          await req("snapshot", zip, editor, "PUT", { "If-Match": "3" })
        ).json();
        await req("snapshot", archive, owner, "PUT", { "If-Match": "3" });
        assert.equal(
          (
            await req(
              "proposals/" + latest.proposalId + "/decision",
              { action: "approve", version: latest.proposalVersion },
              owner,
            )
          ).status,
          409,
        );
        assert.equal(
          (await req("snapshot", undefined, owner)).headers.get(
            "x-family-revision",
          ),
          "4",
        );
      },
    );
    await t.test(
      "foto usulan privat dapat ditinjau admin tanpa mengubah data resmi",
      async () => {
        const image =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lR8AAAAASUVORK5CYII=";
        const draft = structuredClone(state);
        draft.media = [
          {
            id: "foto-usulan",
            mime: "image/png",
            name: "Foto keluarga",
            size: Buffer.from(image.split(",")[1], "base64").length,
          },
        ];
        draft.persons[0].photoId = "foto-usulan";
        const zip = await createBackup(draft, async () => image);
        const sent = await (
          await req("snapshot", zip, editor, "PUT", { "If-Match": "4" })
        ).json();
        const detail = await (
          await req("proposals/" + sent.proposalId, undefined, owner)
        ).json();
        assert.ok(detail.changes.some((c: any) => c.section === "Foto"));
        const photo = await req(
          "proposals/" + sent.proposalId + "/media/foto-usulan",
          undefined,
          owner,
        );
        assert.equal(photo.status, 200);
        assert.equal(photo.headers.get("content-type"), "image/png");
        assert.equal(
          (
            await req(
              "proposals/" + sent.proposalId + "/archive",
              undefined,
              viewer,
            )
          ).status,
          404,
        );
        assert.equal(
          (await req("snapshot", undefined, owner)).headers.get(
            "x-family-revision",
          ),
          "4",
        );
      },
    );
    await t.test(
      "pemilik dapat mencabut akses keluarga",
      async () => {
        assert.equal(
          (
            await req(
              "member",
              { id: viewerId, role: "viewer", active: false },
              owner,
            )
          ).status,
          200,
        );
        assert.equal((await req("snapshot", undefined, viewer)).status, 401);
        assert.equal(
          (await req("login", { login: "pembaca", password: account.password }))
            .status,
          401,
        );
        assert.equal((await req("members", undefined, editor)).status, 403);
      },
    );
    await t.test("admin mengatur ulang sandi anggota tanpa mengganti akun atau sesi admin",async()=>{
      const made=await req("members",{name:"Reset",login:"resetuji",password:account.password},owner);const id=(await made.json()).user.id;
      let login=await req("login",{login:"resetuji",password:account.password});const old=login.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await req("member-password",{id,password:"sandi-baru-untuk-reset"},editor)).status,403);
      assert.equal((await req("member-password",{id,password:"sandi-baru-untuk-reset"},owner)).status,200);
      assert.equal((await req("me",undefined,old)).status,401);
      assert.equal((await req("login",{login:"resetuji",password:"sandi-baru-untuk-reset"})).status,200);
      assert.equal((await req("me",undefined,owner)).status,200);
    });
    await t.test(
      "ganti sandi menutup sesi lama dan logout mencabut sesi",
      async () => {
        const result = await req(
          "password",
          { oldPassword: account.password, password: "kata-sandi-baru-456" },
          owner,
        );
        assert.equal(result.status, 200);
        const next = result.headers.get("set-cookie")!.split(";")[0];
        assert.equal((await req("me", undefined, owner)).status, 401);
        assert.equal((await req("me", undefined, next)).status, 200);
        await req("logout", {}, next);
        assert.equal((await req("me", undefined, next)).status, 401);
      },
    );
    await t.test(
      "runtime data dan API tidak dapat diunduh sebagai berkas statis",
      async () => {
        assert.equal((await fetch(url + "/data/keluarga.sqlite")).status, 404);
        assert.equal((await fetch(url + "/api/unknown")).status, 404);
      },
    );
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
