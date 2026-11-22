"""Train the ETA model on delivered shipments (FR-41).

Usage:  python -m app.ml.train_eta            (reads MONGO_URI, writes app/ml/model.pkl)

Two gradient-boosting models are trained:
  * p50 — the typical delivery time (median), for reporting accuracy;
  * promise — the PROMISE_QUANTILE percentile (default 85th), used as the promised ETA.
Both are compared on a held-out split with what the app promised before: the distance
formula moved into the 9:00–21:00 delivery window.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.model_selection import train_test_split

from app.core.config import settings
from app.ml.features import FEATURES, encode_many

log = logging.getLogger("train_eta")
IST = timezone(timedelta(hours=5, minutes=30))
MODEL_VERSION = 2


def formula_hours(distance_km: float, speed: str) -> float:
    return 4 + distance_km / 55 if speed == "express" else 18 + distance_km / 35


def align_to_window(when: datetime) -> datetime:
    """Same 9:00–21:00 IST delivery window as server/src/services/eta.js (alignToDeliveryWindow)."""
    local = when.astimezone(IST)
    hour = local.hour + local.minute / 60
    if 9 <= hour < 21:
        return when
    overflow = hour - 21 if hour >= 21 else hour + 24 - 21
    day = local.date() + timedelta(days=1 if hour >= 21 else 0)
    morning = datetime(day.year, day.month, day.day, 9, tzinfo=IST)
    return morning + timedelta(hours=min(overflow / 4, 3))


def baseline_promise_hours(row: dict) -> float:
    """What the app promised before the model: formula hours, moved into the delivery window."""
    h = formula_hours(row["distance_km"], row["speed"])
    created = row.get("created")
    if created is None:
        return h
    return (align_to_window(created + timedelta(hours=h)) - created).total_seconds() / 3600


def load_rows(db) -> tuple[list[dict], list[float]]:
    """Delivered shipments → (feature rows, actual hours from booking to delivery)."""
    rows, hours = [], []
    cursor = db.shipments.find(
        {"status": "DELIVERED", "proofOfDelivery.deliveredAt": {"$ne": None}},
        {"createdAt": 1, "proofOfDelivery.deliveredAt": 1, "distanceKm": 1, "package.weightKg": 1, "speed": 1, "pickup.city": 1, "drop.city": 1},
    )
    for s in cursor:
        created, delivered = s["createdAt"], s["proofOfDelivery"]["deliveredAt"]
        if created.tzinfo is None:
            created, delivered = created.replace(tzinfo=timezone.utc), delivered.replace(tzinfo=timezone.utc)
        h = (delivered - created).total_seconds() / 3600
        if h <= 0 or h > 24 * 10:
            continue  # bad data
        local = created.astimezone(IST)
        rows.append({
            "distance_km": s["distanceKm"],
            "weight_kg": s["package"]["weightKg"],
            "speed": s["speed"],
            "hour": local.hour,
            "weekday": local.weekday(),
            "city": s.get("pickup", {}).get("city", ""),
            "drop_city": s.get("drop", {}).get("city", ""),
            "created": created,  # not a feature — used to compute the fair baseline
        })
        hours.append(h)
    return rows, hours


def train(rows: list[dict], hours: list[float], seed: int = 42) -> dict:
    if len(rows) < settings.min_training_rows:
        raise ValueError(f"Need at least {settings.min_training_rows} delivered shipments to train (have {len(rows)})")
    X, y = encode_many(rows), np.array(hours)
    X_tr, X_te, y_tr, y_te, r_tr, r_te = train_test_split(X, y, rows, test_size=0.2, random_state=seed)

    p50 = GradientBoostingRegressor(loss="absolute_error", n_estimators=300, max_depth=3, learning_rate=0.05, random_state=seed).fit(X_tr, y_tr)
    q = settings.promise_quantile
    promise = GradientBoostingRegressor(loss="quantile", alpha=q, n_estimators=300, max_depth=3, learning_rate=0.05, random_state=seed).fit(X_tr, y_tr)
    rf = RandomForestRegressor(n_estimators=200, min_samples_leaf=3, random_state=seed, n_jobs=-1).fit(X_tr, y_tr)

    baseline = np.array([baseline_promise_hours(r) for r in r_te])
    mae = lambda pred: float(np.mean(np.abs(pred - y_te)))  # noqa: E731
    metrics = {
        "samples": len(rows),
        "test_samples": len(y_te),
        "mae_hours": {"formula": round(mae(baseline), 2), "random_forest": round(mae(rf.predict(X_te)), 2), "gradient_boosting_p50": round(mae(p50.predict(X_te)), 2)},
        # Share of test parcels delivered by the promised time.
        "promise_quantile": q,
        "on_time_if_promised": {"formula": round(float(np.mean(y_te <= baseline)), 3), "model": round(float(np.mean(y_te <= promise.predict(X_te))), 3)},
        "mean_promise_hours": {"formula": round(float(baseline.mean()), 2), "model": round(float(promise.predict(X_te).mean()), 2)},
    }
    return {
        "version": MODEL_VERSION,
        "features": FEATURES,
        "p50": p50,
        "promise": promise,
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def save(bundle: dict, path: str | Path = settings.model_path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    joblib.dump(bundle, tmp)
    tmp.replace(path)  # atomic swap so a running service never reads half a file
    return path


def train_from_db(db=None) -> dict:
    from app.core.db import get_db

    rows, hours = load_rows(db if db is not None else get_db())
    bundle = train(rows, hours)
    save(bundle)
    log.info("ETA model trained: %s", json.dumps(bundle["metrics"]))
    return bundle["metrics"]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        print(json.dumps(train_from_db(), indent=2))
    except ValueError as e:
        print(f"Not trained: {e}", file=sys.stderr)
        sys.exit(1)
