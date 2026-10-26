// test-worker.mjs — offline checks for the edge relay's auth policy.
// Run: node test-worker.mjs   (no wrangler, no network)
import assert from 'node:assert/strict';
import worker from './worker.js';

let upstreamCalls = 0;
globalThis.fetch = async () => {
  upstreamCalls++;
  return new Response(JSON.stringify({ data: [{ id: 'fake-model' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const env = (v) => ({ ...v });

async function call(path, { method = 'GET', env: e, headers = {} } = {}) {
  const req = new Request(`https://edge.example${path}`, { method, headers });
  return worker.fetch(req, e);
}

// 1. Unconfigured deployment must refuse to relay (fail closed).
{
  const res = await call('/v1/chat/completions', { method: 'POST', env: env({}) });
  assert.equal(res.status, 503, 'unconfigured worker must answer 503');
  const body = await res.json();
  assert.match(body.error.message, /API_KEYS/);
}

// 2. Configured deployment rejects a missing or wrong key.
{
  const res = await call('/v1/models', { env: env({ API_KEYS: 'k1,k2' }) });
  assert.equal(res.status, 401, 'missing key must be 401');

  const res2 = await call('/v1/models', { env: env({ API_KEYS: 'k1' }), headers: { authorization: 'Bearer nope' } });
  assert.equal(res2.status, 401, 'wrong key must be 401');

  const res3 = await call('/v1/models', { env: env({ API_KEYS: '' }) });
  assert.equal(res3.status, 503, 'empty API_KEYS must not mean open auth');
}

// 3. A valid key is accepted and reaches the patched upstream.
{
  upstreamCalls = 0;
  const res = await call('/v1/models', { env: env({ API_KEYS: 'k1,k2' }), headers: { 'x-api-key': 'k2' } });
  assert.equal(res.status, 200, 'valid key must reach /v1/models');
  assert.equal(upstreamCalls, 1, 'models call must proxy upstream exactly once');
  assert.equal(res.headers.get('access-control-allow-origin'), '*', 'CORS header must survive');
  const body = await res.json();
  assert.equal(body.data[0].id, 'fake-model');
}

// 4. The dashboard explains the unconfigured state instead of claiming "open auth".
{
  const html = await (await call('/', { env: env({}) })).text();
  assert.match(html, /API_KEYS is not configured/);
  assert.doesNotMatch(html, /Open auth/);
}

console.log('all worker auth checks passed');
