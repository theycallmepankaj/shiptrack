"""Decides what a chat message is about (§4.10 query step 1)."""

import re
from dataclasses import dataclass

TRACKING_ID_RE = re.compile(r"\bSHP[-\s]?([A-HJ-NP-Z2-9]{6})\b", re.IGNORECASE)

TRACKING_PHRASES = re.compile(
    r"\b(where('?s| is| are)\b.*\b(my|the|it|parcel|package|shipment|order)"
    r"|track(ing)?\b.*\b(my|parcel|package|shipment|order)"
    r"|(status|eta|update) (of|for|on) my"
    r"|my (latest|last|recent|newest) (parcel|package|shipment|order|delivery)"
    r"|(when|how soon) will (my|it)"
    r"|(has|is|did) my (parcel|package|shipment|order)"
    r"|^track( my)?( parcel| package| shipment| order)?\W*$)",
    re.IGNORECASE,
)
FOLLOW_UP = re.compile(r"\b(when|where|eta|arriv|reach|deliver(ed)? yet|on the way|driver|it now|it be)\b", re.IGNORECASE)
SMALLTALK = re.compile(r"^\W*(hi|hello|hey|hiya|namaste|good (morning|afternoon|evening)|thanks?( you)?|thank u|ok(ay)?|cool|great|bye)\W*$", re.IGNORECASE)


@dataclass
class Intent:
    kind: str  # "tracking" | "policy" | "smalltalk"
    tracking_id: str | None = None
    latest: bool = False  # "where is my latest parcel?" without an ID (FR-47)


def find_tracking_id(text: str) -> str | None:
    m = TRACKING_ID_RE.search(text)
    return f"SHP-{m.group(1).upper()}" if m else None


def classify(message: str, history: list[dict]) -> Intent:
    tid = find_tracking_id(message)
    if tid:
        return Intent("tracking", tracking_id=tid)
    if SMALLTALK.match(message):
        return Intent("smalltalk")
    recent_id = next((find_tracking_id(h["content"]) for h in reversed(history[-6:]) if find_tracking_id(h["content"])), None)
    if TRACKING_PHRASES.search(message):
        # "where is it now?" right after talking about SHP-… means that parcel.
        if recent_id and not re.search(r"\b(latest|last|recent|newest)\b", message, re.I):
            return Intent("tracking", tracking_id=recent_id)
        return Intent("tracking", latest=True)
    if recent_id and FOLLOW_UP.search(message) and len(message.split()) <= 12:
        return Intent("tracking", tracking_id=recent_id)
    return Intent("policy")
