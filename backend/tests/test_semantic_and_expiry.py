"""
Improvement 2 tests:
  - Part A: Semantic Campaign Conflict Detection (no-number contradictions, snippet validation,
    confidence filtering, deterministic fallback, dismiss justification + precedent creation + audit log).
  - Part B: Expiry Forecasting (risk levels: high <=14d, medium <=30d, low >30d, affected approved/live assets).
  - RBAC: Agency 403 enforcement.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.auth.guards import require_roles
from app.config import IST, settings
from app.models.audit import AuditLog
from app.models.auth import User, UserRole
from app.models.campaign import Campaign
from app.models.claims import ExtractedClaim, Finding
from app.models.content import ContentItem, ContentVersion
from app.models.facts import BrandFact, FactVersion
from app.models.governance import Precedent, SemanticConflict
from app.routers.campaigns import get_campaign_semantic_conflicts, run_campaign_semantic_check
from app.routers.facts import get_facts_expiry_forecast
from app.routers.semantic_conflicts import (
    SemanticDismissRequest,
    approve_semantic_conflict_fix,
    dismiss_semantic_conflict,
)
from app.services.expiry_forecast import build_expiry_forecast, compute_expiry_risk_level
from app.services.semantic_coherence import (
    deterministic_pair_check,
    run_semantic_coherence_check,
    validate_candidate_conflict,
)


def test_no_number_conflict_detected_on_festive_campaign(db_session, monkeypatch):
    """
    Part A: Detects contradictions between channels that share NO matching numbers.
    Seeded copy contains:
      - LinkedIn: 'Complimentary shipping on all orders.' and 'Always available year-round.'
      - Email: 'Standard shipping charges apply at checkout.' and 'Limited-time offer'
    """
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()

    res = run_campaign_semantic_check(
        campaign_id="camp_festive_launch",
        db=db_session,
        current_user=reviewer,
    )

    assert res["conflicts_count"] >= 2
    conflicts = res["conflicts"]
    categories = {c["category"] for c in conflicts}
    assert "shipping" in categories
    assert "duration" in categories

    ship_c = next(c for c in conflicts if c["category"] == "shipping")
    assert "shipping" in ship_c["reason"].lower()
    assert ship_c["snippet_a"]
    assert ship_c["snippet_b"]
    assert ship_c["confidence"] >= 0.6


def test_snippet_not_found_in_source_asset_is_dropped():
    """Backend strictly verifies snippets exist verbatim in source assets; hallucinations are dropped."""
    raw_a = "Experience sound. Complimentary shipping on all orders."
    raw_b = "Standard shipping charges apply at checkout."

    # Candidate with snippet_a not in raw_a
    hallucinated_a = {
        "conflict": True,
        "reason": "Shipping contradiction",
        "snippet_a": "100% free overnight shipping forever",  # not verbatim
        "snippet_b": "Standard shipping charges apply at checkout.",
        "confidence": 0.95,
        "category": "shipping",
    }
    assert validate_candidate_conflict(hallucinated_a, raw_a, raw_b) is None

    # Candidate with snippet_b not in raw_b
    hallucinated_b = {
        "conflict": True,
        "reason": "Shipping contradiction",
        "snippet_a": "Complimentary shipping on all orders",
        "snippet_b": "Paid shipping of 250 rupees mandatory",  # not verbatim
        "confidence": 0.95,
        "category": "shipping",
    }
    assert validate_candidate_conflict(hallucinated_b, raw_a, raw_b) is None

    # Valid verbatim candidate passes
    valid_cand = {
        "conflict": True,
        "reason": "Shipping policy mismatch",
        "snippet_a": "Complimentary shipping on all orders",
        "snippet_b": "Standard shipping charges apply at checkout",
        "confidence": 0.88,
        "category": "shipping",
    }
    validated = validate_candidate_conflict(valid_cand, raw_a, raw_b)
    assert validated is not None
    assert validated["snippet_a"] == "Complimentary shipping on all orders"
    assert validated["confidence"] == 0.88


def test_confidence_below_point_six_is_dropped():
    """Backend strictly drops candidate conflicts when confidence is below 0.60."""
    raw_a = "Complimentary shipping on all orders."
    raw_b = "Standard shipping charges apply at checkout."

    low_conf = {
        "conflict": True,
        "reason": "Vague shipping suspicion",
        "snippet_a": "Complimentary shipping on all orders",
        "snippet_b": "Standard shipping charges apply at checkout",
        "confidence": 0.58,
        "category": "shipping",
    }
    assert validate_candidate_conflict(low_conf, raw_a, raw_b) is None

    threshold_cand = {
        "conflict": True,
        "reason": "Passing confidence",
        "snippet_a": "Complimentary shipping on all orders",
        "snippet_b": "Standard shipping charges apply at checkout",
        "confidence": 0.60,
        "category": "shipping",
    }
    assert validate_candidate_conflict(threshold_cand, raw_a, raw_b) is not None


def test_groq_failure_uses_deterministic_fallback(db_session, monkeypatch):
    """When Groq fails or times out, semantic check uses deterministic fallback and sets fallback_used=True."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_dummy_test_key")

    def _fail_post(*args, **kwargs):
        raise httpx.ConnectTimeout("Simulated Groq connection timeout")

    monkeypatch.setattr(httpx, "post", _fail_post)

    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()
    res = run_campaign_semantic_check(
        campaign_id="camp_festive_launch",
        db=db_session,
        current_user=reviewer,
    )

    assert res["fallback_used"] is True
    assert "AI unavailable, using rule-based check" in res["ai_label"]
    assert res["conflicts_count"] >= 2
    assert all(c["fallback_used"] is True for c in res["conflicts"])


