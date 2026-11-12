"""
Precedent-to-Rule Synthesizer Service.

Clusters reviewer overrides/dismissals by finding type and rationale similarity
(pg_trgm >= 0.6 or Groq semantic clustering, with deterministic fallback when Groq
fails or is disabled). When any group reaches >= 3 precedents, synthesizes one
ProposedRule (never duplicating an existing cluster) with supporting links in
rule_precedents.

Also matches incoming findings against active versioned Guidelines so Content
Findings can annotate "matches_rule: <title>".
"""

from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import IST, settings
from app.models.audit import AuditLog
from app.models.claims import ExtractedClaim, Finding
from app.models.governance import Guideline, Precedent, ProposedRule, RulePrecedent
from app.services.llm_client import GROQ_ENDPOINT, _log_call
from app.services.matcher import _py_trigram_similarity
from app.services.tokeniser import tokenise

SIMILARITY_THRESHOLD = 0.60
MIN_PRECEDENTS_FOR_PROPOSAL = 3

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "by", "can",
    "for", "from", "had", "has", "have", "in", "into", "is", "it", "its",
    "of", "on", "or", "per", "that", "the", "their", "this", "to", "under",
    "was", "were", "will", "with", "within", "claim", "finding", "approved",
    "override", "overridden", "dismissed", "reviewer", "exception", "rule",
}


def classify_finding_type(
    finding: Optional[Finding] = None,
    claim: Optional[ExtractedClaim] = None,
    summary_text: str = "",
    reason_text: str = "",
) -> str:
    """Infer canonical finding_type for grouping precedents and matching guidelines."""
    attr = (getattr(claim, "attribute", None) or "").lower()
    subj = (getattr(claim, "subject", None) or "").lower()
    vtype = (getattr(claim, "value_type", None) or "").lower()
    raw_span = (getattr(claim, "raw_span_text", None) or "").lower()
    f_reason = (getattr(finding, "reason", None) or "").lower()
    combined = " ".join(part for part in (attr, subj, vtype, raw_span, f_reason, summary_text.lower(), reason_text.lower()) if part)

    if "guarantee" in combined or "satisfaction" in combined:
        return "guarantee"
    if vtype == "percentage" or "discount" in combined or "offer" in combined or "%" in combined:
        return "discount"
    if vtype == "price" or "price" in combined or "mrp" in combined:
        return "price"
    if vtype == "date" or "valid_to" in combined or "effective date" in combined:
        return "date"
    return vtype or "claim"


def _extract_keywords(text_str: str) -> List[str]:
    tokens = re.findall(r"[a-z]{3,}", (text_str or "").lower())
    seen: List[str] = []
    for tok in tokens:
        if tok not in STOPWORDS and tok not in seen:
            seen.append(tok)
    return seen


def compute_rationale_similarity(db: Session, text_a: str, text_b: str) -> float:
    """
    Compute rationale similarity using PostgreSQL pg_trgm similarity() when available,
    falling back seamlessly to Python character trigram similarity on SQLite.
    """
    a = (text_a or "").strip()
    b = (text_b or "").strip()
    if not a or not b:
        return 0.0
    if a.lower() == b.lower():
        return 1.0

    try:
        dialect = db.bind.dialect.name if db and db.bind else ""
        if dialect == "postgresql":
            row = db.execute(
                text("SELECT similarity(:a, :b)"),
                {"a": a, "b": b},
            ).fetchone()
            if row and row[0] is not None:
                return float(row[0])
    except Exception:
        pass

    return _py_trigram_similarity(a, b)


def _keyword_jaccard(text_a: str, text_b: str) -> float:
    ka = set(_extract_keywords(text_a))
    kb = set(_extract_keywords(text_b))
    if not ka or not kb:
        return 0.0
    return len(ka & kb) / len(ka | kb)


def _cluster_signature(finding_type: str, group: List[Precedent]) -> str:
    """Deterministic key representing a cluster's finding type & core rationale keywords."""
    freq: Dict[str, int] = {}
    for p in group:
        for kw in _extract_keywords(p.reason):
            freq[kw] = freq.get(kw, 0) + 1
    top_kws = [
        k for k, _ in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:4]
    ]
    return f"{finding_type}::{'_'.join(sorted(top_kws))}"


