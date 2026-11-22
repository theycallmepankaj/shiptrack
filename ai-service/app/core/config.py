from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    app_env: str = "development"  # "production" enables startup safety checks
    train_on_startup: bool = True  # retrain the ETA model if the file is missing (ephemeral disks)
    mongo_uri: str = "mongodb://localhost:27017/shiptrack"
    internal_api_key: str = "dev-internal-key"
    node_api_url: str = "http://localhost:5000"
    # RAG chatbot (Milestone 8). Without an LLM key the bot answers extractively from the documents.
    llm_api_key: str = ""
    llm_model: str = "claude-opus-5-5"
    llm_effort: str = "low"  # chat: fast first token (NFR-3)
    # "BAAI/bge-small-en-v1.5" (local ONNX via fastembed) or "hashing" (lexical, no download).
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    # "local" = cosine over doc_chunks in this process; "atlas" = Atlas Vector Search ($vectorSearch).
    vector_search: str = "local"
    vector_index: str = "doc_chunks_vector"
    rag_top_k: int = 5
    # Below this best-chunk score the bot says it isn't sure (FR-50). 0 = embedder's default.
    rag_min_score: float = 0.0
    chunk_tokens: int = 500
    chunk_overlap: int = 50
    model_path: str = "app/ml/model.pkl"
    min_training_rows: int = 200
    # Percentile of delivery time we promise: higher = more on-time, longer promises.
    promise_quantile: float = 0.85


settings = Settings()
