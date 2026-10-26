import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeRequest } from '../server/netlify-bridge.ts';
test('Netlify preserves authentication headers, request bytes, IP and binary ZIP responses', async () => {
  const zip = new Uint8Array([80,75,3,4,0,255]);
  const response = await bridgeRequest(new Request('https://family.netlify.app/api/state?revision=2', {method:'POST',headers:{origin:'https://family.netlify.app',cookie:'family=secret','content-type':'application/zip','if-match':'2'},body:zip}), '192.0.2.1', async (req,res) => {
    assert.equal(req.url,'/api/state?revision=2');
    assert.equal(req.headers.cookie,'family=secret');
    assert.equal(req.headers.origin,'https://family.netlify.app');
    assert.equal(req.headers['if-match'],'2');
    assert.equal(req.socket.remoteAddress,'192.0.2.1');
    const chunks=[];for await(const chunk of req) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks),Buffer.from(zip));
    res.setHeader('Set-Cookie','family=next; HttpOnly; Secure; SameSite=Lax');
    res.writeHead(201,{'Content-Type':'application/zip','Cache-Control':'no-store'});
    res.end(zip);
  });
  assert.equal(response.status,201);
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),zip);
});
test('HEAD sends no response body and preserves an HTTP error',async()=>{
 const response=await bridgeRequest(new Request('https://family.netlify.app/api/status',{method:'HEAD'}),'192.0.2.1',async(_req,res)=>{res.writeHead(403,{'Content-Type':'application/json'});res.end('blocked');});
 assert.equal(response.status,403);assert.equal(await response.text(),'');
});
