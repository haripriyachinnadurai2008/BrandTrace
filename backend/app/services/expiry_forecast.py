"""
Expiry Forecasting Service (Improvement 2 — Part B).

For each non-superseded FactVersion that defines valid_to:
  - Computes days_remaining relative to current IST date
  - Computes risk_level:
      * "high"   if days_remaining <= 14
      * "medium" if 14 < days_remaining <= 30
      * "low"    otherwise (> 30)
  - Collects approved/live content assets citing that fact version.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.config import IST
from app.models.campaign import CampaignFact
from app.models.claims import ClaimFactLink, ExtractedClaim
from app.models.content import ContentItem, ContentVersion
from app.models.facts import BrandFact, FactVersion
from app.services.impact_engine import ensure_ist


def compute_expiry_risk_level(days_remaining: int) -> str:
    """Risk classification: high <= 14d, medium <= 30d, else low."""
    if days_remaining <= 14:
        return "high"
    if days_remaining <= 30:
        return "medium"
    return "low"


def build_expiry_forecast(
    db: Session,
    now_ist: Optional[datetime] = None,
    agency_campaign_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build expiry forecast across all non-superseded FactVersions with valid_to set.
    If agency_campaign_id is provided, scopes facts and affected assets to that campaign.
    """
    ref_now = ensure_ist(now_ist or datetime.now(IST))
    today_date = ref_now.date()

    allowed_fact_ids: Optional[set[str]] = None
    if agency_campaign_id is not None:
        if not agency_campaign_id:
            return {
                "as_of_ist": ref_now.isoformat(),
                "expiring_soon_count": 0,
                "high_risk_count": 0,
                "medium_risk_count": 0,
                "low_risk_count": 0,
                "items": [],
            }
        rows = (
            db.query(FactVersion.fact_id)
            .join(CampaignFact, CampaignFact.fact_version_id == FactVersion.version_id)
            .filter(CampaignFact.campaign_id == agency_campaign_id)
            .distinct()
            .all()
        )
        allowed_fact_ids = {r[0] for r in rows}

    query = (
        db.query(FactVersion, BrandFact)
        .join(BrandFact, FactVersion.fact_id == BrandFact.id)
        .filter(
            FactVersion.valid_to.isnot(None),
            FactVersion.status != "superseded",
        )
    )
    if allowed_fact_ids is not None:
        if not allowed_fact_ids:
            return {
                "as_of_ist": ref_now.isoformat(),
                "expiring_soon_count": 0,
                "high_risk_count": 0,
                "medium_risk_count": 0,
                "low_risk_count": 0,
                "items": [],
            }
        query = query.filter(BrandFact.id.in_(list(allowed_fact_ids)))

    rows = query.all()
    items: List[Dict[str, Any]] = []

    for fv, fact in rows:
        vt_ist = ensure_ist(fv.valid_to)
        days_remaining = (vt_ist.date() - today_date).days
        risk_level = compute_expiry_risk_level(days_remaining)
        is_expired = vt_ist < ref_now

        # Find approved/live content assets citing this fact version
        asset_q = (
            db.query(ContentItem, ContentVersion, ExtractedClaim)
            .join(ContentVersion, ContentVersion.content_id == ContentItem.id)
            .join(ExtractedClaim, ExtractedClaim.content_version_id == ContentVersion.version_id)
            .join(ClaimFactLink, ClaimFactLink.claim_id == ExtractedClaim.id)
            .filter(
                ClaimFactLink.fact_version_id == fv.version_id,
                ContentVersion.state.in_(["approved", "live"]),
                ContentItem.current_state.in_(["approved", "live"]),
            )
        )
        if agency_campaign_id:
            asset_q = asset_q.filter(ContentItem.campaign_id == agency_campaign_id)

        seen_content: Dict[str, Dict[str, Any]] = {}
        for ci, cv, claim in asset_q.all():
            if ci.id not in seen_content:
                seen_content[ci.id] = {
                    "content_id": ci.id,
                    "title": ci.title,
                    "channel": ci.channel,
                    "state": cv.state or ci.current_state,
                    "claim_text": claim.raw_span_text,
                    "publish_url": cv.publish_url,
                }

        affected_assets = sorted(seen_content.values(), key=lambda a: (a["state"], a["title"]))
        items.append({
            "fact_id": fact.id,
            "fact_name": fact.name,
            "category": fact.category,
            "version_id": fv.version_id,
            "version_no": fv.version_no,
            "value": fv.value,
            "valid_from": fv.valid_from,
            "valid_to": fv.valid_to,
            "days_remaining": days_remaining,
            "is_expired": is_expired,
            "risk_level": risk_level,
            "affected_assets_count": len(affected_assets),
            "affected_assets": affected_assets,
        })

    items.sort(key=lambda it: (it["days_remaining"], it["fact_id"], -it["version_no"]))
    high_cnt = sum(1 for it in items if it["risk_level"] == "high")
    med_cnt = sum(1 for it in items if it["risk_level"] == "medium")
    low_cnt = sum(1 for it in items if it["risk_level"] == "low")

    return {
        "as_of_ist": ref_now.isoformat(),
        "expiring_soon_count": high_cnt + med_cnt,
        "high_risk_count": high_cnt,
        "medium_risk_count": med_cnt,
        "low_risk_count": low_cnt,
        "items": items,
    }

