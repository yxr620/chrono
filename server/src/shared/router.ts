export interface FCRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}
export interface FCResponse {
  setStatusCode: (n: number) => void;
  setHeader: (k: string, v: string) => void;
  send: (body: string) => void;
}

export type Handler = (req: FCRequest, body: any, userId?: string) => Promise<unknown>;

export const routes: Array<{ method: string; pattern: RegExp; auth: boolean; handler: Handler }> = [];

export function register(method: string, pattern: RegExp, auth: boolean, handler: Handler) {
  routes.push({ method, pattern, auth, handler });
}
