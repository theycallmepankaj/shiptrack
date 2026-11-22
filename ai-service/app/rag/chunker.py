"""Splits document text into ~500-token chunks with a 50-token overlap (§4.10 ingest).

Chunks follow paragraph boundaries where possible and remember the nearest Markdown
heading, so a citation can say "Refunds › Cancelled before pickup" rather than just a page.
"""

import re
from dataclasses import dataclass

TOKEN_RE = re.compile(r"\w+|[^\w\s]")
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")


def count_tokens(text: str) -> int:
    """Close enough to LLM tokens for sizing chunks (words and punctuation)."""
    return len(TOKEN_RE.findall(text))


@dataclass
class Chunk:
    text: str
    page: int | None
    section: str | None
    index: int = 0


def _paragraphs(text: str):
    """Yields (section, paragraph) pairs; headings update the section and aren't emitted alone."""
    path: list[str] = []
    for block in re.split(r"\n\s*\n", text):
        lines = [ln for ln in block.strip().splitlines() if ln.strip()]
        body = []
        for line in lines:
            m = HEADING_RE.match(line)
            if m:
                if body:
                    yield (" › ".join(path) or None, "\n".join(body))
                    body = []
                level = len(m.group(1))
                path = path[: level - 1] + [m.group(2).strip()]
            else:
                body.append(line.rstrip())
        if body:
            yield (" › ".join(path) or None, "\n".join(body))


def _split_long(paragraph: str, max_tokens: int) -> list[str]:
    words = paragraph.split()
    out, cur, n = [], [], 0
    for w in words:
        t = count_tokens(w)
        if cur and n + t > max_tokens:
            out.append(" ".join(cur))
            cur, n = [], 0
        cur.append(w)
        n += t
    if cur:
        out.append(" ".join(cur))
    return out


def _tail(text: str, tokens: int) -> str:
    """The last ~`tokens` tokens of text, cut at a word boundary."""
    words, n = [], 0
    for w in reversed(text.split()):
        n += count_tokens(w)
        if n > tokens:
            break
        words.append(w)
    return " ".join(reversed(words))


def chunk_pages(pages: list[tuple[int | None, str]], max_tokens: int = 500, overlap: int = 50) -> list[Chunk]:
    chunks: list[Chunk] = []
    for page, text in pages:
        cur: list[str] = []
        cur_tokens = 0
        cur_section = None

        def flush():
            nonlocal cur, cur_tokens
            if cur:
                chunks.append(Chunk(text="\n\n".join(cur), page=page, section=cur_section))
            cur, cur_tokens = [], 0

        for section, para in _paragraphs(text):
            for piece in _split_long(para, max_tokens) if count_tokens(para) > max_tokens else [para]:
                t = count_tokens(piece)
                # A new section starts a new chunk, so a citation points at one section.
                if cur and (cur_tokens + t > max_tokens or section != cur_section):
                    carry = _tail(cur[-1], overlap) if section == cur_section else ""
                    flush()
                    if carry:
                        cur, cur_tokens = [carry], count_tokens(carry)
                cur_section = section
                cur.append(piece)
                cur_tokens += t
        flush()
    # Merge tiny trailing chunks of the same section into their predecessor.
    merged: list[Chunk] = []
    for c in chunks:
        prev = merged[-1] if merged else None
        if prev and prev.section == c.section and prev.page == c.page and count_tokens(prev.text) + count_tokens(c.text) <= max_tokens // 4:
            prev.text += "\n\n" + c.text
        else:
            merged.append(c)
    for i, c in enumerate(merged):
        c.index = i
    return merged
