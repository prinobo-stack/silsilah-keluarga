import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
const { Pool } = pg;
/** One client per API request; a database-wide lock preserves legacy revision transactions across instances. */
export class PostgresDatabase {
  private pool: pg.Pool;
  private context = new AsyncLocalStorage<pg.PoolClient>();
  constructor(url: string) {
    if (!/^postgres(ql)?:\/\//.test(url)) throw Error('DATABASE_URL wajib diisi dengan koneksi PostgreSQL Neon.');
    this.pool = new Pool({connectionString:url,max:4,connectionTimeoutMillis:15000,idleTimeoutMillis:30000});
    this.pool.on('error', () => console.error('Koneksi database terputus.'));
  }
  async withRequest<T>(fn:()=>Promise<T>, database: boolean):Promise<T> {
    if (!database) return fn();
    const client=await this.pool.connect();
    try {
      await client.query("SET statement_timeout = '30s'");
      await client.query('SELECT pg_advisory_lock(735192044)');
      return await this.context.run(client,fn);
    } finally {
      try { await client.query('ROLLBACK'); await client.query('SELECT pg_advisory_unlock(735192044)'); }
      catch {client.release(true); return Promise.reject(new Error('Database connection ended'));}
      client.release();
    }
  }
  async exec(sql:string) {
    const query=sql==='BEGIN IMMEDIATE'?'BEGIN':sql;
    return (this.context.getStore() ?? this.pool).query(query);
  }
  prepare(sql:string) {
    let i=0; const query=sql.replace(/\?/g,()=>`$${++i}`);
    const execute=async(args:unknown[]) => (this.context.getStore() ?? this.pool).query(query,args.map(v=>v instanceof Uint8Array?Buffer.from(v):v));
    return {
      get:async(...args:unknown[]) => (await execute(args)).rows[0],
      all:async(...args:unknown[]) => (await execute(args)).rows,
      run:async(...args:unknown[]) => ({changes:(await execute(args)).rowCount ?? 0}),
    };
  }
  async close(){await this.pool.end();}
}
