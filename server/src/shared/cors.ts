import { config } from '../config.js';

const LOCAL_APP_ORIGINS = new Set([
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
]);

function isAllowedOrigin(origin: string | undefined): origin is string {
  if (!origin) return false;
  if (config.corsAllowedOrigins.includes(origin)) return true;

  if (!LOCAL_APP_ORIGINS.has(origin)) return false;

  return config.corsAllowedOrigins.some((allowedOrigin) => LOCAL_APP_ORIGINS.has(allowedOrigin));
}

export function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = isAllowedOrigin(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
