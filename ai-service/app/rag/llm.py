"""Streams the answer from Claude (FR-49). Optional: without LLM_API_KEY the router answers
extractively from the retrieved text instead, so the bot still works in development."""

import os
from collections.abc import AsyncIterator
from functools import lru_cache

import anthropic

from app.core.config import settings


class Refused(Exception):
    pass


def llm_enabled() -> bool:
    return bool(settings.llm_api_key or os.environ.get("ANTHROPIC_API_KEY"))


@lru_cache(maxsize=1)
def _client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.llm_api_key or None, timeout=30.0, max_retries=1)


async def stream_answer(system: str, messages: list[dict]) -> AsyncIterator[str]:
    """Yields text deltas. Raises anthropic.APIError subclasses on API failure, Refused on a refusal."""
    async with _client().beta.messages.stream(
        model=settings.llm_model,
        max_tokens=2048,
        system=system,
        messages=messages,
        output_config={"effort": settings.llm_effort},
        # If a safety classifier declines, the API retries on a suitable fallback model in the same call.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    ) as stream:
        async for text in stream.text_stream:
            yield text
        final = await stream.get_final_message()
    if final.stop_reason == "refusal":
        raise Refused()
