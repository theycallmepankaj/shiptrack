"""Answers without an LLM: quotes the most relevant sentences of the retrieved chunks
(policy questions) or fills a template from the shipment facts (tracking questions)."""

import re

from .embedder import _fold

STOP = set("a an the is are was were be to of in on for and or i my me we you your it its can do does how what when where which who why with at by from this that if will would should could please our us".split())


def _terms(text: str) -> set[str]:
    return {_fold(w) for w in re.findall(r"[a-z0-9₹]+", text.lower()) if w not in STOP and len(w) > 1}


def _clip(text: str, limit: int) -> str:
    """Cuts at a line (or sentence) boundary so lists stay intact."""
    if len(text) <= limit:
        return text
    out = ""
    for line in text.splitlines():
        if len(out) + len(line) > limit:
            break
        out += line + "\n"
    return out.strip() or text[:limit].rsplit(". ", 1)[0] + "."


def policy_answer(question: str, hits: list[dict], limit: int = 700) -> str:
    """Quotes the best-matching passage (lists and all) instead of writing an answer.

    Among the retrieved passages, the one sharing the most words with the question leads
    (ties keep retrieval order); a short passage is followed by the next one from its document.
    """
    q = _terms(question)
    order = sorted(range(len(hits)), key=lambda i: (-len(q & _terms(hits[i]["text"] + " " + (hits[i].get("section") or ""))), i))
    first = order[0]
    picked = [first]
    if len(hits[first]["text"]) < 300:
        # A short passage (often an intro) reads best with the one that follows it in the document.
        same = [i for i in order[1:] if hits[i]["documentId"] == hits[first]["documentId"]]
        nxt = (hits[first].get("index") or 0) + 1
        more = next((i for i in same if hits[i].get("index") == nxt), same[0] if same else None)
        if more is not None:
            picked.append(more)
    parts = []
    for i in picked:
        h = hits[i]
        where = (h.get("section") or h["title"]).split("›")[-1].strip()
        parts.append(f"**{where}** [{i + 1}]\n{_clip(h['text'], limit // len(picked))}")
    return "Here's what our policy says:\n\n" + "\n\n".join(parts)


def tracking_answer(lines: list[str]) -> str:
    facts = dict(line.split(": ", 1) for line in lines if ": " in line)
    out = [f"**{facts['Tracking ID']}** — **{facts['Status']}**.", f"Route: {facts['Route']}."]
    for key in ("Estimated delivery", "Delivered", "Last update", "Driver"):
        if key in facts:
            out.append(f"{key}: {facts[key]}.")
    if "Details page" in facts:
        out.append("Open the shipment page for the live map and your delivery code.")
    elif "Access" in facts:
        out.append("Log in as the sender to see the live map and driver details.")
    return " ".join(out)
