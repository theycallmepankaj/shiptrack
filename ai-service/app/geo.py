import math

ROAD_FACTOR = 1.3  # keep in sync with server/src/services/pricing.js


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance between (lat, lng) points."""
    lat1, lng1 = map(math.radians, a)
    lat2, lng2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def road_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    return haversine_km(a, b) * ROAD_FACTOR
