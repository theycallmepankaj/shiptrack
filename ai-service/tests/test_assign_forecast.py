from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.routers.forecast import forecast

client = TestClient(app)


def cand(id, lng, **kw):
    return {"driver_id": id, "lat": 12.97, "lng": lng, "on_duty": True, "capacity_left_kg": 20, "active_shipments": 0, "rating": 4.5, **kw}


def test_suggests_nearest_eligible_driver(headers):
    body = {"pickup_lat": 12.97, "pickup_lng": 77.60, "weight_kg": 5, "candidates": [
        cand("near-off-duty", 77.601, on_duty=False),
        cand("near-full", 77.602, capacity_left_kg=2),
        cand("near-busy", 77.603, active_shipments=4),
        cand("ok", 77.62),
        cand("too-far", 78.2),
        {**cand("no-location", 77.6), "lat": None, "lng": None},
    ]}
    res = client.post("/assign/suggest", json=body, headers=headers).json()
    assert res["driver_id"] == "ok"  # busy driver's load penalty outweighs ~2 km
    assert [r["driver_id"] for r in res["ranked"]] == ["ok", "near-busy"]


def test_no_eligible_driver(headers):
    res = client.post("/assign/suggest", json={"pickup_lat": 12.97, "pickup_lng": 77.6, "weight_kg": 5, "candidates": [cand("x", 77.6, on_duty=False)]}, headers=headers).json()
    assert res["driver_id"] is None
    assert "No on-duty driver" in res["reason"]


def test_forecast_weekday_pattern_and_trend():
    today = date(2026, 11, 23)  # Monday
    counts = {"Pune": {}, "Delhi": {}}
    for d in range(1, 36):
        day = today - timedelta(d)
        counts["Pune"][day] = 20 if day.weekday() == 0 else 10  # busy Mondays, flat trend
        counts["Delhi"][day] = 10 if d <= 14 else 5  # doubled recently → trend capped at 1.3
    res = forecast(counts, today, 7)
    pune = next(c for c in res.cities if c.city == "Pune")
    assert pune.daily[0] == 20 and pune.daily[1] == 10 and pune.trend == 1.0
    delhi = next(c for c in res.cities if c.city == "Delhi")
    assert delhi.trend == 1.3
    assert res.total_daily[0] == pune.daily[0] + delhi.daily[0]
