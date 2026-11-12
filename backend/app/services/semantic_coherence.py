"""
Semantic Campaign Conflict Detection Service (Improvement 2 — Part A).

Detects cross-channel semantic contradictions that share no matching numbers
(e.g. "free shipping on all orders" vs "shipping from Rs 99",
"limited-time offer" vs "always available",
"no minimum purchase" vs "valid above Rs 999").

Core principle preserved:
  - Tokenisation masks monetary/percentage/date numbers BEFORE sending copy to Groq.
  - LLM proposes candidate conflicts in strict JSON.
  - Backend strictly validates every proposal: both snippets MUST exist verbatim in the
    source assets and confidence MUST be >= 0.6. Anything else is dropped.
  - If Groq is unavailable, fails, or returns malformed output, runs a deterministic
    rule-based semantic check and returns fallback_used=True with a visible badge label.
"""

from __future__ import annotations

import itertools
import json
import re
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session

from app.config import IST, settings
from app.models.audit import AuditLog
from app.models.campaign import Campaign
from app.models.content import ContentItem, ContentVersion
from app.models.governance import SemanticConflict
from app.services.llm_client import GROQ_ENDPOINT, _log_call
from app.services.tokeniser import tokenise

MIN_SEMANTIC_CONFIDENCE = 0.60
VALID_CATEGORIES = {"shipping", "eligibility", "duration", "discount", "claim"}
FALLBACK_LABEL = "AI unavailable, using rule-based check"

SEMANTIC_SYSTEM_PROMPT = """You are a strict brand compliance auditor detecting semantic contradictions between two marketing assets on different channels.
Numbers, prices, percentages, and dates have been masked as [PRICE_1], [PCT_1], [DATE_1], etc.
Analyze Asset A and Asset B for non-numeric or cross-concept contradictions (such as shipping policy, eligibility/minimum spend, offer duration/availability, discount combinability, or conflicting product claims).
Respond ONLY with strict JSON (either one object or a JSON array of objects). Each object MUST match:
{
  "conflict": true or false,
  "reason": "clear plain-language explanation of the contradiction",
  "snippet_a": "exact substring copied verbatim from Asset A",
  "snippet_b": "exact substring copied verbatim from Asset B",
  "confidence": 0.0 to 1.0,
  "category": "shipping" | "eligibility" | "duration" | "discount" | "claim"
}
If there is no contradiction, return {"conflict": false, "reason": "", "snippet_a": "", "snippet_b": "", "confidence": 0.0, "category": "claim"}."""


# Deterministic regex/phrase contradiction pairs: (category, reason_template, group_a_patterns, group_b_patterns, confidence)
_DETERMINISTIC_RULES: List[Tuple[str, str, List[str], List[str], float]] = [
    (
        "shipping",
        "Shipping policy contradiction: {ch_a} promises free/unconditional shipping while {ch_b} states paid or conditional shipping.",
        [
            r"free\s+express\s+shipping\s+on\s+all\s+orders",
            r"free\s+shipping\s+on\s+all\s+orders",
            r"free\s+express\s+delivery",
            r"free\s+express\s+shipping",
            r"free\s+shipping",
            r"free\s+delivery",
            r"complimentary\s+shipping",
        ],
        [
            r"shipping\s+from\s+(?:rs\.?|inr|₹)\s*[0-9,]+(?:\.[0-9]+)?",
            r"standard\s+shipping\s+(?:fees|charges)\s+apply\s+at\s+checkout",
            r"standard\s+shipping\s+(?:fees|charges)\s+apply",
            r"shipping\s+(?:fees|charges)\s+apply",
            r"paid\s+shipping",
            r"delivery\s+(?:fee|charge)s?\s+apply",
        ],
        0.91,
    ),
    (
        "duration",
        "Availability window contradiction: {ch_a} frames this as time-limited while {ch_b} states it is permanently available.",
        [
            r"limited-time\s+offer",
            r"limited\s+time\s+offer",
            r"limited-time",
            r"this\s+weekend\s+only",
            r"flash\s+sale",
            r"offer\s+ends\s+soon",
        ],
        [
            r"always\s+available\s+year-round",
            r"always\s+available",
            r"available\s+year-round",
            r"permanent\s+offer",
            r"no\s+expiry",
        ],
        0.89,
    ),
    (
        "eligibility",
        "Eligibility/minimum-spend contradiction: {ch_a} advertises no minimum or open access while {ch_b} imposes a purchase threshold or buyer restriction.",
        [
            r"no\s+minimum\s+purchase\s+required",
            r"no\s+minimum\s+purchase",
            r"no\s+minimum\s+order",
            r"no\s+minimum\s+spend",
            r"open\s+to\s+all\s+customers",
            r"available\s+to\s+all\s+customers",
        ],
        [
            r"valid\s+(?:only\s+)?(?:on\s+(?:orders|purchases)\s+)?above\s+(?:rs\.?|inr|₹)\s*[0-9,]+(?:\.[0-9]+)?",
            r"valid\s+above\s+(?:rs\.?|inr|₹)?\s*[0-9,]+(?:\.[0-9]+)?",
            r"minimum\s+bundle\s+purchase\s+required",
            r"minimum\s+(?:purchase|order|spend)\s+(?:of\s+)?(?:rs\.?|inr|₹)\s*[0-9,]+",
            r"minimum\s+purchase\s+required",
            r"first-time\s+buyers\s+only",
            r"new\s+subscribers\s+only",
            r"members\s+only",
        ],
        0.88,
    ),
    (
        "discount",
        "Offer combinability contradiction: {ch_a} restricts stacking/additional discounts while {ch_b} promotes combinable or extra discounts.",
        [
            r"cannot\s+be\s+combined\s+with\s+other\s+offers",
            r"no\s+additional\s+discounts",
            r"full\s+price\s+only",
        ],
        [
            r"stackable\s+with\s+other\s+offers",
            r"extra\s+bundle\s+discount",
            r"additional\s+discount\s+available",
        ],
        0.84,
    ),
    (
        "claim",
        "Product claim contradiction: {ch_a} and {ch_b} make conflicting fulfillment or warranty promises.",
        [
            r"in\s+stock\s+(?:for\s+)?immediate\s+dispatch",
            r"ships\s+immediately",
            r"lifetime\s+warranty",
        ],
        [
            r"pre-order\s+only",
            r"backordered",
            r"limited\s+1-year\s+warranty",
        ],
        0.83,
    ),
]


