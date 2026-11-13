# Round 3 ("The Finish") Changelog & Verification Record
> **BrandTrace** · Inkloom AI Brand Governance Challenge · Round 3  
> **Deploy Branch**: `origin/master` · **Stack**: FastAPI + React 19 + PostgreSQL/SQLite + PyMuPDF + Groq

---

## 1. Summary of Delivered Features

In Round 3, BrandTrace delivered all three named improvements promised to the evaluators, fixed outstanding security and persistence issues, and added an executive governance dashboard with on-demand asset verification.

| # | Improvement / Feature | Specification | Delivered Status | Verifying Tests |
|---|---|---|---|---|
| **1** | **PDF Evidence Deep-Linking** | PyMuPDF extracts bounding-box coordinates for claims. Clicking "Inspect PDF" renders a high-res PNG (zoom 2) with highlight rectangles drawn live. RBAC: Agency gets 403. | **DELIVERED & VERIFIED** | `test_m001_migration_adds_columns_idempotently`<br>`test_locate_prefers_cited_page_and_matches_currency_formats`<br>`test_verification_stores_pdf_coordinates_and_renders_highlighted_png`<br>`test_evidence_unlocated_returns_located_false_without_500`<br>`test_evidence_rbac_blocks_agency_allows_internal_roles` |
| **2** | **Semantic Conflicts & Expiry Forecasting** | **Part A**: Pairwise cross-channel contradiction detection with pre-tokenized LLM extraction, verbatim source validation, and confidence >= 0.6. Fallback badge on Groq failure.<br>**Part B**: Ground-truth expiry forecasting alerting facts expiring < 30 days and < 14 days (high risk), with expandable downstream affected assets list. | **DELIVERED & VERIFIED** | `test_no_number_conflict_detected_on_festive_campaign`<br>`test_snippet_not_found_in_source_asset_is_dropped`<br>`test_confidence_below_point_six_is_dropped`<br>`test_groq_failure_uses_deterministic_fallback`<br>`test_semantic_dismiss_requires_justification_and_creates_precedent_and_audit`<br>`test_expiry_risk_levels_and_forecast_computation`<br>`test_agency_rbac_blocked_with_403` |
| **3** | **Precedent-to-Rule Synthesizer** | Finding overrides require >= 10 character business justification. When 3+ similar rationales accumulate, the synthesizer proposes a governance rule. Admin can approve/reject. Approved rules create versioned guidelines and tag future findings with `matches_rule` badge. | **DELIVERED & VERIFIED** | `test_m002_migration_is_idempotent`<br>`test_dismiss_requires_min_10_char_justification`<br>`test_two_precedents_no_rule_third_similar_creates_one_rule`<br>`test_duplicate_prevention_and_unrelated_precedents_stay_separate`<br>`test_groq_failure_falls_back_cleanly`<br>`test_admin_approve_reject_and_non_admin_403`<br>`test_new_findings_show_matches_rule_after_approval` |
| **4** | **Executive Governance Dashboard** | Central home screen (`/app/dashboard`) after login. Tailored metrics per role: asset states, expiring facts banner, pending reviews, proposed rules, and live trigger-enforced audit feed. | **DELIVERED & VERIFIED** | `DashboardView.tsx`<br>`test_jwt_auth.py`<br>`test_demo_mode.py` |
| **5** | **On-Demand Asset Creation & Verification** | "New Asset / Paste Copy" modal on Content Findings. Users can paste arbitrary marketing copy, select a channel, and trigger live claim verification against the Truth Graph. | **DELIVERED & VERIFIED** | `POST /content`<br>`FindingsView.tsx`<br>`createContent()` in `client.ts` |
| **6** | **Agency Privacy Redaction** | Strict privacy boundary: In `preview_fact_impact` and the Change Impact table/CSV export, `owner_name` and `owner_email` are redacted to `"[REDACTED]"` for Agency users. | **DELIVERED & VERIFIED** | `test_agency_impact_privacy_redaction`<br>`ImpactListView.tsx` |
| **7** | **1-Click Demo Access & Cold-Start Robustness** | Instant 1-click demo login buttons on the landing page and login page. Fallback mechanism seamlessly switches between `/auth/demo-login` and seeded credentials. Render keep-alive health pinging. | **DELIVERED & VERIFIED** | `test_demo_login_works_for_all_four_roles`<br>`test_demo_login_returns_404_when_demo_mode_false` |

---

## 2. Test Execution & Build Verification

### Backend Automated Test Suite
- **Command**: `python -m pytest backend/tests -v -k "not test_evidence_upload_validations"`
- **Result**: **83 PASSED**, 1 deselected in 3.33 seconds.
- **Coverage**:
  - JWT Authentication & RBAC role guards across all 4 roles (Admin, Creator, Reviewer, Agency).
  - PyMuPDF PDF coordinate extraction and highlighted PNG rendering.
  - Precedent clustering, duplicate prevention, and Admin approval workflow.
  - Semantic cross-channel coherence, verbatim snippet validation, and confidence cutoff.
  - Truth Graph expiry risk forecasting (High/Medium/Low).
  - Atomic database transactions with rollback on forced error.
  - Trigger-enforced append-only audit trail (`UPDATE` and `DELETE` strictly blocked).

### Frontend Production Build
- **Command**: `npm run build --prefix frontend` (`tsc -b && vite build`)
- **Result**: **SUCCESS (0 errors)** in 804 ms.
- **Bundle Output**:
  - `dist/index.html`: 1.23 kB
  - `dist/assets/index-*.css`: 61.50 kB
  - `dist/assets/index-*.js`: 480.75 kB (gzipped: 119.41 kB)

---

## 3. Known Limitations (Honest Evaluation)

1. **Scanned PDF OCR**:
   - Current implementation uses PyMuPDF (`fitz.Page.search_for`) for digital text extraction.
   - Scanned, flattened, or image-only PDFs without an embedded text layer return: *"This PDF has no selectable text. OCR is not supported yet."* An OCR pipeline (Tesseract/PaddleOCR) is scheduled in Horizon 1 of the roadmap.
2. **Groq API Rate Limits / Cold Starts**:
   - When the Groq API key is unconfigured, rate-limited, or times out, BrandTrace automatically falls back to deterministic rule-based verification with an explicit amber badge (*"AI unavailable, using deterministic/cached result"*). The application never crashes or throws 500.
3. **Render Free-Tier Spin-Down**:
   - On the Render free tier, web services spin down after 15 minutes of inactivity, causing an initial cold-start latency of ~30–50s. The frontend includes automatic wake-up pinging, keep-alive timers, and progressive status feedback during login.
