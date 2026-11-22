"""Turns an uploaded policy document (PDF, Markdown or plain text) into text per page."""

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError


class UnreadableDocument(ValueError):
    """The file can't be turned into text; the message is shown to the admin."""


def extract(content: bytes, filename: str) -> list[tuple[int | None, str]]:
    """Returns [(page_number or None, text)]. PDFs keep their page numbers for citations."""
    name = filename.lower()
    if name.endswith(".pdf"):
        if not content.startswith(b"%PDF"):
            raise UnreadableDocument("That file isn't a valid PDF")
        try:
            reader = PdfReader(io.BytesIO(content))
            if reader.is_encrypted:
                raise UnreadableDocument("Password-protected PDFs aren't supported")
            pages = [(i + 1, (page.extract_text() or "").strip()) for i, page in enumerate(reader.pages)]
        except PdfReadError as err:
            raise UnreadableDocument(f"Couldn't read the PDF ({err})") from err
        pages = [(n, t) for n, t in pages if t]
        if not pages:
            raise UnreadableDocument("No text found in the PDF — scanned PDFs need OCR first")
        return pages
    if name.endswith((".md", ".markdown", ".txt")):
        try:
            text = content.decode("utf-8-sig").strip()
        except UnicodeDecodeError as err:
            raise UnreadableDocument("Text files must be UTF-8") from err
        if not text:
            raise UnreadableDocument("The file is empty")
        return [(None, text)]
    raise UnreadableDocument("Upload a PDF, Markdown (.md) or text (.txt) file")
