"""RAG chatbot endpoints (FR-45–FR-52, §4.10).

POST /rag/ingest            extract → chunk → embed → store in doc_chunks
DELETE /rag/documents/{id}  remove a document's chunks
POST /rag/chat              intent → retrieval / live shipment lookup → streamed answer (NDJSON)
GET /rag/status             which embedder / LLM / vector search is in use
"""

import asyncio
import base64
import binascii
import json
import logging
import re
from typing import Literal

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.db import get_db
from app.rag import extractive
from app.rag.chunker import chunk_pages
from app.rag.embedder import get_embedder, min_score
from app.rag.intent import classify
from app.rag.llm import Refused, llm_enabled, stream_answer
from app.rag.loader import UnreadableDocument, extract
from app.rag.prompt import SYSTEM, build_messages, shipment_block
from app.rag.shipment_facts import LookupUnavailable, facts, lookup
from app.rag.store import COLLECTION, delete_chunks, replace_chunks, search

router = APIRouter(tags=["rag"])
log = logging.getLogger(__name__)

GREETING = "Hi! I can track a parcel — just send its tracking ID (like SHP-7X4K2P) — or answer questions about pricing, packaging, prohibited items, refunds and delivery areas."
NOT_SURE = "I'm not sure about that — I couldn't find it in ShipTrack's policy documents. Would you like me to raise a support ticket so our team can get back to you?"
REFUSED = "Sorry, I can't help with that. I can answer questions about your parcels and ShipTrack's policies."
ID_HINT = "tracking IDs look like SHP-7X4K2P"


class IngestRequest(BaseModel):
    document_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    filename: str = Field(min_length=1, max_length=255)
    content_b64: str = Field(max_length=15_000_000)


class IngestResponse(BaseModel):
    chunk_count: int
    pages: int
    embedder: str


@router.post("/rag/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest) -> IngestResponse:
    try:
        content = base64.b64decode(req.content_b64, validate=True)
        pages = extract(content, req.filename)
    except binascii.Error as err:
        raise HTTPException(422, "File content isn't valid base64") from err
    except UnreadableDocument as err:
        raise HTTPException(422, str(err)) from err
    chunks = chunk_pages(pages, settings.chunk_tokens, settings.chunk_overlap)
    emb = get_embedder()
    # Title and section go into the embedded text so short chunks keep their context.
    vectors = emb.embed_passages([f"{req.title}\n{c.section or ''}\n{c.text}" for c in chunks])
    count = replace_chunks(get_db(), req.document_id, req.title, chunks, vectors, emb.name)
    log.info("Ingested %s: %d pages → %d chunks (%s)", req.title, len(pages), count, emb.name)
    return IngestResponse(chunk_count=count, pages=len(pages), embedder=emb.name)


@router.delete("/rag/documents/{document_id}")
def remove(document_id: str) -> dict:
    return {"deleted": delete_chunks(get_db(), document_id)}


@router.get("/rag/status")
def status() -> dict:
    emb = get_embedder()
    return {
        "embedder": emb.name,
        "min_score": min_score(emb),
        "llm": llm_enabled(),
        "model": settings.llm_model if llm_enabled() else None,
        "vector_search": settings.vector_search,
        "chunks": get_db()[COLLECTION].count_documents({"embedder": emb.name}),
    }


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    user_id: str | None = None  # set by Node from the authenticated socket; None for guests


def _event(**payload) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode()


async def _words(text: str):
    """Streams a prepared answer in small pieces so it reads like the LLM's."""
    for piece in re.findall(r"\S+\s*", text):
        yield piece
        await asyncio.sleep(0.012)


def _sources(hits: list[dict], answer: str) -> list[dict]:
    """The documents the answer actually cited ([n] markers), merged per section."""
    cited = {int(n) for n in re.findall(r"\[(\d+)\]", answer)}
    out: dict[tuple, dict] = {}
    for i, h in enumerate(hits, 1):
        if i not in cited:
            continue
        key = (h["documentId"], h.get("section"), h.get("page"))
        if key in out:
            out[key]["refs"].append(i)
        else:
            out[key] = {"documentId": h["documentId"], "title": h["title"], "section": h.get("section"), "page": h.get("page"), "refs": [i]}
    return list(out.values())


async def _retrieve(message: str) -> tuple[list[dict], float]:
    emb = get_embedder()
    qvec = await run_in_threadpool(emb.embed_query, message)
    hits = await run_in_threadpool(search, get_db(), qvec, emb.name, settings.rag_top_k)
    threshold = min_score(emb)
    return [h for h in hits if h["score"] >= threshold], (hits[0]["score"] if hits else 0.0)


@router.post("/rag/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    history = [t.model_dump() for t in req.history]
    intent = classify(req.message, history)

    async def run():
        yield _event(type="meta", intent=intent.kind)
        if intent.kind == "smalltalk":
            async for t in _words(GREETING):
                yield _event(type="token", text=t)
            yield _event(type="done", intent="smalltalk", confident=True, sources=[])
            return

        hits, best = await _retrieve(req.message)
        shipment_ctx, fixed, confident = None, None, True
        if intent.kind == "tracking":
            hits = hits[:2]  # related policy (e.g. cancellation) can still help
            try:
                data = await lookup(req.user_id, intent.tracking_id, intent.latest)
            except LookupUnavailable as err:
                log.warning("Shipment lookup failed: %s", err)
                data, fixed, confident = None, "I can't reach live tracking right now. Please try again in a minute, or check the Track page.", False
            if data:
                lines = facts(data)
                shipment_ctx = shipment_block(lines)
            elif fixed is None:
                if intent.latest and not req.user_id:
                    fixed = f"Please share your tracking ID ({ID_HINT}), or log in to see your latest parcel."
                elif intent.latest:
                    fixed = "You don't have any shipments yet. You can book one from your dashboard."
                else:
                    fixed = f"I couldn't find a shipment with tracking ID {intent.tracking_id}. Please check it — {ID_HINT}."
        elif not hits:
            fixed, confident = NOT_SURE, False  # FR-50: low retrieval score

        answer = ""
        if fixed:
            async for t in _words(fixed):
                answer += t
                yield _event(type="token", text=t)
        else:
            try:
                if not llm_enabled():
                    raise LookupError("no LLM configured")
                async for t in stream_answer(SYSTEM, build_messages(history, req.message, hits, shipment_ctx)):
                    answer += t
                    yield _event(type="token", text=t)
            except Refused:
                answer = REFUSED
                yield _event(type="replace", text=REFUSED)
                hits = []
            except (anthropic.APIError, LookupError) as err:
                if answer:  # failed mid-stream: keep what we have
                    log.warning("LLM stream failed mid-answer: %s", err)
                    note = " … (sorry, I lost my connection — please ask again)"
                    answer += note
                    yield _event(type="token", text=note)
                    confident = False
                else:
                    if not isinstance(err, LookupError):
                        log.warning("LLM unavailable, answering extractively: %s", err)
                    text = extractive.tracking_answer(lines) if shipment_ctx else extractive.policy_answer(req.message, hits)
                    async for t in _words(text):
                        answer += t
                        yield _event(type="token", text=t)
        yield _event(type="done", intent=intent.kind, confident=confident, sources=_sources(hits, answer), best_score=round(best, 3))

    return StreamingResponse(run(), media_type="application/x-ndjson")
