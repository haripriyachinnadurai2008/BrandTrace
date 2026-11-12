"""
PDF Evidence Deep-Linking Service (PyMuPDF).

Handles:
- Resolving EvidenceSource files across local uploads/ and tracked backend/seed/pdfs/
- Building currency/numeric/text search variants ("4,999", "₹4,999", "Rs 4,999", etc.)
- Locating bounding boxes with page.search_for() prioritizing cited fact pages first
- Rendering zoomed (zoom=2) PNG page images with highlight rectangles drawn on top
- Validating uploaded PDFs (PDF-only, <=10 MB, selectable text check)
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import pymupdf  # PyMuPDF

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
UPLOADS_DIR = BACKEND_DIR / "uploads"

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB

KNOWN_SOURCE_FILENAMES = {
    "src_price_list_sep": "Price_List_Sep.pdf",
    "src_price_list_dec": "Price_List_Dec.pdf",
}


@dataclass
class EvidenceLocateResult:
    located: bool
    page: Optional[int] = None
    page_count: int = 0
    rects: List[List[float]] = field(default_factory=list)
    page_width: Optional[float] = None
    page_height: Optional[float] = None
    matched_query: Optional[str] = None
    reason: str = ""


def sanitize_filename(filename: str) -> str:
    """Keep only safe basename characters to prevent path traversal."""
    base = Path(filename or "evidence.pdf").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    if not cleaned.lower().endswith(".pdf"):
        cleaned += ".pdf"
    return cleaned


def resolve_pdf_path(source=None, document_id: Optional[str] = None) -> Optional[Path]:
    """
    Resolve an EvidenceSource record (or known document_id) to an existing PDF path on disk.
    Checks uploaded storage first, then tracked backend/seed/pdfs and repo seed/pdfs.
    """
    candidates: List[Path] = []
    file_name = None
    file_path_str = None
    src_id = document_id

    if source is not None:
        src_id = getattr(source, "id", None) or document_id
        file_name = getattr(source, "file_name", None)
        file_path_str = getattr(source, "file_path", None)

    if not file_name and src_id in KNOWN_SOURCE_FILENAMES:
        file_name = KNOWN_SOURCE_FILENAMES[src_id]

    if file_path_str:
        p = Path(file_path_str)
        if p.is_absolute():
            candidates.append(p)
        else:
            candidates.append(BACKEND_DIR / p)
            candidates.append(REPO_ROOT / p)

    if file_name:
        safe_name = Path(file_name).name
        candidates.extend([
            UPLOADS_DIR / safe_name,
            REPO_ROOT / "uploads" / safe_name,
            BACKEND_DIR / "seed" / "pdfs" / safe_name,
            REPO_ROOT / "seed" / "pdfs" / safe_name,
        ])

    for cand in candidates:
        try:
            if cand.exists() and cand.is_file():
                return cand
        except OSError:
            continue
    return None


def _format_indian_number(num_str: str) -> str:
    """Format an integer digit string with Indian grouping (e.g., 100000 -> 1,00,000)."""
    if len(num_str) <= 3:
        return num_str
    last_three = num_str[-3:]
    rest = num_str[:-3]
    groups = []
    while len(rest) > 2:
        groups.append(rest[-2:])
        rest = rest[:-2]
    if rest:
        groups.append(rest)
    return ",".join(reversed(groups)) + "," + last_three


def _numeric_variants(raw_digits: str, is_price: bool) -> List[str]:
    """Generate common display variations for a normalized numeric value."""
    clean = raw_digits.replace(",", "").strip()
    if not re.fullmatch(r"\d+(?:\.\d+)?", clean):
        return []

    if "." in clean:
        int_part, dec_part = clean.split(".", 1)
        std_comma = f"{int(int_part):,}.{dec_part}"
        ind_comma = f"{_format_indian_number(int_part)}.{dec_part}"
        plain = clean
    else:
        int_val = int(clean)
        std_comma = f"{int_val:,}"
        ind_comma = _format_indian_number(clean)
        plain = clean

    num_forms = []
    for nf in (std_comma, ind_comma, plain):
        if nf and nf not in num_forms:
            num_forms.append(nf)

    out: List[str] = []
    if is_price:
        for nf in num_forms:
            out.extend([
                f"₹{nf}",
                f"₹ {nf}",
                f"Rs {nf}",
                f"Rs. {nf}",
                f"Rs.{nf}",
                f"INR {nf}",
                f"{nf} INR",
                nf,
            ])
    else:
        for nf in num_forms:
            out.append(nf)
    return out


def build_search_candidates(
    normalised_value: Optional[str] = None,
    raw_span_text: Optional[str] = None,
    fact_value: Optional[str] = None,
    unit: Optional[str] = None,
    value_type: Optional[str] = None,
) -> List[str]:
    """
    Build an ordered, deduplicated list of search terms for PyMuPDF page.search_for().
    Prioritizes matched FactVersion values/formats when verifying against an evidence PDF.
    """
    candidates: List[str] = []

    def _add(term: Optional[str]) -> None:
        if not term:
            return
        t = term.strip()
        if t and t not in candidates:
            candidates.append(t)

    is_price = (
        (value_type or "").lower() == "price"
        or (unit or "").upper() in ("INR", "USD", "EUR")
        or any(sym in (fact_value or raw_span_text or "") for sym in ("₹", "Rs", "INR", "$"))
    )

    # 1. Exact fact value first (because official PDF holds the verified fact value)
    if fact_value:
        _add(fact_value)
        digits = re.sub(r"[^\d.]", "", fact_value)
        if digits:
            for v in _numeric_variants(digits, is_price=is_price):
                _add(v)

    # 2. Normalised value + common formats ("4,999", "₹4,999", "Rs 4,999", percentages)
    if normalised_value:
        norm = normalised_value.strip()
        if norm.endswith("%"):
            num = norm[:-1].strip()
            _add(norm)
            _add(f"{num} %")
            _add(f"{num} percent")
        elif re.fullmatch(r"\d+(?:\.\d+)?", norm):
            for v in _numeric_variants(norm, is_price=is_price):
                _add(v)
        else:
            _add(norm)

    # 3. Raw claim span text last (useful when claim matches or unverified)
    if raw_span_text:
        _add(raw_span_text)
        digits = re.sub(r"[^\d.]", "", raw_span_text)
        if digits and (len(digits) >= 2):
            for v in _numeric_variants(digits, is_price=is_price):
                _add(v)

    return candidates


def locate_evidence_in_pdf(
    pdf_path: Optional[Path],
    search_terms: List[str],
    cited_page: Optional[int] = None,
) -> EvidenceLocateResult:
    """
    Run PyMuPDF page.search_for() across the PDF to find matching bounding boxes.
    Prioritizes `cited_page` (1-based) first when handling multi-page/multiple matches.
    Never raises unhandled exceptions; always returns a structured EvidenceLocateResult.
    """
    if pdf_path is None or not pdf_path.exists():
        return EvidenceLocateResult(
            located=False,
            page=cited_page if (cited_page and cited_page >= 1) else None,
            page_count=0,
            rects=[],
            reason="PDF source file is not available on disk.",
        )

    if not search_terms:
        try:
            with pymupdf.open(str(pdf_path)) as doc:
                pcount = doc.page_count
                safe_p = cited_page if (cited_page and 1 <= cited_page <= pcount) else (1 if pcount else None)
                rect = doc[safe_p - 1].rect if safe_p else None
                return EvidenceLocateResult(
                    located=False,
                    page=safe_p,
                    page_count=pcount,
                    rects=[],
                    page_width=float(rect.width) if rect else None,
                    page_height=float(rect.height) if rect else None,
                    reason="No searchable claim value available for PDF matching.",
                )
        except Exception as exc:
            return EvidenceLocateResult(
                located=False,
                reason=f"Unable to inspect PDF document: {exc}",
            )

    try:
        with pymupdf.open(str(pdf_path)) as doc:
            page_count = doc.page_count
            if page_count == 0:
                return EvidenceLocateResult(
                    located=False,
                    page_count=0,
                    reason="Evidence PDF has 0 pages.",
                )

            all_text = "\n".join(doc[i].get_text("text").strip() for i in range(page_count)).strip()
            default_page = cited_page if (cited_page and 1 <= cited_page <= page_count) else 1
            default_rect = doc[default_page - 1].rect

            if not all_text:
                return EvidenceLocateResult(
                    located=False,
                    page=default_page,
                    page_count=page_count,
                    rects=[],
                    page_width=float(default_rect.width),
                    page_height=float(default_rect.height),
                    reason="This PDF has no selectable text. OCR is not supported yet.",
                )

            # Build search page order: cited_page FIRST, then remaining pages ascending
            page_order: List[int] = []
            if cited_page and 1 <= cited_page <= page_count:
                page_order.append(cited_page)
            for pno in range(1, page_count + 1):
                if pno not in page_order:
                    page_order.append(pno)

            for pno in page_order:
                page = doc[pno - 1]
                for term in search_terms:
                    if not term:
                        continue
                    matches = page.search_for(term)
                    if matches:
                        rects_list = [
                            [round(float(r.x0), 2), round(float(r.y0), 2), round(float(r.x1), 2), round(float(r.y1), 2)]
                            for r in matches
                        ]
                        p_rect = page.rect
                        cited_note = " (cited page)" if cited_page and pno == cited_page else ""
                        return EvidenceLocateResult(
                            located=True,
                            page=pno,
                            page_count=page_count,
                            rects=rects_list,
                            page_width=round(float(p_rect.width), 2),
                            page_height=round(float(p_rect.height), 2),
                            matched_query=term,
                            reason=f"Located '{term}' on page {pno}{cited_note} ({len(rects_list)} match{'es' if len(rects_list) != 1 else ''}).",
                        )

            return EvidenceLocateResult(
                located=False,
                page=default_page,
                page_count=page_count,
                rects=[],
                page_width=round(float(default_rect.width), 2),
                page_height=round(float(default_rect.height), 2),
                reason=f"Evidence text not located in '{pdf_path.name}' for '{search_terms[0]}'.",
            )
    except Exception as exc:
        return EvidenceLocateResult(
            located=False,
            page=cited_page if (cited_page and cited_page >= 1) else None,
            reason=f"Could not scan evidence PDF: {exc}",
        )


def render_pdf_page_png(
    pdf_path: Path,
    page_no: int,
    highlight_rects: Optional[List[List[float]]] = None,
    zoom: float = 2.0,
) -> Tuple[bytes, int, float, float]:
    """
    Render a PDF page to PNG at the given zoom (default 2.0) and overlay
    amber/yellow highlight rectangles for the supplied [x0, y0, x1, y1] coordinates.
    Returns (png_bytes, page_count, page_width, page_height).
    """
    with pymupdf.open(str(pdf_path)) as doc:
        page_count = doc.page_count
        if page_no < 1 or page_no > page_count:
            raise ValueError(f"Page {page_no} is out of bounds (document has {page_count} page(s))")

        page = doc[page_no - 1]
        p_rect = page.rect

        if highlight_rects:
            for coords in highlight_rects:
                if not coords or len(coords) != 4:
                    continue
                x0, y0, x1, y1 = [float(c) for c in coords]
                padded = pymupdf.Rect(x0 - 3.0, y0 - 2.0, x1 + 3.0, y1 + 2.0) & p_rect
                if padded.is_empty or padded.is_infinite:
                    continue
                page.draw_rect(
                    padded,
                    color=(0.92, 0.52, 0.04),
                    fill=(1.0, 0.90, 0.24),
                    fill_opacity=0.38,
                    width=1.8,
                    overlay=True,
                )

        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        png_bytes = pix.tobytes("png")
        return png_bytes, page_count, float(p_rect.width), float(p_rect.height)


def validate_and_inspect_uploaded_pdf(
    raw_bytes: bytes,
    filename: Optional[str],
    content_type: Optional[str],
) -> Tuple[int, str, str]:
    """
    Validate uploaded PDF bytes:
      1. File name / MIME type / %PDF magic bytes check
      2. Max 10 MB
      3. Readable PDF with selectable text (scanned PDFs rejected clearly)

    Returns (page_count, excerpt_text, sha256_hash).
    Raises ValueError with an explicit user-facing validation message.
    """
    if not raw_bytes:
        raise ValueError("Uploaded file is empty.")

    if len(raw_bytes) > MAX_PDF_BYTES:
        raise ValueError("PDF file exceeds the maximum allowed size of 10 MB.")

    fname_lower = (filename or "").lower()
    allowed_mimes = ("application/pdf", "application/x-pdf", "application/octet-stream", "")
    ctype = (content_type or "").split(";")[0].strip().lower()

    if not fname_lower.endswith(".pdf") and ctype not in ("application/pdf", "application/x-pdf"):
        raise ValueError("Invalid file type. Only PDF (.pdf) documents are allowed.")

    if ctype and ctype not in allowed_mimes:
        raise ValueError("Invalid content type. Only PDF (.pdf) documents are allowed.")

    if not raw_bytes[:16].lstrip().startswith(b"%PDF"):
        raise ValueError("Invalid PDF file header. Only valid PDF documents are supported.")

    try:
        with pymupdf.open(stream=raw_bytes, filetype="pdf") as doc:
            page_count = doc.page_count
            if page_count == 0:
                raise ValueError("PDF document contains no pages.")
            pages_text = [doc[i].get_text("text").strip() for i in range(page_count)]
            combined_text = "\n".join(t for t in pages_text if t).strip()
            if not combined_text:
                raise ValueError("This PDF has no selectable text. OCR is not supported yet.")
            excerpt = re.sub(r"\s+", " ", combined_text)[:300]
            file_hash = hashlib.sha256(raw_bytes).hexdigest()
            return page_count, excerpt, file_hash
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Unable to parse PDF file: {exc}")

