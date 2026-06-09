# NovaChat — project CLAUDE.md

> GLOBAL rules live in `workspace/CLAUDE.md`. This file holds THIS project's specifics.

## What it is
A real, ChatGPT-style AI assistant ("NovaChat"). Users ask anything (text), upload images
(vision), use voice input, and get streaming Markdown answers. Multi-turn memory; asks a
clarifying question when a request is ambiguous. Conversations saved in localStorage.

## Stack
- Backend: **FastAPI** (Python) — `/api/chat` streams the reply; `app/llm.py` is the provider layer.
- LLM providers (auto): **Gemini** when `GEMINI_API_KEY` is set (reliable + image vision),
  else a **keyless community fallback** (Pollinations) so it works out of the box for light use.
- Frontend: vanilla HTML/CSS/JS, `marked` + `DOMPurify` (CDN) for safe Markdown.
- Deploy: **Docker → Render web service (free plan)**.

## Structure
- `app/main.py` — FastAPI app, `/api/chat` (StreamingResponse), `/api/health`, serves `static/`
- `app/llm.py` — provider layer: Gemini SSE stream + Pollinations fallback, system prompt, vision
- `static/index.html` / `styles.css` / `app.js` — ChatGPT-style UI (sidebar, streaming, voice, image)
- `Dockerfile`, `render.yaml`

## How to run
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# optional but recommended for reliability + vision:
export GEMINI_API_KEY=...        # free key: https://aistudio.google.com/app/apikey
uvicorn app.main:app --reload --port 8000
```

## Decisions & notes
- **Works with no key** via the keyless fallback (best-effort, can be slow/rate-limited);
  set `GEMINI_API_KEY` for fast, reliable answers and image understanding.
- Streaming to the browser via `StreamingResponse` (plain text chunks); UI renders Markdown live.
- **Voice** = browser Web Speech API (free, no key). **Images** sent as data URLs.
- Knowledge cutoff applies — for live events, add a web-search tool later.
- Deployed on Render free plan via Docker (per workspace deploy gotchas: free plan, public repo).

## Status
deployed — live URL recorded in `workspace/PROJECTS.md`.
