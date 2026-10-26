import { resolve } from 'node:path';
import { createFamilyServer } from './app.ts';
const database=process.env.DATABASE_URL;
const bootstrapToken=process.env.BOOTSTRAP_TOKEN;
const origin=process.env.PUBLIC_ORIGIN ?? process.env.RENDER_EXTERNAL_URL;
if(!database || !bootstrapToken || bootstrapToken.length<32 || !origin) throw Error('Isi DATABASE_URL, BOOTSTRAP_TOKEN (minimal 32 karakter), dan PUBLIC_ORIGIN/RENDER_EXTERNAL_URL.');
const app=await createFamilyServer({database,bootstrapToken,origin,staticDir:resolve('dist')});
app.listen(Number(process.env.PORT ?? 10000),'0.0.0.0',()=>console.log('Silsilah cloud siap menerima koneksi.'));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>app.close());
