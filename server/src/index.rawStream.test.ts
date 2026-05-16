import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.OSS_REGION ??= 'oss-cn-test';
process.env.OSS_BUCKET ??= 'chrono-test';
process.env.OSS_ACCESS_KEY_ID ??= 'test-access-key-id';
process.env.OSS_ACCESS_KEY_SECRET ??= 'test-access-key-secret';

test('raw stream responses fall back to an event response when no FC stream response object is available', async () => {
  const { register } = await import('./shared/router.js');
  const { handler } = await import('./index.js');

  register('POST', /^\/test\/raw-stream$/, false, async () => ({
    __raw: true,
    status: 200,
    contentType: 'text/event-stream',
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: ok\n\n'));
        controller.close();
      },
    }),
  }));

  const result = await handler({
    requestContext: { http: { method: 'POST' } },
    rawPath: '/test/raw-stream',
    headers: {},
    body: '{}',
  }, {});

  assert.deepEqual(result, {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
      'X-Chrono-Streaming': 'false',
      'X-Chrono-Stream-Reason': 'no-response-object',
      'Content-Type': 'text/event-stream',
    },
    body: 'data: ok\n\n',
    isBase64Encoded: false,
  });
});

test('raw stream responses pipe chunks via respObj.write when FC provides a streaming handler', async () => {
  const { register } = await import('./shared/router.js');
  const { handler } = await import('./index.js');

  register('POST', /^\/test\/raw-stream-pipe$/, false, async () => ({
    __raw: true,
    status: 200,
    contentType: 'text/event-stream',
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hello\n\n'));
        controller.enqueue(new TextEncoder().encode('data: world\n\n'));
        controller.close();
      },
    }),
  }));

  const writes: Uint8Array[] = [];
  const headers: Record<string, string> = {};
  let status = 0;
  let finalSend = '__unset__';
  const respObj = {
    setStatusCode: (n: number) => { status = n; },
    setHeader: (k: string, v: string) => { headers[k] = v; },
    write: (chunk: Uint8Array) => { writes.push(chunk); },
    send: (body: string) => { finalSend = body; },
  };

  await handler({
    requestContext: { http: { method: 'POST' } },
    rawPath: '/test/raw-stream-pipe',
    headers: {},
    body: '{}',
  }, respObj);

  assert.equal(status, 200);
  assert.equal(headers['Content-Type'], 'text/event-stream');
  assert.equal(headers['X-Chrono-Streaming'], 'true');
  assert.equal(writes.length, 2);
  const decoded = writes.map(c => new TextDecoder().decode(c)).join('');
  assert.equal(decoded, 'data: hello\n\ndata: world\n\n');
  assert.equal(finalSend, '');
});

test('raw stream responses buffer the body when respObj lacks .write (FC request-response trigger)', async () => {
  const { register } = await import('./shared/router.js');
  const { handler } = await import('./index.js');

  register('POST', /^\/test\/raw-stream-buffered$/, false, async () => ({
    __raw: true,
    status: 200,
    contentType: 'text/event-stream',
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: buffered\n\n'));
        controller.close();
      },
    }),
  }));

  const headers: Record<string, string> = {};
  let status = 0;
  let finalSend = '__unset__';
  const respObj = {
    setStatusCode: (n: number) => { status = n; },
    setHeader: (k: string, v: string) => { headers[k] = v; },
    send: (body: string) => { finalSend = body; },
    // intentionally no .write — simulates non-streaming FC trigger
  };

  await handler({
    requestContext: { http: { method: 'POST' } },
    rawPath: '/test/raw-stream-buffered',
    headers: {},
    body: '{}',
  }, respObj);

  assert.equal(status, 200);
  assert.equal(headers['X-Chrono-Streaming'], 'false');
  assert.equal(headers['X-Chrono-Stream-Reason'], 'respObj-missing-write');
  assert.equal(finalSend, 'data: buffered\n\n');
});
