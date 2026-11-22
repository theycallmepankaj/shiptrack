"""Fetches live shipment data from Node's internal API (FR-47/48) and words it as facts.

Node decides what this user may see: the owner (or an admin) gets their shipment's details,
anyone else only the public tracking view. This service never reads shipments directly for
chat, so a crafted prompt can't widen access.
"""

from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import settings

IST = timezone(timedelta(hours=5, minutes=30))
STATUS_LABELS = {
    "BOOKED": "Booked — waiting for a driver",
    "ASSIGNED": "Driver assigned — pickup coming up",
    "PICKED_UP": "Picked up",
    "IN_TRANSIT": "In transit",
    "OUT_FOR_DELIVERY": "Out for delivery",
    "DELIVERED": "Delivered",
    "FAILED_ATTEMPT": "Delivery attempt failed",
    "RETURNED": "Returned to sender",
    "CANCELLED": "Cancelled",
}


class LookupUnavailable(Exception):
    pass


async def lookup(user_id: str | None, tracking_id: str | None, latest: bool) -> dict | None:
    params = {"userId": user_id or "", "trackingId": tracking_id or "", "latest": "1" if latest else ""}
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(f"{settings.node_api_url}/api/internal/chat/shipment", params=params, headers={"x-internal-key": settings.internal_api_key})
    except httpx.HTTPError as err:
        raise LookupUnavailable(str(err)) from err
    if res.status_code == 404:
        return None
    if res.status_code != 200:
        raise LookupUnavailable(f"Node responded {res.status_code}")
    return res.json()


def fmt_time(iso: str | None, now: datetime | None = None) -> str | None:
    if not iso:
        return None
    t = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(IST)
    today = (now or datetime.now(IST)).astimezone(IST).date()
    day = "today" if t.date() == today else "tomorrow" if t.date() == today + timedelta(1) else t.strftime("%a %d %b")
    return f"{day}, {t.strftime('%I:%M %p').lstrip('0')} IST"


def ago(iso: str | None, now: datetime | None = None) -> str | None:
    if not iso:
        return None
    t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    mins = int(((now or datetime.now(timezone.utc)) - t).total_seconds() // 60)
    return "just now" if mins < 1 else f"{mins} min ago" if mins < 60 else f"{mins // 60} h ago"


def place(stop: dict) -> str:
    parts = [p for p in (stop.get("address"), stop.get("city")) if p]
    return ", ".join(parts) or "—"


def facts(data: dict, now: datetime | None = None) -> list[str]:
    """Plain-language lines the LLM (or the template) answers from."""
    s, owner = data["shipment"], data["access"] == "owner"
    lines = [
        f"Tracking ID: {s['trackingId']}",
        f"Status: {STATUS_LABELS.get(s['status'], s['status'])}",
        f"Route: {place(s['from'])} → {place(s['to'])}",
        f"Service: {s['speed']}",
    ]
    if s["status"] == "DELIVERED":
        lines.append(f"Delivered: {fmt_time(s.get('deliveredAt'), now) or 'yes'}")
    elif s["status"] not in ("CANCELLED", "RETURNED") and s.get("estimatedDeliveryAt"):
        live = " (live, from the driver's current position)" if s.get("etaSource") == "live" else ""
        lines.append(f"Estimated delivery: {fmt_time(s['estimatedDeliveryAt'], now)}{live}")
    last = s.get("lastUpdate")
    if last:
        lines.append(f"Last update: {STATUS_LABELS.get(last['status'], last['status'])}, {ago(last['at'], now)}" + (f" — note: {last['note']}" if last.get("note") else ""))
    if owner:
        if s.get("driverName"):
            seen = ago(s.get("driverLastSeenAt"), now)
            lines.append(f"Driver: {s['driverName']}" + (f", location updated {seen}" if seen else ""))
        if s.get("paymentStatus"):
            lines.append(f"Payment: {s['paymentStatus']}")
        lines.append(f"Details page: /app/shipments/{s['id']} (live map, delivery code)")
    else:
        lines.append("Access: public tracking view only — the asker isn't the sender, so don't share names, addresses or live location.")
    return lines
