"""POST /route/optimize (FR-42): best visiting order for one driver, with OR-Tools.

Stops may be paired (pickup → drop of the same shipment): the drop must come after its
pickup. The route is open — it starts at the driver and ends at the last stop.
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from pydantic import BaseModel, Field, model_validator

from app.geo import road_km

router = APIRouter(tags=["routing"])
log = logging.getLogger("routing")


class Point(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Stop(Point):
    id: str
    kind: Literal["pickup", "drop"] = "drop"
    shipment_id: str | None = None  # stops sharing a shipment_id: pickup before drop


class RouteRequest(BaseModel):
    start: Point
    stops: list[Stop] = Field(max_length=60)
    time_limit_ms: int = Field(default=1000, ge=100, le=5000)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({s.id for s in self.stops}) != len(self.stops):
            raise ValueError("stop ids must be unique")
        return self


class RouteResponse(BaseModel):
    order: list[str]
    total_km: float
    solver: Literal["ortools", "trivial"]


def _km(a, b) -> float:
    return road_km((a.lat, a.lng), (b.lat, b.lng))


def solve(req: RouteRequest) -> RouteResponse:
    stops = req.stops
    if len(stops) <= 1:
        return RouteResponse(order=[s.id for s in stops], total_km=round(sum(_km(req.start, s) for s in stops), 2), solver="trivial")

    # Nodes: 0 = driver start, 1..n = stops, n+1 = free "end" (open route).
    points = [req.start, *stops]
    n = len(points)
    end = n
    scale = 1000  # metres as integers

    def dist(i: int, j: int) -> int:
        if j == end or i == end:
            return 0
        return int(_km(points[i], points[j]) * scale)

    manager = pywrapcp.RoutingIndexManager(n + 1, 1, [0], [end])
    routing = pywrapcp.RoutingModel(manager)
    transit = routing.RegisterTransitCallback(lambda a, b: dist(manager.IndexToNode(a), manager.IndexToNode(b)))
    routing.SetArcCostEvaluatorOfAllVehicles(transit)
    routing.AddDimension(transit, 0, 10_000_000, True, "Distance")
    distance = routing.GetDimensionOrDie("Distance")

    # Pickup-and-delivery pairs.
    by_shipment: dict[str, dict[str, int]] = {}
    for idx, s in enumerate(stops, start=1):
        if s.shipment_id:
            by_shipment.setdefault(s.shipment_id, {})[s.kind] = idx
    for pair in by_shipment.values():
        if "pickup" in pair and "drop" in pair:
            p, d = manager.NodeToIndex(pair["pickup"]), manager.NodeToIndex(pair["drop"])
            routing.AddPickupAndDelivery(p, d)
            routing.solver().Add(routing.VehicleVar(p) == routing.VehicleVar(d))
            routing.solver().Add(distance.CumulVar(p) <= distance.CumulVar(d))

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.FromMilliseconds(req.time_limit_ms)

    solution = routing.SolveWithParameters(params)
    if solution is None:
        raise HTTPException(422, "No feasible route")
    order, total = [], 0
    index = routing.Start(0)
    while not routing.IsEnd(index):
        nxt = solution.Value(routing.NextVar(index))
        node = manager.IndexToNode(index)
        if node != 0:
            order.append(stops[node - 1].id)
        total += dist(node, manager.IndexToNode(nxt))
        index = nxt
    return RouteResponse(order=order, total_km=round(total / scale, 2), solver="ortools")


@router.post("/route/optimize", response_model=RouteResponse)
def optimize(req: RouteRequest) -> RouteResponse:
    return solve(req)
