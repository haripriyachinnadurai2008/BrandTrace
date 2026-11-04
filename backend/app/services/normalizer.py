import re
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

# Centralized Asia/Kolkata timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30), name="Asia/Kolkata")

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

DAYS_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2,
    "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
}

@dataclass
class NormalizedEntity:
    raw_text: str
    value_type: str  # 'price', 'percentage', 'date', 'number', 'text'
    normalised_str: str
    numeric_value: Optional[float] = None
    unit: Optional[str] = None
    is_approximate: bool = False
    date_value: Optional[datetime] = None
    span_start: int = 0
    span_end: int = 0

class DeterministicNormalizer:
    """
    Deterministic parsers to extract and normalize numbers, currency, dates, and percentages.
    Guarantees:
    - ₹4,999, Rs 4999/-, 4,999 rupees -> 4999 INR
    - 4.9k -> 4900 INR flagged approximate=True (never auto-matches exact fact)
    - lakh (100,000) and crore (10,000,000) Indian scales
    - Percentages (20%, 25%)
    - Dates parsed in Asia/Kolkata timezone with strict midnight boundary preservation
    - Relative dates ("ends this Friday") resolved against scheduled publish date in IST
    """

    PRICE_PATTERNS = [
        # ₹4,999 or Rs 4999/- or Rs. 4999
        re.compile(r'(?:₹|INR|Rs\.?)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:/-)?', re.IGNORECASE),
        # 4,999 rupees or 4999 INR
        re.compile(r'([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(?:/-)?\s*(?:rupees|rs\.?|inr|bucks)', re.IGNORECASE),
    ]

    PCT_PATTERNS = [
        re.compile(r'([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent(?:age)?)', re.IGNORECASE),
    ]

    @staticmethod
    def clean_number(num_str: str) -> float:
        return float(num_str.replace(',', '').strip())

    @classmethod
    def parse_currency(cls, text: str) -> Optional[NormalizedEntity]:
        """Parse currency and price notations."""
        stripped = text.strip()

        # Check approximate 4.9k, 5k, ~5k pattern first
        k_match = re.search(r'(?:approx\.?|about|around|~)?\s*(?:₹|INR|Rs\.?)?\s*([0-9]+(?:\.[0-9]+)?)\s*k\b', stripped, re.IGNORECASE)
        if k_match:
            base_num = float(k_match.group(1))
            val = round(base_num * 1000)
            return NormalizedEntity(
                raw_text=stripped,
                value_type="price",
                normalised_str=str(val),
                numeric_value=float(val),
                unit="INR",
                is_approximate=True
            )

        # Indian scale: lakh / crore
        scale_match = re.search(r'(?:₹|INR|Rs\.?)?\s*([0-9]+(?:\.[0-9]+)?)\s*(lakh|lac|crore|cr)\b', stripped, re.IGNORECASE)
        if scale_match:
            base_num = float(scale_match.group(1))
            scale_word = scale_match.group(2).lower()
            multiplier = 10_000_000 if scale_word in ("crore", "cr") else 100_000
            val = round(base_num * multiplier)
            return NormalizedEntity(
                raw_text=stripped,
                value_type="price",
                normalised_str=str(val),
                numeric_value=float(val),
                unit="INR",
                is_approximate=False
            )

        # Standard currency patterns: ₹4,999, Rs 4999/-, 4,999 rupees
        for pattern in cls.PRICE_PATTERNS:
            m = pattern.search(stripped)
            if m:
                num = cls.clean_number(m.group(1))
                norm_str = str(int(num)) if num.is_integer() else str(num)
                return NormalizedEntity(
                    raw_text=stripped,
                    value_type="price",
                    normalised_str=norm_str,
                    numeric_value=num,
                    unit="INR",
                    is_approximate=False
                )

        return None

    @classmethod
    def parse_percentage(cls, text: str) -> Optional[NormalizedEntity]:
        """Parse percentage formats (e.g. 20%, 25 percent)."""
        stripped = text.strip()
        for p in cls.PCT_PATTERNS:
            m = p.search(stripped)
            if m:
                num = float(m.group(1))
                norm_str = f"{int(num) if num.is_integer() else num}%"
                return NormalizedEntity(
                    raw_text=stripped,
                    value_type="percentage",
                    normalised_str=norm_str,
                    numeric_value=num,
                    unit="%",
                    is_approximate=False
                )
        return None

    @classmethod
    def parse_date_ist(cls, text: str, default_year: int = 2026, reference_date: Optional[datetime] = None) -> Optional[NormalizedEntity]:
        """
        Parse date string strictly in Asia/Kolkata timezone (UTC+5:30).
        Preserves midnight IST boundary (00:00:00+05:30).
        Resolves relative dates like "ends this Friday" against reference_date.
        """
        stripped = text.strip()

        # ISO format: 2026-12-01 or 2026-12-01T00:00:00
        m_iso = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2}):(\d{1,2}))?', stripped)
        if m_iso:
            y, m, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
            hh = int(m_iso.group(4)) if m_iso.group(4) else 0
            mm = int(m_iso.group(5)) if m_iso.group(5) else 0
            ss = int(m_iso.group(6)) if m_iso.group(6) else 0
            dt = datetime(y, m, d, hh, mm, ss, tzinfo=IST)
            return NormalizedEntity(
                raw_text=stripped,
                value_type="date",
                normalised_str=dt.isoformat(),
                numeric_value=dt.timestamp(),
                unit="ISO8601_IST",
                is_approximate=False,
                date_value=dt
            )

        # Day Month Year or Day Month: "1 Dec 2026", "31 Dec", "1st December"
        clean = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', stripped, flags=re.IGNORECASE)
        m_dmy = re.search(r'(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?', clean)
        if m_dmy:
            day = int(m_dmy.group(1))
            mon_key = m_dmy.group(2).lower()
            mon = MONTH_MAP.get(mon_key) or MONTH_MAP.get(mon_key[:3])
            year = int(m_dmy.group(3)) if m_dmy.group(3) else default_year
            if mon and 1 <= day <= 31:
                dt = datetime(year, mon, day, 0, 0, 0, tzinfo=IST)
                return NormalizedEntity(
                    raw_text=stripped,
                    value_type="date",
                    normalised_str=dt.isoformat(),
                    numeric_value=dt.timestamp(),
                    unit="ISO8601_IST",
                    is_approximate=False,
                    date_value=dt
                )

        # Relative weekday date: e.g. "ends this Friday", "this Sunday", "next Friday"
        m_rel = re.search(r'\b(?:ends\s+)?(?:this\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b', stripped, re.IGNORECASE)
        if m_rel:
            day_name = m_rel.group(1).lower()
            target_weekday = DAYS_MAP[day_name]
            ref_dt = reference_date or datetime(default_year, 10, 21, 0, 0, 0, tzinfo=IST)
            if ref_dt.tzinfo is None:
                ref_dt = ref_dt.replace(tzinfo=IST)
            days_ahead = (target_weekday - ref_dt.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            dt = (ref_dt + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
            return NormalizedEntity(
                raw_text=stripped,
                value_type="date",
                normalised_str=dt.isoformat(),
                numeric_value=dt.timestamp(),
                unit="ISO8601_IST",
                is_approximate=False,
                date_value=dt
            )

        return None

    @classmethod
    def normalize_any(cls, text: str, reference_date: Optional[datetime] = None) -> NormalizedEntity:
        """
        Comprehensive normalizer that checks currency, percentage, and date.
        """
        cur = cls.parse_currency(text)
        if cur:
            return cur

        pct = cls.parse_percentage(text)
        if pct:
            return pct

        dt = cls.parse_date_ist(text, reference_date=reference_date)
        if dt:
            return dt

        # Default fallback to number or plain text
        stripped = text.strip()
        try:
            num = cls.clean_number(stripped)
            norm_str = str(int(num)) if num.is_integer() else str(num)
            return NormalizedEntity(
                raw_text=stripped,
                value_type="number",
                normalised_str=norm_str,
                numeric_value=num,
                is_approximate=False
            )
        except Exception:
            return NormalizedEntity(
                raw_text=stripped,
                value_type="text",
                normalised_str=stripped.lower(),
                is_approximate=False
            )
