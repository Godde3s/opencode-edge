/**
 * opencode-edge — OpenAI / Anthropic-compatible edge relay for OpenCode free models.
 *
 * Runs 100% on the Cloudflare Workers FREE plan. No npm dependencies, no build step.
 * Paste worker.js into the Cloudflare dashboard and deploy — that's it.
 *
 * Endpoints:
 *   GET  /                    status dashboard (HTML)
 *   GET  /health              { ok: true }
 *   GET  /v1/models           passthrough (cached 5 min)
 *   POST /v1/chat/completions passthrough (OpenAI style, streaming supported)
 *   POST /v1/messages         Anthropic style -> converted to OpenAI upstream
 *                             (streaming supported, SSE translated back)
 *
 * Optional env vars (wrangler.toml [vars] or dashboard Settings > Variables):
 *   API_KEYS    comma separated list. If set, clients must send
 *               "Authorization: Bearer <key>" or "x-api-key: <key>".
 *   MODEL_MAP   optional "from:to,from2:to2" aliasing applied to incoming models.
 */

const UPSTREAM = 'https://opencode.ai/zen/v1';
const MODELS_TTL = 300; // seconds

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
};

function cors(response) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
  return response;
}

function json(data, status = 200) {
  return cors(new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }));
}

function mapModel(name, env) {
  if (!env || !env.MODEL_MAP) return name;
  for (const pair of String(env.MODEL_MAP).split(',')) {
    const [from, to] = pair.split(':').map((s) => s && s.trim());
    if (from && to && name === from) return to;
  }
  return name;
}

function readApiKey(request) {
  const auth = request.headers.get('authorization') || '';
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  return (request.headers.get('x-api-key') || '').trim();
}

function authorized(request, env) {
  const raw = (env && env.API_KEYS) || '';
  const keys = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!keys.length) return true; // open auth by default (local tooling friendly)
  return keys.includes(readApiKey(request));
}

/* ------------------------------- dashboard ------------------------------- */

function dashboard(request, env) {
  const base = new URL(request.url).origin;
  const protectedMode = !!(env && env.API_KEYS);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>opencode-edge — status</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:radial-gradient(1200px 600px at 20% -10%, #312e81 0%, transparent 60%),
                    radial-gradient(1000px 500px at 90% 10%, #831843 0%, transparent 55%), #0b0b12;
         color:#e7e7ef; min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .card { max-width:760px; width:100%; margin:32px; padding:40px; border-radius:20px;
          background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09); backdrop-filter:blur(14px); }
  h1 { margin:0 0 6px; font-size:28px; letter-spacing:-.02em; }
  .sub { color:#a5a5b8; margin:0 0 26px; font-size:15px; }
  .pill { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12.5px;
          background:rgba(52,211,153,.14); color:#34d399; border:1px solid rgba(52,211,153,.3); }
  code, pre { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  code.k { background:rgba(139,92,246,.18); border:1px solid rgba(139,92,246,.35);
           padding:2px 8px; border-radius:8px; font-size:13px; color:#d8ccff; word-break:break-all; }
  pre { background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.08); border-radius:12px;
        padding:14px 16px; overflow:auto; font-size:12.5px; line-height:1.6; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.12em; color:#a5a5b8; margin:28px 0 10px; }
  a { color:#a78bfa; }
</style>
</head>
<body><div class="card">
  <h1>opencode-edge</h1>
  <p class="sub">OpenAI / Anthropic-compatible edge relay for OpenCode free models · <span class="pill">online</span></p>
  <h2>Base URL</h2>
  <code class="k">${base}/v1</code>
  <h2>Auth</h2>
  <p class="sub">${protectedMode ? 'API key required — send it as <code>Authorization: Bearer &lt;key&gt;</code> or <code>x-api-key</code>.' : 'Open auth — any API key string is accepted.'}</p>
  <h2>Models</h2>
  <p class="sub"><a href="/v1/models">/v1/models</a> — cached for 5 minutes.</p>
  <h2>Use with opencode CLI</h2>
  <pre>opencode auth login
# provider:  OpenAI-compatible
# base URL:  ${base}/v1
# API key:   any-string (or your API_KEYS value)</pre>
  <h2>Use with Anthropic-style tools (claude code)</h2>
  <pre>export ANTHROPIC_BASE_URL=${base}
export ANTHROPIC_API_KEY=any-string</pre>
  <h2>Health</h2>
  <p class="sub"><a href="/health">/health</a></p>
</div></body></html>`;
  return cors(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
}

/* ------------------------------- relaying -------------------------------- */

async function handleModels(request) {
  const res = await fetch(`${UPSTREAM}/models`, { headers: { accept: 'application/json' } });
  const out = new Response(res.body, res);
  out.headers.set('cache-control', `public, max-age=${MODELS_TTL}`);
  return cors(out);
}

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: 'invalid JSON body' } }, 400);
  }
  if (body && body.model) body.model = mapModel(body.model, env);

  const upstream = await fetch(`${UPSTREAM}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: body && body.stream ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return cors(new Response(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
    }));
  }

  const headers = {
    'content-type': upstream.headers.get('content-type') || 'application/json',
    'cache-control': 'no-store',
  };
  return cors(new Response(upstream.body, { status: upstream.status, headers }));
}

/* --------------------------- anthropic protocol --------------------------- */

function anthropicToOpenAI(body, env) {
  const messages = [];
  const system = body.system;
  if (system) {
    const text = Array.isArray(system)
      ? system.map((b) => (b && b.text) || '').join('\n')
      : String(system);
    if (text.trim()) messages.push({ role: 'system', content: text });
  }
  for (const m of body.messages || []) {
    let content = m.content;
    if (Array.isArray(content)) {
      content = content
        .filter((b) => b && (b.type === 'text' || b.type === 'tool_result' || b.type === 'tool_use'))
        .map((b) => (b.type === 'text' ? b.text : JSON.stringify(b)))
        .join('\n');
    }
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(content ?? '') });
  }
  const out = {
    model: mapModel(body.model || 'deepseek-v4-flash-free', env),
    messages,
    max_tokens: body.max_tokens || 4096,
    temperature: body.temperature,
    top_p: body.top_p,
    stream: true, // always stream upstream; de-stream for non-stream clients
  };
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length) out.stop = body.stop_sequences;
  return out;
}

