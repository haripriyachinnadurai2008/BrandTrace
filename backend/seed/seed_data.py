import hashlib
from datetime import datetime
from sqlalchemy.orm import Session, sessionmaker

from app.config import IST
from app.database import engine, get_active_engine, SessionLocal, Base, apply_audit_triggers
from app.auth.jwt import hash_password
from app.models.auth import Organization, User, UserRole
from app.models.facts import EvidenceSource, BrandFact, FactVersion
from app.models.campaign import Campaign, CampaignFact
from app.models.content import ContentItem, ContentVersion
from app.models.claims import ExtractedClaim, ClaimFactLink, Finding
from app.models.governance import Rule, Precedent, Notification
from app.models.audit import AuditLog

def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def _ensure_row(db: Session, model_cls, pk_field: str, instance, alt_unique_field: str = None):
    """Insert instance only if no row with matching PK (or optional unique field) exists."""
    pk_val = getattr(instance, pk_field)
    existing = db.query(model_cls).filter(getattr(model_cls, pk_field) == pk_val).first()
    if existing is None and alt_unique_field:
        alt_val = getattr(instance, alt_unique_field, None)
        if alt_val is not None:
            existing = db.query(model_cls).filter(getattr(model_cls, alt_unique_field) == alt_val).first()
    if existing is not None:
        return existing, False
    db.add(instance)
    db.flush()
    return instance, True


