import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

import { handler } from './index.js';

interface HandlerResponseObject {
  setStatusCode: (n: number) => void;
  setHeader: (k: string, v: string) => void;
  send: (body: string) => void;
  write: (chunk: Uint8Array) => void;
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    } else if (value != null) {
      normalized[key] = String(value);
    }
  });
  return normalized;
}

function requestPath(req: IncomingMessage): string {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  return url.pathname;
}

function createResponseObject(res: ServerResponse): HandlerResponseObject {
  let statusCode = 200;

  const ensureStarted = () => {
    if (res.headersSent) return;
    res.statusCode = statusCode;
    res.flushHeaders();
  };

  return {
    setStatusCode(n: number) {
      statusCode = n;
      if (!res.headersSent) res.statusCode = n;
    },
    setHeader(k: string, v: string) {
      if (!res.headersSent) res.setHeader(k, v);
    },
    write(chunk: Uint8Array) {
      ensureStarted();
      res.write(Buffer.from(chunk));
    },
    send(body: string) {
      if (!res.headersSent) res.statusCode = statusCode;
      res.end(body);
    },
  };
}

export function createChronoHttpServer(): Server {
  return createServer(async (req, res) => {
    try {
      await handler({
        method: req.method ?? 'GET',
        path: requestPath(req),
        headers: normalizeHeaders(req.headers),
        body: await readRequestBody(req),
      }, createResponseObject(res));
    } catch (err) {
      console.error('[httpServer] unexpected', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify({ error: 'internal' }));
    }
  });
}

export function listenPortFromEnv(): number {
  const raw = process.env.FC_CUSTOM_LISTEN_PORT ?? process.env.PORT ?? '9000';
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) ? port : 9000;
}

export function startChronoHttpServer(port = listenPortFromEnv(), host = '0.0.0.0'): Server {
  const server = createChronoHttpServer();
  server.timeout = 0;
  server.keepAliveTimeout = 0;
  server.listen(port, host, () => {
    console.log(`[httpServer] listening on ${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startChronoHttpServer();
}
