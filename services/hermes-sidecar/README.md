# Hermes Supervisor Sidecar

A small FastAPI service that wraps the [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
`AIAgent` Python library so the NestJS backend can delegate **agentic
supervision** (the "Tanya Hermes" assistant and per-bot deep-dives) to Hermes
Agent — using its model, tools/skills and memory.

The customer-facing chatbots stay on the app's own OpenAI-compatible engine;
this sidecar only powers the *supervisor*.

## How it fits

```
NestJS HermesService ──HTTP──▶ this sidecar ──▶ AIAgent (hermes-agent)
   (falls back to the plain model if the sidecar is unset or unavailable)
```

The backend calls the sidecar only when `HERMES_SIDECAR_URL` is set. If
hermes-agent isn't installed, `/health` reports `agentAvailable: false` and
`/ask` returns 503, so the backend transparently falls back.

## Endpoints

- `GET /health` — status, model, whether `run_agent` imported.
- `POST /ask` — `{ question, context?, system? }` → `{ answer, via }`.

## Run

```bash
# 1. Install Hermes Agent (provides the run_agent module)
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes model        # pick a model, e.g. Hermes-4-70B
hermes gateway setup  # (optional) configure outbound platforms for `hermes send`

# 2. Install sidecar deps (into the same Python env that has run_agent)
pip install -r requirements.txt

# 3. Start — bind to loopback and require a token (see Security below)
export HERMES_SIDECAR_TOKEN=$(openssl rand -hex 32)
uvicorn main:app --host 127.0.0.1 --port 8675
```

## Security

`/ask` runs an LLM agent with the app's data as context, so it must not be an
open endpoint (audit C4):

- **Bind to `127.0.0.1`** (never `0.0.0.0`) unless it sits behind an
  authenticating proxy on a trusted network.
- **Set `HERMES_SIDECAR_TOKEN`.** When set, every `/ask` call must carry
  `Authorization: Bearer <token>`. Configure the same value as
  `HERMES_SIDECAR_TOKEN` in the backend so `HermesAgentClient` sends it.
- Request bodies are size-capped (`HERMES_SIDECAR_MAX_QUESTION` /
  `HERMES_SIDECAR_MAX_CONTEXT`) to bound prompt abuse.

## Config

| Env | Default | Meaning |
|---|---|---|
| `HERMES_AGENT_MODEL` | `Hermes-4-70B` | model id passed to `AIAgent` |
| `HERMES_AGENT_MEMORY` | `true` | let the agent use its persistent memory/context |
| `HERMES_SIDECAR_TOKEN` | _(unset)_ | bearer token required on `/ask` when set |
| `HERMES_SIDECAR_MAX_QUESTION` | `8000` | max chars in `question` |
| `HERMES_SIDECAR_MAX_CONTEXT` | `32000` | max chars in `context` |

Then point the backend at it:

```
HERMES_SIDECAR_URL="http://127.0.0.1:8675"
HERMES_SIDECAR_TOKEN="<same value as the sidecar>"
```
