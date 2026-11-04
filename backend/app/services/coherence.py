"""
Phase 4 — Campaign Coherence Lite (Named Improvement #2).

Deterministic check: within a campaign, two content versions that share the
same (subject, attribute) but have DIFFERENT normalised values → High finding
"Cross-channel contradiction". No LLM verdict, no composite score.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Dict, Tuple
from sqlalchemy.orm import Session

from app.config import IST
from app.models.campaign import Campaign
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ExtractedClaim, Finding


def check_campaign_coherence(db: Session, campaign_id: str) -> List[dict]:
    """
    Returns list of High findings for cross-channel contradictions.
    Writes Finding rows to DB (caller must commit).
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        return []

    # Collect the latest content version for every item in this campaign
    items = db.query(ContentItem).filter(ContentItem.campaign_id == campaign_id).all()
    if not items:
        return []

    # Group claims by (subject, attribute) → { key: [(content_title, channel, claim)] }
    claim_groups: Dict[Tuple[str, str], List[Tuple[str, str, ExtractedClaim]]] = {}

    for item in items:
        latest_cv = (
            db.query(ContentVersion)
            .filter(ContentVersion.content_id == item.id)
            .order_by(ContentVersion.version_no.desc())
            .first()
        )
        if not latest_cv:
            continue
        claims = db.query(ExtractedClaim).filter(
            ExtractedClaim.content_version_id == latest_cv.version_id
        ).all()
        for claim in claims:
            if claim.subject and claim.attribute:
                key = (claim.subject.lower().strip(), claim.attribute.lower().strip())
                claim_groups.setdefault(key, []).append(
                    (item.title, item.channel, latest_cv, claim)
                )

    findings_created = []
    now = datetime.now(IST)

    for (subject, attribute), entries in claim_groups.items():
        if len(entries) < 2:
            continue

        # Collect distinct normalised values
        values = [(title, channel, cv, claim, claim.normalised_value.strip())
                  for title, channel, cv, claim in entries]
        unique_vals = set(v[-1] for v in values)

        if len(unique_vals) <= 1:
            continue  # All agree — no contradiction

        # Build human-readable contradiction note
        examples = "; ".join(
            f"'{channel}' says {norm_val}"
            for _, channel, _, _, norm_val in values[:4]
        )
        reason = (
            f"Cross-channel contradiction on '{subject} / {attribute}': {examples}."
        )

        # Write one Finding per affected content version
        for title, channel, cv, claim, norm_val in values:
            finding = Finding(
                id=str(uuid.uuid4()),
                content_version_id=cv.version_id,
                claim_id=claim.id,
                risk_tier="High",
                reason=reason,
                source_reference=f"campaign:{campaign_id}",
                extraction_confidence=1.0,
                status="open",
                fix_options={
                    "professional": f"Align all channels: approved offer is '{campaign.approved_offer}'.",
                    "marketing": f"Consistent offer across channels: {campaign.approved_offer}.",
                    "minimal": campaign.approved_offer or "Align with approved offer.",
                },
                created_at=now,
            )
            db.add(finding)
            findings_created.append({
                "finding_id": finding.id,
                "content_title": title,
                "channel": channel,
                "subject": subject,
                "attribute": attribute,
                "this_value": norm_val,
                "all_values": list(unique_vals),
                "risk_tier": "High",
                "reason": reason,
            })

    return findings_created

