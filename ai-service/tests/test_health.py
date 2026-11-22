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
