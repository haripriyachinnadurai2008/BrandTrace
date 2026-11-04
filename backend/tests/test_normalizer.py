from datetime import datetime, timezone, timedelta
from app.services.normalizer import DeterministicNormalizer, IST

def test_currency_and_number_formats():
    """Verify deterministic parsing across Indian currency formats."""
    # 1. Standard ₹ symbol
    e1 = DeterministicNormalizer.parse_currency("₹4,999")
    assert e1 is not None
    assert e1.normalised_str == "4999"
    assert e1.numeric_value == 4999.0
    assert e1.is_approximate is False
    assert e1.unit == "INR"

    # 2. Rs with /- suffix
    e2 = DeterministicNormalizer.parse_currency("Rs 4999/-")
    assert e2 is not None
    assert e2.normalised_str == "4999"
    assert e2.numeric_value == 4999.0
    assert e2.is_approximate is False

    # 3. Trailing rupees
    e3 = DeterministicNormalizer.parse_currency("4,999 rupees")
    assert e3 is not None
    assert e3.normalised_str == "4999"
    assert e3.numeric_value == 4999.0
    assert e3.is_approximate is False

    # 4. Rs. with comma
    e4 = DeterministicNormalizer.parse_currency("Rs. 5,499")
    assert e4 is not None
    assert e4.normalised_str == "5499"
    assert e4.numeric_value == 5499.0
    assert e4.is_approximate is False

def test_approximate_k_notation_never_auto_matches():
    """Verify 4.9k is normalised to 4900 and flagged approximate=True."""
    e = DeterministicNormalizer.parse_currency("4.9k")
    assert e is not None
    assert e.normalised_str == "4900"
    assert e.numeric_value == 4900.0
    assert e.is_approximate is True  # MUST be flagged approximate so it never auto-matches!

    e_about = DeterministicNormalizer.parse_currency("approx ₹5k")
    assert e_about is not None
    assert e_about.normalised_str == "5000"
    assert e_about.is_approximate is True

def test_indian_scale_lakh_and_crore():
    """Verify lakh (100k) and crore (10M) parsing."""
    e_lakh = DeterministicNormalizer.parse_currency("5 lakh")
    assert e_lakh is not None
    assert e_lakh.normalised_str == "500000"
    assert e_lakh.numeric_value == 500000.0
    assert e_lakh.is_approximate is False

    e_cr = DeterministicNormalizer.parse_currency("1.5 crore")
    assert e_cr is not None
    assert e_cr.normalised_str == "15000000"
    assert e_cr.numeric_value == 15000000.0
    assert e_cr.is_approximate is False

def test_percentages():
    """Verify percentage formats."""
    p1 = DeterministicNormalizer.parse_percentage("20%")
    assert p1 is not None
    assert p1.normalised_str == "20%"
    assert p1.numeric_value == 20.0

    p2 = DeterministicNormalizer.parse_percentage("25 percent")
    assert p2 is not None
    assert p2.normalised_str == "25%"
    assert p2.numeric_value == 25.0

def test_midnight_ist_boundary():
    """
    Verify exact midnight-IST boundary handling.
    1 Dec 2026 00:00:00 IST is exactly 2026-11-30 18:30:00 UTC.
    Tests boundary comparison with 23:59:59 IST prior day.
    """
    d1 = DeterministicNormalizer.parse_date_ist("1 Dec 2026")
    assert d1 is not None
    assert d1.date_value is not None
    assert d1.date_value.tzinfo == IST
    assert d1.date_value.year == 2026
    assert d1.date_value.month == 12
    assert d1.date_value.day == 1
    assert d1.date_value.hour == 0
    assert d1.date_value.minute == 0
    assert d1.date_value.second == 0

    # Convert to UTC and verify +05:30 offset
    utc_dt = d1.date_value.astimezone(timezone.utc)
    assert utc_dt.year == 2026
    assert utc_dt.month == 11
    assert utc_dt.day == 30
    assert utc_dt.hour == 18
    assert utc_dt.minute == 30

    # Boundary comparison: 1 second before midnight IST
    prior_sec = datetime(2026, 11, 30, 23, 59, 59, tzinfo=IST)
    midnight_ist = d1.date_value

    assert prior_sec < midnight_ist
    assert (midnight_ist - prior_sec).total_seconds() == 1.0

    # 31 Dec relative date
    d_31dec = DeterministicNormalizer.parse_date_ist("31 Dec", default_year=2026)
    assert d_31dec is not None
    assert d_31dec.date_value.day == 31
    assert d_31dec.date_value.month == 12
    assert d_31dec.date_value.tzinfo == IST
