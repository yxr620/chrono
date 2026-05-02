import { config } from './config.js';
import { corsHeaders } from './shared/cors.js';
import { HttpError } from './shared/errors.js';

interface FCRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}
interface FCResponse {
  setStatusCode: (n: number) => void;
  setHeader: (k: string, v: string) => void;
  send: (body: string) => void;
}

type Handler = (req: FCRequest, body: any, userId?: string) => Promise<unknown>;

const routes: Array<{ method: string; pattern: RegExp; auth: boolean; handler: Handler }> = [];

export function register(method: string, pattern: RegExp, auth: boolean, handler: Handler) {
  routes.push({ method, pattern, auth, handler });
}

export const handler = async (req: FCRequest, resp: FCResponse) => {
  const origin = req.headers['origin'] ?? req.headers['Origin'];
  const cors = corsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => resp.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    resp.setStatusCode(204);
    resp.send('');
    return;
  }

  try {
    const route = routes.find(r => r.method === req.method && r.pattern.test(req.path));
    if (!route) throw new HttpError(404, 'route_not_found');

    let parsedBody: any = {};
    if (req.body) {
      try { parsedBody = JSON.parse(req.body); }
      catch { throw new HttpError(400, 'invalid_json'); }
    }

    let userId: string | undefined;
    if (route.auth) {
      // verifyJwt wired up in Task 5
      // const { verifyJwt } = await import('./auth/jwt.js');
      // const auth = req.headers['authorization'] ?? req.headers['Authorization'] ?? '';
      // const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      // if (!token) throw new HttpError(401, 'missing_token');
      // const claims = verifyJwt(token);
      // userId = claims.sub;
      throw new HttpError(401, 'auth_not_wired');
    }

    const result = await route.handler(req, parsedBody, userId);
    resp.setStatusCode(200);
    resp.setHeader('Content-Type', 'application/json');
    resp.send(JSON.stringify(result));
  } catch (err) {
    if (err instanceof HttpError) {
      resp.setStatusCode(err.status);
      resp.setHeader('Content-Type', 'application/json');
      resp.send(JSON.stringify({ error: err.code, message: err.message }));
    } else {
      console.error('[handler] unexpected', err);
      resp.setStatusCode(500);
      resp.send(JSON.stringify({ error: 'internal' }));
    }
  }
};

// Route registrations (filled by import side effects).
// Imports added in Task 7 once the route files exist.
// import './auth/register.js';
// import './auth/login.js';
// import './features/me.js';
