from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def stop(id, lng, kind="drop", shipment=None):
    return {"id": id, "lat": 12.97, "lng": lng, "kind": kind, "shipment_id": shipment}


def test_orders_stops_along_a_line(headers):
    body = {"start": {"lat": 12.97, "lng": 77.50}, "stops": [stop("c", 77.53), stop("a", 77.51), stop("b", 77.52)]}
    res = client.post("/route/optimize", json=body, headers=headers).json()
    assert res["order"] == ["a", "b", "c"]
    assert res["solver"] == "ortools"
    assert 3 < res["total_km"] < 4.5  # ~3.3 km straight line × 1.3


def test_pickup_always_before_its_drop(headers):
    # The drop of S1 is right next to the driver, but its pickup is far away.
    body = {"start": {"lat": 12.97, "lng": 77.50}, "stops": [
        stop("s1-drop", 77.501, "drop", "S1"), stop("s1-pickup", 77.56, "pickup", "S1"),
        stop("s2-drop", 77.53, "drop", "S2"),
    ]}
    order = client.post("/route/optimize", json=body, headers=headers).json()["order"]
    assert order.index("s1-pickup") < order.index("s1-drop")
    assert set(order) == {"s1-drop", "s1-pickup", "s2-drop"}


def test_beats_greedy_on_a_trap(headers):
    # Greedy takes the nearest stop (just east), sweeps east, then must come all the way back west.
    # Optimal: hop west first, then one sweep east.
    from app.geo import road_km

    body = {"start": {"lat": 12.97, "lng": 77.50}, "stops": [stop("w", 77.489), stop("e1", 77.509), stop("e2", 77.53), stop("e3", 77.55)]}
    res = client.post("/route/optimize", json=body, headers=headers).json()
    p = lambda lng: (12.97, lng)  # noqa: E731
    greedy = road_km(p(77.50), p(77.509)) + road_km(p(77.509), p(77.53)) + road_km(p(77.53), p(77.55)) + road_km(p(77.55), p(77.489))
    assert res["order"] == ["w", "e1", "e2", "e3"]
    assert res["total_km"] < greedy * 0.7


def test_edge_cases(headers):
    assert client.post("/route/optimize", json={"start": {"lat": 1, "lng": 1}, "stops": []}, headers=headers).json()["order"] == []
    dup = {"start": {"lat": 1, "lng": 1}, "stops": [stop("x", 77.5), stop("x", 77.6)]}
    assert client.post("/route/optimize", json=dup, headers=headers).status_code == 422
