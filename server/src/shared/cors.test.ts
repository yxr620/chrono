import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.OSS_REGION ??= 'oss-cn-test';
process.env.OSS_BUCKET ??= 'chrono-test';
process.env.OSS_ACCESS_KEY_ID ??= 'test-access-key-id';
process.env.OSS_ACCESS_KEY_SECRET ??= 'test-access-key-secret';
process.env.CORS_ALLOWED_ORIGINS = 'capacitor://localhost,http://localhost:5173';

const { corsHeaders } = await import('./cors.js');

test('allows Android localhost when Capacitor localhost is configured', () => {
  const headers = corsHeaders('http://localhost');

  assert.equal(headers['Access-Control-Allow-Origin'], 'http://localhost');
});

test('allows secure Android localhost when Capacitor localhost is configured', () => {
  const headers = corsHeaders('https://localhost');

  assert.equal(headers['Access-Control-Allow-Origin'], 'https://localhost');
});

test('keeps configured localhost origins working', () => {
  const headers = corsHeaders('capacitor://localhost');

  assert.equal(headers['Access-Control-Allow-Origin'], 'capacitor://localhost');
});

test('rejects unrelated origins', () => {
  const headers = corsHeaders('https://example.com');

  assert.equal(headers['Access-Control-Allow-Origin'], '');
});