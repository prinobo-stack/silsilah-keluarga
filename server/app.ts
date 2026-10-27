import {prepareReviewedProposal} from "./reviewed-proposal.ts";
import {DEFAULT_PUBLIC_PRIVACY,parsePublicPrivacy,privacyKey} from "../src/public-privacy.ts";
import {historyCursor} from "../src/audit-history.ts";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { PostgresDatabase } from "./postgres.ts";
import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { resolve, extname, sep } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { proposalChanges } from "./changes.ts";
import { emptyState } from "../src/domain.ts";
import { publicFamily } from "./public-family.ts";
import { createBackup, inspectBackup } from "../src/backup.ts";

const scrypt = promisify(scryptCallback);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const MAX_ZIP = 64 * 1024 * 1024;
type Role = "owner" | "editor" | "viewer";
interface User {
  id: string;
  name: string;
  login: string;
  role: Role;
  active: number;
}
interface Proposal {
  id: string;
  actor: string;
  base_revision: number;
  version: number;
  full_zip: Uint8Array;
  view_zip: Uint8Array;
  status: string;
  note: string;
  created_at: string;
  updated_at: string;
  published_revision: number | null;
  name?: string;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
async function passwordHash(password: string, salt: string) {
  return (await scrypt(password, salt, 64)) as Buffer;
}
function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    fail(400, "Kata sandi harus 12–128 karakter.");
  return value as string;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(400, "Isian belum lengkap atau terlalu panjang.");
  return (value as string).trim();
}
async function body(req: IncomingMessage, max: number): Promise<Buffer> {
  if (Number(req.headers["content-length"] ?? 0) > max)
    fail(413, "Berkas terlalu besar.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) fail(413, "Berkas terlalu besar.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function json(req: IncomingMessage) {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json"))
    fail(415, "Gunakan JSON.");
  try {
    return JSON.parse((await body(req, 8192)).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    fail(400, "JSON tidak valid.");
  }
}
const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  login: u.login,
  role: u.role,
});

export async function createFamilyServer(options: {
  database: string;
  origin: string;
  bootstrapToken: string;
  staticDir: string;
}) {
  const origin = new URL(options.origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !(local && origin.protocol === "http:"))
    throw Error("PUBLIC_ORIGIN wajib HTTPS; HTTP hanya untuk localhost.");
  const db = new PostgresDatabase(options.database);
  (await db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS invites(code_hash TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('editor','viewer')), expires BIGINT NOT NULL, used_by TEXT REFERENCES users(id), created_by TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS family(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, full_zip BYTEA NOT NULL, view_zip BYTEA NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,actor TEXT NOT NULL REFERENCES users(id),base_revision INTEGER NOT NULL,version INTEGER NOT NULL,full_zip BYTEA NOT NULL,view_zip BYTEA NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),note TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_revision INTEGER);
    CREATE TABLE IF NOT EXISTS public_privacy(id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS proposal_revisions(proposal_id TEXT NOT NULL,version INTEGER NOT NULL,full_zip BYTEA NOT NULL,base_revision INTEGER NOT NULL,PRIMARY KEY(proposal_id,version));
    CREATE TABLE IF NOT EXISTS audit(id BIGSERIAL PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires BIGINT NOT NULL);
  `));
  const audit = async (actor: string, action: string) =>
    (await db
      .prepare("INSERT INTO audit(actor,action,at) VALUES(?,?,?)")
      .run(actor, action, new Date().toISOString()));
  const cookie = (token: string, age = 604800) =>
    `family_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${origin.protocol === "https:" ? "; Secure" : ""}`;
  const session = async (req: IncomingMessage) => {
    const token = /(?:^|;\s*)family_session=([a-zA-Z0-9_-]+)/.exec(
      req.headers.cookie ?? "",
    )?.[1];
    if (!token) return undefined;
    return (await db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.active=1",
      )
      .get(hash(token), Date.now())) as unknown as User | undefined;
  };
  async function auth(req: IncomingMessage, role?: "owner" | "write") {
    const u = (await session(req));
    if (!u) fail(401, "Masuk dahulu. Sesi mungkin sudah berakhir.");
    if (role === "owner" && u!.role !== "owner")
      fail(403, "Hanya pemilik yang dapat mengelola akses.");
    if (role === "write" && u!.role === "viewer")
      fail(403, "Akun ini hanya boleh melihat.");
    return u!;
  }
  async function issueSession(res: ServerResponse, id: string) {
    const token = secret();
    (await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now()));
    (await db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      id,
      Date.now() + 7 * 86400000,
    ));
    res.setHeader("Set-Cookie", cookie(token));
  }
  async function rate(req: IncomingMessage) {
    // Do not trust forwarded IP headers from arbitrary clients.
    const key = hash(req.socket.remoteAddress ?? "unknown");
    const now = Date.now();
    (await db.prepare("DELETE FROM login_limits WHERE expires<?").run(now));
    (await db.prepare(
      "INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=login_limits.attempts+1",
    ).run(key, now + 900000));
    const row = (await db
      .prepare("SELECT attempts FROM login_limits WHERE key=?")
      .get(key)) as { attempts: number };
    if (row.attempts > 60)
      fail(429, "Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
  }
  const respond = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  };
  let publicCache: {policy:string; revision: number; bytes: Promise<Uint8Array>} | undefined;
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const url = new URL(req.url ?? "/", origin);
      const path = url.pathname,
        method = req.method ?? "GET";
      if (path.startsWith("/api/") && !["GET", "HEAD"].includes(method)) {
        if (req.headers.origin !== origin.origin)
          fail(403, "Asal permintaan tidak diizinkan.");
      }
      if (path === "/api/privacy" && (method === "GET" || method === "POST")) {
        const owner = await auth(req,"owner");
        if (method === "POST") {
          let policy;
          try { policy = parsePublicPrivacy(await json(req)); }
          catch { fail(400,"Pengaturan privasi tidak valid."); }
          await db.exec("BEGIN IMMEDIATE");
          try {
            await db.prepare("INSERT INTO public_privacy(id,config) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config").run(JSON.stringify(policy!));
            await audit(owner.id,"privacy");
            await db.exec("COMMIT");publicCache=undefined;
          } catch(e) {await db.exec("ROLLBACK");throw e;}
          return respond(res,200,policy!);
        }
        const stored = await db.prepare("SELECT config FROM public_privacy WHERE id=1").get() as {config:string}|undefined;
        return respond(res,200,stored?parsePublicPrivacy(JSON.parse(stored.config)):DEFAULT_PUBLIC_PRIVACY);
      }
      if (method === "GET" && path === "/api/history") {
        await auth(req, "owner");
        let before: string | null = null;
        try { before = historyCursor(url.searchParams.get("before")); }
        catch { fail(400, "Penanda halaman riwayat tidak valid."); }
        const rows = await db.prepare(
          "SELECT a.id::text AS id,a.actor,a.action,a.at,u.name AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor" +
          (before ? " WHERE a.id < ?" : "") + " ORDER BY a.id DESC LIMIT 51"
        ).all(...(before ? [before] : []));
        const visible = rows.slice(0,50) as {id:string}[];
        return respond(res,200,{rows:visible,next:rows.length>50?visible[visible.length-1].id:null});
      }
      if (method === "GET" && path === "/api/status")
        return respond(res, 200, {
          setupRequired: !(await db.prepare("SELECT 1 FROM users LIMIT 1").get()),
        });
      if (["/api/join", "/api/invites", "/api/revoke-invites"].includes(path))
        fail(410, "Pendaftaran dengan kode sudah dihapus. Akun keluarga dibuat oleh admin.");
      if (method === "GET" && path === "/api/public/snapshot") {
        const stored = await db.prepare("SELECT config FROM public_privacy WHERE id=1").get() as {config:string}|undefined;
        const privacy = stored?parsePublicPrivacy(JSON.parse(stored.config)):DEFAULT_PUBLIC_PRIVACY;
        if(!privacy.enabled)return respond(res,403,{error:"Akses pohon publik dinonaktifkan oleh admin. Silakan masuk dengan akun keluarga."});
        const policy=privacyKey(privacy);

        const row = (await db.prepare("SELECT revision,full_zip FROM family WHERE id=1").get()) as {revision:number;full_zip:Uint8Array} | undefined;
        const revision = row?.revision ?? 0;
        if (!publicCache || publicCache.revision !== revision || publicCache.policy !== policy) {
          publicCache = {revision, policy, bytes: (async () => {
            const full = row ? await inspectBackup(row.full_zip) : {state:emptyState(),files:{} as Record<string,string>};
            const safe = publicFamily(full.state,privacy);
            return createBackup(safe, async id => full.files[id]);
          })()};
        }
        let bytes: Uint8Array;
        try { bytes = await publicCache.bytes; } catch(e) {publicCache=undefined;throw e;}
        res.writeHead(200, {"Content-Type":"application/zip", "X-Family-Revision":String(revision), "X-Family-Privacy":policy, "X-Family-Role":"viewer"});
        res.end(bytes);
        return;
      }
      if (method === "POST" && path === "/api/members") {
        const owner = (await auth(req, "owner"));
        (await rate(req));
        const data = await json(req);
        const login = text(data.login,120).toLowerCase();
        if (!/^[a-z0-9@._+-]{3,120}$/.test(login)) fail(400,"Nama akun gunakan 3–120 huruf/angka tanpa spasi.");
        if (data.role !== undefined && data.role !== "editor") fail(400,"Akun keluarga baru menggunakan peran pengusul.");
        const name = text(data.name,100), salt=secret(), id=crypto.randomUUID();
        const stored = (await passwordHash(password(data.password),salt)).toString("hex");
        (await auth(req,"owner"));
        if ((await db.prepare("SELECT 1 FROM users WHERE login=?").get(login))) fail(409,"Nama akun sudah dipakai.");
        (await db.prepare("INSERT INTO users(id,login,name,salt,password,role) VALUES(?,?,?,?,?,'editor')").run(id,login,name,salt,stored));
        (await audit(owner.id,"create-member:"+id));
        return respond(res,201,{user:{id,name,login,role:"editor"}});
      }
      if (method === "POST" && path === "/api/member-password") {
        const owner=(await auth(req,"owner"));(await rate(req));const data=await json(req);
        const id=text(data.id,64);
        const target=(await db.prepare("SELECT role FROM users WHERE id=?").get(id)) as {role:Role}|undefined;
        if(!target || target.role==="owner") fail(400,"Pilih akun anggota keluarga.");
        const salt=secret(), key=(await passwordHash(password(data.password),salt)).toString("hex");
        (await db.prepare("UPDATE users SET salt=?,password=? WHERE id=?").run(salt,key,id));
        (await db.prepare("DELETE FROM sessions WHERE user_id=?").run(id));
        (await audit(owner.id,"reset-password:"+id));
        return respond(res,200,{ok:true});
      }
      if (method === "GET" && path === "/api/me")
        return respond(res, 200, { user: publicUser((await auth(req))) });
      if (
        method === "POST" &&
        ["/api/setup", "/api/login"].includes(path)
      ) {
        (await rate(req));
        const data = await json(req);
        const login = text(data.login, 120).toLowerCase();
        if (!/^[a-z0-9@._+-]{3,120}$/.test(login))
          fail(400, "Nama akun gunakan 3–120 huruf/angka tanpa spasi.");
        const pass = password(data.password);
        if (path === "/api/login") {
          const u = (await db
            .prepare("SELECT * FROM users WHERE login=? AND active=1")
            .get(login)) as
            | (User & { salt: string; password: string })
            | undefined;
          // Equal-cost check for unknown accounts.
          const key = await passwordHash(
            pass,
            u?.salt ?? "unknown-account-salt",
          );
          if (!u || !timingSafeEqual(Buffer.from(u.password, "hex"), key))
            fail(401, "Nama akun atau kata sandi salah.");
          (await issueSession(res, u.id));
          (await audit(u.id, "login"));
          return respond(res, 200, { user: publicUser(u) });
        }
        const name = text(data.name, 100),
          id = crypto.randomUUID(),
          salt = secret();
        const storedPassword = (await passwordHash(pass, salt)).toString("hex");
        let role: Role = "owner";
        (await db.exec("BEGIN IMMEDIATE"));
        try {
          if ((await db.prepare("SELECT 1 FROM users WHERE login=?").get(login)))
            fail(409, "Nama akun sudah dipakai.");
          if (path === "/api/setup") {
            if ((await db.prepare("SELECT 1 FROM users LIMIT 1").get()))
              fail(409, "Pemilik sudah dibuat.");
            if (
              typeof data.code !== "string" ||
              hash(data.code) !== hash(options.bootstrapToken)
            )
              fail(403, "Kode aktivasi server tidak sesuai.");
          }
          (await db.prepare(
            "INSERT INTO users(id,login,name,salt,password,role) VALUES(?,?,?,?,?,?)",
          ).run(id, login, name, salt, storedPassword, role));
          (await audit(id, "setup"));
          (await db.exec("COMMIT"));
        } catch (e) {
          (await db.exec("ROLLBACK"));
          throw e;
        }
        (await issueSession(res, id));
        return respond(res, 201, { user: { id, login, name, role } });
      }
      if (method === "POST" && path === "/api/logout") {
        const token = /(?:^|;\s*)family_session=([a-zA-Z0-9_-]+)/.exec(
          req.headers.cookie ?? "",
        )?.[1];
        if (token)
          (await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
            hash(token),
          ));
        res.setHeader("Set-Cookie", cookie("", 0));
        return respond(res, 200, { ok: true });
      }
      if (method === "POST" && path === "/api/password") {
        const u = (await auth(req));
        (await rate(req));
        const data = await json(req);
        const row = (await db
          .prepare("SELECT salt,password FROM users WHERE id=?")
          .get(u.id)) as { salt: string; password: string };
        const old = await passwordHash(password(data.oldPassword), row.salt);
        if (!timingSafeEqual(old, Buffer.from(row.password, "hex")))
          fail(403, "Kata sandi lama salah.");
        const salt = secret(),
          key = await passwordHash(password(data.password), salt);
        (await db.prepare("UPDATE users SET salt=?,password=? WHERE id=?").run(
          salt,
          key.toString("hex"),
          u.id,
        ));
        (await db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id));
        (await issueSession(res, u.id));
        (await audit(u.id, "password"));
        return respond(res, 200, { ok: true });
      }
      if (method === "GET" && path === "/api/members") {
        (await auth(req, "owner"));
        return respond(res, 200, {
          users: (await db
            .prepare(
              "SELECT id,name,login,role,active FROM users ORDER BY name",
            )
            .all()),
          audit: (await db
            .prepare(
              "SELECT actor,action,at FROM audit ORDER BY id DESC LIMIT 30",
            )
            .all()),
        });
      }
      if (method === "POST" && path === "/api/member") {
        const u = (await auth(req, "owner")),
          data = await json(req);
        const member = (await db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(text(data.id, 64))) as User | undefined;
        if (!member || member.role === "owner")
          fail(400, "Pemilik tidak dapat diubah atau dinonaktifkan.");
        if (
          !["editor", "viewer"].includes(data.role) ||
          typeof data.active !== "boolean"
        )
          fail(400, "Hak akses tidak valid.");
        (await db.prepare("UPDATE users SET role=?,active=? WHERE id=?").run(
          data.role,
          data.active ? 1 : 0,
          member.id,
        ));
        (await db.prepare("DELETE FROM sessions WHERE user_id=?").run(member.id));
        (await audit(u.id, "member:" + member.id));
        return respond(res, 200, { ok: true });
      }
      if (method === "GET" && path === "/api/proposals") {
        const u = (await auth(req));
        const fields =
          "p.id,p.actor,p.base_revision,p.version,p.status,p.note,p.created_at,p.updated_at,p.published_revision,u.name";
        const rows =
          u.role === "owner"
            ? (await db
                .prepare(
                  "SELECT " +
                    fields +
                    " FROM proposals p JOIN users u ON u.id=p.actor ORDER BY p.updated_at DESC LIMIT 100",
                )
                .all())
            : (await db
                .prepare(
                  "SELECT " +
                    fields +
                    " FROM proposals p JOIN users u ON u.id=p.actor WHERE p.actor=? ORDER BY p.updated_at DESC LIMIT 30",
                )
                .all(u.id));
        return respond(res, 200, { proposals: rows });
      }
      const proposalRoute =
        /^\/api\/proposals\/([a-zA-Z0-9-]+)(?:\/(archive|decision|rebase|status|media\/[a-zA-Z0-9-]+))?$/.exec(
          path,
        );
      if (proposalRoute) {
        const u = (await auth(req)),
          id = proposalRoute[1],
          operation = proposalRoute[2];
        const p = (await db
          .prepare(
            "SELECT p.*,u.name FROM proposals p JOIN users u ON u.id=p.actor WHERE p.id=?",
          )
          .get(id)) as unknown as Proposal | undefined;
        if (
          u.role === "viewer" ||
          !p ||
          (u.role !== "owner" && p.actor !== u.id)
        )
          fail(404, "Usulan tidak ditemukan.");
        const info = {
          id: p.id,
          actor: p.actor,
          name: p.name,
          base_revision: p.base_revision,
          version: p.version,
          status: p.status,
          note: p.note,
          published_revision: p.published_revision,
        };
        if (method === "GET" && operation === "status")
          return respond(res, 200, info);
        if (method === "GET" && operation === "archive") {
          const version = url.searchParams.get("version");
          if(version !== null){
            if(!/^[1-9]\d{0,8}$/.test(version))fail(400,"Versi arsip tidak valid.");
            const archived = await db.prepare("SELECT full_zip FROM proposal_revisions WHERE proposal_id=? AND version=?").get(p.id,Number(version)) as {full_zip:Uint8Array}|undefined;
            if(!archived)fail(404,"Arsip usulan tidak ditemukan.");
            res.writeHead(200,{"Content-Type":"application/zip","Content-Disposition":"attachment; filename=Usulan_Sebelum_Peninjauan.zip"});res.end(archived!.full_zip);return;
          }

          res.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": "attachment; filename=Usulan_Keluarga.zip",
          });
          res.end(p.full_zip);
          return;
        }
        if (method === "GET" && operation?.startsWith("media/")) {
          const draft = await inspectBackup(p.full_zip),
            mediaId = operation.slice(6),
            media = draft.state.media.find((m) => m.id === mediaId);
          if (!media || !draft.files[mediaId])
            fail(404, "Foto usulan tidak ditemukan.");
          res.writeHead(200, { "Content-Type": media.mime });
          res.end(Buffer.from(draft.files[mediaId].split(",")[1], "base64"));
          return;
        }
        if (method === "GET" && !operation) {
          const current = (await db
            .prepare("SELECT revision,full_zip FROM family WHERE id=1")
            .get()) as { revision: number; full_zip: Uint8Array } | undefined;
          const before = current
            ? await inspectBackup(current.full_zip)
            : { state: emptyState(), files: {} };
          const after = await inspectBackup(p.full_zip);
          return respond(res, 200, {
            ...info,
            current_revision: current?.revision ?? 0,
            changes: proposalChanges(before, after),
            people: Object.fromEntries(
              [...before.state.persons, ...after.state.persons].map((p) => [
                p.id,
                p.name,
              ]),
            ),
          });
        }
        if (method === "POST" && operation === "rebase") {
          await auth(req,"owner");
          const data = await json(req);
          if(!Number.isSafeInteger(data.version)||!Number.isSafeInteger(data.current_revision))fail(400,"Versi peninjauan tidak valid.");
          await db.exec("BEGIN IMMEDIATE");
          try {
            const latest=await db.prepare("SELECT * FROM proposals WHERE id=?").get(p.id) as unknown as Proposal;
            const current=await db.prepare("SELECT revision,full_zip FROM family WHERE id=1").get() as {revision:number;full_zip:Uint8Array}|undefined;
            if(latest.status!=="pending"||latest.version!==data.version||(current?.revision??0)!==data.current_revision)fail(409,"Data atau usulan berubah. Muat ulang rincian sebelum meninjau.");
            const before=current?await inspectBackup(current.full_zip):{state:emptyState(),files:{}};
            const draft=await inspectBackup(latest.full_zip);
            let full;
            try { full=prepareReviewedProposal(before,draft,data.selected); }
            catch(e){fail(400,"Pilihan belum dapat digabung: "+(e as Error).message);}
            const canonical=await createBackup(full!.state,async id=>full!.files[id]);
        const redacted = structuredClone(full!.state);
        redacted.persons = redacted.persons.filter((p) => !p.deletedAt);
        const live = new Set(redacted.persons.map((p) => p.id));
        redacted.parents = redacted.parents.filter(
          (l) => live.has(l.parentId) && live.has(l.childId),
        );
        redacted.siblings = (redacted.siblings ?? []).filter(
          (l) => live.has(l.olderId) && live.has(l.youngerId),
        );
        redacted.unions = redacted.unions.filter((u) =>
          u.members.every((id) => live.has(id)),
        );
        redacted.memories = redacted.memories.map((m) => ({
          ...m,
          personIds: m.personIds.filter((id) => live.has(id)),
        }));
        if (redacted.rootId && !live.has(redacted.rootId))
          redacted.rootId = redacted.persons[0]?.id ?? null;
        const mediaIds = new Set([
          ...(redacted.familyProfile?.coverPhotoId ? [redacted.familyProfile.coverPhotoId] : []),
          ...redacted.persons.flatMap((p) => (p.photoId ? [p.photoId] : [])),
          ...redacted.memories.flatMap((m) => m.mediaIds),
        ]);
        redacted.media = redacted.media.filter((m) => mediaIds.has(m.id));
        for (const p of redacted.persons) {
          p.nik = "";
          p.address = "";
          p.addressMode = "manual";
        }
        const view = await createBackup(redacted, async (id) => full!.files[id]);

            await db.prepare("INSERT INTO proposal_revisions(proposal_id,version,full_zip,base_revision) VALUES(?,?,?,?) ON CONFLICT(proposal_id,version) DO NOTHING").run(latest.id,latest.version,latest.full_zip,latest.base_revision);
            await db.prepare("UPDATE proposals SET base_revision=?,version=?,full_zip=?,view_zip=?,updated_at=? WHERE id=?").run(current?.revision??0,latest.version+1,canonical,view,new Date().toISOString(),latest.id);
            await audit(u.id,"rebase:"+latest.id+":"+(latest.version+1));await db.exec("COMMIT");
            return respond(res,200,{ok:true,version:latest.version+1,archived_version:latest.version});
          }catch(e){await db.exec("ROLLBACK");throw e;}
        }
        if (method === "POST" && operation === "decision") {
          (await auth(req, "owner"));
          const data = await json(req);
          if (
            !["approve", "reject"].includes(data.action) ||
            !Number.isSafeInteger(data.version)
          )
            fail(400, "Keputusan atau versi usulan tidak valid.");
          const note = typeof data.note === "string" ? data.note.trim() : "";
          if (note.length > 1000 || (data.action === "reject" && !note))
            fail(400, "Penolakan memerlukan catatan, maksimal 1.000 karakter.");
          (await db.exec("BEGIN IMMEDIATE"));
          try {
            const latest = (await db
              .prepare("SELECT * FROM proposals WHERE id=?")
              .get(p.id)) as unknown as Proposal;
            if (latest.status !== "pending" || latest.version !== data.version)
              fail(
                409,
                "Usulan sudah berubah atau diputuskan. Buka rincian terbaru sebelum memutuskan.",
              );
            const author = (await db
              .prepare("SELECT role,active FROM users WHERE id=?")
              .get(latest.actor)) as { role: Role; active: number };
            if (
              data.action === "approve" &&
              (!author.active || author.role !== "editor")
            )
              fail(
                409,
                "Akses pengusul berubah. Usulan tidak dapat disetujui.",
              );
            const current = (await db
              .prepare("SELECT revision FROM family WHERE id=1")
              .get()) as { revision: number } | undefined;
            let published: number | null = null;
            if (data.action === "approve") {
              if ((current?.revision ?? 0) !== latest.base_revision)
                fail(
                  409,
                  "Data resmi sudah berubah sejak usulan dibuat. Minta anggota memperbarui usulan dari data resmi terbaru.",
                );
              published = latest.base_revision + 1;
              (await db.prepare(
                "INSERT INTO family VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,full_zip=excluded.full_zip,view_zip=excluded.view_zip,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
              ).run(
                published,
                latest.full_zip,
                latest.view_zip,
                new Date().toISOString(),
                u.id,
              ));
            }
            (await db.prepare(
              "UPDATE proposals SET status=?,note=?,updated_at=?,published_revision=? WHERE id=?",
            ).run(
              data.action === "approve" ? "approved" : "rejected",
              note,
              new Date().toISOString(),
              published,
              p.id,
            ));
            (await audit(u.id, data.action + ":" + p.id));
            (await db.exec("COMMIT"));
            return respond(res, 200, { ok: true, revision: published });
          } catch (e) {
            (await db.exec("ROLLBACK"));
            throw e;
          }
        }
        fail(405, "Metode usulan tidak diizinkan.");
      }
      if (method === "GET" && path === "/api/revision") {
        const u = (await auth(req));
        const row = (await db
          .prepare("SELECT revision FROM family WHERE id=1")
          .get()) as { revision: number } | undefined;
        return respond(res, 200, {
          revision: row?.revision ?? 0,
          role: u.role,
        });
      }
      if (method === "GET" && path === "/api/snapshot") {
        const u = (await auth(req));
        const row = (await db.prepare("SELECT * FROM family WHERE id=1").get()) as
          | { revision: number; full_zip: Uint8Array; view_zip: Uint8Array }
          | undefined;
        const zip = row
          ? u.role === "viewer"
            ? row.view_zip
            : row.full_zip
          : await createBackup(emptyState(), async () => "");
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "X-Family-Revision": String(row?.revision ?? 0),
          "X-Family-Role": u.role,
        });
        res.end(zip);
        return;
      }
      if (method === "PUT" && path === "/api/snapshot") {
        const u = (await auth(req, "write"));
        // Some hosting proxies consume conditional HTTP headers. Carry the same
        // required revision in the URL as a fallback; never assume revision zero.
        const headerRevision = req.headers["if-match"];
        const queryRevision = url.searchParams.get("baseRevision");
        const rawRevision = headerRevision ?? queryRevision;
        const base = Number(rawRevision);
        if (
          typeof rawRevision !== "string" ||
          !/^\d+$/.test(rawRevision) ||
          !Number.isSafeInteger(base) ||
          (headerRevision !== undefined && queryRevision !== null &&
            Number(headerRevision) !== Number(queryRevision))
        )
          fail(400, "Revisi awal wajib diisi.");
        const bytes = await body(req, MAX_ZIP);
        let prepared: Awaited<ReturnType<typeof inspectBackup>>;
        try {
          prepared = await inspectBackup(new Uint8Array(bytes));
        } catch {
          fail(400, "Cadangan tidak valid, rusak, atau melebihi batas.");
        }
        const full = prepared!;
        // Preferences are local to each device, never authoritative shared data.
        full.state.settings = emptyState().settings;
        const canonical = await createBackup(
          full.state,
          async (id) => full.files[id],
        );
        const redacted = structuredClone(full.state);
        redacted.persons = redacted.persons.filter((p) => !p.deletedAt);
        const live = new Set(redacted.persons.map((p) => p.id));
        redacted.parents = redacted.parents.filter(
          (l) => live.has(l.parentId) && live.has(l.childId),
        );
        redacted.siblings = (redacted.siblings ?? []).filter(
          (l) => live.has(l.olderId) && live.has(l.youngerId),
        );
        redacted.unions = redacted.unions.filter((u) =>
          u.members.every((id) => live.has(id)),
        );
        redacted.memories = redacted.memories.map((m) => ({
          ...m,
          personIds: m.personIds.filter((id) => live.has(id)),
        }));
        if (redacted.rootId && !live.has(redacted.rootId))
          redacted.rootId = redacted.persons[0]?.id ?? null;
        const mediaIds = new Set([
          ...(redacted.familyProfile?.coverPhotoId ? [redacted.familyProfile.coverPhotoId] : []),
          ...redacted.persons.flatMap((p) => (p.photoId ? [p.photoId] : [])),
          ...redacted.memories.flatMap((m) => m.mediaIds),
        ]);
        redacted.media = redacted.media.filter((m) => mediaIds.has(m.id));
        for (const p of redacted.persons) {
          p.nik = "";
          p.address = "";
          p.addressMode = "manual";
        }
        const view = await createBackup(redacted, async (id) => full.files[id]);
        (await auth(req, "write"));
        (await db.exec("BEGIN IMMEDIATE"));
        try {
          const row = (await db
            .prepare("SELECT revision FROM family WHERE id=1")
            .get()) as { revision: number } | undefined;
          if ((row?.revision ?? 0) !== base)
            fail(
              409,
              "Data server sudah berubah. Salinan lokal tetap aman; selesaikan konflik dahulu.",
            );
          if (u.role === "editor") {
            const existing = (await db
              .prepare(
                "SELECT id,version FROM proposals WHERE actor=? AND status='pending' ORDER BY updated_at DESC LIMIT 1",
              )
              .get(u.id)) as { id: string; version: number } | undefined;
            const id = existing?.id ?? crypto.randomUUID(),
              version = (existing?.version ?? 0) + 1,
              now = new Date().toISOString();
            if (existing)
              (await db.prepare(
                "UPDATE proposals SET base_revision=?,version=?,full_zip=?,view_zip=?,updated_at=? WHERE id=?",
              ).run(base, version, canonical, view, now, id));
            else
              (await db.prepare(
                "INSERT INTO proposals VALUES(?,?,?,?,?,?,'pending','',?,?,NULL)",
              ).run(id, u.id, base, version, canonical, view, now, now));
            (await audit(u.id, "proposal:" + id + ":" + version));
            (await db.exec("COMMIT"));
            return respond(res, 202, {
              revision: base,
              proposalId: id,
              proposalVersion: version,
            });
          }
          (await db.prepare(
            "INSERT INTO family VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,full_zip=excluded.full_zip,view_zip=excluded.view_zip,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
          ).run(base + 1, canonical, view, new Date().toISOString(), u.id));
          (await audit(u.id, "snapshot:" + (base + 1)));
          (await db.exec("COMMIT"));
        } catch (e) {
          (await db.exec("ROLLBACK"));
          throw e;
        }
        return respond(res, 200, { revision: base + 1 });
      }
      if (path.startsWith("/api/")) fail(404, "Menu server tidak ditemukan.");
      if (!["GET", "HEAD"].includes(method))
        fail(405, "Metode tidak diizinkan.");
      const staticRoot = resolve(options.staticDir);
      let decoded = "";
      try {
        decoded = decodeURIComponent(path);
      } catch {
        fail(400, "Alamat tidak valid.");
      }
      if (decoded!.includes("\0") || decoded!.includes("\\"))
        fail(400, "Alamat tidak valid.");
      const file = resolve(staticRoot, "." + decoded!);
      if (file !== staticRoot && !file.startsWith(staticRoot + sep))
        fail(403, "Alamat tidak diizinkan.");
      const chosen = decoded === "/" ? resolve(staticRoot, "index.html") : file;
      let content: Buffer;
      try {
        if (!(await stat(chosen)).isFile())
          fail(404, "Berkas tidak ditemukan.");
        content = await readFile(chosen);
      } catch {
        fail(404, "Berkas tidak ditemukan.");
      }
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".ttf": "font/ttf",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(chosen)] ?? "application/octet-stream",
        "Cache-Control": decoded!.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      res.end(method === "HEAD" ? undefined : content!);
    } catch (e) {
      if (!res.headersSent)
        respond(res, e instanceof HttpError ? e.status : 500, {
          error:
            e instanceof HttpError
              ? e.message
              : "Server mengalami kesalahan. Data sebelumnya tetap tersimpan.",
        });
      else res.end();
    }
  };
  const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await db.withRequest(() => handle(req, res), (req.url ?? '').startsWith('/api/'));
    } catch {
      if (!res.headersSent) respond(res, 503, {error: 'Database belum dapat dihubungi. Coba lagi.'});
      else res.end();
    }
  };
  const server = Object.assign(createServer((req, res) => {
    void handleRequest(req, res);
  }), { handleRequest });
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  server.on("close", () => db.close());
  return server;
}
