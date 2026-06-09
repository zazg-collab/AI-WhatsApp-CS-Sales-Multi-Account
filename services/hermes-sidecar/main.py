"""
Hermes Supervisor Sidecar
=========================

A thin HTTP wrapper around the NousResearch/hermes-agent `AIAgent` Python
library. It lets the NestJS backend delegate *agentic* supervision (ask /
bot deep-dive) to Hermes Agent, so the supervisor can use Hermes' own model,
tools/skills and memory — while the customer-facing chatbots keep running on
the app's custom OpenAI-compatible engine.

The backend only calls this when HERMES_SIDECAR_URL is configured; otherwise it
falls back to the plain model. This service degrades gracefully: if
hermes-agent isn't installed, /health reports it and /ask returns 503 so the
caller can fall back.

Run:
    pip install -r requirements.txt
    # hermes-agent must be installed so `run_agent` is importable
    uvicorn main:app --host 0.0.0.0 --port 8675
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# hermes-agent exposes the AIAgent class via `run_agent`. Import lazily-safe so
# the sidecar still boots (and reports status) when it isn't installed.
try:
    from run_agent import AIAgent  # type: ignore

    AGENT_AVAILABLE = True
    IMPORT_ERROR = ""
except Exception as exc:  # pragma: no cover - depends on host install
    AIAgent = None  # type: ignore
    AGENT_AVAILABLE = False
    IMPORT_ERROR = str(exc)

MODEL = os.getenv("HERMES_AGENT_MODEL", "Hermes-4-70B")
# Whether the agent may use its persistent memory / context files.
USE_MEMORY = os.getenv("HERMES_AGENT_MEMORY", "true").lower() == "true"

DEFAULT_SYSTEM = (
    "Kamu adalah Hermes, supervisor assistant untuk banyak chatbot WhatsApp "
    "CS/Sales. Jawab berdasarkan DATA yang diberikan, jangan mengarang angka. "
    "Ringkas, actionable, Bahasa Indonesia."
)

app = FastAPI(title="Hermes Supervisor Sidecar")


class AskRequest(BaseModel):
    question: str
    context: Optional[str] = None
    system: Optional[str] = None


class AskResponse(BaseModel):
    answer: str
    via: str = "hermes-agent"


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "agentAvailable": AGENT_AVAILABLE,
        "model": MODEL,
        "importError": IMPORT_ERROR or None,
    }


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    if not AGENT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=f"hermes-agent not available: {IMPORT_ERROR}",
        )

    system = req.system or DEFAULT_SYSTEM
    if req.context:
        system = f"{system}\n\nDATA (JSON real-time):\n{req.context}"

    # Per hermes-agent guidance: one AIAgent per task, never shared.
    agent = AIAgent(
        model=MODEL,
        quiet_mode=True,
        ephemeral_system_prompt=system,
        skip_memory=not USE_MEMORY,
        save_trajectories=False,
    )
    answer = agent.chat(req.question)
    return AskResponse(answer=answer)
