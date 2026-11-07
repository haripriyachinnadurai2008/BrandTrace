import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.routers.facts import preview_fact_impact
from app.models.auth import User, UserRole

def check_impact():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        res = preview_fact_impact(fact_id="F001", new_value="₹5,499", db=db, current_user=admin)
        print("=== GET /facts/F001/impact JSON ===")
        print(json.dumps(res.dict(), indent=2, default=str))
        print("===================================")
        summary = res.summary
        print(f"Summary counts: {summary}")
        assert summary["re_review"] == 2, f"Expected 2 re-review, got {summary['re_review']}"
        assert summary["stale"] == 1, f"Expected 1 stale, got {summary['stale']}"
        assert summary["red_alert"] == 1, f"Expected 1 red alert, got {summary['red_alert']}"
        assert summary["left_alone"] == 1, f"Expected 1 left alone, got {summary['left_alone']}"
        assert summary["total"] == 5, f"Expected 5 total, got {summary['total']}"
        print("[SUCCESS] Impact counts on clean seed match exactly 2/1/1/1 (total 5)!")
    finally:
        db.close()

if __name__ == "__main__":
    check_impact()
