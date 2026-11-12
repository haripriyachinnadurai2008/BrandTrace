"""
Tests for Improvement 3: Precedent-to-Rule Synthesizer.

Covers:
1. Schema migration m002 (idempotent creation of proposed_rules, rule_precedents, guidelines, precedents.finding_type)
2. Dismiss justification >= 10 chars requirement (Pydantic / FastAPI route body validation) and Precedent + AuditLog persistence
3. Seed starts with 2 similar guarantee precedents -> 0 proposed rules until a 3rd override triggers 1 proposal
4. Duplicate prevention (re-running synthesis or adding a 4th similar override does not create duplicates) & unrelated clusters stay separate
5. Groq failure falls back cleanly to deterministic rule copy and logs failure
6. Admin-only /rules/proposed, /rules/{id}/approve, /rules/{id}/reject (non-Admin gets 403), Guideline versioning, and AuditLog records
7. New findings on similar claims include matches_rule hint with approved guideline title
"""

from __future__ import annotations

from datetime import datetime
from typing import List

import httpx
import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text

from app.config import IST, settings
from app.db.migrations import m002_precedent_rule_synthesizer
from app.main import app
from app.models.audit import AuditLog
from app.models.auth import User, UserRole
from app.models.claims import ExtractedClaim, Finding
from app.models.content import ContentVersion
from app.models.governance import ExternalCallsLog, Guideline, Precedent, ProposedRule, RulePrecedent
from app.routers import findings as findings_router
from app.routers import rules as rules_router
from app.routers.content import get_content_detail
from app.routers.findings import DismissRequest, dismiss_finding, get_finding
from app.routers.rules import (
    approve_proposed_rule,
    list_guidelines,
    list_proposed_rules,
    reject_proposed_rule,
)
from app.schemas.governance import RuleDecisionRequest
from app.services.checker import run_check
from app.services.rule_synthesizer import synthesize_proposed_rules


def _make_guarantee_finding(
    db,
    finding_id: str,
    claim_id: str,
    reason_text: str = "Unverified guarantee claim: 'Guaranteed 100% satisfaction' has no linked brand fact.",
) -> Finding:
    cv = db.query(ContentVersion).filter(ContentVersion.content_id == "ci_linkedin_launch").first()
    claim = ExtractedClaim(
        id=claim_id,
        content_version_id=cv.version_id,
        raw_span_text="Guaranteed 100% satisfaction",
        normalised_value="satisfaction guarantee",
        value_type="text",
        is_approximate=False,
        subject="satisfaction guarantee",
        attribute="guarantee",
        span_start=0,
        span_end=28,
        extraction_confidence=0.92,
        created_at=datetime.now(IST),
    )
    db.add(claim)
    db.flush()

    finding = Finding(
        id=finding_id,
        content_version_id=cv.version_id,
        claim_id=claim.id,
        risk_tier="Medium",
        reason=reason_text,
        source_reference="Claim Review",
        extraction_confidence=0.92,
        status="open",
        created_at=datetime.now(IST),
    )
    db.add(finding)
    db.commit()
    return finding


def _find_route(path: str, method: str) -> APIRoute:
    for router_routes in (findings_router.router.routes, rules_router.router.routes, app.routes):
        for route in router_routes:
            if isinstance(route, APIRoute) and route.path == path and method.upper() in (route.methods or set()):
                return route
    raise AssertionError(f"Route {method} {path} not registered on FastAPI app")


def _route_role_guards(route: APIRoute):
    """Collect role-guard dependencies wired onto a FastAPI APIRoute."""
    guards = []
    for dep in route.dependant.dependencies:
        if dep.name == "current_user" and dep.call is not None:
            guards.append(dep.call)
    return guards


