import json
import os
from pathlib import Path

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.core import db as dbmod
from app.core.config import settings
from app.rag import embedder as embmod
from app.rag import extractive
from app.rag.chunker import chunk_pages, count_tokens
from app.rag.intent import classify, find_tracking_id
from app.rag.loader import UnreadableDocument, extract
from app.rag.prompt import build_messages
from app.rag.shipment_facts import facts
from app.routers import rag as ragmod

DOCS = Path(__file__).resolve().parents[2] / "server" / "seed-docs"


# ---------- pure units ----------

def test_chunker_respects_size_overlap_and_sections():
    para = " ".join(f"word{i}" for i in range(400))
    text = f"# Policy\n\n## Part A\n\n{para}\n\n{para}\n\n## Part B\n\nShort final section."
    chunks = chunk_pages([(None, text)], max_tokens=500, overlap=50)
    assert all(count_tokens(c.text) <= 560 for c in chunks)
    assert {c.section for c in chunks} == {"Policy › Part A", "Policy › Part B"}
    a = [c for c in chunks if c.section.endswith("Part A")]
    assert len(a) >= 2
    tail = a[0].text.split()[-10:]
    assert " ".join(tail) in a[1].text  # ~50-token overlap carried into the next chunk
    assert chunks[-1].text == "Short final section."


def test_chunker_on_seed_docs():
    for f in DOCS.glob("*.md"):
        chunks = chunk_pages(extract(f.read_bytes(), f.name))
        assert chunks and all(c.section for c in chunks)


