import random

from fastapi.testclient import TestClient

from app.main import app
from app.ml.train_eta import formula_hours, save, train

client = TestClient(app)
BODY = {"distance_km": 70, "weight_kg": 2, "speed": "standard", "hour": 10, "weekday": 2, "city": "Bengaluru"}


def synthetic(n=1200, seed=1):
    """Delivery hours that depend on city, rush hour, weight and speed — like the seeded data."""
    rnd = random.Random(seed)
    slow = {"Bengaluru": 0.06, "Mumbai": 0.12, "Delhi": 0.09, "Pune": 0.0, "Hyderabad": 0.03}
    rows, hours = [], []
    for _ in range(n):
        city = rnd.choice(list(slow))
        r = {"distance_km": rnd.uniform(2, 30), "weight_kg": rnd.uniform(0.3, 20), "speed": rnd.choice(["standard", "express"]),
             "hour": rnd.randint(8, 20), "weekday": rnd.randint(0, 6), "city": city, "drop_city": city}
        rush = 0.14 if r["hour"] in (8, 9, 10, 17, 18, 19, 20) else 0
        f = 0.6 + rush + slow[city] + (0.1 if r["weight_kg"] > 10 else 0) + rnd.gauss(0, 0.14)
        rows.append(r)
        hours.append(formula_hours(r["distance_km"], r["speed"]) * max(f, 0.35))
    return rows, hours


def test_formula_when_no_model(tmp_model, headers):
    std = client.post("/eta", json=BODY, headers=headers).json()
    exp = client.post("/eta", json={**BODY, "speed": "express"}, headers=headers).json()
    assert std == {"eta_hours": 20.0, "p50_hours": None, "source": "formula"}
    assert exp["eta_hours"] < std["eta_hours"]


def test_trained_model_beats_formula_and_hot_reloads(tmp_model, headers):
    rows, hours = synthetic()
    bundle = train(rows, hours)
    m = bundle["metrics"]
    assert m["mae_hours"]["gradient_boosting_p50"] < m["mae_hours"]["formula"]
    assert m["promise_quantile"] == 0.85
    assert 0.78 <= m["on_time_if_promised"]["model"] <= 0.93  # ≈ the promise percentile

    save(bundle, tmp_model)
    res = client.post("/eta", json=BODY, headers=headers).json()
    assert res["source"] == "model"
    assert res["p50_hours"] <= res["eta_hours"]
    # Learned effects: Mumbai slower than Pune; rush hour slower than mid-afternoon.
    eta = lambda **kw: client.post("/eta", json={**BODY, "distance_km": 10, **kw}, headers=headers).json()["eta_hours"]  # noqa: E731
    assert eta(city="Mumbai") > eta(city="Pune")
    assert eta(hour=18) > eta(hour=14)
    assert client.get("/ml/model", headers=headers).json()["loaded"] is True


def test_refuses_to_train_on_too_little_data(tmp_model):
    rows, hours = synthetic(50)
    try:
        train(rows, hours)
        raise AssertionError("should refuse")
    except ValueError as e:
        assert "at least" in str(e)


def test_validation_and_auth(headers):
    assert client.post("/eta", json={**BODY, "distance_km": -1}, headers=headers).status_code == 422
    assert client.post("/eta", json=BODY).status_code == 401


def test_baseline_uses_the_delivery_window():
    from datetime import datetime, timedelta, timezone

    from app.ml.train_eta import IST, align_to_window, baseline_promise_hours

    assert align_to_window(datetime(2026, 11, 23, 15, tzinfo=IST)) == datetime(2026, 11, 23, 15, tzinfo=IST)
    assert align_to_window(datetime(2026, 11, 23, 23, tzinfo=IST)) == datetime(2026, 11, 24, 9, 30, tzinfo=IST)
    # Booked 19:00 → formula 18.29 h lands 13:17 next day (inside the window, unchanged).
    created = datetime(2026, 11, 23, 13, 30, tzinfo=timezone.utc)
    assert round(baseline_promise_hours({"distance_km": 10, "speed": "standard", "created": created}), 2) == 18.29
    # Booked 13:00 IST → 07:17 next morning → moved to ~11:15.
    created = datetime(2026, 11, 23, 7, 30, tzinfo=timezone.utc)
    assert baseline_promise_hours({"distance_km": 10, "speed": "standard", "created": created}) > 18.29 + 3.5
    assert timedelta(0) < timedelta(hours=1)
