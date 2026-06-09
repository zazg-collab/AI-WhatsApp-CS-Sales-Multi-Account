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

# 3. Start
uvicorn main:app --host 0.0.0.0 --port 8675
```

## Config

| Env | Default | Meaning |
|---|---|---|
| `HERMES_AGENT_MODEL` | `Hermes-4-70B` | model id passed to `AIAgent` |
| `HERMES_AGENT_MEMORY` | `true` | let the agent use its persistent memory/context |

Then point the backend at it:

```
HERMES_SIDECAR_URL="http://localhost:8675"
```
