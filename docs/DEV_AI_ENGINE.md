# DEV-only local AI engine (Ollama / Groq)

A development-only AI engine for Site Builder. When it is switched on, **every**
existing text AI feature — Events AI, Alerts, News, Polls, Countdown, Tips,
Gantt, Org Chart text AI, Site Content, Theme, the global/local AI assistants and
every per-widget assistant — transparently uses a local gateway instead of the
production AI backend. No screen, widget or prompt changes.

It cannot be activated in production. See [Production isolation](#production-isolation).

---

## Runtime architecture

```
Existing Site Builder AI UI (AdminEvents, AdminNews, AdminWidgetAIAssistant, ...)
        |
        v
existing AIService.ask()                        <- unchanged public contract
        |
        |  import.meta.env.DEV && VITE_DEV_AI_ENABLED
        v
POST /api/dev-ai/stream         (same origin, local development server)
        |
        v
DEV AI provider router
        |
        +--> Ollama on localhost      (http://127.0.0.1:11434/api/chat, NDJSON)
        |
        +--> Groq API                 (OpenAI-compatible /chat/completions, SSE)
        |
        v
normalized SSE  (data: {"choices":[{"delta":{"content":"..."}}]} ... data: [DONE])
        |
        v
AIService reconstruction  ->  parseJsonFromModel  ->  existing domain normalizers
```

The gateway is mounted on the **Vite development server** (`scripts/dev/viteDevAiPlugin.mjs`,
`apply: 'serve'`) and on the **Express development API** (`server/src/app.js`).
Both use the same transport-neutral middleware, so `npm run dev` and
`npm run dev:vite` both expose the route with no extra process and no extra terminal.

Because the browser talks to its own origin, there is no CORS hop and no proxy to
configure — and no provider identity, base URL or credential reaches the client.

---

## Two independent gates

| Side | Variable | Where |
| --- | --- | --- |
| Browser | `VITE_DEV_AI_ENABLED` | `.env.local` |
| Server | `DEV_AI_ENABLED` | `server/.env.local` or `~/.config/site-builder/dev-ai.env` |

DEV AI operates only when **both** of these hold:

```
import.meta.env.DEV === true   AND   VITE_DEV_AI_ENABLED === true     (browser)
NODE_ENV !== 'production'      AND   DEV_AI_ENABLED === true          (server)
```

With DEV AI disabled the existing production AI behaviour is byte-for-byte unchanged.

---

## Production isolation

This is architectural, not documentation:

1. `createDevAiRuntime()` returns `null` whenever `NODE_ENV === 'production'`, so
   neither host can register `/api/dev-ai` — regardless of `DEV_AI_ENABLED`.
2. The Vite plugin declares `apply: 'serve'`, so it is absent from `vite build`
   output entirely; a production bundle has no dev server to mount it on.
3. `resolveDevAiConfig()` forces `enabled: false` and `routeAllowed: false` in production.
4. The browser resolver requires `import.meta.env.DEV === true`, which Vite
   statically replaces with `false` in every production build.
5. The optional developer secret file is never read when `NODE_ENV=production`.

Regression coverage: `server/src/devAi/productionIsolation.test.js` sets *both*
gates plus a Groq key and model under `NODE_ENV=production` and asserts the route
never becomes operational.

---

## Environment variables

### Browser-visible (`.env.local`)

```env
VITE_DEV_AI_ENABLED=false
```

That is the only DEV AI variable that may carry a `VITE_` prefix, and it is a
boolean switch. **`GROQ_API_KEY` must never be placed in a `VITE_*` variable.**

### Server-only (`server/.env.local`, or the machine-local secret file)

```env
DEV_AI_ENABLED=false
DEV_AI_PROVIDER=auto

DEV_AI_OLLAMA_BASE_URL=http://127.0.0.1:11434
DEV_AI_OLLAMA_MODEL=
DEV_AI_OLLAMA_NUM_PREDICT=

GROQ_API_KEY=
DEV_AI_GROQ_MODEL=
DEV_AI_GROQ_BASE_URL=https://api.groq.com/openai/v1
DEV_AI_GROQ_REASONING_FORMAT=hidden
DEV_AI_GROQ_REASONING_EFFORT=none
DEV_AI_GROQ_MAX_TOKENS=4096

DEV_AI_TIMEOUT_MS=60000
DEV_AI_CONNECT_TIMEOUT_MS=5000
DEV_AI_MAX_INPUT_CHARS=200000
DEV_AI_AUTO_ORDER=ollama,groq
```

No model id is hardcoded in application logic: both models are configuration.

### Optional machine-local developer secret source

```
~/.config/site-builder/dev-ai.env
```

Optional. Read only outside production, only by the Node side, never bundled by
Vite. Precedence:

1. explicit process environment
2. repository-local `server/.env.local` (DEV AI keys only — the rest of the
   server environment is deliberately ignored)
3. machine-local DEV secret file
4. safe defaults

An explicitly supplied, non-empty value is never overwritten by a lower source.
The application works normally when the file does not exist. Never commit it.

Because both file sources are read by the loader itself, `npm run dev` and
`npm run dev:vite` see the same DEV AI configuration without any extra plumbing.

---

## Providers

| `DEV_AI_PROVIDER` | Behaviour |
| --- | --- |
| `ollama` | Ollama only. Never falls back to the cloud — the privacy/offline mode. |
| `groq` | Groq only. Requires `GROQ_API_KEY` and `DEV_AI_GROQ_MODEL`. |
| `auto` | Prefers a healthy local Ollama with the configured model installed; falls back to Groq when Groq is correctly configured. If neither is available, returns `DEV_AI_ALL_PROVIDERS_FAILED`. |

`auto` never falls back to the production AI backend. The production AI path is
used only when DEV AI itself is disabled.

### Fallback rules (auto only)

Falls back on: provider not configured, provider unavailable / connection
refused, model not configured, model not found, `429` (and Groq's `413`
tokens-per-minute overage), upstream `5xx`, timeout before a useful response.

Does **not** fall back on: invalid request, malformed messages, oversized input,
or a permanent 4xx configuration fault such as `401`/`403`.

**Commit semantics:** a provider is committed only once its first token has been
pulled. Response headers are not written before that, so two answers can never be
spliced together. After the stream has materially begun, the original failure is
returned as an SSE error event instead of a silent provider switch.

---

## Routes

| Route | Purpose |
| --- | --- |
| `POST /api/dev-ai/stream` | Normalized SSE chat stream |
| `GET /api/dev-ai/health` | Safe structured status |
| `GET /api/dev-ai/init` | Same payload, for `AIService.init()` compatibility |

Response headers: `x-dev-ai-provider`, `x-proxy-model`, `x-request-id` (all
listed in `Access-Control-Expose-Headers`). `AIService` surfaces these as
`providerUsed`, `modelUsed` and `requestId` without breaking existing callers.

The client-sent `model` field is accepted and logged but is not authoritative:
production model names such as `gpt-4o` mean nothing to Ollama or Groq, so the
gateway always resolves the real model from server-side configuration.

### Health example

```json
{
  "ok": true,
  "enabled": true,
  "mode": "auto",
  "order": ["ollama", "groq"],
  "providers": {
    "ollama": { "configured": true, "reachable": true, "model": "...", "modelAvailable": true },
    "groq":   { "configured": true, "reachable": true, "model": "...", "modelAvailable": true, "apiKeyPresent": true }
  },
  "usableProviders": ["ollama"]
}
```

Health never returns a credential and never performs a paid generation: Groq is
probed through the free model-list endpoint.

---

## Error taxonomy

`DEV_AI_DISABLED`, `DEV_AI_NOT_AVAILABLE_IN_PRODUCTION`, `DEV_AI_INVALID_REQUEST`,
`DEV_AI_INPUT_TOO_LARGE`, `DEV_AI_PROVIDER_NOT_CONFIGURED`,
`DEV_AI_PROVIDER_UNAVAILABLE`, `DEV_AI_MODEL_NOT_CONFIGURED`,
`DEV_AI_MODEL_NOT_FOUND`, `DEV_AI_RATE_LIMITED`, `DEV_AI_TIMEOUT`,
`DEV_AI_UPSTREAM_ERROR`, `DEV_AI_ALL_PROVIDERS_FAILED`.

Messages are Hebrew-friendly; the codes stay machine-readable.

---

## Diagnostics

```bash
npm run dev:ai:check
```

```bash
npm run dev:ai:models
```

```bash
npm run dev:ai:smoke
```

```bash
npm run dev:ai:smoke:structured
```

`dev:ai:check` prints configured / reachable / model-available / latency /
normalized error code per provider. It may consume the key internally but prints
only safe facts.

`dev:ai:smoke` is **explicitly developer-triggered** and is the only command that
spends provider quota. It boots the real Vite dev server, loads the real
`ai.config` resolver and the real `AIService` through Vite's SSR loader, and
sends one Hebrew request through the complete path. `--structured` runs a real
Site Builder News prompt through the existing domain normalizer instead. Nothing
in the build or test pipeline runs either one.

Logs are structured metadata only — request id, provider mode, attempted and
resolved provider, requested and resolved model, message count, input character
count, duration, fallback decision, upstream status, normalized error code.
Prompts, widget/site content, model output text and credentials are dropped by a
field whitelist rather than redacted.

---

## Setup

### Groq only

1. `.env.local`: `VITE_DEV_AI_ENABLED=true`
2. Add the key **server-side** — `server/.env.local` or `~/.config/site-builder/dev-ai.env`:
   `DEV_AI_ENABLED=true`, `DEV_AI_PROVIDER=groq`, `GROQ_API_KEY=...`
3. `npm run dev:ai:models` to see what this account can use, then set `DEV_AI_GROQ_MODEL`.
4. `npm run dev` (or `npm run dev:vite`), then `npm run dev:ai:check`.

### Ollama only

1. Install Ollama yourself. Site Builder never installs it.
2. Pull a multilingual model yourself, e.g. `ollama pull <model>`.
   Site Builder never runs `ollama pull` and never downloads a model.
3. Server-side: `DEV_AI_ENABLED=true`, `DEV_AI_PROVIDER=ollama`, `DEV_AI_OLLAMA_MODEL=<model>`
4. `.env.local`: `VITE_DEV_AI_ENABLED=true`
5. `npm run dev`

### Auto

Configure both. A healthy local Ollama with the configured model installed is
preferred; Groq is the fallback.

If Ollama is configured but not running, development startup does **not** crash:
health reports Ollama unavailable, `auto` uses Groq, and an explicit `ollama`
request returns a useful error.

---

## Troubleshooting

**Model missing (Ollama)** — the error names the exact configured model and the
command to run. Run it yourself: `ollama pull <DEV_AI_OLLAMA_MODEL>`.

**Ollama not running** — `npm run dev:ai:check` shows `reachable: no` with
`DEV_AI_PROVIDER_UNAVAILABLE`. Start Ollama, or use `auto`/`groq`.

**Groq 429, or 413 with `rate_limit_exceeded`** — `DEV_AI_RATE_LIMITED`. Groq
reports a tokens-per-minute overage as `413`, not `429`. Prompt tokens plus
`DEV_AI_GROQ_MAX_TOKENS` are charged against the account's TPM allowance, so on a
small free-tier limit lower `DEV_AI_GROQ_MAX_TOKENS`. In `auto` this falls
through to the next provider; in `groq` mode wait and retry.

**Groq key missing** — `DEV_AI_PROVIDER_NOT_CONFIGURED`. Check that the server
process actually loaded it: `npm run dev:ai:check` prints `api key present`.
Never print the key itself.

**Groq 401 with a key present** — the key is wrong or the server process did not
load the file you edited. Confirm the `Secret file:` line in `dev:ai:check`
points at the file you edited and lists `GROQ_API_KEY` among its keys.

**Configured model unavailable** — `DEV_AI_MODEL_NOT_FOUND`. Run
`npm run dev:ai:models` and update `DEV_AI_GROQ_MODEL`.

**A reasoning model returns `<think>` text instead of JSON, or an empty/truncated
answer** — its chain of thought is landing in the content channel and consuming
the completion budget. `DEV_AI_GROQ_REASONING_FORMAT=hidden` keeps reasoning out
of the content; `DEV_AI_GROQ_REASONING_EFFORT=none` skips it entirely and is what
makes structured Site Builder prompts fit comfortably in the budget. Both are on
by default, and a model that rejects one has that single parameter dropped and
the request retried once (bounded — never a loop). Failing that, raise
`DEV_AI_GROQ_MAX_TOKENS` while staying inside the account's TPM allowance.

**The AI button still calls the production endpoint** — both gates must be on.
Check `VITE_DEV_AI_ENABLED=true` in `.env.local`, restart Vite (env changes need
a restart), and confirm `GET /api/dev-ai/health` returns `"enabled": true`. In
development the AI panels show `DEV AI · <provider> · <model>` next to the answer
when the DEV engine served it.

---

## What this engine never does

- It never installs Ollama, never downloads a model, never runs `ollama pull`,
  and never modifies machine configuration. It detects and explains.
- It never sends `GROQ_API_KEY` to the browser, logs it, or returns it from
  health or errors. The key is read in exactly one module
  (`server/src/devAi/env.js`) and sent in exactly one
  (`server/src/devAi/providers/groq.js`), both server-side.
- It never interprets Site Builder's business JSON. Braces, markdown fences and
  raw JSON are transported verbatim; `parseJsonFromModel` and the existing domain
  normalizers stay authoritative.
- It never makes an external call from an automated test, and never runs a paid
  smoke request as part of a build or test.
- It never modifies or replaces the verified production AI path.