def test_m002_migration_is_idempotent():
    """Verify m002 cleanly upgrades a pre-m002 precedents table and can be re-run safely."""
    engine = create_engine("sqlite:///:memory:?check_same_thread=False")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE precedents (
                    id VARCHAR PRIMARY KEY,
                    rule_id VARCHAR,
                    finding_id VARCHAR,
                    reviewer_id VARCHAR NOT NULL,
                    reason TEXT NOT NULL,
                    finding_summary TEXT NOT NULL,
                    resolution_action VARCHAR NOT NULL,
                    timestamp DATETIME NOT NULL
                )
                """
            )
        )

    applied_first = m002_precedent_rule_synthesizer.upgrade(engine)
    assert "precedents.finding_type" in applied_first
    assert "proposed_rules" in applied_first
    assert "rule_precedents" in applied_first
    assert "guidelines" in applied_first

    inspector = inspect(engine)
    prec_cols = {c["name"] for c in inspector.get_columns("precedents")}
    assert "finding_type" in prec_cols
    assert inspector.has_table("proposed_rules")
    assert inspector.has_table("rule_precedents")
    assert inspector.has_table("guidelines")

    applied_second = m002_precedent_rule_synthesizer.upgrade(engine)
    assert applied_second == []
    engine.dispose()


def test_dismiss_requires_min_10_char_justification(db_session):
    """Short or whitespace-only reasons must fail validation; >= 10 chars writes Precedent + AuditLog."""
    route = _find_route("/findings/{finding_id}/dismiss", "POST")
    body_field = route.dependant.body_params[0]
    assert body_field.field_info.annotation is DismissRequest

    with pytest.raises(ValidationError):
        DismissRequest(reason="123456789", resolution_action="dismissed")

    with pytest.raises(ValidationError):
        DismissRequest(reason="            ", resolution_action="dismissed")

    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()
    finding = _make_guarantee_finding(db_session, "f_short_check", "cl_short_check")

    res = dismiss_finding(
        finding_id=finding.id,
        payload=DismissRequest(
            reason="Acceptable promotional copy approved by Brand Lead.",
            resolution_action="dismissed",
        ),
        db=db_session,
        current_user=reviewer,
    )

    assert res["status"] == "success"
    prec = db_session.query(Precedent).filter(Precedent.id == res["precedent_id"]).first()
    assert prec is not None
    assert prec.finding_id == finding.id
    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_id == finding.id, AuditLog.action == "DISMISS")
        .first()
    )
    assert audit is not None


def test_two_precedents_no_rule_third_similar_creates_one_rule(db_session, monkeypatch):
    """Seeded 2 guarantee precedents create no rule; 3rd similar override triggers 1 ProposedRule."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")

    assert db_session.query(Precedent).count() == 2
    assert db_session.query(ProposedRule).count() == 0

    created_before = synthesize_proposed_rules(db_session)
    assert created_before == []
    assert db_session.query(ProposedRule).count() == 0

    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()
    finding = _make_guarantee_finding(db_session, "f_synth_3rd", "cl_synth_3rd")

    res = dismiss_finding(
        finding_id=finding.id,
        payload=DismissRequest(
            reason="Satisfaction guarantee phrasing approved under standard consumer return policy window.",
            resolution_action="dismissed",
        ),
        db=db_session,
        current_user=reviewer,
    )

    assert res["status"] == "success"
    assert len(res["proposed_rules_created"]) == 1

    rules = db_session.query(ProposedRule).all()
    assert len(rules) == 1
    rule = rules[0]
    assert rule.status == "proposed"
    assert rule.finding_type == "guarantee"
    assert rule.title
    assert rule.description
    assert rule.suggested_policy_text

    links = db_session.query(RulePrecedent).filter(RulePrecedent.rule_id == rule.id).all()
    assert len(links) == 3

    synth_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_id == rule.id, AuditLog.action == "RULE_SYNTHESIZED")
        .first()
    )
    assert synth_audit is not None


