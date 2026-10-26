<div align="center">

# ⚡ opencode-edge

**OpenAI / Anthropic-compatible edge relay for OpenCode free models — on the Cloudflare Workers FREE plan.**

One file. Zero dependencies. Zero build step. No server, no VPS, no credit card.

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy%20to%20Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](#deploy-in-3-minutes)
[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg?style=flat-square)](./LICENSE)

🌐 [English](README.md) | [**فارسی**](README.fa.md)

</div>

---

## What is this?

`opencode-edge` is a tiny Cloudflare Worker that sits between your AI coding tools and the **free models of [OpenCode Zen](https://opencode.ai)**. It exposes the two endpoints every modern tool already speaks:

- `POST /v1/chat/completions` — OpenAI protocol (opencode CLI, Cursor, Continue, Cline, aider, …)
- `POST /v1/messages` — Anthropic protocol (claude code, and anything using `ANTHROPIC_BASE_URL`), converted on the fly — **including streaming SSE translation**

Because it runs on Cloudflare's edge network, there is nothing to install on your machine: no Node process, no proxy pool to babysit, no ports to forward. The free Workers plan (100,000 requests/day) is more than enough for personal coding sessions.

## Features

| | |
|---|---|
| ⚡ | Single `worker.js` — no npm install, no bundler |
| 🔀 | OpenAI **and** Anthropic protocols, auto-converted |
| 🌊 | Full streaming support in both protocols (SSE ⇄ SSE) |
| 🔐 | Required `API_KEYS` protection — refuses to relay until a key is configured |
| 🗺️ | Optional `MODEL_MAP` aliasing (e.g. `gpt-4o → deepseek-v4-flash-free`) |
| 📊 | Built-in dark status dashboard at `/` |
| 🌍 | Global edge network — low latency from anywhere |

## Deploy in 3 minutes (no expertise needed)

**Option A — dashboard (easiest):**

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com) (no credit card needed).
2. Go to **Workers & Pages → Create → Worker → Deploy** (the hello-world is fine).
3. Click **Edit code**, delete everything, paste the full contents of [`worker.js`](./worker.js), click **Deploy**.
4. **Settings → Variables → Add variable**: `API_KEYS` = a long random string (comma-separate several keys). Without this the worker answers `/v1` with **503** on purpose.
5. Your endpoint is ready: `https://your-worker.your-subdomain.workers.dev/v1`

**Option B — CLI:**

```bash
npm i -g wrangler
wrangler login
wrangler deploy
```

### Use it

```bash
# opencode CLI (OpenAI-compatible)
opencode auth login        # base URL: https://<your-worker>/v1 — key: your API_KEYS value

# claude code (Anthropic-compatible)
export ANTHROPIC_BASE_URL=https://<your-worker>
export ANTHROPIC_API_KEY=<your API_KEYS value>

# plain curl
curl https://<your-worker>/v1/chat/completions \
  -H "Authorization: Bearer $API_KEYS" -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-flash-free","messages":[{"role":"user","content":"hi"}]}'
```

`API_KEYS` is **required**: set it in the dashboard (**Settings → Variables**) or in `wrangler.toml`. While it is unset the worker returns `503` for every `/v1` call, because otherwise anyone who finds the URL could spend your free-model quota.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `API_KEYS` | *(required)* | Comma-separated keys; requests must present one. Unset → `/v1` returns `503`. |
| `MODEL_MAP` | *(unset → passthrough)* | Aliases like `"gpt-4o:deepseek-v4-flash-free"`. |

## Notes & scope

- The relay is protocol translation + caching only: it stores nothing, logs nothing, and holds no state.
- Availability and rate limits of the upstream free models are owned by OpenCode — this project simply speaks both client dialects to them from the nearest edge location.
- If you prefer a *local* process with a rotating public-proxy pool, desktop tray and dashboard instead, check out [Parsa013Ah/OpenCode-Unlimited-ProxyPool](https://github.com/Parsa013Ah/OpenCode-Unlimited-ProxyPool), which inspired this edge-first take (no upstream code used here — independent implementation).

## License

[MIT](./LICENSE) © 2026 Usf (Godde3s)
