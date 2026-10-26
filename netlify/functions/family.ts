import { createFamilyServer } from '../../server/app.ts';
import { bridgeRequest } from '../../server/netlify-bridge.ts';

let runtime: ReturnType<typeof createFamilyServer> | undefined;
export default async function(request: Request, context: {ip: string}) {
  if (!new URL(request.url).pathname.startsWith('/api/')) return new Response('Not found', {status:404});
  try {
    if (!runtime) {
      const database = process.env.DATABASE_URL;
      const bootstrapToken = process.env.BOOTSTRAP_TOKEN;
      const origin = process.env.PUBLIC_ORIGIN || process.env.URL;
      if (!database || !origin || !bootstrapToken || bootstrapToken.length < 32) {
        return Response.json({error:'Konfigurasi DATABASE_URL, BOOTSTRAP_TOKEN, atau PUBLIC_ORIGIN belum lengkap.'}, {status:503,headers:{'Cache-Control':'no-store'}});
      }
      runtime = createFamilyServer({database, bootstrapToken, origin, staticDir:'dist'});
      runtime.catch(() => {runtime = undefined;});
    }
    const server = await runtime;
    return await bridgeRequest(request, context.ip, server.handleRequest);
  } catch {
    return Response.json({error:'Database belum dapat dihubungi. Coba lagi.'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
export const config = {path:'/api/*'};