def _pdf(text: str) -> bytes:
    """A minimal one-page PDF with `text`, offsets computed so pypdf reads it cleanly."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


def test_loader_pdf_md_and_errors():
    assert extract(_pdf("Refunds take 5 days"), "policy.pdf") == [(1, "Refunds take 5 days")]
    assert extract("# Hi\n\nText".encode(), "a.md") == [(None, "# Hi\n\nText")]
    with pytest.raises(UnreadableDocument):
        extract(b"not a pdf", "x.pdf")
    with pytest.raises(UnreadableDocument):
        extract(b"\xff\xfe\xfa", "x.txt")
    with pytest.raises(UnreadableDocument):
        extract(b"hello", "x.docx")


@pytest.mark.parametrize(
    "message,kind,tid,latest",
    [
        ("Where is SHP-7X4K2P?", "tracking", "SHP-7X4K2P", False),
        ("status shp 7x4k2p", "tracking", "SHP-7X4K2P", False),
        ("Where is my latest parcel?", "tracking", None, True),
        ("Track my parcel", "tracking", None, True),
        ("What can't I ship?", "policy", None, False),
        ("How is the delivery price calculated?", "policy", None, False),
        ("Can I send a power bank?", "policy", None, False),
        ("hello!", "smalltalk", None, False),
    ],
)
def test_intent(message, kind, tid, latest):
    i = classify(message, [])
    assert (i.kind, i.tracking_id, i.latest) == (kind, tid, latest)


def test_intent_follow_up_uses_recent_tracking_id():
    history = [{"role": "user", "content": "where is SHP-ABCDEF"}, {"role": "assistant", "content": "SHP-ABCDEF is in transit"}]
    assert classify("when will it arrive?", history).tracking_id == "SHP-ABCDEF"
    assert classify("what about refunds for fragile items?", history).kind == "policy"
    assert find_tracking_id("no id here") is None


def test_prompt_history_starts_with_user_and_keeps_last_10():
    history = [{"role": "assistant", "content": "hi"}] + [{"role": r, "content": str(i)} for i, r in enumerate(["user", "assistant"] * 6)]
    msgs = build_messages(history, "q?", [{"title": "T", "section": "S", "page": None, "text": "body"}], None)
    assert msgs[0]["role"] == "user" and len(msgs) <= 11
    assert '<document index="1" source="T · S">' in msgs[-1]["content"] and msgs[-1]["content"].endswith("Customer question: q?")


def test_facts_hide_private_details_for_public_access():
    base = {"trackingId": "SHP-ABCDEF", "status": "IN_TRANSIT", "from": {"city": "Pune"}, "to": {"city": "Mumbai"}, "speed": "standard", "estimatedDeliveryAt": "2026-11-23T08:30:00Z", "lastUpdate": None}
    public = facts({"access": "public", "shipment": base})
    assert any(line.startswith("Access: public") for line in public)
    assert not any(line.startswith("Driver") for line in public)
    owner = facts({"access": "owner", "shipment": {**base, "id": "abc", "driverName": "Ravi", "from": {"address": "Baner", "city": "Pune"}}})
    assert "Driver: Ravi" in owner and "Route: Baner, Pune → Mumbai" in owner
    assert "2:00 PM IST" in next(line for line in owner if line.startswith("Estimated"))


def test_extractive_answer_quotes_best_passage_with_its_list():
    hits = [
        {"documentId": "a", "index": 0, "title": "Prohibited", "section": "Prohibited › Intro", "text": "Some items can't be carried."},
        {"documentId": "a", "index": 2, "title": "Prohibited", "section": "Prohibited › Restricted", "text": "Phones are allowed if switched off."},
        {"documentId": "b", "index": 0, "title": "Pricing", "section": "Pricing › Formula", "text": "Base fare is ₹40."},
        {"documentId": "a", "index": 1, "title": "Prohibited", "section": "Prohibited › Items", "text": "We do not accept:\n- Fireworks\n- Loose power banks"},
    ]
    ans = extractive.policy_answer("can I ship a power bank?", hits)
    assert ans.index("**Items** [4]") < ans.index("**Restricted** [2]")  # most overlap leads; same-doc passage follows
    assert "- Loose power banks" in ans and "₹40" not in ans
    # A short intro is followed by the next passage in its document, not just any passage from it.
    ans = extractive.policy_answer("what can't I send?", hits)
    assert "**Intro** [1]" in ans and "**Items** [4]" in ans and "Restricted" not in ans


# ---------- API (needs MongoDB: MONGO_TEST_URI or localhost) ----------

@pytest.fixture
def rag_env(monkeypatch):
    uri = os.environ.get("MONGO_TEST_URI", "mongodb://localhost:27017")
    client = MongoClient(uri, serverSelectionTimeoutMS=1500)
    try:
        client.admin.command("ping")
    except Exception:
        pytest.skip("MongoDB not available")
    database = client["shiptrack_rag_test"]
    database.doc_chunks.drop()
    monkeypatch.setattr(dbmod, "get_db", lambda: database)
    monkeypatch.setattr(ragmod, "get_db", lambda: database)
    monkeypatch.setattr(settings, "embedding_model", "hashing")
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ragmod, "_words", _instant_words)
    embmod.get_embedder.cache_clear()
    from app.main import app

    yield TestClient(app), database
    database.doc_chunks.drop()
    embmod.get_embedder.cache_clear()


async def _instant_words(text):
    for w in text.split(" "):
        yield w + " "


def _ingest(client, headers):
    import base64

    for i, f in enumerate(sorted(DOCS.glob("*.md"))):
        r = client.post("/rag/ingest", headers=headers, json={"document_id": f"{i:024x}", "title": f.stem.replace("-", " ").title(), "filename": f.name, "content_b64": base64.b64encode(f.read_bytes()).decode()})
        assert r.status_code == 200, r.text
        assert r.json()["chunk_count"] > 0


def _chat(client, headers, message, **kw):
    r = client.post("/rag/chat", headers=headers, json={"message": message, **kw})
    assert r.status_code == 200
    events = [json.loads(line) for line in r.text.splitlines() if line]
    text = "".join(e["text"] for e in events if e["type"] == "token")
    return text, events[-1]


def test_ingest_rejects_bad_files(rag_env, headers):
    client, _ = rag_env
    r = client.post("/rag/ingest", headers=headers, json={"document_id": "x", "title": "x", "filename": "x.pdf", "content_b64": "bm90IGEgcGRm"})
    assert r.status_code == 422 and "PDF" in r.json()["detail"]


def test_policy_answer_with_sources_and_low_confidence(rag_env, headers):
    client, database = rag_env
    _ingest(client, headers)
    text, done = _chat(client, headers, "Can I ship a power bank or fireworks?")
    assert done["confident"] is True and done["intent"] == "policy"
    assert "power banks" in text.lower() or "fireworks" in text.lower()
    assert done["sources"] and done["sources"][0]["title"] == "Prohibited Items"

    text, done = _chat(client, headers, "What's the capital of Australia's football team mascot?")
    assert done["confident"] is False and done["sources"] == []
    assert "support ticket" in text

    # Deleting a document removes it from retrieval.
    doc_id = database.doc_chunks.find_one({"title": "Prohibited Items"})["documentId"]
    assert client.delete(f"/rag/documents/{doc_id}", headers=headers).json()["deleted"] > 0
    _, done = _chat(client, headers, "Can I ship fireworks?")
    assert all(s["title"] != "Prohibited Items" for s in done["sources"])


def test_tracking_uses_node_lookup(rag_env, headers, monkeypatch):
    client, _ = rag_env
    seen = {}

    async def fake_lookup(user_id, tracking_id, latest):
        seen.update(user_id=user_id, tracking_id=tracking_id, latest=latest)
        if tracking_id == "SHP-NNNNNN" or (latest and not user_id):
            return None
        return {"access": "public", "shipment": {"trackingId": tracking_id or "SHP-LATEST", "status": "OUT_FOR_DELIVERY", "from": {"city": "Pune"}, "to": {"city": "Mumbai"}, "speed": "express", "estimatedDeliveryAt": None, "lastUpdate": None}}

    monkeypatch.setattr(ragmod, "lookup", fake_lookup)
    text, done = _chat(client, headers, "where is SHP-ABCDEF?", user_id="u1")
    assert seen == {"user_id": "u1", "tracking_id": "SHP-ABCDEF", "latest": False}
    assert "SHP-ABCDEF" in text and "Out for delivery" in text and "Log in as the sender" in text
    text, _ = _chat(client, headers, "where is SHP-NNNNNN?")
    assert "couldn't find" in text
    text, _ = _chat(client, headers, "where is my latest parcel?")
    assert "share your tracking ID" in text


def test_llm_stream_citations_and_fallback(rag_env, headers, monkeypatch):
    client, _ = rag_env
    _ingest(client, headers)
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    captured = {}

    async def fake_stream(system, messages):
        captured["messages"] = messages
        for t in ["Power banks ", "can't be shipped ", "on their own [1]."]:
            yield t

    monkeypatch.setattr(ragmod, "stream_answer", fake_stream)
    text, done = _chat(client, headers, "Can I ship a power bank or fireworks?", history=[{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello!"}])
    assert text == "Power banks can't be shipped on their own [1]."
    assert [s["refs"] for s in done["sources"]] == [[1]]
    assert captured["messages"][0] == {"role": "user", "content": "hi"} and "<documents>" in captured["messages"][-1]["content"]

    async def broken_stream(system, messages):
        raise anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com"))
        yield  # pragma: no cover

    monkeypatch.setattr(ragmod, "stream_answer", broken_stream)
    text, done = _chat(client, headers, "Can I ship a power bank or fireworks?")
    assert text.startswith("Here's what our policy says") and done["sources"]
