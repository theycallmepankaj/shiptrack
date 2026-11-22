"""Text embeddings for retrieval.

Default: BAAI/bge-small-en-v1.5 run locally through fastembed (ONNX, no API key, 384 dims).
`EMBEDDING_MODEL=hashing` uses a lexical hashing embedder instead — no model download, used
by the tests and as a fallback if the model can't be loaded. Chunks record which embedder
made them; retrieval only compares vectors from the same embedder.
"""

import logging
from functools import lru_cache

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer

from app.core.config import settings

log = logging.getLogger(__name__)


class HashingEmbedder:
    name = "hashing"
    # Lexical only (no synonyms), so recall is much weaker than bge — a fallback, not the default.
    min_score = 0.15

    def __init__(self, dims: int = 2048):
        self._v = HashingVectorizer(n_features=dims, alternate_sign=False, stop_words="english", ngram_range=(1, 1), norm="l2", binary=True)

    def _embed(self, texts: list[str]) -> np.ndarray:
        # Crude plural folding ("batteries" ~ "battery") helps lexical matching a lot.
        texts = [" ".join(_fold(w) for w in t.lower().split()) for t in texts]
        return self._v.transform(texts).toarray().astype(np.float32)

    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return self._embed(texts)

    def embed_query(self, text: str) -> np.ndarray:
        return self._embed([text])[0]


def _fold(word: str) -> str:
    w = word.strip(".,;:!?()[]\"'")
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


class FastEmbedder:
    # bge-small cosine on the seeded policies: real questions scored ≥ 0.61, off-topic ones ≤ 0.52.
    min_score = 0.56

    def __init__(self, model: str):
        from fastembed import TextEmbedding

        self.name = model
        self._m = TextEmbedding(model_name=model)

    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return np.array(list(self._m.passage_embed(texts)), dtype=np.float32)

    def embed_query(self, text: str) -> np.ndarray:
        return np.array(next(iter(self._m.query_embed(text))), dtype=np.float32)


@lru_cache(maxsize=1)
def get_embedder():
    if settings.embedding_model == "hashing":
        return HashingEmbedder()
    try:
        return FastEmbedder(settings.embedding_model)
    except Exception as err:  # missing package, no network for the first download, bad name…
        log.warning("Embedding model %s unavailable (%s); using the hashing embedder", settings.embedding_model, err)
        return HashingEmbedder()


def min_score(embedder) -> float:
    return settings.rag_min_score or embedder.min_score
