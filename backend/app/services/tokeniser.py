"""
Tokeniser — replaces normalised values in text with typed tokens BEFORE the LLM call.

Rule: The LLM never sees raw Rs 4,999 / 20% / 31 Dec.
Tokens: [PRICE_N], [PCT_N], [DATE_N]
Backend reattaches real normalised values after the LLM returns token references.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from app.services.normalizer import DeterministicNormalizer, NormalizedEntity

# Patterns used for detection (looser than normalizer; normalizer does the parsing)
_PRICE_RE = re.compile(
    r'(?:(?:Rs\.?|INR|₹)\s*[0-9,]+(?:\.[0-9]+)?(?:/-)?'
    r'|[0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*(?:rupees|rs\.?|inr|/-)'
    r'|[0-9]+(?:\.[0-9]+)?[kK]\b'  # 4.9k
    r'|[0-9]+(?:\.[0-9]+)?\s*(?:lakh|lac|crore|cr)\b)',
    re.IGNORECASE
)
_PCT_RE = re.compile(r'[0-9]+(?:\.[0-9]+)?\s*(?:%|percent(?:age)?)', re.IGNORECASE)
_DATE_RE = re.compile(
    r'\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|'
    r'Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|'
    r'Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+\d{4})?'
    r'|\d{4}-\d{2}-\d{2}'
    r'|(?:ends\s+)?(?:this\s+|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b',
    re.IGNORECASE
)


@dataclass
class TokenMap:
    """Bidirectional map: token ↔ NormalizedEntity."""
    tokens: Dict[str, NormalizedEntity] = field(default_factory=dict)
    # ordered list of (span_start, span_end, token, entity) for span reattachment
    spans: List[Tuple[int, int, str, NormalizedEntity]] = field(default_factory=list)

    def add(self, token: str, entity: NormalizedEntity, start: int, end: int):
        self.tokens[token] = entity
        self.spans.append((start, end, token, entity))

    def resolve(self, token: str) -> NormalizedEntity | None:
        return self.tokens.get(token)


def tokenise(text: str, publish_date_year: int = 2026) -> Tuple[str, TokenMap]:
    """
    Replace every detected price / pct / date span in *text* with a typed token.
    Returns (masked_text, TokenMap).

    Processing order: prices first, then pcts, then dates.
    Overlapping spans are skipped (first match wins).
    """
    occupied: List[Tuple[int, int]] = []  # (start, end) of already-replaced spans
    replacements: List[Tuple[int, int, str, NormalizedEntity]] = []
    token_map = TokenMap()

    price_count = pct_count = date_count = 0

    def _overlaps(s: int, e: int) -> bool:
        return any(s < oe and e > os for os, oe in occupied)

    # ── Prices ────────────────────────────────────────────────────────────────
    for m in _PRICE_RE.finditer(text):
        s, e = m.start(), m.end()
        if _overlaps(s, e):
            continue
        entity = DeterministicNormalizer.parse_currency(m.group())
        if entity is None:
            continue
        price_count += 1
        token = f"[PRICE_{price_count}]"
        replacements.append((s, e, token, entity))
        occupied.append((s, e))

    # ── Percentages ───────────────────────────────────────────────────────────
    for m in _PCT_RE.finditer(text):
        s, e = m.start(), m.end()
        if _overlaps(s, e):
            continue
        entity = DeterministicNormalizer.parse_percentage(m.group())
        if entity is None:
            continue
        pct_count += 1
        token = f"[PCT_{pct_count}]"
        replacements.append((s, e, token, entity))
        occupied.append((s, e))

    # ── Dates ─────────────────────────────────────────────────────────────────
    for m in _DATE_RE.finditer(text):
        s, e = m.start(), m.end()
        if _overlaps(s, e):
            continue
        entity = DeterministicNormalizer.parse_date_ist(m.group(), default_year=publish_date_year)
        if entity is None:
            continue
        date_count += 1
        token = f"[DATE_{date_count}]"
        replacements.append((s, e, token, entity))
        occupied.append((s, e))

    # ── Build masked text (replace right-to-left to preserve offsets) ─────────
    replacements.sort(key=lambda x: x[0], reverse=True)
    masked = text
    for s, e, token, entity in replacements:
        # Compute original span in original text before any replacement
        token_map.add(token, entity, s, e)
        masked = masked[:s] + token + masked[e:]

    # Sort spans by original position (ascending) for display
    token_map.spans.sort(key=lambda x: x[0])

    return masked, token_map

