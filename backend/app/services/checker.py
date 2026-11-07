"""
Content Check Service — full extraction → verification pipeline.

POST /content/{id}/check calls this.

Flow:
  1. Tokenise text (replace Rs 4,999 → [PRICE_1] etc.)
  2. Call LLM with masked text → list of {type, subject, attribute, value_ref, confidence}
  3. Reattach real values via TokenMap
  4. For each claim:
     a. Persist ExtractedClaim row
     b. Run Matcher → MatchResult
     c. Load FactVersion
     d. Run Verifier → VerificationResult (dropped if no source)
     e. Persist ClaimFactLink + Finding
  5. Determine overall content status: "Ready for review" / "Needs human review"
  6. Return structured FindingReport
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import IST
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ExtractedClaim, ClaimFactLink, Finding
from app.models.facts import FactVersion
from app.models.audit import AuditLog
from app.services.tokeniser import tokenise
from app.services.llm_client import call_llm
from app.services.matcher import match_claim
from app.services.verifier import verify
from app.services.normalizer import DeterministicNormalizer, NormalizedEntity


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _span_search(text: str, raw_value: str) -> tuple[int, int]:
    """Find first occurrence of raw_value in text; return (start, end)."""
    idx = text.find(raw_value)
    if idx == -1:
        return 0, 0
    return idx, idx + len(raw_value)


def run_check(
    db: Session,
    content_id: str,
    actor_id: str,
    actor_role: str,
    publish_date_year: int = 2026,
) -> dict:
    """Execute the full check pipeline for a content item's latest version."""
    # ── Load content ──────────────────────────────────────────────────────────
    ci = db.query(ContentItem).filter(ContentItem.id == content_id).first()
    if not ci:
        raise ValueError(f"Content item '{content_id}' not found")

    # Get or create latest content version
    cv = (
        db.query(ContentVersion)
        .filter(ContentVersion.content_id == content_id)
        .order_by(ContentVersion.version_no.desc())
        .first()
    )
    if not cv:
        raise ValueError(f"No content version for '{content_id}'")

    raw_text = cv.raw_text
    source_id = ci.org_id  # For demo, use org's first evidence source
    source_page = 1

    # Try to get a real evidence source for this org
    from app.models.facts import EvidenceSource
    from app.models.campaign import Campaign
    source = db.query(EvidenceSource).filter(
        EvidenceSource.org_id == ci.org_id
    ).first()
    if source:
        source_id = source.id

    campaign = None
    if ci.campaign_id:
        campaign = db.query(Campaign).filter(Campaign.id == ci.campaign_id).first()
    campaign_products = campaign.get_declared_products() if campaign else []

    # ── Delete previous check results for this version ────────────────────────
    old_findings = db.query(Finding).filter(
        Finding.content_version_id == cv.version_id
    ).all()
    for f in old_findings:
        db.delete(f)
    old_links = (
        db.query(ClaimFactLink)
        .join(ExtractedClaim, ClaimFactLink.claim_id == ExtractedClaim.id)
        .filter(ExtractedClaim.content_version_id == cv.version_id)
        .all()
    )
    for l in old_links:
        db.delete(l)
    old_claims = db.query(ExtractedClaim).filter(
        ExtractedClaim.content_version_id == cv.version_id
    ).all()
    for c in old_claims:
        db.delete(c)
    db.flush()

    # ── Step 1: Tokenise ──────────────────────────────────────────────────────
    masked_text, token_map = tokenise(raw_text, publish_date_year)

    # ── Step 2: LLM call ──────────────────────────────────────────────────────
    llm_claims = call_llm(masked_text, db=db)

    # ── Step 3 + 4: Process each LLM claim ───────────────────────────────────
    findings_out = []
    now = datetime.now(IST)

    # Also process any tokenised entities that LLM didn't cover
    processed_tokens = set()

    def _process_one(claim_type: str, subject: str, attribute: str,
                     value_ref: Optional[str], llm_confidence: float):
        """Inner function to process one extracted claim."""
        # Reattach real entity
        entity: Optional[NormalizedEntity] = None
        span_start, span_end = 0, 0
        raw_span = value_ref or ""

        if value_ref and value_ref in token_map.tokens:
            entity = token_map.tokens[value_ref]
            # Find span in token_map.spans
            for s, e, tok, ent in token_map.spans:
                if tok == value_ref:
                    span_start, span_end = s, e
                    break
            raw_span = entity.raw_text
            processed_tokens.add(value_ref)
        elif claim_type == "claim":
            # Non-quantitative: create a text entity
            entity = NormalizedEntity(
                raw_text=subject,
                value_type="text",
                normalised_str=subject.lower(),
                is_approximate=False,
            )
            span_start, span_end = _span_search(raw_text, subject)
            raw_span = subject

        if entity is None:
            return

        # Persist ExtractedClaim
        claim = ExtractedClaim(
            id=str(uuid.uuid4()),
            content_version_id=cv.version_id,
            raw_span_text=raw_span,
            normalised_value=entity.normalised_str,
            value_type=entity.value_type,
            is_approximate=entity.is_approximate,
            subject=subject,
            attribute=attribute,
            span_start=span_start,
            span_end=span_end,
            extraction_confidence=llm_confidence,
            masked_token=value_ref,
            created_at=now,
        )
        db.add(claim)
        db.flush()

        # Sec 6.8: when a claim has no subject, default to campaign's declared product;
        # if the campaign has several products, route to human queue.
        # NOTE: Sec 6.8 subject defaulting applies ONLY to price-type claims.
        # Other attributes (e.g., "free shipping above Rs 999", delivery, warranty) keep
        # their own attribute and must NOT map to product price.
        is_empty_or_generic_subject = not subject or subject.strip().lower() in (
            "", "product", "retail units", "official partners", "units"
        )
        effective_subject = subject

        # Determine if this claim actually represents a product price claim
        is_price_claim = False
        attr_lower = (attribute or "").strip().lower()

        # Check context window in raw_text around the claim span to detect non-price attributes
        ctx_start = max(0, span_start - 40)
        ctx_end = min(len(raw_text), span_end + 40)
        surrounding_ctx = raw_text[ctx_start:ctx_end].lower()

        non_price_keywords = ["shipping", "delivery", "order", "spend", "cart", "threshold", "cashback", "voucher", "warranty"]
        has_non_price_ctx = any(k in surrounding_ctx for k in non_price_keywords) or any(k in attr_lower for k in non_price_keywords)

        if entity.value_type == "price" and not has_non_price_ctx:
            if not attr_lower or attr_lower in ("price", "mrp", "cost", "pricing", "launch price", "offer price", "unit price"):
                is_price_claim = True
        elif has_non_price_ctx:
            # Preserve non-price attribute (e.g. shipping threshold)
            for k in non_price_keywords:
                if k in surrounding_ctx or k in attr_lower:
                    attribute = k
                    if is_empty_or_generic_subject:
                        effective_subject = f"{k} threshold"
                    break

        if is_price_claim and is_empty_or_generic_subject:
            if len(campaign_products) == 1:
                effective_subject = f"{campaign_products[0]} price"
            elif len(campaign_products) > 1:
                effective_subject = ""  # Ambiguous: route to human queue

        # Matcher
        if not effective_subject or (is_empty_or_generic_subject and len(campaign_products) > 1):
            match = MatchResult(fact_id=None, fact_version_id=None, score=0.0, method="human", candidate_facts=[])
        else:
            match = match_claim(db, effective_subject, entity)

        # Load fact version
        # For archived content: match against the historical fact version valid at its
        # published_at / archived_at date, NOT the current active version.
        is_archived = (cv.state or "").lower() == "archived" or (ci.current_state or "").lower() == "archived"
        effective_time = cv.archived_at or cv.published_at or cv.created_at

        fv: Optional[FactVersion] = None
        if is_archived and effective_time and match.fact_id:
            # Query version active at historical archive/publish time
            fv = (
                db.query(FactVersion)
                .filter(
                    FactVersion.fact_id == match.fact_id,
                    FactVersion.valid_from <= effective_time,
                    (FactVersion.valid_to == None) | (FactVersion.valid_to >= effective_time)
                )
                .order_by(FactVersion.version_no.desc())
                .first()
            )
            if not fv:
                fv = (
                    db.query(FactVersion)
                    .filter(
                        FactVersion.fact_id == match.fact_id,
                        FactVersion.valid_from <= effective_time
                    )
                    .order_by(FactVersion.version_no.desc())
                    .first()
                )

        if fv is None:
            if match.fact_version_id:
                fv = db.query(FactVersion).filter(
                    FactVersion.version_id == match.fact_version_id
                ).first()
            elif match.fact_id:
                # Latest active version for live/draft/approved content
                fv = (
                    db.query(FactVersion)
                    .filter(FactVersion.fact_id == match.fact_id)
                    .order_by(FactVersion.version_no.desc())
                    .first()
                )

        # Use the matched version's actual evidence source and page
        cur_source_id = fv.source_id if fv and fv.source_id else source_id
        cur_source_page = fv.source_page if fv and fv.source_page else source_page

        # Persist ClaimFactLink
        link_status = "unverified"
        if match.fact_id:
            link = ClaimFactLink(
                id=str(uuid.uuid4()),
                claim_id=claim.id,
                fact_version_id=fv.version_id if fv else (match.fact_version_id or ""),
                similarity_score=match.score,
                link_type=match.method,
                status="unverified",
                created_at=now,
            )
            db.add(link)
            db.flush()

        # Verifier
        result = verify(
            entity=entity,
            match=match,
            fact_version=fv,
            content_state="archived" if is_archived else (cv.state or "draft"),
            source_id=cur_source_id,
            source_page=cur_source_page,
            claim_type=claim_type,
            campaign_products=campaign_products,
        )

        if result is None:
            return  # Dropped by verifier (no source ref)

        # Update link status
        if match.fact_id:
            link.status = result.status.lower()

        # Persist Finding (only Critical / High / Medium / Info shown)
        finding = Finding(
            id=str(uuid.uuid4()),
            content_version_id=cv.version_id,
            claim_id=claim.id,
            risk_tier=result.risk_tier,
            reason=result.reason,
            source_reference=result.source_reference,
            extraction_confidence=result.extraction_confidence,
            status="open",
            fix_options=result.fix_options,
            created_at=now,
        )
        db.add(finding)
        db.flush()

        # Compute span in original text for display
        excerpt = raw_text[max(0, span_start - 40):span_end + 40].strip()

        findings_out.append({
            "finding_id": finding.id,
            "claim_id": claim.id,
            "risk_tier": result.risk_tier,
            "status": result.status,
            "reason": result.reason,
            "source_reference": result.source_reference,
            "extraction_confidence": result.extraction_confidence,
            "excerpt": excerpt,
            "span_start": span_start,
            "span_end": span_end,
            "raw_span_text": raw_span,
            "fact_id": match.fact_id,
            "fact_version_id": fv.version_id if fv else None,
            "match_method": match.method,
            "match_score": match.score,
            "is_approximate": entity.is_approximate,
            "fix_options": result.fix_options,
            "claim_type": claim_type,
        })

    # Process LLM-returned claims
    for llm_claim in llm_claims:
        _process_one(
            claim_type=llm_claim.get("type", "claim"),
            subject=llm_claim.get("subject", ""),
            attribute=llm_claim.get("attribute", ""),
            value_ref=llm_claim.get("value_ref"),
            llm_confidence=float(llm_claim.get("confidence", 0.8)),
        )

    # Process any tokenised values not referenced by LLM (safety net)
    for s, e, token, entity in token_map.spans:
        if token not in processed_tokens:
            _process_one(
                claim_type=entity.value_type,
                subject="product",          # generic subject when LLM missed it
                attribute=entity.value_type,
                value_ref=token,
                llm_confidence=0.5,
            )

    # ── Step 5: Derive content status ─────────────────────────────────────────
    # Any Critical or High finding strictly yields "Needs human review"
    has_critical_or_high = any(
        f.get("risk_tier") in ("Critical", "High")
        for f in findings_out
    )
    content_status_label = "Needs human review" if has_critical_or_high else "Ready for review"

    # Audit log
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        entity_type="content_version",
        entity_id=cv.version_id,
        action="CHECK_RUN",
        actor_id=actor_id,
        actor_role=actor_role,
        old_values=None,
        new_values={
            "findings_count": len(findings_out),
            "content_status": content_status_label,
        },
        reason="Content check executed",
        created_at=now,
    ))

    db.commit()

    return {
        "content_id": content_id,
        "content_version_id": cv.version_id,
        "content_status": content_status_label,
        "findings_count": len(findings_out),
        "findings": findings_out,
        "ai_label": "AI-assisted analysis",
    }

