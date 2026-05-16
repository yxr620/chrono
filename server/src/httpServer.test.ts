import assert from 'node:assert/strict';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.OSS_REGION ??= 'oss-cn-test';
process.env.OSS_BUCKET ??= 'chrono-test';
process.env.OSS_ACCESS_KEY_ID ??= 'test-access-key-id';
process.env.OSS_ACCESS_KEY_SECRET ??= 'test-access-key-secret';

test('custom runtime HTTP server streams raw SSE chunks before the upstream stream closes', async (t) => {
  const { register } = await import('./shared/router.js');
  const { createChronoHttpServer } = await import('./httpServer.js');

  register('POST', /^\/test\/custom-runtime-stream$/, false, async () => ({
    __raw: true,
    status: 200,
    contentType: 'text/event-stream',
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: first\n\n'));
        setTimeout(() => {
          controller.enqueue(encoder.encode('data: second\n\n'));
          controller.close();
        }, 150);
      },
    }),
  }));

  const server = createChronoHttpServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
  });

  const port = (server.address() as AddressInfo).port;
  const startedAt = Date.now();
  const response = await new Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: string;
    firstChunkAt: number;
    endAt: number;
  }>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let firstChunkAt = 0;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/test/custom-runtime-stream',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      res.on('data', (chunk: Buffer) => {
        if (!firstChunkAt) firstChunkAt = Date.now();
        chunks.push(Buffer.from(chunk));
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf-8'),
          firstChunkAt,
          endAt: Date.now(),
        });
      });
    });
    req.on('error', reject);
    req.end('{}');
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-type']), /^text\/event-stream/);
  assert.equal(response.headers['x-chrono-streaming'], 'true');
  assert.equal(response.body, 'data: first\n\ndata: second\n\n');
  assert.ok(response.firstChunkAt - startedAt < 100, 'first chunk should arrive before delayed close');
  assert.ok(response.endAt - response.firstChunkAt >= 75, 'response should stay open after first chunk');
});