def test_semantic_dismiss_requires_justification_and_creates_precedent_and_audit(db_session, monkeypatch):
    """Dismissing a semantic conflict requires >= 10 chars, persists to precedents & audit_logs."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()

    # Run check to ensure open conflicts exist
    run_res = run_campaign_semantic_check("camp_festive_launch", db=db_session, current_user=reviewer)
    conflict_id = run_res["conflicts"][0]["id"]

    # Short reason (< 10 chars) rejected by validator
    with pytest.raises(ValidationError):
        SemanticDismissRequest(reason="too short")
    with pytest.raises(ValidationError):
        SemanticDismissRequest(reason="         ")

    valid_justification = "Approved difference: social channels advertise complimentary shipping as introductory perk."
    dis_res = dismiss_semantic_conflict(
        conflict_id=conflict_id,
        payload=SemanticDismissRequest(reason=valid_justification),
        db=db_session,
        current_user=reviewer,
    )

    assert dis_res["status"] == "dismissed"
    assert dis_res["precedent_id"]

    # Verify precedent in ledger
    prec = db_session.query(Precedent).filter(Precedent.id == dis_res["precedent_id"]).first()
    assert prec is not None
    assert prec.reviewer_id == reviewer.id
    assert prec.reason == valid_justification
    assert prec.resolution_action == "dismissed"

    # Verify audit log row
    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_id == conflict_id, AuditLog.action == "SEMANTIC_CONFLICT_DISMISS")
        .first()
    )
    assert audit is not None
    assert audit.reason == valid_justification


def test_expiry_risk_levels_and_forecast_computation(db_session):
    """
    Part B: Days remaining and risk levels:
      - <= 14 days: 'high'
      - 15-30 days: 'medium'
      - > 30 days: 'low'
    """
    assert compute_expiry_risk_level(14) == "high"
    assert compute_expiry_risk_level(1) == "high"
    assert compute_expiry_risk_level(-2) == "high"
    assert compute_expiry_risk_level(15) == "medium"
    assert compute_expiry_risk_level(30) == "medium"
    assert compute_expiry_risk_level(31) == "low"
    assert compute_expiry_risk_level(90) == "low"

    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    forecast = get_facts_expiry_forecast(db=db_session, current_user=admin)

    assert "items" in forecast
    assert forecast["expiring_soon_count"] >= 1

    # Seed fact F003 expires in ~7 days -> must be classified as 'high' risk
    f003_item = next((it for it in forecast["items"] if it["fact_id"] == "F003"), None)
    assert f003_item is not None
    assert f003_item["risk_level"] == "high"
    assert f003_item["days_remaining"] <= 14
    assert f003_item["affected_assets_count"] >= 2

    # Verify affected approved/live assets are listed
    affected_titles = {a["title"] for a in f003_item["affected_assets"]}
    assert "Festive Email Campaign" in affected_titles or "Product Brochure PDF" in affected_titles


def test_agency_rbac_blocked_with_403(db_session):
    """Agency gets clear 403 on semantic check and semantic conflict dismiss."""
    agency = db_session.query(User).filter(User.role == UserRole.AGENCY).first()
    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()
    creator = db_session.query(User).filter(User.role == UserRole.CREATOR).first()

    semantic_view_guard = require_roles([UserRole.ADMIN, UserRole.REVIEWER, UserRole.CREATOR])
    semantic_decide_guard = require_roles([UserRole.ADMIN, UserRole.REVIEWER])

    # Allowed roles pass
    for u in (admin, reviewer, creator):
        assert semantic_view_guard(current_user=u) == u
    for u in (admin, reviewer):
        assert semantic_decide_guard(current_user=u) == u

    # Agency is blocked on both
    with pytest.raises(HTTPException) as exc_v:
        semantic_view_guard(current_user=agency)
    assert exc_v.value.status_code == 403

    with pytest.raises(HTTPException) as exc_d:
        semantic_decide_guard(current_user=agency)
    assert exc_d.value.status_code == 403

