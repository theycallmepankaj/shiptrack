"""Creates the Atlas Vector Search index on doc_chunks (run once per Atlas cluster).

    python -m app.rag.setup_index          # create (or report) the index
    python -m app.rag.setup_index --print  # just print the definition

The vector size follows EMBEDDING_MODEL, so the index always matches the embeddings.
Then set VECTOR_SEARCH=atlas. Works on the free M0 tier.
"""

import json
import sys
import time

from pymongo.operations import SearchIndexModel

from app.core.config import settings
from app.core.db import get_db
from app.rag.embedder import get_embedder
from app.rag.store import COLLECTION


def definition() -> dict:
    dims = len(get_embedder().embed_query("dimension probe"))
    return {
        "fields": [
            {"type": "vector", "path": "embedding", "numDimensions": dims, "similarity": "cosine"},
            {"type": "filter", "path": "embedder"},
        ]
    }


def main() -> int:
    spec = definition()
    if "--print" in sys.argv:
        print(json.dumps({"name": settings.vector_index, "type": "vectorSearch", "collection": COLLECTION, "definition": spec}, indent=2))
        return 0
    db = get_db()
    if COLLECTION not in db.list_collection_names():
        db.create_collection(COLLECTION)
    coll = db[COLLECTION]
    existing = {i["name"]: i for i in coll.list_search_indexes()}
    if settings.vector_index in existing:
        print(f"Index {settings.vector_index} already exists (status: {existing[settings.vector_index].get('status')}).")
        return 0
    coll.create_search_index(SearchIndexModel(definition=spec, name=settings.vector_index, type="vectorSearch"))
    print(f"Creating {settings.vector_index} ({spec['fields'][0]['numDimensions']} dims)…", end="", flush=True)
    for _ in range(60):
        status = next((i.get("status") for i in coll.list_search_indexes() if i["name"] == settings.vector_index), None)
        if status == "READY":
            print(" ready. Set VECTOR_SEARCH=atlas.")
            return 0
        print(".", end="", flush=True)
        time.sleep(5)
    print(" still building — check Atlas → Search.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
