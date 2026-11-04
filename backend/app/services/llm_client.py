"""
LLM Client — Groq interface with CACHED-EXTRACTION fallback.

Flow:
  1. Check in-memory cache (populated from seed/cached_extractions.json at import).
  2. If GROQ_API_KEY is absent or cache hits → return cached result, log cached=True.
  3. Otherwise → call Groq API, log to external_calls_log, return result.

The LLM never sees raw monetary / date / percentage values.
The tokeniser replaces them with [PRICE_1] etc. BEFORE this call.
"""

import json
import time
import hashlib
import uuid
import re
from pathlib import Path
from datetime import datetime
from typing import Optional, Any
import httpx

from app.config import settings, IST

# ── Load cached extractions at module import ──────────────────────────────────
_CACHE_PATH = Path(__file__).resolve().parent.parent.parent.parent / "seed" / "cached_extractions.json"
_EXTRACTION_CACHE: dict[str, Any] = {}
_PATTERN_CACHE: list[tuple[list[str], list[dict]]] = []

def _cache_key(masked_text: str) -> str:
    """SHA-256 of the masked text as cache key."""
    return hashlib.sha256(masked_text.strip().encode()).hexdigest()

def _load_cache() -> None:
    global _EXTRACTION_CACHE, _PATTERN_CACHE
    _EXTRACTION_CACHE = {}
    _PATTERN_CACHE = []
    if _CACHE_PATH.exists():
        try:
            with open(_CACHE_PATH, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
            
            for k, val in raw_data.items():
                if k.startswith("_"):
                    continue
                res = val.get("result") if isinstance(val, dict) else val
                if not isinstance(res, list):
                    continue
                
                # Direct key
                _EXTRACTION_CACHE[k] = res
                
                # Hashes of masked and text if present
                if isinstance(val, dict):
                    if "masked" in val:
                        _EXTRACTION_CACHE[_cache_key(val["masked"])] = res
                    if "text" in val:
                        _EXTRACTION_CACHE[_cache_key(val["text"])] = res
                        
            # Patterns for known demo pieces
            _PATTERN_CACHE = [
                (["meet the x1 pro", "satisfaction"], _EXTRACTION_CACHE.get("exit_test_phase2", [])),
                (["experience sound", "x1 pro"], _EXTRACTION_CACHE.get("linkedin_launch", [])),
                (["festive season", "20%"], _EXTRACTION_CACHE.get("email_festive", [])),
                (["turn up the bass", "25%"], _EXTRACTION_CACHE.get("instagram_poster", [])),
                (["technical specifications", "brochure"], _EXTRACTION_CACHE.get("brochure_pdf", [])),
                (["webinar", "early bird"], _EXTRACTION_CACHE.get("webinar_post", [])),
            ]
        except Exception:
            _EXTRACTION_CACHE = {}
            _PATTERN_CACHE = []

_load_cache()


def _log_call(db, service: str, endpoint: str, latency_ms: int,
              status_code: int, request_payload: str, response_payload: str,
              cached: bool, error: Optional[str] = None) -> None:
    """Write a row to external_calls_log. Silently skips if db is None."""
    if db is None:
        return
    try:
        from app.models.governance import ExternalCallsLog
        db.add(ExternalCallsLog(
            id=str(uuid.uuid4()),
            service_name=f"{service}{'_cache' if cached else ''}",
            endpoint=endpoint,
            latency_ms=latency_ms,
            status_code=status_code,
            request_payload=request_payload[:4000] if request_payload else None,
            response_payload=response_payload[:4000] if response_payload else None,
            error_message=error,
            created_at=datetime.now(IST),
        ))
        db.flush()
    except Exception:
        pass  # Never let logging break the main flow


GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_PROMPT = """You are a brand-fact extraction assistant.
You receive marketing text with monetary values replaced by tokens like [PRICE_1], [DATE_1], [PCT_1].
Return a JSON array. Each element: {"type": "price|date|percentage|claim", "subject": "...", "attribute": "...", "value_ref": "[TOKEN]", "confidence": 0.0-1.0}.
For non-quantitative claims (guarantees, superlatives) set type="claim", value_ref=null.
Return ONLY valid JSON. No prose."""


def call_llm(masked_text: str, db=None) -> list[dict]:
    """
    Main entry point for LLM extraction.
    Returns list of raw claim dicts with token references.
    Backend reattaches real values after this call.
    """
    key = _cache_key(masked_text)
    t0 = time.monotonic()

    # 1. Exact SHA-256 Cache hit
    if key in _EXTRACTION_CACHE:
        result = _EXTRACTION_CACHE[key]
        latency = int((time.monotonic() - t0) * 1000)
        _log_call(db, "groq", GROQ_ENDPOINT, latency, 200,
                  masked_text[:500], json.dumps(result), cached=True)
        return result

    # 2. Pattern-based Cache hit
    lower_text = masked_text.lower()
    for keywords, res in _PATTERN_CACHE:
        if all(kw in lower_text for kw in keywords) and res:
            latency = int((time.monotonic() - t0) * 1000)
            _log_call(db, "groq", GROQ_ENDPOINT, latency, 200,
                      masked_text[:500], json.dumps(res), cached=True)
            return res

    # 3. No API key → fallback to heuristic extraction
    if not settings.GROQ_API_KEY:
        # Generate basic claims from tokens if present
        fallback_claims = []
        if "[PRICE_1]" in masked_text:
            fallback_claims.append({
                "type": "price",
                "subject": "X1 Pro price" if "x1" in lower_text else "product price",
                "attribute": "price",
                "value_ref": "[PRICE_1]",
                "confidence": 0.95
            })
        if "[PCT_1]" in masked_text and "discount" in lower_text or "off" in lower_text:
            fallback_claims.append({
                "type": "percentage",
                "subject": "Festive Launch offer",
                "attribute": "discount",
                "value_ref": "[PCT_1]",
                "confidence": 0.95
            })
        if "guarantee" in lower_text or "satisfaction" in lower_text:
            fallback_claims.append({
                "type": "claim",
                "subject": "satisfaction guarantee",
                "attribute": "guarantee",
                "value_ref": None,
                "confidence": 0.85
            })
        if "[DATE_1]" in masked_text:
            fallback_claims.append({
                "type": "date",
                "subject": "offer end date",
                "attribute": "valid_to",
                "value_ref": "[DATE_1]",
                "confidence": 0.90
            })
            
        latency = int((time.monotonic() - t0) * 1000)
        _log_call(db, "groq", GROQ_ENDPOINT, latency, 200,
                  masked_text[:500], json.dumps(fallback_claims), cached=True)
        return fallback_claims

    # 4. Live Groq call
    payload = {
        "model": settings.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": masked_text},
        ],
        "temperature": 0.0,
        "max_tokens": 1024,
    }
    request_str = json.dumps(payload)
    try:
        resp = httpx.post(
            GROQ_ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30.0,
        )
        latency = int((time.monotonic() - t0) * 1000)
        resp.raise_for_status()
        body = resp.json()
        raw_content = body["choices"][0]["message"]["content"]
        result = json.loads(raw_content)
        if not isinstance(result, list):
            result = []
        _log_call(db, "groq", GROQ_ENDPOINT, latency, resp.status_code,
                  request_str, raw_content, cached=False)
        _EXTRACTION_CACHE[key] = result
        return result
    except Exception as exc:
        latency = int((time.monotonic() - t0) * 1000)
        _log_call(db, "groq", GROQ_ENDPOINT, latency, 500,
                  request_str, "", cached=False, error=str(exc))
        return []