def test_duplicate_prevention_and_unrelated_precedents_stay_separate(db_session, monkeypatch):
    """Running synthesis again or adding a 4th similar override must not duplicate; unrelated ones don't merge."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()

    # 3rd similar guarantee -> creates 1 rule
    f3 = _make_guarantee_finding(db_session, "f_dup_3", "cl_dup_3")
    dismiss_finding(
        finding_id=f3.id,
        payload=DismissRequest(
            reason="Satisfaction guarantee phrasing approved under standard consumer return policy window.",
            resolution_action="dismissed",
        ),
        db=db_session,
        current_user=reviewer,
    )
    assert db_session.query(ProposedRule).count() == 1

    # Re-running synthesis directly creates 0 new rules
    assert synthesize_proposed_rules(db_session) == []
    assert db_session.query(ProposedRule).count() == 1

    # 4th similar guarantee attaches cleanly without creating a second rule
    f4 = _make_guarantee_finding(db_session, "f_dup_4", "cl_dup_4")
    res4 = dismiss_finding(
        finding_id=f4.id,
        payload=DismissRequest(
            reason="Satisfaction guarantee phrasing approved under standard consumer return policy window for social.",
            resolution_action="override",
        ),
        db=db_session,
        current_user=reviewer,
    )
    assert res4["proposed_rules_created"] == []
    assert db_session.query(ProposedRule).count() == 1

    # Add 2 unrelated discount precedents -> still does not merge or propose a 2nd rule
    db_session.add_all(
        [
            Precedent(
                id="prec_unrel_1",
                reviewer_id=reviewer.id,
                reason="One-off flash sale exception granted for trade show booth handouts only.",
                finding_summary="Unverified discount 30% off",
                finding_type="discount",
                resolution_action="dismissed",
                timestamp=datetime.now(IST),
            ),
            Precedent(
                id="prec_unrel_2",
                reviewer_id=reviewer.id,
                reason="One-off VIP bundle rebate approved for annual dealer conference.",
                finding_summary="Unverified discount 15% off",
                finding_type="discount",
                resolution_action="dismissed",
                timestamp=datetime.now(IST),
            ),
        ]
    )
    db_session.commit()
    assert synthesize_proposed_rules(db_session) == []
    assert db_session.query(ProposedRule).count() == 1


def test_groq_failure_falls_back_cleanly(db_session, monkeypatch):
    """When Groq fails/times out, synthesizer falls back to deterministic rule copy without raising."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "dummy-groq-key")

    def _fail_post(*args, **kwargs):
        raise httpx.TimeoutException("simulated groq timeout")

    monkeypatch.setattr("app.services.rule_synthesizer.httpx.post", _fail_post)

    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()
    finding = _make_guarantee_finding(db_session, "f_groq_fail", "cl_groq_fail")
    res = dismiss_finding(
        finding_id=finding.id,
        payload=DismissRequest(
            reason="Satisfaction guarantee phrasing approved under standard consumer return policy window.",
            resolution_action="dismissed",
        ),
        db=db_session,
        current_user=reviewer,
    )

    assert len(res["proposed_rules_created"]) == 1
    rule = db_session.query(ProposedRule).first()
    assert "Satisfaction Guarantee" in rule.title
    assert rule.suggested_policy_text

    err_log = (
        db_session.query(ExternalCallsLog)
        .filter(ExternalCallsLog.service_name == "groq")
        .order_by(ExternalCallsLog.created_at.desc())
        .first()
    )
    assert err_log is not None
    assert err_log.status_code == 500
    assert "timeout" in (err_log.error_message or "").lower()


