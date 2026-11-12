"""Tests for Improvement 1: PDF Evidence Deep-Linking."""

import io
import uuid
from datetime import datetime
from unittest.mock import patch

import pymupdf
import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine, inspect, text

from app.config import IST
from app.db.migrations.m001_evidence_coordinates import upgrade as run_m001_upgrade
from app.models.auth import User, UserRole
from app.models.claims import ExtractedClaim, Finding
from app.models.facts import EvidenceSource
from app.routers import evidence as evidence_router
from app.routers import content as content_router
from app.services.checker import run_check
from app.services.pdf_evidence import (
    MAX_PDF_BYTES,
    build_search_candidates,
    locate_evidence_in_pdf,
)


def _make_pdf_bytes(pages_text: list[str]) -> bytes:
    """Create a real in-memory PDF with selectable text on each page."""
    doc = pymupdf.open()
    for text_body in pages_text:
        page = doc.new_page(width=595, height=842)
        if text_body:
            page.insert_text((72, 120), text_body, fontsize=12)
    data = doc.tobytes()
    doc.close()
    return data


def _make_scanned_pdf_bytes() -> bytes:
    """Create an image-only PDF with zero selectable text."""
    doc = pymupdf.open()
    page = doc.new_page(width=400, height=400)
    # Draw shapes only (no text layer)
    page.draw_rect(pymupdf.Rect(50, 50, 300, 150), color=(0.2, 0.2, 0.2), fill=(0.9, 0.9, 0.9))
    data = doc.tobytes()
    doc.close()
    return data


def test_m001_migration_adds_columns_idempotently():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as conn:
        conn.execute(text(
            "CREATE TABLE extracted_claims (id VARCHAR PRIMARY KEY, content_version_id VARCHAR, raw_span_text VARCHAR)"
        ))

    added_first = run_m001_upgrade(eng)
    assert set(added_first) >= {
        "evidence_document_id",
        "evidence_page",
        "evidence_rects",
        "evidence_page_width",
        "evidence_page_height",
        "evidence_located",
        "evidence_reason",
    }

    cols = {c["name"] for c in inspect(eng).get_columns("extracted_claims")}
    assert {"evidence_page", "evidence_rects", "evidence_page_width", "evidence_page_height"}.issubset(cols)

    # Re-running must be a clean no-op
    added_second = run_m001_upgrade(eng)
    assert added_second == []
    eng.dispose()


def test_locate_prefers_cited_page_and_matches_currency_formats(tmp_path):
    pdf_file = tmp_path / "multi_match.pdf"
    pdf_file.write_bytes(
        _make_pdf_bytes([
            "Summary cover page: reference Rs 4,999 teaser",
            "Official Schedule (Cited): Item F001 MRP Rs 4,999 incl. GST.",
        ])
    )

    candidates = build_search_candidates(normalised_value="4999", fact_value="₹4,999", unit="INR", value_type="price")
    assert "4,999" in candidates
    assert "₹4,999" in candidates
    assert "Rs 4,999" in candidates

    # When page 2 is cited in the fact record, page 2 MUST win over page 1
    loc = locate_evidence_in_pdf(pdf_file, candidates, cited_page=2)
    assert loc.located is True
    assert loc.page == 2
    assert loc.page_count == 2
    assert len(loc.rects) >= 1
    assert len(loc.rects[0]) == 4
    assert loc.page_width == pytest.approx(595.0, abs=1.0)
    assert loc.page_height == pytest.approx(842.0, abs=1.0)


def test_verification_stores_pdf_coordinates_and_renders_highlighted_png(db_session):
    with patch(
        "app.services.checker.call_llm_with_meta",
        return_value={
            "claims": [
                {
                    "type": "price",
                    "subject": "X1 Pro price",
                    "attribute": "price",
                    "value_ref": "[PRICE_1]",
                    "confidence": 0.98,
                }
            ],
            "source": "cache",
            "ai_unavailable": False,
            "fallback_reason": None,
        },
    ):
        result = run_check(
            db=db_session,
            content_id="ci_linkedin_launch",
            actor_id="usr_reviewer_devin",
            actor_role="Reviewer",
        )

    assert result["findings_count"] >= 1
    finding_out = next(f for f in result["findings"] if f["claim_id"])
    assert finding_out["evidence_page"] == 2
    assert finding_out["evidence_located"] is True
    assert finding_out["evidence_rects"] and len(finding_out["evidence_rects"][0]) == 4
    assert finding_out["evidence_page_width"] > 0
    assert finding_out["evidence_page_height"] > 0

    claim_row = db_session.query(ExtractedClaim).filter(ExtractedClaim.id == finding_out["claim_id"]).first()
    assert claim_row.evidence_page == 2
    assert claim_row.evidence_located is True
    assert claim_row.evidence_rects == finding_out["evidence_rects"]

    # GET /content/{id} returns enriched evidence coordinates & verified value
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()
    detail = content_router.get_content_detail("ci_linkedin_launch", db=db_session, current_user=reviewer)
    assert detail["findings"][0]["evidence_page"] == 2
    assert detail["findings"][0]["verified_value"] == "Rs 4,999"

    # GET /evidence/{doc}/page/{n}?highlight=<claim_id> returns zoomed PNG with highlights
    png_p2 = evidence_router.get_evidence_page_image(
        document_id="src_price_list_sep",
        page_no=2,
        highlight=claim_row.id,
        db=db_session,
        current_user=reviewer,
    )
    assert png_p2.media_type == "image/png"
    assert png_p2.body[:8] == b"\x89PNG\r\n\x1a\n"
    assert png_p2.headers["X-Evidence-Located"] == "true"
    assert int(png_p2.headers["X-Evidence-Highlights"]) >= 1
    assert int(png_p2.headers["X-Evidence-Page-Count"]) == 2

    # Verify zoom=2 resolution (595*2 x 842*2 = 1190 x 1684)
    pix = pymupdf.Pixmap(png_p2.body)
    assert pix.width == 1190
    assert pix.height == 1684

    # Viewing without highlight produces different PNG bytes (confirming highlight rect is drawn)
    png_plain = evidence_router.get_evidence_page_image(
        document_id="src_price_list_sep",
        page_no=2,
        highlight=None,
        db=db_session,
        current_user=reviewer,
    )
    assert png_p2.body != png_plain.body


