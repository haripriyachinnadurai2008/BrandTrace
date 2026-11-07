import pytest
from datetime import datetime
from fastapi import HTTPException
from app.config import IST
from app.models.auth import User, UserRole
from app.models.facts import FactVersion
from app.schemas.facts import FactVersionCreate
from app.routers.facts import create_fact_version
from app.services.impact_engine import ImpactEngine


def test_reject_noop_fact_version_router(db_session):
    """
    FIX 5 Unit Test:
    Attempting to create a new fact version with a value identical to the current
    active value must be rejected with HTTP 422 Unprocessable Entity and a clear message.
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    assert admin is not None

    current_fv = db.query(FactVersion).filter(FactVersion.fact_id == "F001").order_by(FactVersion.version_no.desc()).first()
    assert current_fv is not None
    cur_val = current_fv.value  # e.g., "Rs 4,999" or "₹4,999"

    # 1. Attempt exact match value
    with pytest.raises(HTTPException) as exc_info:
        create_fact_version(
            fact_id="F001",
            payload=FactVersionCreate(
                value=cur_val,
                unit="INR",
                valid_from=datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST),
                source_id="src_price_list_sep",
                source_page=2,
                reason="Redundant update attempt"
            ),
            db=db,
            current_user=admin
        )
    assert exc_info.value.status_code == 422
    assert "no-op version rejected" in exc_info.value.detail.lower()

    # 2. Attempt normalized equivalent value (e.g., "4999" or "Rs 4999/-")
    with pytest.raises(HTTPException) as exc_norm:
        create_fact_version(
            fact_id="F001",
            payload=FactVersionCreate(
                value="Rs 4,999/-",
                unit="INR",
                valid_from=datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST),
                source_id="src_price_list_sep",
                source_page=2,
                reason="Normalized duplicate"
            ),
            db=db,
            current_user=admin
        )
    assert exc_norm.value.status_code == 422
    assert "no-op version rejected" in exc_norm.value.detail.lower()
    print("\n[TEST PASSED] No-op version creation properly rejected with HTTP 422.")


def test_reject_noop_impact_engine(db_session):
    """
    Direct ImpactEngine invocation with identical value raises ValueError.
    """
    db = db_session
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()

    with pytest.raises(ValueError) as exc:
        ImpactEngine.execute_fact_change(
            db=db,
            fact_id="F001",
            new_value="Rs 4,999",
            unit="INR",
            valid_from=datetime(2026, 12, 1, 0, 0, 0, tzinfo=IST),
            valid_to=None,
            source_id="src_price_list_sep",
            source_page=2,
            actor=admin,
            reason="No-op change"
        )
    assert "no-op" in str(exc.value).lower()