def test_admin_approve_reject_and_non_admin_403(db_session, monkeypatch):
    """RBAC: only Admin can list/approve/reject proposed rules; approval creates versioned Guideline + AuditLog."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")

    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    creator = db_session.query(User).filter(User.role == UserRole.CREATOR).first()
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()
    agency = db_session.query(User).filter(User.role == UserRole.AGENCY).first()

    # Trigger 1 proposed rule (guarantee)
    finding = _make_guarantee_finding(db_session, "f_rbac_approve", "cl_rbac_approve")
    dismiss_finding(
        finding_id=finding.id,
        payload=DismissRequest(
            reason="Satisfaction guarantee phrasing approved under standard consumer return policy window.",
            resolution_action="dismissed",
        ),
        db=db_session,
        current_user=reviewer,
    )
    prule = db_session.query(ProposedRule).first()
    assert prule is not None

    # Create a second proposed rule to test reject path
    prule2 = ProposedRule(
        id="prule_reject_test",
        title="Rejectable Draft Rule",
        description="Test rule for reject endpoint",
        suggested_policy_text="Allow draft pricing rounding exceptions.",
        finding_type="price",
        cluster_signature="sig_reject_test",
        status="proposed",
        created_at=datetime.now(IST),
    )
    db_session.add(prule2)
    db_session.commit()

    # Verify registered FastAPI route role guards block all non-Admins with HTTP 403
    admin_only_routes = [
        ("/rules/proposed", "GET"),
        ("/rules/{rule_id}/approve", "POST"),
        ("/rules/{rule_id}/reject", "POST"),
    ]
    for path, method in admin_only_routes:
        route = _find_route(path, method)
        guards = _route_role_guards(route)
        assert len(guards) == 1
        guard_fn = guards[0]
        assert guard_fn(current_user=admin) == admin
        for non_admin in (creator, reviewer, agency):
            with pytest.raises(HTTPException) as exc_info:
                guard_fn(current_user=non_admin)
            assert exc_info.value.status_code == 403

    # Verify /rules/guidelines blocks Agency with 403 while permitting Admin, Creator, Reviewer
    guides_route = _find_route("/rules/guidelines", "GET")
    guides_guard = _route_role_guards(guides_route)[0]
    with pytest.raises(HTTPException) as exc_ag:
        guides_guard(current_user=agency)
    assert exc_ag.value.status_code == 403
    for allowed_u in (admin, creator, reviewer):
        assert guides_guard(current_user=allowed_u) == allowed_u

    # Admin lists proposed rules
    listed = list_proposed_rules(db=db_session, current_user=admin)
    assert any(item.id == prule.id and len(item.supporting_precedents) == 3 for item in listed)

    # Admin approves rule 1 -> creates Guideline v1 + AuditLog
    custom_policy = "Approved policy: permit satisfaction guarantee claims backed by 30-day return terms."
    app_data = approve_proposed_rule(
        rule_id=prule.id,
        payload=RuleDecisionRequest(policy_text=custom_policy, reason="Legal & Admin signed off"),
        db=db_session,
        current_user=admin,
    )
    assert app_data["status"] == "approved"
    assert app_data["guideline"]["version"] == 1
    assert app_data["guideline"]["active"] is True
    assert app_data["guideline"]["text"] == custom_policy

    # Double-approve returns 409 Conflict
    with pytest.raises(HTTPException) as exc_dup:
        approve_proposed_rule(rule_id=prule.id, payload=None, db=db_session, current_user=admin)
    assert exc_dup.value.status_code == 409

    # Reviewer can list active guidelines
    rev_guides = list_guidelines(active_only=True, db=db_session, current_user=reviewer)
    assert any(g.rule_id == prule.id and g.version == 1 for g in rev_guides)

    # Admin rejects rule 2
    rej_data = reject_proposed_rule(
        rule_id=prule2.id,
        payload=RuleDecisionRequest(reason="Rounding exceptions violate compliance"),
        db=db_session,
        current_user=admin,
    )
    assert rej_data["status"] == "rejected"

    approve_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_id == prule.id, AuditLog.action == "RULE_APPROVE")
        .first()
    )
    reject_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_id == prule2.id, AuditLog.action == "RULE_REJECT")
        .first()
    )
    assert approve_audit is not None
    assert reject_audit is not None


def test_new_findings_show_matches_rule_after_approval(db_session, monkeypatch):
    """After Admin approves synthesized rule, checking similar content marks finding with matches_rule."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")

    admin = db_session.query(User).filter(User.role == UserRole.ADMIN).first()
    reviewer = db_session.query(User).filter(User.role == UserRole.REVIEWER).first()

    # Dismiss 3rd similar guarantee finding -> synthesizes ProposedRule
    finding = _make_guarantee_finding(db_session, "f_e2e_match", "cl_e2e_match")
    res = dismiss_finding(
        finding_id=finding.id,
        payload=DismissRequest(
            reason="Satisfaction guarantee phrasing approved under standard consumer return policy window.",
            resolution_action="dismissed",
        ),
        db=db_session,
        current_user=reviewer,
    )
    rule_id = res["proposed_rules_created"][0]["id"]

    # Admin approves into active Guideline v1
    approved = approve_proposed_rule(
        rule_id=rule_id,
        payload=RuleDecisionRequest(reason="Promote pattern to Living Guideline"),
        db=db_session,
        current_user=admin,
    )
    expected_title = approved["rule"]["title"]

    # Run verification on ci_linkedin_launch (cached extraction yields a satisfaction guarantee claim)
    check_res = run_check(
        db=db_session,
        content_id="ci_linkedin_launch",
        actor_id=reviewer.id,
        actor_role="Reviewer",
    )
    guarantee_findings = [
        f for f in check_res["findings"] if f.get("matches_rule") == expected_title
    ]
    assert len(guarantee_findings) >= 1
    assert guarantee_findings[0]["matches_rule_version"] == 1

    # Verify GET /findings/{finding_id} and GET /content/{content_id} endpoints include matches_rule
    f_detail = get_finding(
        finding_id=guarantee_findings[0]["finding_id"],
        db=db_session,
        current_user=reviewer,
    )
    assert f_detail["matches_rule"] == expected_title
    assert f_detail["matches_rule_version"] == 1

    c_detail = get_content_detail("ci_linkedin_launch", db=db_session, current_user=reviewer)
    assert any(item["matches_rule"] == expected_title for item in c_detail["findings"])
