import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.auth import User, UserRole
from app.models.facts import BrandFact, FactVersion
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ExtractedClaim, ClaimFactLink, Finding
from app.models.governance import Notification
from app.models.audit import AuditLog
from app.services.normalizer import DeterministicNormalizer, IST

def ensure_ist(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=IST)
    return dt.astimezone(IST)

class ImpactEngine:
    """
    Executes fact version updates and calculates downstream content impact.
    Enforces atomic transaction: inserting version, closing old valid_to,
    evaluating impact rules, creating notifications, and recording audit logs.
    """

    @classmethod
    def execute_fact_change(
        cls,
        db: Session,
        fact_id: str,
        new_value: str,
        unit: str,
        valid_from: datetime,
        valid_to: Optional[datetime],
        source_id: str,
        source_page: int,
        actor: User,
        reason: Optional[str] = "Fact version update",
        simulate_failure: bool = False
    ) -> Dict[str, Any]:
        """
        Runs atomic transaction. If simulate_failure is True, raises an exception
        midway to test transaction rollback.
        """
        # Ensure valid_from is in IST
        if valid_from.tzinfo is None:
            valid_from = valid_from.replace(tzinfo=IST)
        else:
            valid_from = valid_from.astimezone(IST)

        if valid_to and valid_to.tzinfo is None:
            valid_to = valid_to.replace(tzinfo=IST)
        elif valid_to:
            valid_to = valid_to.astimezone(IST)

        fact = db.query(BrandFact).filter(BrandFact.id == fact_id).first()
        if not fact:
            raise ValueError(f"BrandFact '{fact_id}' not found")

        # Get latest version
        current_version = (
            db.query(FactVersion)
            .filter(FactVersion.fact_id == fact_id)
            .order_by(desc(FactVersion.version_no))
            .first()
        )

        next_version_no = (current_version.version_no + 1) if current_version else 1
        old_version_id = current_version.version_id if current_version else None
        old_value = current_version.value if current_version else ""

        # Normalize new value
        normalized_entity = DeterministicNormalizer.normalize_any(new_value)
        normalised_val_str = normalized_entity.normalised_str

        # 1. Close old valid_to
        if current_version:
            current_version.valid_to = valid_from
            current_version.status = "superseded"

        # 2. Insert new version
        new_version = FactVersion(
            version_id=str(uuid.uuid4()),
            fact_id=fact_id,
            version_no=next_version_no,
            value=new_value,
            unit=unit,
            normalised_value=normalised_val_str,
            valid_from=valid_from,
            valid_to=valid_to,
            status="approved",
            approved_by=actor.id,
            approved_at=datetime.now(IST),
            source_id=source_id,
            source_page=source_page,
            supersedes_version_id=old_version_id,
            created_at=datetime.now(IST)
        )
        db.add(new_version)
        db.flush()  # Assign new_version.version_id

        # 3. Process Impact Engine across all linked content
        impact_summary = {
            "re_review": 0,
            "stale": 0,
            "red_alert": 0,
            "left_alone": 0,
            "total": 0
        }
        impact_items: List[Dict[str, Any]] = []

        # Find all claim links pointing to ANY previous version of this fact
        linked_claims_query = (
            db.query(ClaimFactLink, ExtractedClaim, ContentVersion, ContentItem, User)
            .join(ExtractedClaim, ClaimFactLink.claim_id == ExtractedClaim.id)
            .join(ContentVersion, ExtractedClaim.content_version_id == ContentVersion.version_id)
            .join(ContentItem, ContentVersion.content_id == ContentItem.id)
            .join(User, ContentItem.owner_id == User.id)
            .join(FactVersion, ClaimFactLink.fact_version_id == FactVersion.version_id)
            .filter(FactVersion.fact_id == fact_id)
            .all()
        )

        # Track already processed content versions to avoid duplicate counts
        processed_cvs = set()

        for link, claim, cv, ci, owner in linked_claims_query:
            if cv.version_id in processed_cvs:
                continue
            processed_cvs.add(cv.version_id)

            item_impact = {
                "content_id": ci.id,
                "content_version_id": cv.version_id,
                "title": ci.title,
                "channel": ci.channel,
                "old_state": cv.state,
                "new_state": cv.state,
                "owner_name": owner.name,
                "owner_email": owner.email,
                "action_required": "Left alone",
                "is_red_alert": False,
                "is_stale": False,
                "is_re_review": False,
                "is_left_alone": False,
                "outdated_value": claim.raw_span_text,
                "new_value": new_value,
                "priority": "None"
            }

            # RULE 4: Archived before new valid_from is left alone with NO alert
            is_archived_prior = False
            if cv.state.lower() == "archived":
                archive_time = ensure_ist(cv.archived_at or cv.published_at or cv.created_at)
                if archive_time and archive_time < valid_from:
                    is_archived_prior = True

            if is_archived_prior:
                item_impact["is_left_alone"] = True
                item_impact["action_required"] = "Left alone"
                item_impact["priority"] = "None"
                impact_summary["left_alone"] += 1
                impact_items.append(item_impact)
                continue

            # RULE 1: Approved and not live -> Re-review required, approval invalidated, owner and reviewer notified
            if cv.state.lower() == "approved":
                cv.state = "re-review required"
                ci.current_state = "re-review required"
                cv.approved_at = None  # Invalidate approval
                cv.is_stale = True
                ci.is_stale = True
                link.status = "stale"

                item_impact["new_state"] = "re-review required"
                item_impact["action_required"] = "Re-review required"
                item_impact["is_re_review"] = True
                item_impact["is_stale"] = True
                item_impact["priority"] = "High"
                impact_summary["re_review"] += 1

                # Create notifications for owner and reviewers
                db.add(Notification(
                    id=str(uuid.uuid4()),
                    user_id=owner.id,
                    type="re_review_required",
                    title=f"Approval Invalidated: {ci.title}",
                    message=f"Fact '{fact.name}' updated to {new_value}. Content has been returned to Re-review required.",
                    reference_id=ci.id,
                    reference_type="content_item",
                    created_at=datetime.now(IST)
                ))

                # Notify reviewers
                reviewers = db.query(User).filter(User.role.in_([UserRole.REVIEWER, UserRole.ADMIN])).all()
                for rev in reviewers:
                    db.add(Notification(
                        id=str(uuid.uuid4()),
                        user_id=rev.id,
                        type="re_review_required",
                        title=f"Action Required: Re-review {ci.title}",
                        message=f"Fact '{fact.name}' updated to {new_value}. Approval was invalidated.",
                        reference_id=ci.id,
                        reference_type="content_item",
                        created_at=datetime.now(IST)
                    ))

            # RULE 2: Draft -> Marked stale with corrected value pre-filled as suggestion
            elif cv.state.lower() == "draft":
                link.status = "stale"
                cv.is_stale = True
                ci.is_stale = True
                item_impact["is_stale"] = True
                item_impact["action_required"] = "Marked stale"
                item_impact["priority"] = "Medium"
                impact_summary["stale"] += 1

                # Add finding with pre-filled suggestion
                db.add(Finding(
                    id=str(uuid.uuid4()),
                    content_version_id=cv.version_id,
                    claim_id=claim.id,
                    risk_tier="Medium",
                    reason=f"Pinned fact '{fact.name}' was superseded by v{next_version_no} ({new_value}). Suggested fix pre-filled.",
                    source_reference=f"{new_version.source_id} p.{new_version.source_page}",
                    extraction_confidence=claim.extraction_confidence,
                    status="open",
                    fix_options={
                        "minimal": f"Update price to {new_value}",
                        "marketing": f"Get the latest {fact.name} at just {new_value}",
                        "professional": f"The official price is {new_value} (effective {valid_from.strftime('%d %b %Y')})"
                    },
                    created_at=datetime.now(IST)
                ))

                db.add(Notification(
                    id=str(uuid.uuid4()),
                    user_id=owner.id,
                    type="stale_draft",
                    title=f"Fact Updated: Draft {ci.title} is Stale",
                    message=f"Fact '{fact.name}' updated to {new_value}. A corrected suggestion has been pre-filled.",
                    reference_id=ci.id,
                    reference_type="content_item",
                    created_at=datetime.now(IST)
                ))

            # RULE 3: Live (creator-marked) content still showing outdated value -> RED ALERT
            elif cv.state.lower() == "live":
                link.status = "contradicted"
                cv.is_red_alert = True
                ci.is_red_alert = True
                item_impact["is_red_alert"] = True
                item_impact["action_required"] = "RED ALERT"
                item_impact["priority"] = "Critical"
                impact_summary["red_alert"] += 1

                # Never auto-edit or unpublish; create Critical Finding + Red Alert Notification
                db.add(Finding(
                    id=str(uuid.uuid4()),
                    content_version_id=cv.version_id,
                    claim_id=claim.id,
                    risk_tier="Critical",
                    reason=f"CRITICAL RED ALERT: Live published asset displays outdated value '{claim.raw_span_text}'. Approved new value is '{new_value}'. Immediate human intervention required.",
                    source_reference=f"{new_version.source_id} p.{new_version.source_page}",
                    extraction_confidence=claim.extraction_confidence,
                    status="open",
                    fix_options={
                        "minimal": f"Correct live asset value to {new_value}",
                        "marketing": f"Update live campaign to reflect {new_value}",
                        "professional": f"Replace with officially approved price: {new_value}"
                    },
                    created_at=datetime.now(IST)
                ))

                db.add(Notification(
                    id=str(uuid.uuid4()),
                    user_id=owner.id,
                    type="red_alert",
                    title=f"[RED ALERT] Live Content Outdated in {ci.title}",
                    message=f"Live asset at {cv.publish_url or 'public URL'} shows {claim.raw_span_text} instead of {new_value}.",
                    reference_id=ci.id,
                    reference_type="content_item",
                    created_at=datetime.now(IST)
                ))

            impact_items.append(item_impact)

        impact_summary["total"] = len(impact_items)

        # 4. Audit Log entry
        audit_entry = AuditLog(
            id=str(uuid.uuid4()),
            entity_type="fact_version",
            entity_id=new_version.version_id,
            action="VERSION_CHANGE",
            actor_id=actor.id,
            actor_role=actor.role.value if hasattr(actor.role, "value") else str(actor.role),
            old_values={"version_no": current_version.version_no if current_version else None, "value": old_value},
            new_values={"version_no": next_version_no, "value": new_value, "valid_from": valid_from.isoformat()},
            reason=reason,
            created_at=datetime.now(IST)
        )
        db.add(audit_entry)

        # Forced failure test hook: simulate failure right before commit to verify rollback
        if simulate_failure:
            db.flush()
            raise RuntimeError("FORCED_SIMULATED_FAILURE: Transaction rollback test triggered.")

        return {
            "fact_id": fact_id,
            "fact_name": fact.name,
            "new_version_no": next_version_no,
            "new_value": new_value,
            "effective_from": valid_from,
            "summary": impact_summary,
            "items": impact_items
        }