def test_evidence_unlocated_returns_located_false_without_500(db_session):
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()

    # Add an unmatched claim whose text does not exist in Price_List_Sep.pdf
    claim = ExtractedClaim(
        id="claim_unmatched_missing",
        content_version_id="cv_linkedin_launch_v1",
        raw_span_text="₹99,887",
        normalised_value="99887",
        value_type="price",
        subject="Nonexistent Edition",
        attribute="price",
        extraction_confidence=0.9,
        created_at=datetime.now(IST),
    )
    db_session.add(claim)
    db_session.commit()

    res = evidence_router.locate_evidence(
        document_id="src_price_list_sep",
        claim_id="claim_unmatched_missing",
        finding_id=None,
        db=db_session,
        current_user=reviewer,
    )
    assert res["located"] is False
    assert res["reason"]
    assert res["page_count"] == 2

    # Out-of-bounds page returns clean 400 (never 500)
    with pytest.raises(HTTPException) as exc:
        evidence_router.get_evidence_page_image(
            document_id="src_price_list_sep",
            page_no=99,
            highlight="claim_unmatched_missing",
            db=db_session,
            current_user=reviewer,
        )
    assert exc.value.status_code == 400


def test_evidence_rbac_blocks_agency_allows_internal_roles(db_session):
    agency = db_session.query(User).filter(User.role == UserRole.AGENCY).first()
    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    creator = db_session.query(User).filter(User.role == UserRole.CREATOR).first()
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()

    # Guard checks directly (exact same dependency used on router endpoints)
    for allowed_user in (admin, creator, reviewer):
        res = evidence_router.locate_evidence(
            document_id="src_price_list_sep",
            claim_id="claim_linkedin_launch_1",
            finding_id=None,
            db=db_session,
            current_user=allowed_user,
        )
        assert res["document_id"] == "src_price_list_sep"

    from app.auth.guards import require_roles

    guard = require_roles([UserRole.ADMIN, UserRole.CREATOR, UserRole.REVIEWER])
    with pytest.raises(HTTPException) as exc:
        guard(current_user=agency)
    assert exc.value.status_code == 403


@pytest.mark.anyio
async def test_evidence_upload_validations(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(evidence_router, "UPLOADS_DIR", tmp_path)
    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()

    # 1. Valid text-extractable PDF succeeds
    good_pdf = _make_pdf_bytes(["Aura X1 Pro Revised Warranty: 24 Months coverage."])
    good_upload = UploadFile(
        filename="warranty_terms.pdf",
        file=io.BytesIO(good_pdf),
        headers={"content-type": "application/pdf"},
    )
    created = await evidence_router.upload_evidence_pdf(
        file=good_upload, title="Official Warranty Terms", db=db_session, current_user=admin
    )
    assert created["file_name"] == "warranty_terms.pdf"
    assert created["page_count"] == 1
    assert db_session.query(EvidenceSource).filter(EvidenceSource.id == created["id"]).first() is not None

    # 2. Scanned image-only PDF rejected with exact clear OCR message
    scanned_upload = UploadFile(
        filename="scanned_doc.pdf",
        file=io.BytesIO(_make_scanned_pdf_bytes()),
        headers={"content-type": "application/pdf"},
    )
    with pytest.raises(HTTPException) as exc_scan:
        await evidence_router.upload_evidence_pdf(
            file=scanned_upload, title="Scanned", db=db_session, current_user=admin
        )
    assert exc_scan.value.status_code == 400
    assert exc_scan.value.detail == "This PDF has no selectable text. OCR is not supported yet."

    # 3. Non-PDF file rejected
    txt_upload = UploadFile(
        filename="notes.txt",
        file=io.BytesIO(b"plain text content"),
        headers={"content-type": "text/plain"},
    )
    with pytest.raises(HTTPException) as exc_type:
        await evidence_router.upload_evidence_pdf(
            file=txt_upload, title="Notes", db=db_session, current_user=admin
        )
    assert exc_type.value.status_code == 400

    # 4. Oversized (> 10 MB) file rejected
    oversize_upload = UploadFile(
        filename="huge.pdf",
        file=io.BytesIO(b"%PDF-1.4\n" + b"0" * (MAX_PDF_BYTES + 100)),
        headers={"content-type": "application/pdf"},
    )
    with pytest.raises(HTTPException) as exc_big:
        await evidence_router.upload_evidence_pdf(
            file=oversize_upload, title="Huge", db=db_session, current_user=admin
        )
    assert exc_big.value.status_code == 400
    assert "10 MB" in exc_big.value.detail

