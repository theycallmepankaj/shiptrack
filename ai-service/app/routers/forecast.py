"""POST /forecast/demand (FR-44, stretch): shipments per city for the next N days.

Seasonal-naive with trend: for each city, the average of the same weekday over the last
4 weeks, scaled by recent growth (last 14 days vs the 14 before, clamped to ±30%).
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

router = APIRouter(tags=["forecast"])
IST = timezone(timedelta(hours=5, minutes=30))


class ForecastRequest(BaseModel):
    days: int = Field(default=7, ge=1, le=28)


class CityForecast(BaseModel):
    city: str
    daily: list[float]
    total: float
    trend: float  # growth factor applied


class ForecastResponse(BaseModel):
    start: date
    days: int
    cities: list[CityForecast]
    total_daily: list[float]


def forecast(counts: dict[str, dict[date, int]], today: date, days: int) -> ForecastResponse:
    """counts: city → {IST date → shipments booked}."""
    out = []
    for city, by_day in counts.items():
        last14 = sum(by_day.get(today - timedelta(d), 0) for d in range(1, 15))
        prev14 = sum(by_day.get(today - timedelta(d), 0) for d in range(15, 29))
        trend = min(1.3, max(0.7, (last14 / prev14) if prev14 else 1.0))
        daily = []
        for k in range(days):
            target = today + timedelta(k)
            same_weekday = [by_day.get(target - timedelta(7 * w), 0) for w in range(1, 5)]
            daily.append(round(sum(same_weekday) / 4 * trend, 1))
        out.append(CityForecast(city=city, daily=daily, total=round(sum(daily), 1), trend=round(trend, 3)))
    out.sort(key=lambda c: -c.total)
    total_daily = [round(sum(c.daily[k] for c in out), 1) for k in range(days)]
    return ForecastResponse(start=today, days=days, cities=out, total_daily=total_daily)


def load_counts(db, today: date) -> dict[str, dict[date, int]]:
    since = datetime.combine(today - timedelta(days=35), datetime.min.time(), IST)
    rows = db.shipments.aggregate([
        {"$match": {"createdAt": {"$gte": since}}},
        {"$group": {"_id": {"city": "$pickup.city", "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt", "timezone": "Asia/Kolkata"}}}, "n": {"$sum": 1}}},
    ])
    counts: dict[str, dict[date, int]] = defaultdict(dict)
    for r in rows:
        if r["_id"]["city"]:
            counts[r["_id"]["city"]][date.fromisoformat(r["_id"]["day"])] = r["n"]
    return counts


@router.post("/forecast/demand", response_model=ForecastResponse)
async def demand(req: ForecastRequest) -> ForecastResponse:
    from app.core.db import get_db

    today = datetime.now(IST).date()
    counts = await run_in_threadpool(load_counts, get_db(), today)
    return forecast(counts, today, req.days)