def seed_database(db: Session = None, target_engine = None, reset: bool = False) -> dict:
    """
    Idempotent seed function (never deletes user-created rows unless reset=True):
    - Fictional company: Aura Audio
    - 4 Demo Users (Admin, Creator, Reviewer, Agency)
    - Fact F001 'X1 Pro price' v1 ₹4,999 (valid 1 Sep to 30 Nov 2026 IST)
    - Campaign 'Festive Launch'
    - 5 content pieces (LinkedIn, Email, Instagram, Brochure, Webinar)
    - Rules, 2 initial precedents & initial audit log
    """
    should_close = False
    eng = target_engine or (db.get_bind() if db else get_active_engine())

    if reset:
        Base.metadata.drop_all(bind=eng)

    Base.metadata.create_all(bind=eng)
    from app.db.migrations import run_schema_migrations
    run_schema_migrations(eng)
    with eng.begin() as conn:
        apply_audit_triggers(conn)

    if db is None:
        db = sessionmaker(bind=eng)()
        should_close = True

    try:

        # 1. Organization
        org, _ = _ensure_row(db, Organization, "id", Organization(
            id="org_aura_audio",
            name="Aura Audio Technologies",
            created_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)
        ))

        # 2. Users (Admin, Creator, Reviewer, Agency)
        demo_pwd_hash = hash_password("BrandTrace2026!")
        admin, _ = _ensure_row(db, User, "id", User(
            id="usr_admin_elena",
            org_id=org.id,
            name="Elena Vance",
            email="admin@aura-audio.com",
            password_hash=demo_pwd_hash,
            role=UserRole.ADMIN,
            created_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)
        ), alt_unique_field="email")
        creator, _ = _ensure_row(db, User, "id", User(
            id="usr_creator_marcus",
            org_id=org.id,
            name="Marcus Brody",
            email="creator@aura-audio.com",
            password_hash=demo_pwd_hash,
            role=UserRole.CREATOR,
            created_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)
        ), alt_unique_field="email")
        reviewer, _ = _ensure_row(db, User, "id", User(
            id="usr_reviewer_devin",
            org_id=org.id,
            name="Devin Chen",
            email="reviewer@aura-audio.com",
            password_hash=demo_pwd_hash,
            role=UserRole.REVIEWER,
            created_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)
        ), alt_unique_field="email")
        agency, _ = _ensure_row(db, User, "id", User(
            id="usr_agency_partner",
            org_id=org.id,
            name="Partner Agency (Read-Only)",
            email="agency@partner.com",
            password_hash=demo_pwd_hash,
            role=UserRole.AGENCY,
            assigned_campaign_id="camp_festive_launch",
            created_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)
        ), alt_unique_field="email")
        if not agency.assigned_campaign_id:
            agency.assigned_campaign_id = "camp_festive_launch"
            db.flush()

        # 3. Evidence Sources (Sep and Dec price lists)
        source, _ = _ensure_row(db, EvidenceSource, "id", EvidenceSource(
            id="src_price_list_sep",
            org_id=org.id,
            title="Official Price List Q3/Q4 2026",
            file_name="Price_List_Sep.pdf",
            file_type="pdf",
            file_path="uploads/Price_List_Sep.pdf",
            file_hash="hash_price_list_sep_2026",
            excerpt="X1 Pro Flagship Wireless Earbuds: MRP ₹4,999 incl. taxes. Effective 1 Sep 2026.",
            created_at=datetime(2026, 8, 25, 10, 0, 0, tzinfo=IST)
        ))
        source_dec, _ = _ensure_row(db, EvidenceSource, "id", EvidenceSource(
            id="src_price_list_dec",
            org_id=org.id,
            title="Official Price List December Revision 2026",
            file_name="Price_List_Dec.pdf",
            file_type="pdf",
            file_path="uploads/Price_List_Dec.pdf",
            file_hash="hash_price_list_dec_2026",
            excerpt="X1 Pro Flagship Wireless Earbuds: MRP ₹5,499 incl. taxes. Effective 1 Dec 2026.",
            created_at=datetime(2026, 11, 20, 10, 0, 0, tzinfo=IST)
        ))

        # 4. Brand Fact F001 & Version v1 (₹4,999 valid 1 Sep to 30 Nov 2026)
        fact_f001, _ = _ensure_row(db, BrandFact, "id", BrandFact(
            id="F001",
            org_id=org.id,
            name="X1 Pro price",
            category="Pricing",
            created_at=datetime(2026, 8, 25, 10, 30, 0, tzinfo=IST)
        ))

        f001_v1, _ = _ensure_row(db, FactVersion, "version_id", FactVersion(
            version_id="fv_f001_v1",
            fact_id=fact_f001.id,
            version_no=1,
            value="₹4,999",
            unit="INR",
            normalised_value="4999",
            valid_from=datetime(2026, 9, 1, 0, 0, 0, tzinfo=IST),
            valid_to=datetime(2026, 11, 30, 23, 59, 59, tzinfo=IST),
            status="approved",
            approved_by=admin.id,
            approved_at=datetime(2026, 8, 28, 12, 0, 0, tzinfo=IST),
            source_id=source.id,
            source_page=2,
            supersedes_version_id=None,
            created_at=datetime(2026, 8, 28, 12, 0, 0, tzinfo=IST)
        ))

        # 5. Campaign "Festive Launch"
        campaign, _ = _ensure_row(db, Campaign, "id", Campaign(
            id="camp_festive_launch",
            org_id=org.id,
            name="Festive Launch",
            description="Q4 Festive Launch Campaign featuring X1 Pro introductory offers",
            approved_offer="20% off launch discount",
            status="active",
            created_at=datetime(2026, 8, 30, 9, 0, 0, tzinfo=IST)
        ))

        _ensure_row(db, CampaignFact, "id", CampaignFact(
            id="cf_festive_f001",
            campaign_id=campaign.id,
            fact_version_id=f001_v1.version_id,
            notes="Standard retail launch price",
            created_at=datetime(2026, 8, 30, 9, 0, 0, tzinfo=IST)
        ))

        # 6. Governance Rules
        rule_pricing, _ = _ensure_row(db, Rule, "id", Rule(
            id="R001",
            name="Pricing Accuracy Rule",
            description="All marketing and public copy mentioning product pricing must strictly match the active fact version.",
            severity="Critical",
            rule_type="governance",
            created_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)
        ))
        rule_campaign, _ = _ensure_row(db, Rule, "id", Rule(
            id="R002",
            name="Campaign Offer Coherence Rule",
            description="Campaign creative and promotional text must align with the approved campaign offer terms.",
            severity="High",
            rule_type="campaign",
            created_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=IST)
        ))

        # 7. Seed the 5 Content Pieces (only insert versions/claims when content item is newly created)
        # PIECE 1: LinkedIn Launch Post (Approved, Not Live)
        ci_linkedin, created_p1 = _ensure_row(db, ContentItem, "id", ContentItem(
            id="ci_linkedin_launch",
            org_id=org.id,
            campaign_id=campaign.id,
            title="LinkedIn Launch Post",
            channel="linkedin",
            current_state="approved",
            owner_id=creator.id,
            created_at=datetime(2026, 10, 10, 10, 0, 0, tzinfo=IST)
        ))
        if created_p1:
            text_linkedin = "Experience sound redefined. The all-new X1 Pro is officially available starting at ₹5,499 across all retail outlets. Guaranteed 100% satisfaction. Grab yours today!"
            cv_linkedin = ContentVersion(
                version_id="cv_linkedin_v1",
                content_id=ci_linkedin.id,
                version_no=1,
                raw_text=text_linkedin,
                version_hash=hash_text(text_linkedin),
                state="approved",
                approved_at=datetime(2026, 10, 15, 10, 0, 0, tzinfo=IST),
                created_at=datetime(2026, 10, 10, 10, 0, 0, tzinfo=IST)
            )
            claim_linkedin = ExtractedClaim(
                id="claim_linkedin_1",
                content_version_id=cv_linkedin.version_id,
                raw_span_text="₹5,499",
                normalised_value="5499",
                value_type="price",
                is_approximate=False,
                subject="X1 Pro price",
                attribute="price",
                span_start=text_linkedin.find("₹5,499"),
                span_end=text_linkedin.find("₹5,499") + len("₹5,499"),
                extraction_confidence=0.98,
                masked_token="[PRICE_1]",
                created_at=datetime(2026, 10, 10, 10, 0, 0, tzinfo=IST)
            )
            link_linkedin = ClaimFactLink(
                id="link_linkedin_1",
                claim_id=claim_linkedin.id,
                fact_version_id=f001_v1.version_id,
                similarity_score=1.0,
                link_type="auto",
                status="verified",
                created_at=datetime(2026, 10, 10, 10, 0, 0, tzinfo=IST)
            )
            db.add_all([cv_linkedin, claim_linkedin, link_linkedin])

        # PIECE 2: Email Campaign (Approved, Not Live, says 20% off)
        ci_email, created_p2 = _ensure_row(db, ContentItem, "id", ContentItem(
            id="ci_email_festive",
            org_id=org.id,
            campaign_id=campaign.id,
            title="Festive Email Campaign",
            channel="email",
            current_state="approved",
            owner_id=creator.id,
            created_at=datetime(2026, 10, 12, 11, 0, 0, tzinfo=IST)
        ))
        if created_p2:
            text_email = "Festive Season Exclusive: Get the flagship X1 Pro for only ₹4,999 with our limited-time 20% off discount. Upgrade your audio now!"
            cv_email = ContentVersion(
                version_id="cv_email_v1",
                content_id=ci_email.id,
                version_no=1,
                raw_text=text_email,
                version_hash=hash_text(text_email),
                state="approved",
                approved_at=datetime(2026, 10, 20, 14, 30, 0, tzinfo=IST),
                created_at=datetime(2026, 10, 12, 11, 0, 0, tzinfo=IST)
            )
            claim_email_price = ExtractedClaim(
                id="claim_email_1",
                content_version_id=cv_email.version_id,
                raw_span_text="₹4,999",
                normalised_value="4999",
                value_type="price",
                is_approximate=False,
                subject="X1 Pro price",
                attribute="price",
                span_start=text_email.find("₹4,999"),
                span_end=text_email.find("₹4,999") + len("₹4,999"),
                extraction_confidence=0.99,
                masked_token="[PRICE_1]",
                created_at=datetime(2026, 10, 12, 11, 0, 0, tzinfo=IST)
            )
            link_email_price = ClaimFactLink(
                id="link_email_1",
                claim_id=claim_email_price.id,
                fact_version_id=f001_v1.version_id,
                similarity_score=1.0,
                link_type="auto",
                status="verified",
                created_at=datetime(2026, 10, 12, 11, 0, 0, tzinfo=IST)
            )
            claim_email_offer = ExtractedClaim(
                id="claim_email_2",
                content_version_id=cv_email.version_id,
                raw_span_text="20% off",
                normalised_value="20%",
                value_type="percentage",
                is_approximate=False,
                subject="Festive Launch offer",
                attribute="discount",
                span_start=text_email.find("20% off"),
                span_end=text_email.find("20% off") + len("20% off"),
                extraction_confidence=0.97,
                masked_token="[PCT_1]",
                created_at=datetime(2026, 10, 12, 11, 0, 0, tzinfo=IST)
            )
            db.add_all([cv_email, claim_email_price, link_email_price, claim_email_offer])

        # PIECE 3: Instagram Poster Caption (Draft, says 25% off)
        ci_insta, created_p3 = _ensure_row(db, ContentItem, "id", ContentItem(
            id="ci_insta_poster",
            org_id=org.id,
            campaign_id=campaign.id,
            title="Instagram Poster Caption",
            channel="instagram",
            current_state="draft",
            owner_id=creator.id,
            created_at=datetime(2026, 10, 25, 15, 0, 0, tzinfo=IST)
        ))
        if created_p3:
            text_insta = "Turn up the bass! 🎧 X1 Pro drops for ₹4,999 with 25% off this weekend only! #AuraAudio #MusicMatters"
            cv_insta = ContentVersion(
                version_id="cv_insta_v1",
                content_id=ci_insta.id,
                version_no=1,
                raw_text=text_insta,
                version_hash=hash_text(text_insta),
                state="draft",
                created_at=datetime(2026, 10, 25, 15, 0, 0, tzinfo=IST)
            )
            claim_insta_price = ExtractedClaim(
                id="claim_insta_1",
                content_version_id=cv_insta.version_id,
                raw_span_text="₹4,999",
                normalised_value="4999",
                value_type="price",
                is_approximate=False,
                subject="X1 Pro price",
                attribute="price",
                span_start=text_insta.find("₹4,999"),
                span_end=text_insta.find("₹4,999") + len("₹4,999"),
                extraction_confidence=0.95,
                masked_token="[PRICE_1]",
                created_at=datetime(2026, 10, 25, 15, 0, 0, tzinfo=IST)
            )
            link_insta_price = ClaimFactLink(
                id="link_insta_1",
                claim_id=claim_insta_price.id,
                fact_version_id=f001_v1.version_id,
                similarity_score=1.0,
                link_type="auto",
                status="verified",
                created_at=datetime(2026, 10, 25, 15, 0, 0, tzinfo=IST)
            )
            claim_insta_offer = ExtractedClaim(
                id="claim_insta_2",
                content_version_id=cv_insta.version_id,
                raw_span_text="25% off",
                normalised_value="25%",
                value_type="percentage",
                is_approximate=False,
                subject="Festive Launch offer",
                attribute="discount",
                span_start=text_insta.find("25% off"),
                span_end=text_insta.find("25% off") + len("25% off"),
                extraction_confidence=0.96,
                masked_token="[PCT_1]",
                created_at=datetime(2026, 10, 25, 15, 0, 0, tzinfo=IST)
            )
            db.add_all([cv_insta, claim_insta_price, link_insta_price, claim_insta_offer])

        # PIECE 4: Product Brochure PDF (Live, showing ₹4,999)
        ci_brochure, created_p4 = _ensure_row(db, ContentItem, "id", ContentItem(
            id="ci_brochure_pdf",
            org_id=org.id,
            campaign_id=campaign.id,
            title="Product Brochure PDF",
            channel="brochure",
            current_state="live",
            owner_id=creator.id,
            created_at=datetime(2026, 9, 8, 9, 0, 0, tzinfo=IST)
        ))
        if created_p4:
            text_brochure = "Aura X1 Pro Technical Specifications and Pricing Guide. Retail Price: ₹4,999 incl. GST. Battery: 36h playback with ANC enabled."
            cv_brochure = ContentVersion(
                version_id="cv_brochure_v1",
                content_id=ci_brochure.id,
                version_no=1,
                raw_text=text_brochure,
                version_hash=hash_text(text_brochure),
                state="live",
                approved_at=datetime(2026, 9, 9, 10, 0, 0, tzinfo=IST),
                published_at=datetime(2026, 9, 10, 9, 0, 0, tzinfo=IST),
                publish_url="https://aura-audio.com/brochures/x1-pro-q3.pdf",
                created_at=datetime(2026, 9, 8, 9, 0, 0, tzinfo=IST)
            )
            claim_brochure = ExtractedClaim(
                id="claim_brochure_1",
                content_version_id=cv_brochure.version_id,
                raw_span_text="₹4,999",
                normalised_value="4999",
                value_type="price",
                is_approximate=False,
                subject="X1 Pro price",
                attribute="price",
                span_start=text_brochure.find("₹4,999"),
                span_end=text_brochure.find("₹4,999") + len("₹4,999"),
                extraction_confidence=0.99,
                masked_token="[PRICE_1]",
                created_at=datetime(2026, 9, 8, 9, 0, 0, tzinfo=IST)
            )
            link_brochure = ClaimFactLink(
                id="link_brochure_1",
                claim_id=claim_brochure.id,
                fact_version_id=f001_v1.version_id,
                similarity_score=1.0,
                link_type="auto",
                status="verified",
                created_at=datetime(2026, 9, 8, 9, 0, 0, tzinfo=IST)
            )
            db.add_all([cv_brochure, claim_brochure, link_brochure])

        # PIECE 5: Old Webinar Post (Published and Archived before 1 Dec 2026)
        ci_webinar, created_p5 = _ensure_row(db, ContentItem, "id", ContentItem(
            id="ci_webinar_post",
            org_id=org.id,
            campaign_id=campaign.id,
            title="Q3 Launch Webinar Post",
            channel="webinar",
            current_state="archived",
            owner_id=creator.id,
            created_at=datetime(2026, 9, 5, 10, 0, 0, tzinfo=IST)
        ))
        if created_p5:
            text_webinar = "Thank you for joining our launch webinar recap! Early bird orders for X1 Pro were fulfilled at ₹4,999. Recording now archived."
            cv_webinar = ContentVersion(
                version_id="cv_webinar_v1",
                content_id=ci_webinar.id,
                version_no=1,
                raw_text=text_webinar,
                version_hash=hash_text(text_webinar),
                state="archived",
                approved_at=datetime(2026, 9, 5, 10, 30, 0, tzinfo=IST),
                published_at=datetime(2026, 9, 5, 11, 0, 0, tzinfo=IST),
                archived_at=datetime(2026, 10, 31, 18, 0, 0, tzinfo=IST),
                publish_url="https://aura-audio.com/webinars/q3-recap",
                created_at=datetime(2026, 9, 5, 10, 0, 0, tzinfo=IST)
            )
            claim_webinar = ExtractedClaim(
                id="claim_webinar_1",
                content_version_id=cv_webinar.version_id,
                raw_span_text="₹4,999",
                normalised_value="4999",
                value_type="price",
                is_approximate=False,
                subject="X1 Pro price",
                attribute="price",
                span_start=text_webinar.find("₹4,999"),
                span_end=text_webinar.find("₹4,999") + len("₹4,999"),
                extraction_confidence=0.98,
                masked_token="[PRICE_1]",
                created_at=datetime(2026, 9, 5, 10, 0, 0, tzinfo=IST)
            )
            link_webinar = ClaimFactLink(
                id="link_webinar_1",
                claim_id=claim_webinar.id,
                fact_version_id=f001_v1.version_id,
                similarity_score=1.0,
                link_type="auto",
                status="verified",
                created_at=datetime(2026, 9, 5, 10, 0, 0, tzinfo=IST)
            )
            db.add_all([cv_webinar, claim_webinar, link_webinar])

        # 8. Seed at least 2 Example Precedents (Living Guidelines Lite) — insert only if missing
        _ensure_row(db, Precedent, "id", Precedent(
            id="prec_festive_override_01",
            rule_id=rule_pricing.id,
            finding_id=None,
            reviewer_id=reviewer.id,
            reason="Reviewed with executive marketing team: 30-day introductory price lock exception approved for initial launch window.",
            finding_summary="Product price claim '₹4,999' on LinkedIn Launch Post",
            resolution_action="override",
            timestamp=datetime(2026, 10, 15, 11, 0, 0, tzinfo=IST)
        ))
        _ensure_row(db, Precedent, "id", Precedent(
            id="prec_festive_coherence_02",
            rule_id=rule_campaign.id,
            finding_id=None,
            reviewer_id=reviewer.id,
            reason="Promotional discount '20% off' cross-verified with Festive Launch campaign brief and authorized by CMO.",
            finding_summary="Campaign offer claim '20% off' on Festive Email Campaign",
            resolution_action="accepted",
            timestamp=datetime(2026, 10, 20, 15, 0, 0, tzinfo=IST)
        ))

        # 9. Initial Audit Log (strictly insert-if-missing, never update/delete)
        _ensure_row(db, AuditLog, "id", AuditLog(
            id="audit_initial_seed",
            entity_type="brand_fact",
            entity_id=fact_f001.id,
            action="CREATE",
            actor_id=admin.id,
            actor_role="Admin",
            old_values=None,
            new_values={"fact_id": fact_f001.id, "initial_version": "₹4,999", "valid_from": "2026-09-01T00:00:00+05:30"},
            reason="Initial seed of Aura Audio brand governance base",
            created_at=datetime(2026, 8, 28, 12, 0, 0, tzinfo=IST)
        ))

        # 10. Backfill PDF evidence coordinates idempotently for seeded price claims if missing
        from app.services.pdf_evidence import build_search_candidates, locate_evidence_in_pdf, resolve_pdf_path
        sep_path = resolve_pdf_path(source, document_id=source.id)
        if sep_path is not None:
            sep_terms = build_search_candidates(
                normalised_value=f001_v1.normalised_value,
                fact_value=f001_v1.value,
                unit=f001_v1.unit,
                value_type="price",
            )
            sep_loc = locate_evidence_in_pdf(sep_path, search_terms=sep_terms, cited_page=2)
            seeded_price_claims = (
                db.query(ExtractedClaim)
                .filter(ExtractedClaim.id.in_([
                    "claim_linkedin_1",
                    "claim_email_1",
                    "claim_insta_1",
                    "claim_brochure_1",
                    "claim_webinar_1",
                ]))
                .all()
            )
            for sc in seeded_price_claims:
                if sc.evidence_located is None:
                    sc.evidence_document_id = source.id
                    sc.evidence_page = sep_loc.page
                    sc.evidence_rects = sep_loc.rects
                    sc.evidence_page_width = sep_loc.page_width
                    sc.evidence_page_height = sep_loc.page_height
                    sc.evidence_located = sep_loc.located
                    sc.evidence_reason = sep_loc.reason

        db.commit()
        return {
            "status": "success",
            "mode": "reset" if reset else "idempotent",
            "organization": org.name,
            "fact_seeded": f"{fact_f001.id} v1 ({f001_v1.value})",
            "content_items_total": db.query(ContentItem).count(),
            "precedents_total": db.query(Precedent).count(),
            "audit_logs_total": db.query(AuditLog).count(),
            "campaign": campaign.name
        }
    except Exception as e:
        db.rollback()
        raise e
    finally:
        if should_close:
            db.close()

if __name__ == "__main__":
    result = seed_database()
    print("Seed Complete:", result)
