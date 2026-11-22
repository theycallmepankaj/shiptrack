import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI

from .core.config import settings
from .core.security import require_internal_key
from .routers import assign, eta, forecast, rag, routing

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("startup")


def _bootstrap_model() -> None:
    """Hosts like Render wipe the disk on each deploy: retrain the ETA model if it's missing."""
    from app.ml.train_eta import train_from_db

    try:
        metrics = train_from_db()
        log.info("ETA model retrained at startup on %s deliveries", metrics["samples"])
    except ValueError as err:  # not enough delivered shipments yet
        log.info("No ETA model yet (%s); using the formula", err)
    except Exception as err:  # noqa: BLE001 — database not reachable yet, etc.
        log.warning("Couldn't train the ETA model at startup: %s", err)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.app_env == "production" and settings.internal_api_key.startswith("dev-"):
        raise RuntimeError("Set a real INTERNAL_API_KEY in production (shared with the Node API)")
    if settings.train_on_startup and not Path(settings.model_path).exists():
        threading.Thread(target=_bootstrap_model, name="eta-bootstrap", daemon=True).start()
    yield


app = FastAPI(title="ShipTrack AI Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    """Public, no data — for the host's health check. Everything else needs X-Internal-Key (NFR-6)."""
    return {"status": "ok"}


for r in (eta.router, routing.router, assign.router, forecast.router, rag.router):
    app.include_router(r, dependencies=[Depends(require_internal_key)])
