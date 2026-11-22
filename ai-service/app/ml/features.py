"""Feature encoding shared by training and prediction, so both always agree."""

import numpy as np

CITIES = ["Bengaluru", "Mumbai", "Delhi", "Pune", "Hyderabad"]
FEATURES = ["distance_km", "weight_kg", "express", "hour", "weekday", "weekend", "rush", "intercity", *[f"city_{c}" for c in CITIES], "city_other"]


def encode(row: dict) -> list[float]:
    """row: distance_km, weight_kg, speed, hour (IST 0-23), weekday (Mon=0), city, drop_city."""
    hour = int(row["hour"])
    city = row.get("city") or ""
    drop_city = row.get("drop_city") or city
    one_hot = [1.0 if city == c else 0.0 for c in CITIES]
    return [
        float(row["distance_km"]),
        float(row["weight_kg"]),
        1.0 if row["speed"] == "express" else 0.0,
        float(hour),
        float(row["weekday"]),
        1.0 if row["weekday"] >= 5 else 0.0,
        1.0 if 8 <= hour <= 10 or 17 <= hour <= 20 else 0.0,
        1.0 if drop_city and city and drop_city != city else 0.0,
        *one_hot,
        0.0 if any(one_hot) else 1.0,
    ]


def encode_many(rows: list[dict]) -> np.ndarray:
    return np.array([encode(r) for r in rows], dtype=float)
