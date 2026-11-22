"""POST /assign/suggest (FR-43): best driver for a shipment.

Eligible = on duty, has a known location within the radius, and enough spare capacity.
Score (lower is better) = distance to pickup + a penalty per active shipment − a small
bonus for higher ratings, so a nearby but overloaded driver can lose to one a little farther.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.geo import road_km

router = APIRouter(tags=["assign"])

LOAD_PENALTY_KM = 1.5
RATING_BONUS_KM = 2.0


class Candidate(BaseModel):
    driver_id: str
    lat: float | None = None
    lng: float | None = None
    on_duty: bool
    capacity_left_kg: float
    active_shipments: int = Field(ge=0)
    rating: float = Field(default=5, ge=0, le=5)


class AssignRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    weight_kg: float = Field(gt=0)
    max_km: float = Field(default=25, gt=0)
    candidates: list[Candidate] = Field(max_length=500)


class Ranked(BaseModel):
    driver_id: str
    distance_km: float
    score: float


class AssignResponse(BaseModel):
    driver_id: str | None
    ranked: list[Ranked]
    reason: str


@router.post("/assign/suggest", response_model=AssignResponse)
def suggest(req: AssignRequest) -> AssignResponse:
    ranked: list[Ranked] = []
    for c in req.candidates:
        if not c.on_duty or c.lat is None or c.lng is None or c.capacity_left_kg < req.weight_kg:
            continue
        km = road_km((c.lat, c.lng), (req.pickup_lat, req.pickup_lng))
        if km > req.max_km:
            continue
        score = km + LOAD_PENALTY_KM * c.active_shipments - RATING_BONUS_KM * (c.rating - 4.5)
        ranked.append(Ranked(driver_id=c.driver_id, distance_km=round(km, 2), score=round(score, 3)))
    ranked.sort(key=lambda r: r.score)
    if not ranked:
        return AssignResponse(driver_id=None, ranked=[], reason=f"No on-duty driver with space within {req.max_km:g} km")
    best = ranked[0]
    return AssignResponse(driver_id=best.driver_id, ranked=ranked[:10], reason=f"{best.distance_km} km away, best score of {len(ranked)} eligible")
