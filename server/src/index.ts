import { corsHeaders } from './shared/cors.js';
import { HttpError } from './shared/errors.js';
import { routes } from './shared/router.js';

interface FCHttpResponseObject {
  setStatusCode: (n: number) => void;
  setHeader: (k: string, v: string) => void;
  send: (body: string) => void;
  write?: (chunk: Uint8Array) => void;
}

interface FCEventV3 {
  rawPath?: string;
  path?: string;
  headers?: Record<string, string>;
  requestContext?: { http?: { method?: string } };
  httpMethod?: string;
  body?: string;
  isBase64Encoded?: boolean;
}

interface NormalizedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

interface ReadableNodeStreamLike {
  on: (event: 'data' | 'end' | 'error', callback: (...args: never[]) => void) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isReadableNodeStreamLike(value: unknown): value is ReadableNodeStreamLike {
  return isRecord(value) && typeof value.on === 'function';
}

async function readStream(stream: unknown): Promise<string> {
  if (stream == null) return '';
  if (typeof stream === 'string') return stream;
  if (Buffer.isBuffer(stream)) return stream.toString('utf-8');
  if (!isReadableNodeStreamLike(stream)) return '';
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

async function readWebStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf-8');
}

async function normalizeRequest(arg1: unknown): Promise<NormalizedRequest> {
  // FC 2.0 / FC 3.0 stream style: (req, resp, context) — req has .method/.path/.headers
  if (isRecord(arg1) && typeof arg1.method === 'string' && isRecord(arg1.headers)) {
    const body = await readStream(arg1.body);
    return {
      method: String(arg1.method).toUpperCase(),
      path: typeof arg1.path === 'string' ? arg1.path : '/',
      headers: arg1.headers as Record<string, string>,
      body,
    };
  }

  // FC 3.0 event style: (event, context) — event is Buffer/string/object (HTTP API v2 shape)
  let parsed: FCEventV3 = {};
  if (Buffer.isBuffer(arg1)) {
    try { parsed = JSON.parse(arg1.toString('utf-8')); } catch { /* keep empty */ }
  } else if (typeof arg1 === 'string') {
    try { parsed = JSON.parse(arg1); } catch { /* keep empty */ }
  } else if (isRecord(arg1)) {
    parsed = arg1 as FCEventV3;
  }

  const method = (parsed.requestContext?.http?.method ?? parsed.httpMethod ?? 'GET').toUpperCase();
  const path = parsed.rawPath ?? parsed.path ?? '/';
  const headers = parsed.headers ?? {};
  let body = parsed.body ?? '';
  if (parsed.isBase64Encoded && body) {
    body = Buffer.from(body, 'base64').toString('utf-8');
  }
  return { method, path, headers, body };
}

function isStreamResponse(x: unknown): x is FCHttpResponseObject {
  return isRecord(x) && typeof x.setStatusCode === 'function' && typeof x.send === 'function';
}

export const handler = async (arg1: unknown, arg2: unknown): Promise<unknown> => {
  const req = await normalizeRequest(arg1);
  const respObj = isStreamResponse(arg2) ? arg2 : null;

  const origin = req.headers['origin'] ?? req.headers['Origin'];
  const cors = corsHeaders(origin);

  const reply = (
    status: number,
    body: string,
    contentType?: string,
    extraHeaders?: Record<string, string>,
  ): unknown => {
    const hdrs: Record<string, string> = { ...cors, ...(extraHeaders ?? {}) };
    if (contentType) hdrs['Content-Type'] = contentType;
    if (respObj) {
      Object.entries(hdrs).forEach(([k, v]) => respObj.setHeader(k, v));
      respObj.setStatusCode(status);
      respObj.send(body);
      return undefined;
    }
    return { statusCode: status, headers: hdrs, body, isBase64Encoded: false };
  };

  if (req.method === 'OPTIONS') {
    return reply(204, '');
  }

  try {
    const route = routes.find(r => r.method === req.method && r.pattern.test(req.path));
    if (!route) throw new HttpError(404, 'route_not_found');

    let parsedBody: unknown = {};
    if (req.body) {
      try { parsedBody = JSON.parse(req.body); }
      catch { throw new HttpError(400, 'invalid_json'); }
    }

    let userId: string | undefined;
    if (route.auth) {
      const { verifyJwt } = await import('./auth/jwt.js');
      const authHeader = req.headers['authorization'] ?? req.headers['Authorization'] ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) throw new HttpError(401, 'missing_token');
      const claims = verifyJwt(token);
      userId = claims.sub;
    }

    const result = await route.handler(req, parsedBody, userId);
    if (result && typeof result === 'object' && (result as { __raw?: boolean }).__raw) {
      const raw = result as {
        status: number;
        contentType: string;
        body?: string;
        stream?: ReadableStream<Uint8Array>;
      };
      if (raw.stream) {
        // Diagnostic header so curl / browser devtools can see at a glance
        // whether FC handed us a streaming-capable response object.
        const canStream = !!(respObj && respObj.write);
        if (!respObj) {
          console.log('[stream] FC invoked us with no respObj — falling back to buffered relay');
          return reply(raw.status, await readWebStream(raw.stream), raw.contentType, {
            'X-Chrono-Streaming': 'false',
            'X-Chrono-Stream-Reason': 'no-response-object',
          });
        }
        Object.entries(cors).forEach(([k, v]) => respObj.setHeader(k, v));
        respObj.setHeader('Content-Type', raw.contentType);
        respObj.setHeader('X-Chrono-Streaming', canStream ? 'true' : 'false');
        if (!canStream) {
          respObj.setHeader('X-Chrono-Stream-Reason', 'respObj-missing-write');
        }
        respObj.setStatusCode(raw.status);
        if (!respObj.write) {
          console.log('[stream] respObj.write missing — FC trigger is request-response, buffering full body');
          respObj.send(await readWebStream(raw.stream));
          return undefined;
        }
        console.log('[stream] respObj.write available — streaming chunks 1:1');
        const reader = raw.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) respObj.write(value);
        }
        respObj.send('');
        return undefined;
      }
      return reply(raw.status, raw.body ?? '', raw.contentType);
    }
    return reply(200, JSON.stringify(result), 'application/json');
  } catch (err) {
    if (err instanceof HttpError) {
      return reply(err.status, JSON.stringify({ error: err.code, message: err.message }), 'application/json');
    }
    console.error('[handler] unexpected', err);
    return reply(500, JSON.stringify({ error: 'internal' }), 'application/json');
  }
};

// Route registrations (filled by import side effects)
import './auth/register.js';
import './auth/login.js';
import './features/me.js';
import './features/sts.js';
import './features/ai.js';
import './userdata/syncNamespace.js';
import './userdata/devicesEndpoints.js';
import './userdata/storageEndpoint.js';
import './userdata/accountEndpoint.js';
