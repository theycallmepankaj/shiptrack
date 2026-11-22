"""doc_chunks collection: written at ingest, searched at query time.

VECTOR_SEARCH=atlas uses Atlas Vector Search (`$vectorSearch`; create the index with
`python -m app.rag.setup_index`). VECTOR_SEARCH=local (default, works on any MongoDB)
scores every chunk in-process — fine for a policy knowledge base of a few thousand chunks.
"""

from datetime import datetime, timezone

import numpy as np
from bson import ObjectId

from app.core.config import settings

COLLECTION = "doc_chunks"


def _oid(document_id: str):
    return ObjectId(document_id) if ObjectId.is_valid(document_id) else document_id


def replace_chunks(db, document_id: str, title: str, chunks, vectors: np.ndarray, embedder: str) -> int:
    coll = db[COLLECTION]
    coll.delete_many({"documentId": _oid(document_id)})
    now = datetime.now(timezone.utc)
    docs = [
        {
            "documentId": _oid(document_id),
            "title": title,
            "text": c.text,
            "page": c.page,
            "section": c.section,
            "index": c.index,
            "embedder": embedder,
            "embedding": vec.tolist(),
            "createdAt": now,
        }
        for c, vec in zip(chunks, vectors)
    ]
    if docs:
        coll.insert_many(docs)
    return len(docs)


def delete_chunks(db, document_id: str) -> int:
    return db[COLLECTION].delete_many({"documentId": _oid(document_id)}).deleted_count


FIELDS = {"_id": 0, "documentId": 1, "title": 1, "text": 1, "page": 1, "section": 1, "index": 1}


def _hit(row: dict, score: float) -> dict:
    return {**row, "documentId": str(row["documentId"]), "score": round(float(score), 4)}


def search(db, query_vec: np.ndarray, embedder: str, k: int) -> list[dict]:
    if settings.vector_search == "atlas":
        rows = db[COLLECTION].aggregate([
            {"$vectorSearch": {"index": settings.vector_index, "path": "embedding", "queryVector": query_vec.tolist(), "numCandidates": k * 20, "limit": k, "filter": {"embedder": embedder}}},
            {"$project": {**FIELDS, "score": {"$meta": "vectorSearchScore"}}},
        ])
        # Atlas reports cosine as (1 + cos) / 2; convert back so thresholds mean the same thing.
        return [_hit(r, 2 * r.pop("score") - 1) for r in rows]

    rows = list(db[COLLECTION].find({"embedder": embedder}, {**FIELDS, "embedding": 1}))
    if not rows:
        return []
    matrix = np.array([r.pop("embedding") for r in rows], dtype=np.float32)
    scores = matrix @ query_vec  # vectors are L2-normalised: dot = cosine
    top = np.argsort(-scores)[:k]
    return [_hit(rows[i], scores[i]) for i in top]