function stopReasonFromFinish(finish) {
  if (finish === 'length') return 'max_tokens';
  if (finish === 'tool_calls') return 'tool_use';
  return 'end_turn';
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/* Non-streaming Anthropic: buffer the upstream SSE stream, then emit one JSON message. */
async function anthropicBuffered(upstream, model) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let id = 'msg_edge';
  let usageIn = 0;
  let usageOut = 0;
  let finish = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      let chunk;
      try { chunk = JSON.parse(payload); } catch { continue; }
      if (chunk.id) id = chunk.id;
      if (chunk.usage) {
        usageIn = chunk.usage.prompt_tokens ?? usageIn;
        usageOut = chunk.usage.completion_tokens ?? usageOut;
      }
      const choice = (chunk.choices && chunk.choices[0]) || {};
      if (choice.delta && choice.delta.content) text += choice.delta.content;
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }

  return json({
    id,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: stopReasonFromFinish(finish),
    stop_sequence: null,
    usage: { input_tokens: usageIn, output_tokens: usageOut },
  });
}

/* Streaming Anthropic: translate OpenAI SSE -> Anthropic SSE on the fly. */
async function anthropicStreaming(upstream, model) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let started = false;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          let chunk;
          try { chunk = JSON.parse(payload); } catch { continue; }
          const choice = (chunk.choices && chunk.choices[0]) || {};
          const delta = choice.delta || {};
          const text = delta.content || '';

          if (!started) {
            started = true;
            controller.enqueue(encoder.encode(sse('message_start', {
              type: 'message_start',
              message: {
                id: chunk.id || 'msg_edge', type: 'message', role: 'assistant', model,
                content: [], usage: { input_tokens: 0, output_tokens: 0 },
              },
            })));
            controller.enqueue(encoder.encode(sse('content_block_start', {
              type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
            })));
          }
          if (text) {
            controller.enqueue(encoder.encode(sse('content_block_delta', {
              type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text },
            })));
          }
          if (choice.finish_reason) {
            controller.enqueue(encoder.encode(sse('content_block_stop', { type: 'content_block_stop', index: 0 })));
            controller.enqueue(encoder.encode(sse('message_delta', {
              type: 'message_delta',
              delta: { stop_reason: stopReasonFromFinish(choice.finish_reason) },
              usage: { output_tokens: (chunk.usage && chunk.usage.completion_tokens) || 0 },
            })));
          }
        }
      }
      controller.enqueue(encoder.encode(sse('message_stop', { type: 'message_stop' })));
      controller.close();
    },
  });

  return cors(new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
  }));
}

async function handleAnthropic(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ type: 'error', error: { type: 'invalid_request_error', message: 'invalid JSON body' } }, 400);
  }
  const model = mapModel(body.model || 'deepseek-v4-flash-free', env);
  const openaiBody = anthropicToOpenAI(body, env);

  const upstream = await fetch(`${UPSTREAM}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(openaiBody),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return cors(new Response(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
    }));
  }

  return body.stream ? anthropicStreaming(upstream, model) : anthropicBuffered(upstream, model);
}

/* --------------------------------- router -------------------------------- */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/' || path === '/index.html') return dashboard(request, env);
    if (path === '/health') return json({ ok: true, service: 'opencode-edge' });
    if (path === '/favicon.ico') return cors(new Response(null, { status: 204 }));

    if (!authorized(request, env)) {
      return json({ type: 'error', error: { type: 'authentication_error', message: 'invalid API key' } }, 401);
    }

    if (path === '/v1/models') return cors(handleModels(request));
    if (path === '/v1/chat/completions') {
      if (request.method !== 'POST') return json({ error: { message: 'POST required' } }, 405);
      return handleChat(request, env);
    }
    if (path === '/v1/messages') {
      if (request.method !== 'POST') return json({ error: { message: 'POST required' } }, 405);
      return handleAnthropic(request, env);
    }
    return json({ error: { message: `no route for ${path}` } }, 404);
  },
};
