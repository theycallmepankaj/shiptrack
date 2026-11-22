"""Loads the trained ETA model and hot-reloads it when the file changes (e.g. after retraining)."""

import logging
import threading
from pathlib import Path

import joblib

from app.core.config import settings
from app.ml.features import FEATURES, encode

log = logging.getLogger("model_store")
_lock = threading.Lock()
_state: dict = {"mtime": None, "bundle": None}


def get_bundle() -> dict | None:
    path = Path(settings.model_path)
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        _state.update(mtime=None, bundle=None)
        return None
    if mtime != _state["mtime"]:
        with _lock:
            if mtime != _state["mtime"]:
                try:
                    bundle = joblib.load(path)
                    if bundle.get("features") != FEATURES or "promise" not in bundle:
                        raise ValueError("model format changed — retrain the model")
                    _state.update(mtime=mtime, bundle=bundle)
                    log.info("Loaded ETA model trained %s", bundle.get("trained_at"))
                except Exception:  # noqa: BLE001
                    log.exception("Could not load ETA model; using the formula")
                    _state.update(mtime=mtime, bundle=None)
    return _state["bundle"]


def predict(row: dict) -> tuple[float, float] | None:
    """(promise hours, p50 hours) or None if no model is available."""
    bundle = get_bundle()
    if bundle is None:
        return None
    x = [encode(row)]
    return float(bundle["promise"].predict(x)[0]), float(bundle["p50"].predict(x)[0])
