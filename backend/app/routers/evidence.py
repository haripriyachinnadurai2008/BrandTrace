"""
Evidence PDF Deep-Linking Router.

Endpoints:
  GET  /evidence/{document_id}/locate        — Metadata & coordinates for a claim/finding in a PDF
  GET  /evidence/{document_id}/page/{n}      — PNG render (zoom=2) with highlight rectangles drawn
  POST /evidence/upload                      — Upload new PDF (PDF-only, max 10 MB, selectable text)

RBAC: Admin, Creator, and Reviewer only. Agency users receive a clear 403.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth.guards import require_roles
from app.config import IST
from app.database import get_db
from app.models.audit import AuditLog
from app.models.auth import User, UserRole
from app.models.claims import ClaimFactLink, ExtractedClaim, Finding
from app.models.facts import BrandFact, EvidenceSource, FactVersion
from app.services.pdf_evidence import (
    EvidenceLocateResult,
    MAX_PDF_BYTES,
    UPLOADS_DIR,
    build_search_candidates,
    locate_evidence_in_pdf,
    render_pdf_page_png,
    resolve_pdf_path,
    sanitize_filename,
    validate_and_inspect_uploaded_pdf,
)

router = APIRouter(prefix="/evidence", tags=["Evidence Deep-Linking"])

INTERNAL_ROLES = [UserRole.ADMIN, UserRole.CREATOR, UserRole.REVIEWER]


def _parse_source_reference_page(source_reference: Optional[str]) -> Optional[int]:
    if not source_reference or "p." not in source_reference:
        return None
    try:
        page_part = source_reference.rsplit("p.", 1)[-1].strip().split()[0]
        pno = int(page_part)
        return pno if pno >= 1 else None
    except Exception:
        return None


def _resolve_claim_and_fact_context(
    db: Session,
    claim_or_finding_id: Optional[str],
    finding_id: Optional[str] = None,
) -> Tuple[Optional[ExtractedClaim], Optional[Finding], Optional[FactVersion], Optional[BrandFact]]:
    """Resolve ExtractedClaim, optional Finding, linked FactVersion, and BrandFact."""
    claim: Optional[ExtractedClaim] = None
    finding: Optional[Finding] = None

    if finding_id:
        finding = db.query(Finding).filter(Finding.id == finding_id).first()
        if finding:
            claim = db.query(ExtractedClaim).filter(ExtractedClaim.id == finding.claim_id).first()

    if claim is None and claim_or_finding_id:
        claim = db.query(ExtractedClaim).filter(ExtractedClaim.id == claim_or_finding_id).first()
        if claim is None:
            # Allow passing finding_id directly in ?highlight= if needed
            finding_by_id = db.query(Finding).filter(Finding.id == claim_or_finding_id).first()
            if finding_by_id:
                finding = finding_by_id
                claim = db.query(ExtractedClaim).filter(ExtractedClaim.id == finding_by_id.claim_id).first()

    if claim and finding is None:
        finding = (
            db.query(Finding)
            .filter(Finding.claim_id == claim.id)
            .order_by(Finding.created_at.desc())
            .first()
        )

    fact_version: Optional[FactVersion] = None
    brand_fact: Optional[BrandFact] = None
    if claim:
        link = (
            db.query(ClaimFactLink)
            .filter(ClaimFactLink.claim_id == claim.id)
            .order_by(ClaimFactLink.created_at.desc())
            .first()
        )
        if link:
            fact_version = (
                db.query(FactVersion)
                .filter(FactVersion.version_id == link.fact_version_id)
                .first()
            )
            if fact_version:
                brand_fact = (
                    db.query(BrandFact)
                    .filter(BrandFact.id == fact_version.fact_id)
                    .first()
                )
                # If finding cites a newer version of the same fact (e.g. post-cascade Finding)
                if finding and finding.source_reference:
                    cited_doc = finding.source_reference.split(" p.")[0].strip()
                    cited_page = _parse_source_reference_page(finding.source_reference)
                    matching_fv = (
                        db.query(FactVersion)
                        .filter(
                            FactVersion.fact_id == fact_version.fact_id,
                            FactVersion.source_id == cited_doc,
                            FactVersion.source_page == (cited_page or FactVersion.source_page),
                        )
                        .order_by(FactVersion.version_no.desc())
                        .first()
                    )
                    if matching_fv:
                        fact_version = matching_fv

    return claim, finding, fact_version, brand_fact


def _locate_for_claim_in_document(
    db: Session,
    document_id: str,
    pdf_path: Optional[Path],
    claim: Optional[ExtractedClaim],
    finding: Optional[Finding],
    fact_version: Optional[FactVersion],
) -> EvidenceLocateResult:
    """
    Use persisted claim coordinates when they match `document_id`, or dynamically
    search the PDF via PyMuPDF when unindexed or citing another version/source.
    """
    cited_page = (
        _parse_source_reference_page(finding.source_reference if finding else None)
        or (fact_version.source_page if fact_version else None)
        or (claim.evidence_page if claim else None)
        or 1
    )

    if claim is None:
        return locate_evidence_in_pdf(pdf_path, search_terms=[], cited_page=cited_page)

    # Return stored DB coordinates if stored against this exact document
    if (
        claim.evidence_document_id == document_id
        and claim.evidence_located is not None
        and pdf_path is not None
        and pdf_path.exists()
    ):
        import pymupdf

        try:
            with pymupdf.open(str(pdf_path)) as doc:
                pcount = doc.page_count
        except Exception:
            pcount = 0

        return EvidenceLocateResult(
            located=bool(claim.evidence_located),
            page=claim.evidence_page or cited_page,
            page_count=pcount,
            rects=claim.evidence_rects or [],
            page_width=claim.evidence_page_width,
            page_height=claim.evidence_page_height,
            reason=claim.evidence_reason
            or (
                f"Located on page {claim.evidence_page}"
                if claim.evidence_located
                else "Evidence text not located in source PDF."
            ),
        )

    # Otherwise compute via PyMuPDF search_for()
    if fact_version is not None:
        search_terms = build_search_candidates(
            normalised_value=fact_version.normalised_value,
            fact_value=fact_version.value,
            unit=fact_version.unit,
            value_type=claim.value_type,
        )
    else:
        search_terms = build_search_candidates(
            normalised_value=claim.normalised_value,
            raw_span_text=claim.raw_span_text,
            value_type=claim.value_type,
        )

    loc = locate_evidence_in_pdf(pdf_path, search_terms=search_terms, cited_page=cited_page)

    # Cache onto claim if it didn't have stored coordinates yet
    if claim.evidence_located is None and (
        not claim.evidence_document_id or claim.evidence_document_id == document_id
    ):
        claim.evidence_document_id = document_id
        claim.evidence_page = loc.page
        claim.evidence_rects = loc.rects
        claim.evidence_page_width = loc.page_width
        claim.evidence_page_height = loc.page_height
        claim.evidence_located = loc.located
        claim.evidence_reason = loc.reason
        try:
            db.commit()
        except Exception:
            db.rollback()

    return loc


@router.get("/{document_id}/locate")
def locate_evidence(
    document_id: str,
    claim_id: Optional[str] = Query(default=None, description="ExtractedClaim ID"),
    finding_id: Optional[str] = Query(default=None, description="Optional Finding ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(INTERNAL_ROLES)),
) -> Dict[str, Any]:
    """
    Return evidence PDF metadata, page count, locate status (located=true/false + reason),
    and claim vs verified fact details for the side-by-side viewer.
    Never returns 500 when text cannot be located or PDF lacks text.
    """
    source = (
        db.query(EvidenceSource)
        .filter(
            EvidenceSource.id == document_id,
            EvidenceSource.org_id == current_user.org_id,
        )
        .first()
    )
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evidence document '{document_id}' not found",
        )

    pdf_path = resolve_pdf_path(source, document_id=document_id)
    claim, finding, fact_version, brand_fact = _resolve_claim_and_fact_context(
        db, claim_or_finding_id=claim_id, finding_id=finding_id
    )

    loc = _locate_for_claim_in_document(
        db=db,
        document_id=document_id,
        pdf_path=pdf_path,
        claim=claim,
        finding=finding,
        fact_version=fact_version,
    )

    claim_payload: Optional[Dict[str, Any]] = None
    if claim is not None:
        claim_payload = {
            "claim_id": claim.id,
            "finding_id": finding.id if finding else None,
            "raw_span_text": claim.raw_span_text,
            "normalised_value": claim.normalised_value,
            "value_type": claim.value_type,
            "subject": claim.subject,
            "attribute": claim.attribute,
            "verified_value": fact_version.value if fact_version else None,
            "verified_normalised_value": fact_version.normalised_value if fact_version else None,
            "fact_id": brand_fact.id if brand_fact else (fact_version.fact_id if fact_version else None),
            "fact_name": brand_fact.name if brand_fact else None,
            "extraction_confidence": (
                finding.extraction_confidence if finding else claim.extraction_confidence
            ),
            "risk_tier": finding.risk_tier if finding else None,
            "status": finding.status if finding else None,
            "finding_reason": finding.reason if finding else None,
            "source_reference": finding.source_reference if finding else f"{document_id} p.{loc.page or 1}",
        }

    return {
        "document_id": source.id,
        "title": source.title,
        "file_name": source.file_name,
        "located": bool(loc.located),
        "reason": loc.reason,
        "page_count": loc.page_count,
        "evidence_page": loc.page,
        "evidence_rects": loc.rects,
        "evidence_page_width": loc.page_width,
        "evidence_page_height": loc.page_height,
        "matched_query": loc.matched_query,
        "claim": claim_payload,
    }


@router.get("/{document_id}/page/{page_no}")
def get_evidence_page_image(
    document_id: str,
    page_no: int,
    highlight: Optional[str] = Query(default=None, description="Claim ID (or Finding ID) to highlight"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(INTERNAL_ROLES)),
):
    """
    Render page `n` (1-based) of an evidence PDF as PNG (PyMuPDF zoom=2).
    When `?highlight=<claim_id>` is supplied and located on page `n`, draws highlight rectangles.
    RBAC: Admin, Creator, and Reviewer only; Agency receives 403.
    """
    source = (
        db.query(EvidenceSource)
        .filter(
            EvidenceSource.id == document_id,
            EvidenceSource.org_id == current_user.org_id,
        )
        .first()
    )
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evidence document '{document_id}' not found",
        )

    pdf_path = resolve_pdf_path(source, document_id=document_id)
    if pdf_path is None or not pdf_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PDF binary for evidence document '{document_id}' is not available on server.",
        )

    highlight_rects: List[List[float]] = []
    located_flag = False
    reason = "Rendered PDF page without claim highlight."

    if highlight:
        claim, finding, fact_version, _ = _resolve_claim_and_fact_context(
            db, claim_or_finding_id=highlight
        )
        if claim is None:
            located_flag = False
            reason = f"Claim '{highlight}' not found; rendered unhighlighted page."
        else:
            loc = _locate_for_claim_in_document(
                db=db,
                document_id=document_id,
                pdf_path=pdf_path,
                claim=claim,
                finding=finding,
                fact_version=fact_version,
            )
            if loc.located and loc.page == page_no and loc.rects:
                highlight_rects = loc.rects
                located_flag = True
                reason = loc.reason
            elif loc.located and loc.page != page_no:
                located_flag = True
                reason = f"Evidence located on page {loc.page} (currently viewing page {page_no})."
            else:
                located_flag = False
                reason = loc.reason or "Evidence text not located on this PDF."

    try:
        png_bytes, page_count, page_w, page_h = render_pdf_page_png(
            pdf_path=pdf_path,
            page_no=page_no,
            highlight_rects=highlight_rects,
            zoom=2.0,
        )
    except ValueError as bounds_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(bounds_err))
    except Exception as render_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not render PDF page {page_no}: {render_err}",
        )

    safe_reason = reason.replace("\r", " ").replace("\n", " ")[:240]
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Evidence-Located": "true" if located_flag else "false",
            "X-Evidence-Page": str(page_no),
            "X-Evidence-Page-Count": str(page_count),
            "X-Evidence-Highlights": str(len(highlight_rects)),
            "X-Evidence-Page-Width": str(round(page_w, 2)),
            "X-Evidence-Page-Height": str(round(page_h, 2)),
            "X-Evidence-Reason": safe_reason,
            "Cache-Control": "no-store",
        },
    )


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_evidence_pdf(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(INTERNAL_ROLES)),
):
    """
    Upload a new official evidence PDF document.
    Validates: PDF-only, max 10 MB, and selectable/extractable text.
    Scanned image-only PDFs are rejected clearly (no OCR).
    """
    raw_bytes = await file.read(MAX_PDF_BYTES + 1)
    if len(raw_bytes) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF file exceeds the maximum allowed size of 10 MB.",
        )

    try:
        page_count, excerpt, file_hash = validate_and_inspect_uploaded_pdf(
            raw_bytes=raw_bytes,
            filename=file.filename,
            content_type=file.content_type,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(file.filename or "evidence.pdf")
    source_id = f"src_{uuid.uuid4().hex[:12]}"
    stored_filename = f"{source_id}_{safe_name}"
    dest_path = UPLOADS_DIR / stored_filename
    dest_path.write_bytes(raw_bytes)

    now = datetime.now(IST)
    clean_title = (title or "").strip() or safe_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ")

    source = EvidenceSource(
        id=source_id,
        org_id=current_user.org_id,
        title=clean_title,
        file_name=safe_name,
        file_type="pdf",
        file_path=f"uploads/{stored_filename}",
        file_hash=file_hash,
        excerpt=excerpt,
        created_at=now,
    )
    db.add(source)

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            entity_type="evidence_source",
            entity_id=source_id,
            action="EVIDENCE_UPLOAD",
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            old_values=None,
            new_values={
                "id": source_id,
                "title": clean_title,
                "file_name": safe_name,
                "page_count": page_count,
                "size_bytes": len(raw_bytes),
            },
            reason=f"Uploaded evidence PDF '{safe_name}' ({page_count} page(s))",
            created_at=now,
        )
    )
    db.commit()
    db.refresh(source)

    return {
        "id": source.id,
        "org_id": source.org_id,
        "title": source.title,
        "file_name": source.file_name,
        "file_type": source.file_type,
        "page_count": page_count,
        "file_hash": source.file_hash,
        "excerpt": source.excerpt,
        "created_at": source.created_at,
    }

