"""
Verifier — assigns claim status and risk tier.

Rules (from spec):
  • Verified   : matched fact, normalised values agree.
  • Contradicted: matched fact, normalised values DISAGREE.
  • Unverified : no matched fact (no approved source → never "false").
  • Stale      : pinned fact_version has been superseded.

Risk tiers (no composite score, per-finding):
  • Critical   : Contradicted price / quantitative fact in live content
                 or any Contradicted with active fact_version.
  • High       : Contradicted (non-live), or cross-channel contradiction (Phase 4).
  • Medium     : Unverified claim with no evidence (guarantee, superlative).
  • Info       : Verified with minor note, or Stale in draft.

Verifier step drops any finding that has no source reference (source_id is mandatory).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.services.matcher import MatchResult
from app.services.normalizer import NormalizedEntity
from app.models.facts import FactVersion


@dataclass
class VerificationResult:
    status: str           # Verified | Contradicted | Unverified | Stale
    risk_tier: str        # Critical | High | Medium | Info
    reason: str
    source_reference: str  # "source_id p.N" — empty → finding dropped
    extraction_confidence: float
    fix_options: Optional[dict] = None


def verify(
    entity: NormalizedEntity,
    match: MatchResult,
    fact_version: Optional[FactVersion],
    content_state: str,
    source_id: Optional[str],
    source_page: int,
    claim_type: str,  # price | date | percentage | claim
    campaign_products: Optional[list[str]] = None,
) -> Optional[VerificationResult]:
    """
    Produce a VerificationResult or None (if finding should be dropped).

    Verifier drops the finding when source_reference is empty.
    Enforces Sec 6.8: multi-product campaign ambiguity routes to human queue.
    """
    # Build source ref; drop if no source
    if not source_id:
        return None  # No source → Verifier drops it
    source_ref = f"{source_id} p.{source_page}"

    state = content_state.lower().strip()

    # ── Stale check: pinned version superseded ────────────────────────────────
    if match.fact_version_id and fact_version and fact_version.valid_to is not None:
        return VerificationResult(
            status="Stale",
            risk_tier="Medium" if state in ("draft",) else "High",
            reason=(
                f"Pinned fact version has been superseded. "
                f"The current approved value differs."
            ),
            source_reference=source_ref,
            extraction_confidence=entity.extraction_confidence if hasattr(entity, "extraction_confidence") else 1.0,
        )

    # ── Unverified: no match ──────────────────────────────────────────────────
    if match.method == "human" or match.fact_id is None:
        # Superlatives / guarantees → Medium; approximate values → Medium
        tier = "Medium" if claim_type == "claim" else "Medium"
        if campaign_products and len(campaign_products) > 1 and not match.fact_id:
            reason = (
                f"Multiple products declared in campaign ({', '.join(campaign_products)}). "
                f"Claim with unspecified product subject must be resolved by human reviewer (Sec 6.8)."
            )
        elif entity.is_approximate:
            reason = (
                f"Approximate value '{entity.raw_text}' (≈{entity.normalised_str}) "
                "cannot be auto-matched to a fact. Human review required."
            )
        else:
            reason = (
                "No matching brand fact found. "
                "Claim requires human verification — it has NOT been auto-rejected."
            )
        return VerificationResult(
            status="Unverified",
            risk_tier=tier,
            reason=reason,
            source_reference=source_ref,
            extraction_confidence=entity.extraction_confidence if hasattr(entity, "extraction_confidence") else 1.0,
        )

    # ── Matched: compare normalised values ───────────────────────────────────
    if fact_version is None:
        return VerificationResult(
            status="Unverified",
            risk_tier="Medium",
            reason="Fact matched but no approved version found.",
            source_reference=source_ref,
            extraction_confidence=1.0,
        )

    fact_norm = fact_version.normalised_value.strip()
    claim_norm = entity.normalised_str.strip()

    values_match = (fact_norm == claim_norm)

    if values_match:
        return VerificationResult(
            status="Verified",
            risk_tier="Info",
            reason=f"Claim value '{entity.raw_text}' matches fact '{fact_version.value}'.",
            source_reference=source_ref,
            extraction_confidence=1.0,
        )
    else:
        # Contradicted
        tier = _contradiction_tier(state, claim_type)
        fix = _build_fix_options(entity, fact_version)
        return VerificationResult(
            status="Contradicted",
            risk_tier=tier,
            reason=(
                f"Claim states '{entity.raw_text}' (normalised: {claim_norm}) "
                f"but approved fact is '{fact_version.value}' (normalised: {fact_norm}). "
                f"Source: {source_ref}."
            ),
            source_reference=source_ref,
            extraction_confidence=1.0,
            fix_options=fix,
        )


def _contradiction_tier(content_state: str, claim_type: str) -> str:
    """Risk tier for a Contradicted finding."""
    if content_state == "live":
        return "Critical"
    if claim_type == "price":
        return "Critical"
    return "High"


def _build_fix_options(entity: NormalizedEntity, fact_version: FactVersion) -> dict:
    correct = fact_version.value
    return {
        "professional": f"The verified value is {correct}.",
        "marketing": f"Get it at just {correct}!",
        "minimal": correct,
    }

