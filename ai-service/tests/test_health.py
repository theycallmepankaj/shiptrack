from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_health_is_public():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_other_routes_require_key():
    body = {"distance_km": 5, "weight_kg": 1, "speed": "standard", "hour": 10, "weekday": 1}
    assert client.post("/eta", json=body).status_code == 401
    assert client.post("/eta", json=body, headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.post("/eta", json=body, headers={"X-Internal-Key": settings.internal_api_key}).status_code == 200
    assert client.get("/rag/status").status_code == 401


def test_request_id_is_echoed_or_generated():
    given = client.get("/health", headers={"X-Request-Id": "trace-abc-123"})
    assert given.headers["x-request-id"] == "trace-abc-123"
    made = client.get("/health", headers={"X-Request-Id": "bad id with spaces"})
    assert made.headers["x-request-id"] != "bad id with spaces" and len(made.headers["x-request-id"]) == 32
