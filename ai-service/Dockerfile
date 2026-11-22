FROM python:3.11-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 FASTEMBED_CACHE_PATH=/srv/.cache/fastembed
COPY requirements.txt .
RUN pip install -r requirements.txt
# Bake the embedding model into the image so the first chat doesn't wait for a download.
ARG EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='${EMBEDDING_MODEL}')"
COPY app ./app
# Run as an unprivileged user; the ETA model is written to /srv/models.
RUN useradd --create-home app && mkdir -p /srv/models && chown -R app /srv/models /srv/.cache
USER app
ENV MODEL_PATH=/srv/models/model.pkl PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health', timeout=4)"
# Render (and most hosts) provide $PORT.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
