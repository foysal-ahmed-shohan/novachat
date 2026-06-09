"""LLM layer for NovaChat.

Two providers, auto-selected:
  1. Google Gemini  — used when GEMINI_API_KEY is set (reliable + image vision, free tier).
  2. Pollinations    — a keyless community endpoint used as the default fallback so the chat
                       WORKS out of the box with no setup (best-effort; lighter reliability).

Config (env):
  GEMINI_API_KEY   optional — enables Gemini
  NOVA_MODEL       Gemini model (default gemini-2.0-flash)
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncIterator

import httpx

API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
MODEL = os.environ.get("NOVA_MODEL", "gemini-2.0-flash").strip()
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
POLLI_URL = "https://text.pollinations.ai/openai"

SYSTEM_PROMPT = (
    "You are NovaChat, a friendly, highly knowledgeable AI assistant. "
    "Answer clearly, accurately and helpfully, using Markdown (headings, lists, bold, and "
    "fenced code blocks with language tags when relevant). "
    "If a request is ambiguous or missing key details needed to answer well, briefly ask one "
    "clarifying question first instead of guessing. Be concise but complete. "
    "If a topic may be past your training knowledge (e.g. very recent events), say so honestly "
    "rather than inventing facts."
)


def using_gemini() -> bool:
    return bool(API_KEY)


def is_configured() -> bool:
    # Always usable: Gemini if keyed, else the keyless fallback.
    return True


def provider_label() -> str:
    return MODEL if using_gemini() else "community model (keyless)"


# ---------------- Gemini ----------------
def _gemini_contents(messages: list[dict]) -> list[dict]:
    contents = []
    for m in messages:
        role = "model" if m.get("role") == "assistant" else "user"
        parts: list[dict] = []
        text = (m.get("content") or "").strip()
        if text:
            parts.append({"text": text})
        img = m.get("image")
        if img and isinstance(img, str) and img.startswith("data:"):
            try:
                header, b64 = img.split(",", 1)
                mime = header.split(":", 1)[1].split(";", 1)[0]
                parts.append({"inline_data": {"mime_type": mime, "data": b64}})
            except (ValueError, IndexError):
                pass
        contents.append({"role": role, "parts": parts or [{"text": ""}]})
    return contents


async def _gemini_stream(messages: list[dict]) -> AsyncIterator[str]:
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": _gemini_contents(messages),
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048, "topP": 0.95},
    }
    url = f"{GEMINI_BASE}/{MODEL}:streamGenerateContent?alt=sse&key={API_KEY}"
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
        async with client.stream("POST", url, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", "ignore")
                raise RuntimeError(f"Gemini API {resp.status_code}: {body[:300]}")
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                for cand in obj.get("candidates", []):
                    for part in cand.get("content", {}).get("parts", []):
                        if part.get("text"):
                            yield part["text"]


# ---------------- Pollinations (keyless fallback) ----------------
def _openai_messages(messages: list[dict]) -> list[dict]:
    out = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        role = "assistant" if m.get("role") == "assistant" else "user"
        text = (m.get("content") or "").strip()
        img = m.get("image")
        if img and role == "user" and isinstance(img, str) and img.startswith("data:"):
            out.append({"role": role, "content": [
                {"type": "text", "text": text or "Describe this image."},
                {"type": "image_url", "image_url": {"url": img}},
            ]})
        else:
            out.append({"role": role, "content": text})
    return out


async def _polli_reply(messages: list[dict]) -> AsyncIterator[str]:
    payload = {"model": "openai", "messages": _openai_messages(messages), "private": True}
    last_err = ""
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
        for attempt in range(4):
            try:
                r = await client.post(POLLI_URL, json=payload)
                if r.status_code == 200:
                    text = ""
                    try:
                        data = r.json()
                        text = data["choices"][0]["message"]["content"]
                    except Exception:
                        text = r.text
                    text = (text or "").strip()
                    if text:
                        # emit in word chunks for a natural "typing" effect
                        buf = ""
                        for tok in text.split(" "):
                            buf += tok + " "
                            if len(buf) > 24:
                                yield buf
                                buf = ""
                                await asyncio.sleep(0)
                        if buf:
                            yield buf
                        return
                    last_err = "empty response"
                else:
                    last_err = f"HTTP {r.status_code}"
            except Exception as e:
                last_err = str(e)
            await asyncio.sleep(1.2 * (attempt + 1))  # backoff on 429/transient
    raise RuntimeError(f"keyless AI endpoint busy ({last_err}). Add a free GEMINI_API_KEY for reliable answers.")


# ---------------- Public ----------------
async def stream_reply(messages: list[dict]) -> AsyncIterator[str]:
    if using_gemini():
        async for c in _gemini_stream(messages):
            yield c
    else:
        async for c in _polli_reply(messages):
            yield c