def _build_token_raw_lookup(raw_text: str, spans: List[Tuple[int, int, str, Any]]) -> Dict[str, str]:
    """Map '[PRICE_1]' -> exact original substring from raw_text so unmasked snippets remain verbatim."""
    return {token: raw_text[start:end] for start, end, token, _ in spans}


def _unmask_snippet(snippet: str, token_lookup: Dict[str, str]) -> str:
    result = (snippet or "").strip()
    if not result:
        return ""
    for tok, original in token_lookup.items():
        if tok in result:
            result = result.replace(tok, original)
    return result


def validate_candidate_conflict(
    candidate: Dict[str, Any],
    raw_a: str,
    raw_b: str,
    token_lookup_a: Optional[Dict[str, str]] = None,
    token_lookup_b: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Backend verification gate ("LLM proposes, backend verifies"):
      - conflict must be True
      - confidence must be >= 0.6
      - snippet_a MUST exist verbatim in raw_a
      - snippet_b MUST exist verbatim in raw_b
      - category must be one of shipping/eligibility/duration/discount/claim
    Returns sanitized dict or None if rejected.
    """
    if not isinstance(candidate, dict):
        return None
    if candidate.get("conflict") is not True:
        return None

    try:
        confidence = float(candidate.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None
    if confidence < MIN_SEMANTIC_CONFIDENCE or confidence > 1.0:
        return None

    snippet_a = _unmask_snippet(str(candidate.get("snippet_a") or ""), token_lookup_a or {})
    snippet_b = _unmask_snippet(str(candidate.get("snippet_b") or ""), token_lookup_b or {})
    if not snippet_a or not snippet_b:
        return None

    # Strict verbatim containment check against source asset raw texts
    if snippet_a not in raw_a or snippet_b not in raw_b:
        return None

    reason = str(candidate.get("reason") or "").strip()
    if not reason:
        return None

    category = str(candidate.get("category") or "claim").strip().lower()
    if category not in VALID_CATEGORIES:
        category = "claim"

    return {
        "conflict": True,
        "reason": reason[:600],
        "snippet_a": snippet_a,
        "snippet_b": snippet_b,
        "confidence": round(confidence, 3),
        "category": category,
    }


def _first_match(text: str, patterns: List[str]) -> Optional[str]:
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            return m.group(0)
    return None


def deterministic_pair_check(
    raw_a: str,
    raw_b: str,
    channel_a: str,
    channel_b: str,
) -> List[Dict[str, Any]]:
    """
    Rule-based semantic contradiction check used when Groq is disabled or fails.
    Always extracts exact verbatim substrings from raw_a and raw_b.
    """
    detected: List[Dict[str, Any]] = []
    for category, reason_tmpl, pats_a, pats_b, conf in _DETERMINISTIC_RULES:
        # Check normal direction (A matches pats_a, B matches pats_b)
        match_a = _first_match(raw_a, pats_a)
        match_b = _first_match(raw_b, pats_b)
        if match_a and match_b:
            detected.append({
                "conflict": True,
                "reason": reason_tmpl.format(ch_a=channel_a, ch_b=channel_b),
                "snippet_a": match_a,
                "snippet_b": match_b,
                "confidence": conf,
                "category": category,
            })
            continue

        # Check reversed direction (A matches pats_b, B matches pats_a)
        rev_a = _first_match(raw_a, pats_b)
        rev_b = _first_match(raw_b, pats_a)
        if rev_a and rev_b:
            detected.append({
                "conflict": True,
                "reason": reason_tmpl.format(ch_a=channel_b, ch_b=channel_a),
                "snippet_a": rev_a,
                "snippet_b": rev_b,
                "confidence": conf,
                "category": category,
            })
    return detected


def _parse_groq_json(content: str) -> List[Dict[str, Any]]:
    text_clean = (content or "").strip()
    if text_clean.startswith("```"):
        text_clean = text_clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    parsed = json.loads(text_clean)
    if isinstance(parsed, dict):
        if "conflicts" in parsed and isinstance(parsed["conflicts"], list):
            return [c for c in parsed["conflicts"] if isinstance(c, dict)]
        return [parsed]
    if isinstance(parsed, list):
        return [c for c in parsed if isinstance(c, dict)]
    return []


def _call_groq_pair(
    db: Optional[Session],
    channel_a: str,
    masked_a: str,
    channel_b: str,
    masked_b: str,
) -> Tuple[Optional[List[Dict[str, Any]]], bool]:
    """
    Evaluate one masked cross-channel pair via Groq.
    Returns (candidates_or_None, call_succeeded).
    """
    if not settings.GROQ_API_KEY:
        return None, False

    user_prompt = (
        f"Asset A (channel: {channel_a}):\n{masked_a}\n\n"
        f"Asset B (channel: {channel_b}):\n{masked_b}\n\n"
        "Return ONLY valid JSON."
    )
    payload = {
        "model": settings.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": SEMANTIC_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 500,
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
            timeout=15.0,
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        _log_call(
            db, "groq", GROQ_ENDPOINT, latency_ms, resp.status_code,
            json.dumps(payload), resp.text, cached=False,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return _parse_groq_json(content), True
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        _log_call(
            db, "groq", GROQ_ENDPOINT, latency_ms, 500,
            json.dumps(payload), "", cached=False, error=str(exc),
        )
        return None, False


def _serialize_conflict(c: SemanticConflict) -> Dict[str, Any]:
    return {
        "id": c.id,
        "campaign_id": c.campaign_id,
        "asset_a": c.asset_a,
        "asset_b": c.asset_b,
        "asset_a_title": c.asset_a_title,
        "asset_b_title": c.asset_b_title,
        "channel_a": c.channel_a,
        "channel_b": c.channel_b,
        "snippet_a": c.snippet_a,
        "snippet_b": c.snippet_b,
        "snippets": c.snippets or {"snippet_a": c.snippet_a, "snippet_b": c.snippet_b},
        "reason": c.reason,
        "confidence": c.confidence,
        "category": c.category,
        "status": c.status,
        "fallback_used": bool(c.fallback_used),
        "decided_by": c.decided_by,
        "decided_at": c.decided_at,
        "decision_reason": c.decision_reason,
        "created_at": c.created_at,
    }


def list_campaign_semantic_conflicts(db: Session, campaign_id: str) -> List[Dict[str, Any]]:
    rows = (
        db.query(SemanticConflict)
        .filter(SemanticConflict.campaign_id == campaign_id)
        .order_by(SemanticConflict.created_at.desc())
        .all()
    )
    return [_serialize_conflict(r) for r in rows]


def run_semantic_coherence_check(
    db: Session,
    campaign_id: str,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build cross-channel pairs for campaign_id, evaluate via masked Groq LLM (with
    deterministic fallback on failure/missing key), strictly validate verbatim snippets
    & confidence >= 0.6, persist to semantic_conflicts, and log to AuditLog.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        return {
            "campaign_id": campaign_id,
            "campaign_name": "",
            "pairs_evaluated": 0,
            "conflicts_count": 0,
            "fallback_used": False,
            "ai_label": "Groq LLM Verified",
            "conflicts": [],
        }

    items = db.query(ContentItem).filter(ContentItem.campaign_id == campaign_id).all()
    active_assets: List[Tuple[ContentItem, ContentVersion]] = []
    for item in items:
        if (item.current_state or "").lower() == "archived":
            continue
        latest_cv = (
            db.query(ContentVersion)
            .filter(ContentVersion.content_id == item.id)
            .order_by(ContentVersion.version_no.desc())
            .first()
        )
        if not latest_cv or (latest_cv.state or "").lower() == "archived":
            continue
        if not (latest_cv.raw_text or "").strip():
            continue
        active_assets.append((item, latest_cv))

    # Build pairs strictly across different channels (deterministic order by id)
    active_assets.sort(key=lambda pair: pair[0].id)
    pairs = [
        (a, b)
        for a, b in itertools.combinations(active_assets, 2)
        if (a[0].channel or "").strip().lower() != (b[0].channel or "").strip().lower()
    ]

    any_fallback = False
    validated_findings: List[Dict[str, Any]] = []

    for (item_a, cv_a), (item_b, cv_b) in pairs:
        raw_a = cv_a.raw_text
        raw_b = cv_b.raw_text

        masked_a, map_a = tokenise(raw_a)
        masked_b, map_b = tokenise(raw_b)
        lookup_a = _build_token_raw_lookup(raw_a, map_a.spans)
        lookup_b = _build_token_raw_lookup(raw_b, map_b.spans)

        llm_candidates, groq_ok = _call_groq_pair(
            db, item_a.channel, masked_a, item_b.channel, masked_b
        )

        used_pair_fallback = False
        if not groq_ok or llm_candidates is None:
            used_pair_fallback = True
            any_fallback = True
            raw_candidates = deterministic_pair_check(raw_a, raw_b, item_a.channel, item_b.channel)
            pair_lookup_a: Dict[str, str] = {}
            pair_lookup_b: Dict[str, str] = {}
        else:
            raw_candidates = llm_candidates
            pair_lookup_a = lookup_a
            pair_lookup_b = lookup_b

        for cand in raw_candidates:
            checked = validate_candidate_conflict(
                cand, raw_a, raw_b, pair_lookup_a, pair_lookup_b
            )
            if checked is None:
                continue
            validated_findings.append({
                "asset_a": item_a.id,
                "asset_b": item_b.id,
                "asset_a_title": item_a.title,
                "asset_b_title": item_b.title,
                "channel_a": item_a.channel,
                "channel_b": item_b.channel,
                "fallback_used": used_pair_fallback,
                **checked,
            })

    # Preserve already human-decided (approved/dismissed) conflicts; replace stale open rows
    existing_all = (
        db.query(SemanticConflict)
        .filter(SemanticConflict.campaign_id == campaign_id)
        .all()
    )
    decided_keys = set()
    for row in existing_all:
        if row.status in ("approved", "dismissed"):
            key_fwd = (row.asset_a, row.asset_b, row.category, row.snippet_a, row.snippet_b)
            key_rev = (row.asset_b, row.asset_a, row.category, row.snippet_b, row.snippet_a)
            decided_keys.add(key_fwd)
            decided_keys.add(key_rev)
        else:
            db.delete(row)
    db.flush()

    now = datetime.now(IST)
    seen_open_keys = set()
    for f in validated_findings:
        key = (f["asset_a"], f["asset_b"], f["category"], f["snippet_a"], f["snippet_b"])
        if key in decided_keys or key in seen_open_keys:
            continue
        seen_open_keys.add(key)
        db.add(
            SemanticConflict(
                id=f"sem_{uuid.uuid4().hex[:12]}",
                campaign_id=campaign_id,
                asset_a=f["asset_a"],
                asset_b=f["asset_b"],
                asset_a_title=f["asset_a_title"],
                asset_b_title=f["asset_b_title"],
                channel_a=f["channel_a"],
                channel_b=f["channel_b"],
                snippet_a=f["snippet_a"],
                snippet_b=f["snippet_b"],
                snippets={"snippet_a": f["snippet_a"], "snippet_b": f["snippet_b"]},
                reason=f["reason"],
                confidence=f["confidence"],
                category=f["category"],
                status="open",
                fallback_used=f["fallback_used"],
                created_at=now,
            )
        )

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            entity_type="campaign",
            entity_id=campaign_id,
            action="SEMANTIC_COHERENCE_CHECK",
            actor_id=actor_id,
            actor_role=actor_role or "System",
            old_values=None,
            new_values={
                "pairs_evaluated": len(pairs),
                "validated_conflicts": len(seen_open_keys),
                "fallback_used": any_fallback,
            },
            reason=f"Semantic cross-channel check evaluated {len(pairs)} channel pairs",
            created_at=now,
        )
    )
    db.commit()

    all_rows = list_campaign_semantic_conflicts(db, campaign_id)
    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.name,
        "pairs_evaluated": len(pairs),
        "conflicts_count": len(all_rows),
        "open_count": sum(1 for r in all_rows if r["status"] == "open"),
        "fallback_used": any_fallback,
        "ai_label": FALLBACK_LABEL if any_fallback else "Groq LLM Verified (Token-Masked)",
        "conflicts": all_rows,
    }

