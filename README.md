# ✦ NovaChat — AI Chat Assistant

A real, ChatGPT-style AI assistant. Ask anything in text, **upload images** to ask about them,
use **voice input**, and get **streaming** answers with Markdown + code formatting. Conversations
are saved locally so you can switch between chats.

> **Real, not a demo** — answers come from a live LLM (Google Gemini). It needs a
> `GEMINI_API_KEY` (free tier) set on the server to respond; without it, the UI loads and
> tells you it isn't connected yet.

## Features
- **Streaming** assistant responses (typed out live)
- **Image upload** → vision (ask "what's in this picture?")
- **🎤 Voice input** via the browser's Speech Recognition (free, no key)
- **Markdown + code blocks**, multi-turn memory, asks a clarifying question when needed
- **Conversation sidebar** (new chat / switch / delete), saved in `localStorage`
- Mobile-friendly, dark theme

## Stack
- **Backend:** FastAPI (Python) — `/api/chat` proxies to Gemini with SSE streaming + vision
- **Frontend:** vanilla HTML/CSS/JS, `marked` + `DOMPurify` for safe Markdown
- **Deploy:** Docker → Render web service (free)

## Configure (the one required step)
1. Get a **free** Gemini API key at **https://aistudio.google.com/app/apikey** (no payment).
2. Set it as an env var on the server: `GEMINI_API_KEY=...` (optionally `NOVA_MODEL`, default `gemini-2.0-flash`).

## Run locally
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY=your_key_here
uvicorn app.main:app --reload --port 8000   # http://localhost:8000
```

## API
- `POST /api/chat` — `{ messages: [{role, content, image?}] }` → streamed text reply
- `GET /api/health` — `{ ok, configured, model }`

## Notes
LLMs have a knowledge cutoff, so very recent events may not be known — NovaChat will say so
rather than invent facts. Add web search later for live info.
