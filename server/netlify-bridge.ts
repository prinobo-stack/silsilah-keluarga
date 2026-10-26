import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Preserve the same authentication, binary bodies and headers as the HTTP server. */
export async function bridgeRequest(request: Request, ip: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Promise<Response> {
  const url = new URL(request.url);
  const input = Readable.from(request.body ? [Buffer.from(await request.arrayBuffer())] : []);
  const headers = Object.fromEntries(request.headers.entries());
  const req = Object.assign(input, {url: url.pathname + url.search, method: request.method, headers, socket: {remoteAddress: ip}}) as unknown as IncomingMessage;
  const outputHeaders = new Headers();
  let status = 200;
  let bytes: Buffer | undefined;
  let ended = false;
  const res = {
    headersSent: false,
    setHeader(name: string, value: string) { outputHeaders.set(name, value); return this; },
    writeHead(code: number, values: Record<string,string>) {
      status = code;
      for (const [name,value] of Object.entries(values)) outputHeaders.set(name,value);
      this.headersSent = true;
      return this;
    },
    end(value?: string | Uint8Array) {
      if (!ended) bytes = value === undefined ? undefined : Buffer.from(value);
      ended = true;
      this.headersSent = true;
      return this;
    },
  };
  await handler(req, res as unknown as ServerResponse);
  return new Response(request.method === 'HEAD' ? null : bytes as BodyInit | undefined, {status, headers: outputHeaders});
}
