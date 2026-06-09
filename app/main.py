"""NovaChat — FastAPI backend: serves the chat UI and a streaming /api/chat endpoint."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

from . import llm

BASE = Path(__file__).resolve().parent.parent
STATIC = BASE / "static"

app = FastAPI(title="NovaChat", version="1.0.0")


@app.get("/api/health")
async def health():
    return {"ok": True, "configured": llm.is_configured(), "model": llm.provider_label()}


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    messages = body.get("messages") or []
    if not isinstance(messages, list) or not messages:
        return JSONResponse({"error": "messages required"}, status_code=400)

    if not llm.is_configured():
        async def notconf():
            yield ("⚠️ **NovaChat isn't connected to an AI model yet.**\n\n"
                   "The owner needs to add a free Google Gemini API key "
                   "(`GEMINI_API_KEY`) to enable real answers. Once set, I'll respond to "
                   "anything you ask — text, images and voice.")
        return StreamingResponse(notconf(), media_type="text/plain; charset=utf-8")

    async def gen():
        try:
            async for chunk in llm.stream_reply(messages):
                yield chunk
        except Exception as e:  # surface a readable error to the UI stream
            yield f"\n\n⚠️ Error contacting the AI service: {e}"

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


# Static assets + SPA fallback
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/")
async def index():
    return FileResponse(str(STATIC / "index.html"))
