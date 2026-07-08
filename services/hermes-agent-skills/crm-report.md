# Hermes Agent skill: Hermes CRM report

Lets the open-source **Hermes Agent** (NousResearch CLI) pull a read-only CRM
report from the Hermes AI Sales/CS Control Center, so you can ask the agent
(e.g. over Telegram) things like *"kasih report CRM hari ini"* and it answers
with real numbers from this app.

This is the **inbound** direction (agent → app), complementing the existing
outbound `hermes send` notifications and the supervision sidecar.

## Scope & security

- **Supervisor, not owner.** The endpoint is **read-only**: summary,
  performance, lead funnel, pending follow-ups, recent hot leads, knowledge
  gaps, and Hermes alerts. It cannot mutate data, send WhatsApp messages, or
  touch users/settings.
- Authenticated with a single shared secret in the `x-api-key` header
  (`AGENT_API_KEY` on the app). Keep it secret; rotate by changing the env.
- If `AGENT_API_KEY` is unset on the app, the endpoint returns `503` (fail
  closed).

## Endpoint

```
GET {APP_BASE_URL}/api/v1/agent/crm-report?days=7
Headers: x-api-key: <AGENT_API_KEY>
```

`days` is clamped to 1..90 (default 7). There is also a key-check endpoint:

```
GET {APP_BASE_URL}/api/v1/agent/health
Headers: x-api-key: <AGENT_API_KEY>
```

### Response shape (abridged)

```jsonc
{
  "generatedAt": "2026-06-18T07:00:00.000Z",
  "rangeDays": 7,
  "scope": "supervisor-read-only",
  "summary": { "totalConversations": 0, "activeConversations": 0, "avgResponseTime": 0, "leadsToday": {"hot":0,"warm":0,"cold":0} },
  "performance": { "response": {"avgSeconds":0,"p95Seconds":0,"sampleSize":0}, "aiQuality": {"reviewCount":0,"avgConfidence":0,"fallbackRate":0}, "csat": {} },
  "leadFunnel": [ { "stage": "hot", "count": 0 } ],
  "dailyReport": { /* Hermes daily review aggregate */ },
  "followUps": [ { "id": "", "scheduledAt": "", "message": "", "customerName": "", "customerPhone": "" } ],
  "hotLeads": [ { "id": "", "name": "", "phoneNumber": "", "leadStage": "hot", "leadScore": 0 } ],
  "knowledgeGaps": [ /* AI messages that fell back to admin */ ],
  "alerts": [ /* actionable Hermes reviews */ ]
}
```

## Example tool definition (OpenAI-compatible function schema)

Register this as a tool/skill in your Hermes Agent so it can call the report
on demand. Inject `APP_BASE_URL` and `AGENT_API_KEY` from the agent's config.

```json
{
  "type": "function",
  "function": {
    "name": "hermes_crm_report",
    "description": "Fetch a read-only CRM report (summary, performance, lead funnel, follow-ups, hot leads, knowledge gaps, alerts) from the WhatsApp CS/Sales control center.",
    "parameters": {
      "type": "object",
      "properties": {
        "days": { "type": "integer", "minimum": 1, "maximum": 90, "default": 7 }
      }
    }
  }
}
```

Reference implementation of the call (Python):

```python
import os, requests

def hermes_crm_report(days: int = 7) -> dict:
    base = os.environ["APP_BASE_URL"]           # e.g. https://hermes.example.com
    key = os.environ["AGENT_API_KEY"]
    r = requests.get(
        f"{base}/api/v1/agent/crm-report",
        params={"days": days},
        headers={"x-api-key": key},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()
```

The agent should summarize the JSON for the human; it must not invent numbers
beyond what the report returns (same rule as the in-app supervisor).
