"""
Matcher — three-tier cascade matching claim subjects to brand facts.

Tier 1: Exact subject/alias match  → score 1.0, method="exact"
Tier 2: pg_trgm similarity ≥ 0.85  → score from trgm, method="trgm"  (auto-link)
         0.60 – 0.84               → present top-3 to LLM for pick, method="llm_pick"
         < 0.60                    → Unverified human queue, method="human"

Approximate values (is_approximate=True) are NEVER auto-matched regardless of
subject score; they go straight to the human queue.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.facts import BrandFact, FactVersion
from app.services.normalizer import NormalizedEntity


@dataclass
class MatchResult:
    fact_id: Optional[str]
    fact_version_id: Optional[str]
    score: float
    method: str  # exact | trgm | llm_pick | human
    candidates: List[dict]  # top-3 when method == llm_pick


def _current_version(db: Session, fact_id: str) -> Optional[FactVersion]:
    """Return the current (valid_to IS NULL or latest) approved version."""
    return (
        db.query(FactVersion)
        .filter(FactVersion.fact_id == fact_id, FactVersion.valid_to.is_(None))
        .order_by(FactVersion.version_no.desc())
        .first()
    ) or (
        db.query(FactVersion)
        .filter(FactVersion.fact_id == fact_id)
        .order_by(FactVersion.version_no.desc())
        .first()
    )


def _py_trigrams(text_str: str) -> set[str]:
    """Generate character trigrams with standard pg_trgm padding."""
    padded = f"  {text_str.lower().strip()} "
    return {padded[i:i+3] for i in range(len(padded) - 2)}


def _py_trigram_similarity(a: str, b: str) -> float:
    """Compute trigram similarity identical to pg_trgm."""
    t1 = _py_trigrams(a)
    t2 = _py_trigrams(b)
    if not t1 or not t2:
        return 0.0
    return len(t1 & t2) / len(t1 | t2)


def _trgm_scores(db: Session, subject: str, limit: int = 5) -> List[Tuple[str, float]]:
    """
    Use pg_trgm similarity() to rank brand_fact names against the claim subject.
    Falls back to Python trigram similarity if pg_trgm is not installed or on SQLite.
    """
    try:
        rows = db.execute(
            text(
                "SELECT id, similarity(name, :q) AS sim "
                "FROM brand_facts ORDER BY sim DESC LIMIT :lim"
            ),
            {"q": subject, "lim": limit},
        ).fetchall()
        return [(row[0], float(row[1])) for row in rows]
    except Exception:
        # Fallback for SQLite / environments without pg_trgm extension
        all_facts = db.query(BrandFact).all()
        scored = [
            (f.id, _py_trigram_similarity(f.name, subject))
            for f in all_facts
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]


def match_claim(
    db: Session,
    subject: str,
    entity: NormalizedEntity,
    llm_pick_fn=None,  # optional callable(masked_text, candidates) -> fact_id | None
) -> MatchResult:
    """
    Match a single extracted claim to a brand fact.

    Parameters
    ----------
    subject : claim subject string extracted by LLM
    entity  : NormalizedEntity with parsed value and is_approximate flag
    llm_pick_fn : injected function that calls LLM with top-3 candidates;
                  if None, falls back to human queue at the 0.60-0.85 band.
    """
    # Approximate values → always human queue (never auto-match)
    if entity.is_approximate:
        return MatchResult(
            fact_id=None, fact_version_id=None,
            score=0.0, method="human", candidates=[]
        )

    all_facts: List[BrandFact] = db.query(BrandFact).all()

    # ── Tier 1: Exact name / alias match ─────────────────────────────────────
    for fact in all_facts:
        if fact.name.lower().strip() == subject.lower().strip():
            ver = _current_version(db, fact.id)
            return MatchResult(
                fact_id=fact.id,
                fact_version_id=ver.version_id if ver else None,
                score=1.0,
                method="exact",
                candidates=[],
            )

    # ── Tier 2: pg_trgm similarity ───────────────────────────────────────────
    trgm_results = _trgm_scores(db, subject, limit=5)

    if not trgm_results:
        return MatchResult(fact_id=None, fact_version_id=None,
                           score=0.0, method="human", candidates=[])

    top_score = trgm_results[0][1]
    top_fact_id = trgm_results[0][0]

    if top_score >= 0.85:
        ver = _current_version(db, top_fact_id)
        return MatchResult(
            fact_id=top_fact_id,
            fact_version_id=ver.version_id if ver else None,
            score=top_score,
            method="trgm",
            candidates=[],
        )

    if top_score >= 0.60:
        # Build top-3 candidate list for LLM or human
        candidates = []
        for fid, score in trgm_results[:3]:
            fact = db.query(BrandFact).filter(BrandFact.id == fid).first()
            ver = _current_version(db, fid)
            candidates.append({
                "fact_id": fid,
                "fact_version_id": ver.version_id if ver else None,
                "name": fact.name if fact else fid,
                "current_value": ver.value if ver else "unknown",
                "score": score,
            })

        if llm_pick_fn:
            picked_id = llm_pick_fn(subject, candidates)
            if picked_id:
                matched = next((c for c in candidates if c["fact_id"] == picked_id), None)
                if matched:
                    return MatchResult(
                        fact_id=matched["fact_id"],
                        fact_version_id=matched["fact_version_id"],
                        score=matched["score"],
                        method="llm_pick",
                        candidates=candidates,
                    )

        return MatchResult(
            fact_id=None, fact_version_id=None,
            score=top_score, method="human", candidates=candidates
        )

    # < 0.60 → human queue
    return MatchResult(fact_id=None, fact_version_id=None,
                       score=top_score, method="human", candidates=[])

