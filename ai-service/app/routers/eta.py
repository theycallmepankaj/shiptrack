"""POST /eta (FR-40/41) and POST /ml/train. Uses the trained model when present, else a distance formula."""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.ml import model_store
from app.ml.train_eta import formula_hours, train_from_db

router = APIRouter(tags=["eta"])
log = logging.getLogger("eta")


class EtaRequest(BaseModel):
    distance_km: float = Field(gt=0, le=5000)
    weight_kg: float = Field(gt=0, le=1000)
    speed: Literal["standard", "express"]
    hour: int = Field(ge=0, le=23)
    weekday: int = Field(ge=0, le=6, description="0 = Monday")
    city: str = ""
    drop_city: str = ""


class EtaResponse(BaseModel):
    eta_hours: float  # the promise: PROMISE_QUANTILE percentile of delivery time with the model
    p50_hours: float | None = None
    source: Literal["model", "formula"]


def formula_eta_hours(distance_km: float, speed: str) -> float:
    """Same formula as the Node fallback, so results agree when this service is down."""
    return formula_hours(distance_km, speed)


@router.post("/eta", response_model=EtaResponse)
def predict_eta(req: EtaRequest) -> EtaResponse:
    try:
        pred = model_store.predict(req.model_dump())
    except Exception:  # noqa: BLE001
        log.exception("ETA model failed; using formula")
        pred = None
    if pred is not None:
        promise, p50 = pred
        return EtaResponse(eta_hours=round(max(promise, p50, 0.5), 2), p50_hours=round(max(p50, 0.5), 2), source="model")
    return EtaResponse(eta_hours=round(formula_eta_hours(req.distance_km, req.speed), 2), source="formula")


@router.post("/ml/train")
async def retrain() -> dict:
    """Retrains on delivered shipments in MongoDB; the new model is picked up immediately."""
    try:
        return {"trained": True, "metrics": await run_in_threadpool(train_from_db)}
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


@router.get("/ml/model")
def model_info() -> dict:
    bundle = model_store.get_bundle()
    if bundle is None:
        return {"loaded": False}
    return {"loaded": True, "trained_at": bundle["trained_at"], "metrics": bundle["metrics"], "features": bundle["features"]}