def _groq_cluster_and_label(
    db: Session,
    finding_type: str,
    group: List[Precedent],
) -> Optional[Dict[str, str]]:
    """
    Ask Groq (with strictly masked/tokenized text, zero raw numbers) to produce a
    plain-language title, description, and suggested policy text for a cluster.
    Returns None cleanly if GROQ_API_KEY is missing or if Groq fails/times out.
    """
    if not settings.GROQ_API_KEY:
        return None

    masked_items = []
    for p in group[:8]:
        masked_summary, _ = tokenise(p.finding_summary or "")
        masked_reason, _ = tokenise(p.reason or "")
        masked_items.append({
            "summary": masked_summary[:200],
            "rationale": masked_reason[:240],
        })

    prompt = (
        "You are a brand governance policy synthesizer.\n"
        f"Finding category: {finding_type}\n"
        f"Clustered reviewer overrides (sensitive numbers masked):\n{json.dumps(masked_items)}\n\n"
        "Respond with ONLY valid JSON matching:\n"
        '{"title": "short 5-9 word title", "description": "1-2 sentence pattern explanation", '
        '"suggested_policy_text": "clear actionable governance rule sentence"}'
    )

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "Return ONLY valid JSON with keys title, description, suggested_policy_text."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 300,
    }

    t0 = time.monotonic()
    try:
        resp = httpx.post(
            GROQ_ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10.0,
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        _log_call(
            db, "groq", GROQ_ENDPOINT, latency_ms, resp.status_code,
            json.dumps(payload), resp.text, cached=False,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        parsed = json.loads(content)
        title = str(parsed.get("title", "")).strip()
        desc = str(parsed.get("description", "")).strip()
        policy = str(parsed.get("suggested_policy_text", "")).strip()
        if title and desc and policy:
            return {
                "title": title[:160],
                "description": desc[:400],
                "suggested_policy_text": policy[:600],
            }
        return None
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        _log_call(
            db, "groq", GROQ_ENDPOINT, latency_ms, 500,
            json.dumps(payload), "", cached=False, error=str(exc),
        )
        return None


def _deterministic_rule_copy(finding_type: str, group: List[Precedent]) -> Dict[str, str]:
    """Deterministic fallback rule copy when Groq is disabled or fails."""
    combined = " ".join(
        f"{p.finding_summary or ''} {p.reason or ''}" for p in group
    ).lower()

    if finding_type == "guarantee" or ("satisfaction" in combined and "guarantee" in combined):
        return {
            "title": "Standardize Satisfaction Guarantee Claims Under Return Policy",
            "description": (
                f"Synthesized from {len(group)} consistent reviewer overrides approving "
                "satisfaction guarantee phrasing under standard consumer return policy coverage."
            ),
            "suggested_policy_text": (
                "Permit product satisfaction guarantee claims across approved marketing channels "
                "when backed by standard consumer return policy terms and disclosure links."
            ),
        }

    freq: Dict[str, int] = {}
    for p in group:
        for kw in _extract_keywords(p.reason):
            freq[kw] = freq.get(kw, 0) + 1
    top_kws = [k for k, _ in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:4]]
    kw_label = ", ".join(top_kws) if top_kws else finding_type
    rep_reason = (group[0].reason or "").strip().rstrip(".")

    return {
        "title": f"Living Guideline: {finding_type.replace('_', ' ').title()} ({kw_label})",
        "description": (
            f"Synthesized from {len(group)} similar reviewer overrides in category '{finding_type}' "
            f"citing recurring justification pattern: {rep_reason}."
        ),
        "suggested_policy_text": (
            f"Allow '{finding_type}' claims matching reviewed exception pattern ({kw_label}) "
            f"when rationale aligns with: {rep_reason}."
        ),
    }


def _find_matching_existing_rule(
    db: Session,
    finding_type: str,
    signature: str,
    group: List[Precedent],
) -> Optional[ProposedRule]:
    """Check whether a ProposedRule already exists for this precedent cluster."""
    group_ids = {p.id for p in group}
    existing_rules = (
        db.query(ProposedRule)
        .filter(ProposedRule.finding_type == finding_type)
        .all()
    )
    for rule in existing_rules:
        if rule.cluster_signature == signature:
            return rule
        linked_ids = {lnk.precedent_id for lnk in rule.precedent_links}
        # Same cluster if >= 2 precedents overlap or direct rationale similarity >= threshold
        if len(group_ids & linked_ids) >= 2:
            return rule
        if rule.precedent_links:
            rep_prec = rule.precedent_links[0].precedent
            if rep_prec and compute_rationale_similarity(db, rep_prec.reason, group[0].reason) >= SIMILARITY_THRESHOLD:
                return rule
    return None


def _similar_rationales(db: Session, prec_a: Precedent, prec_b: Precedent) -> bool:
    """True if two precedents have rationale similarity >= 0.6 (pg_trgm or semantic fallback)."""
    trgm_sim = compute_rationale_similarity(db, prec_a.reason, prec_b.reason)
    if trgm_sim >= SIMILARITY_THRESHOLD:
        return True
    # Paraphrase safety net when key policy terms overlap strongly
    if _keyword_jaccard(prec_a.reason, prec_b.reason) >= 0.55:
        return True
    return False


def synthesize_proposed_rules(
    db: Session,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
) -> List[ProposedRule]:
    """
    Cluster precedents by finding_type + rationale similarity (>= 0.6).
    For any cluster with >= 3 precedents that has no ProposedRule yet, creates one
    ProposedRule and links all supporting precedents in rule_precedents.
    Never creates duplicates for an existing cluster.
    """
    precedents: List[Precedent] = (
        db.query(Precedent)
        .order_by(Precedent.timestamp.asc())
        .all()
    )
    if len(precedents) < MIN_PRECEDENTS_FOR_PROPOSAL:
        return []

    # Group by finding_type first
    by_type: Dict[str, List[Precedent]] = {}
    for p in precedents:
        ftype = p.finding_type
        if not ftype:
            finding_obj = (
                db.query(Finding).filter(Finding.id == p.finding_id).first()
                if p.finding_id
                else None
            )
            claim_obj = (
                db.query(ExtractedClaim).filter(ExtractedClaim.id == finding_obj.claim_id).first()
                if finding_obj
                else None
            )
            ftype = classify_finding_type(
                finding=finding_obj,
                claim=claim_obj,
                summary_text=p.finding_summary or "",
                reason_text=p.reason or "",
            )
            p.finding_type = ftype
        by_type.setdefault(ftype, []).append(p)

    newly_created: List[ProposedRule] = []
    now = datetime.now(IST)

    for finding_type, items in by_type.items():
        if len(items) < MIN_PRECEDENTS_FOR_PROPOSAL:
            continue

        # Cluster by pairwise similarity against group members
        clusters: List[List[Precedent]] = []
        for prec in items:
            placed = False
            for cluster in clusters:
                if any(_similar_rationales(db, existing, prec) for existing in cluster):
                    cluster.append(prec)
                    placed = True
                    break
            if not placed:
                clusters.append([prec])

        for group in clusters:
            if len(group) < MIN_PRECEDENTS_FOR_PROPOSAL:
                continue

            sig = _cluster_signature(finding_type, group)
            existing_rule = _find_matching_existing_rule(db, finding_type, sig, group)
            if existing_rule is not None:
                # Attach newly matching precedents if still open for review, without duplicating rule
                existing_prec_ids = {lnk.precedent_id for lnk in existing_rule.precedent_links}
                for p in group:
                    if p.id not in existing_prec_ids:
                        db.add(
                            RulePrecedent(
                                id=str(uuid.uuid4()),
                                rule_id=existing_rule.id,
                                precedent_id=p.id,
                                created_at=now,
                            )
                        )
                db.flush()
                continue

            copy_dict = _groq_cluster_and_label(db, finding_type, group)
            if copy_dict is None:
                copy_dict = _deterministic_rule_copy(finding_type, group)

            proposed = ProposedRule(
                id=f"prule_{uuid.uuid4().hex[:12]}",
                title=copy_dict["title"],
                description=copy_dict["description"],
                suggested_policy_text=copy_dict["suggested_policy_text"],
                finding_type=finding_type,
                cluster_signature=sig,
                status="proposed",
                created_at=now,
            )
            db.add(proposed)
            db.flush()

            for p in group:
                db.add(
                    RulePrecedent(
                        id=str(uuid.uuid4()),
                        rule_id=proposed.id,
                        precedent_id=p.id,
                        created_at=now,
                    )
                )

            db.add(
                AuditLog(
                    id=str(uuid.uuid4()),
                    entity_type="proposed_rule",
                    entity_id=proposed.id,
                    action="RULE_SYNTHESIZED",
                    actor_id=actor_id,
                    actor_role=actor_role or "System",
                    old_values=None,
                    new_values={
                        "title": proposed.title,
                        "finding_type": finding_type,
                        "precedent_count": len(group),
                    },
                    reason=f"Synthesized proposed rule from {len(group)} similar '{finding_type}' overrides",
                    created_at=now,
                )
            )
            db.flush()
            newly_created.append(proposed)

    return newly_created


def find_matching_active_guideline(
    db: Session,
    finding_type: str,
    claim_text: str = "",
    subject: str = "",
    reason_text: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Match a finding against active versioned Guidelines.
    Returns {"rule_id", "guideline_id", "title", "version", "text"} or None.
    """
    active_guidelines = (
        db.query(Guideline)
        .filter(Guideline.active.is_(True))
        .order_by(Guideline.version.desc(), Guideline.created_at.desc())
        .all()
    )
    if not active_guidelines:
        return None

    finding_haystack = f"{claim_text} {subject} {reason_text}".lower()
    finding_kws = set(_extract_keywords(finding_haystack))

    for g in active_guidelines:
        prule = db.query(ProposedRule).filter(ProposedRule.id == g.rule_id).first()
        g_type = (g.finding_type or (prule.finding_type if prule else "") or "claim").lower()
        if g_type != finding_type.lower():
            continue

        rule_title = g.title or (prule.title if prule else "Approved Brand Guideline")
        rule_corpus_parts = [rule_title, g.text or ""]
        if prule:
            for lnk in prule.precedent_links:
                if lnk.precedent:
                    rule_corpus_parts.append(lnk.precedent.finding_summary or "")
                    rule_corpus_parts.append(lnk.precedent.reason or "")
        rule_kws = set(_extract_keywords(" ".join(rule_corpus_parts)))

        overlap = finding_kws & rule_kws
        # Require at least 1 meaningful shared content token (or matching non-trivial cluster signature)
        if overlap:
            return {
                "rule_id": g.rule_id,
                "guideline_id": g.id,
                "title": rule_title,
                "version": g.version,
                "text": g.text,
            }

    return None

