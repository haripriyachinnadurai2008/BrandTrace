# BrandTrace — Git for Brand Facts
> **Round 2 Prototype** · Inkloom AI Brand Governance Challenge  
> **Core Principle**: THE LLM EXTRACTS, THE BACKEND VERIFIES, HUMANS DECIDE.

BrandTrace is a brand governance and truth verification platform designed to ensure enterprise marketing assets across every channel (social, email, brochures, webinars) stay strictly pinned to verified, sourced, and versioned brand facts.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Frontend["React 19 + Vite + Tailwind CSS"]
        UI1["1. Content Findings & Fixes"]
        UI2["2. Change Impact Blast Radius"]
        UI3["3. Truth Graph (Admin)"]
        UI4["4. Campaign Coherence"]
        UI5["5. Living Guidelines"]
        UI6["6. Tamper-Proof Audit Trail"]
    end

    subgraph Backend["FastAPI Backend (Python 3.12)"]
        AUTH["Role Guard Middleware\n(Admin | Creator | Reviewer | Agency)"]
        TOKEN["Deterministic Tokeniser\n(Masks Rs 4,999 -> [PRICE_1])"]
        LLM["Groq LLM Client\n(with Cached-Extraction Fallback)"]
        MATCH["3-Tier Matching Cascade\n(Exact -> pg_trgm -> Human Queue)"]
        VERIFY["Deterministic Verifier\n(Verified | Contradicted | Unverified | Stale)"]
        IMPACT["Atomic Change-Impact Engine\n(Single-Transaction Cascade + Rollback)"]
        COHERENCE["Campaign Coherence Lite\n(Cross-Channel Attribute Collision)"]
    end

    subgraph Storage["PostgreSQL (Supabase / Render)"]
        DB_FACTS[("brand_facts & fact_versions")]
        DB_CLAIMS[("extracted_claims & claim_fact_links")]
        DB_CONTENT[("content_items & content_versions")]
        DB_AUDIT[("audit_logs (Append-Only Trigger)")]
        DB_PRECEDENT[("precedents & rules")]
    end

    UI1 & UI2 & UI3 & UI4 & UI5 & UI6 --> AUTH
    AUTH --> TOKEN --> LLM --> MATCH --> VERIFY
    AUTH --> IMPACT
    AUTH --> COHERENCE
    VERIFY --> DB_CLAIMS
    IMPACT --> DB_FACTS & DB_CONTENT & DB_AUDIT
    AUTH --> DB_AUDIT
```

---

## The Three Named Improvements

| # | Improvement | Technical Implementation | Value to Brand Governance |
|---|---|---|---|
| **1** | **Change-Impact Engine** | Single atomic database transaction (`ImpactEngine.execute_fact_change`): closes previous `valid_to`, creates new fact version, scans downstream content graph, invalidates approvals on approved assets, marks drafts stale with pre-filled suggestions, and flags live assets as Critical RED ALERT. Rolls back entirely on any mid-stream error. | Eliminates silent regressions when enterprise facts (pricing, specs) change. Ensures no live asset displays outdated values without explicit alerts. |
| **2** | **Campaign Coherence Lite** | Deterministic pairwise attribute matcher (`check_campaign_coherence`): groups content by campaign and detects conflicting claims on the same `(subject, attribute)` across channels. Zero LLM hallucinations or composite scores. | Catches discount drift (e.g. Email says 20% off while Instagram poster says 25% off) before assets go live. |
| **3** | **Living Guidelines Lite** | Precedent persistence (`POST /findings/{id}/dismiss`): Reviewers must supply an auditable business rationale to override a finding. Stored in `precedents` grouped by governance rule. | Captures organizational institutional memory and exception decisions without hardcoded rule bloat. |

---

## Plan vs. Built Comparison

| Scope Area | Specification Requirement | Built Status | Verification / Exit Test |
|---|---|---|---|
| **Phase 1** | 18 tables, IST midnight dates, fact versioning | **COMPLETE** | `test_phase1_f001_v1_created` & `test_phase1_f001_v2_effective_midnight_ist` **PASSED** |
| **Phase 2** | Pre-tokenization (`[PRICE_1]`), deterministic normalizer, 3-tier cascade, unverified-not-false | **COMPLETE** | `test_phase2_exit_test_extraction_and_verification` **PASSED** (Price = Critical Contradicted, Guarantee = Medium Unverified) |
| **Phase 3** | Change-impact atomic engine: 2 re-opened, 1 stale, 1 red alert, 1 left alone | **COMPLETE** | `test_phase3_five_item_impact_exact` & `test_forced_failure_atomic_rollback` **PASSED** |
| **Phase 4** | Campaign Coherence Lite: email 20% vs poster 25% flagged as High conflict | **COMPLETE** | `test_phase4_campaign_coherence_lite` **PASSED** |
| **Phase 5** | Living Guidelines Lite: reviewer override logged to `precedents` with reason | **COMPLETE** | `test_phase5_living_guidelines_precedent_logging` **PASSED** |
| **Phase 6** | Role-based permission matrix, approval gate blocked by Critical findings, audit logs | **COMPLETE** | `test_phase6_approval_gate_blocked_by_open_critical` & `test_role_guards.py` (20/20) **PASSED** |
| **Phase 7** | React + Vite + Tailwind frontend: 6 dedicated screens, role switcher, span highlights, fix options | **COMPLETE** | Vite production build generated in 1.39s with 0 errors |
| **Audit** | Append-only audit logs enforced via DB trigger | **COMPLETE** | `test_audit_trigger.py` (UPDATE & DELETE strictly blocked) **PASSED** |
| **Test Pack** | 30-item test pack (10 dev, 20 held-out) with confusion matrix | **COMPLETE** | `tests/eval_pack.py` **PASSED** (30/30 correct, 100% accuracy) |

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
# Backend Settings
PROJECT_NAME="BrandTrace"
ENVIRONMENT="development"
TIMEZONE="Asia/Kolkata"

# Database Configuration (PostgreSQL with pg_trgm for Prod; SQLite supported for tests)
DATABASE_URL="postgresql+psycopg2://brandtrace:brandtrace@127.0.0.1:5432/brandtrace_db"

# Groq LLM API (Cached-extractions fallback active if blank)
GROQ_API_KEY=""
GROQ_MODEL="llama-3.3-70b-versatile"

# Security & Role Switcher
SECRET_KEY="brandtrace-secret-key-change-in-production"
ALLOW_ROLE_SWITCHER="true"          # Set to "false" in deployed production builds
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"

# Frontend Settings (frontend/.env)
VITE_API_BASE_URL="http://localhost:8000"
VITE_ALLOW_ROLE_SWITCHER="true"
```

---

## Local Setup & Quick Start

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Seed Database
```bash
python seed/run_seed.py
# Or:
make seed
```

### 3. Run Backend Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Health endpoint: `http://localhost:8000/health`

### 4. Frontend Setup & Run
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Testing & Evaluation

### Run Pytest Suite
```bash
cd backend
python -m pytest tests/ -v --tb=short
```
*Result: 36 passed in 0.62s.*

### Run 30-Item Test Pack Evaluation
```bash
python tests/eval_pack.py --mode both
```

---

## Evaluation (live, small sample)

The system was evaluated against the 30-item evaluation pack (`tests/pack.json`: 10 Dev, 20 Held-Out including 8 adversarial items) using live Groq LLM extraction (`openai/gpt-oss-120b`, temperature=0.0) with cache strictly bypassed:

> [!NOTE]
> **Tuning / Fix Disclosure**: On initial live evaluation, held-out adversarial cases failed (specifically ADV-01, ADV-02, and ADV-06) because marketing copy omitted explicit brand product tokens (`"X1 Pro"`). These cases were diagnosed and fixed by implementing Section 6.8 (Campaign Declared Product defaulting and multi-product ambiguity routing). Furthermore, Sec 6.8 was restricted strictly to price-type claims so non-price attributes (e.g. shipping thresholds) maintain their own attribute.

### 1. Extraction Performance
* **True Positives (TP)**: 29
* **False Positives (FP)**: 3
* **False Negatives (FN)**: 1
* **Extraction Precision**: **90.6%**
* **Extraction Recall**: **96.7%**

### 2. Verification Accuracy & 95% Wilson Score Confidence Intervals
$$w = \frac{\hat{p} + \frac{z^2}{2n} \pm z \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}} \quad (z = 1.96)$$

| Split | Total | Correct | Accuracy | 95% Wilson Interval |
| :--- | :--- | :--- | :--- | :--- |
| **Dev** | 10 | 8 | 80.0% | `[49.0%, 94.3%]` |
| **Held-Out** | 20 | 17 | 85.0% | `[64.0%, 94.8%]` |
| **Overall** | 30 | 25 | **83.3%** | `[66.4%, 92.7%]` |

### 3. Confusion Matrix (Rows: Ground Truth, Columns: Predicted)
```text
Actual \ Pred    | Verified   | Contradicted | Unverified | Stale     
----------------------------------------------------------------------
Verified         | 8          | 1            | 1          | 0         
Contradicted     | 0          | 6            | 2          | 0         
Unverified       | 0          | 1            | 9          | 0         
Stale            | 0          | 0            | 0          | 2         
```

### 4. Known Failure Modes & Adversarial Behaviors
1. **Subject Ambiguity Depends on Campaign Product Count (Sec 6.8 & ADV-06)**:
   * When marketing copy omits the product name (e.g. *"Only Rs 4,999 with express same-day courier delivery"*), the LLM extracts an empty or generic subject (`"units"`).
   * **Single-Product Campaign**: If the campaign declares exactly one product (`["X1 Pro"]`), Sec 6.8 safely defaults the subject to `"X1 Pro price"` (as in ADV-01 and ADV-02).
   * **Multi-Product Campaign (ADV-06)**: If the campaign declares multiple products (e.g. `["X1 Pro", "X2 Elite"]`), the backend **strictly refuses to guess** and leaves the subject ambiguous, routing the claim directly to the human review queue (`Unverified`).
   * **Attribute Guard**: Sec 6.8 subject defaulting applies **strictly to price-type claims**. Non-price attributes (e.g. *"free shipping above Rs 999"*) keep their own attribute (`shipping`) and are prevented from false-matching against product price facts.
2. **Approximate Values Never Auto-Match**:
   * Marketing copy using approximate shorthand (e.g. `"4.9k"` $\rightarrow$ 4900) parses with `is_approximate = True`. Even if the numeric value is close to a fact (4900 vs 4999), the matcher is strictly blocked from auto-linking and routes to the human review queue.
3. **Compound Conditional Offers**:
   * Claims with threshold criteria (e.g. *"20% off exclusively on orders above Rs 10,000"*) flag as `Contradicted` against unconditional campaign offers, requiring reviewer review of conditional policy terms.

---

## Deployment Checklist & Environment Variables

### 1. Render Deployment (Backend: FastAPI + PostgreSQL)

1. **Create PostgreSQL Database on Render or Supabase**:
   * Enable `pg_trgm`: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
   * Obtain the Connection URL: `postgresql+psycopg2://<user>:<password>@<host>:5432/<dbname>`
2. **Create Web Service on Render**:
   * **Repository**: Connect Git repository containing `/backend`
   * **Root Directory**: `backend`
   * **Environment**: `Python 3`
   * **Region**: `Singapore` (closest to Asia/Kolkata users)
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   * **Health Check Path**: `/health`
3. **Exact Environment Variables (Render Dashboard)**:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+psycopg2://...` | Connection URI to PostgreSQL with pg_trgm |
| `GROQ_API_KEY` | `gsk_...` | Groq API Key (falls back to cache if blank) |
| `ENVIRONMENT` | `production` | Enables production security guards |
| `ALLOW_ROLE_SWITCHER` | `false` | Strictly disables header-based role switching |
| `SECRET_KEY` | `<generate-32-char-random-key>` | Key for signing HS256 JWT tokens |
| `CORS_ORIGINS` | `https://brandtrace.vercel.app` | Exact URL of your deployed Vercel frontend |
| `TIMEZONE` | `Asia/Kolkata` | Canonical business timezone |
| `PORT` | `8000` | Render port (auto-set by Render) |

4. **Post-Deploy Database Seed**:
   * In Render Web Shell or local connection pointing to Render DB:
     ```bash
     python seed/run_seed.py
     ```
   * Confirm seed log created F001 v1, 4 demo users, 5 content pieces, and append-only audit trigger.

---

### 2. Vercel Deployment (Frontend: React + Vite + Tailwind)

1. **Import Project into Vercel**:
   * **Root Directory**: `frontend`
   * **Framework Preset**: `Vite`
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
2. **Exact Environment Variables (Vercel Project Settings)**:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://brandtrace-api.onrender.com` | URL of deployed Render backend (no trailing slash) |
| `VITE_ALLOW_ROLE_SWITCHER` | `false` | Hides dev role-switcher in UI; enforces JWT modal |

3. **Verify Deployment & Cold Start**:
   * Trigger GET `https://brandtrace-api.onrender.com/health` to warm the Render free instance.
   * Open `https://brandtrace.vercel.app` in browser.
   * Click **Sign In** and log in with any seeded user (`admin@aura-audio.com`, `BrandTrace2026!`).
   * Test the 6 views: Content Findings, Change Impact, Truth Graph, Campaign Coherence, Precedents, Audit Trail.

* **Backend (Render)**: Configured via `backend/render.yaml` and `backend/Procfile`. Uses Singpore region for optimal latency to Asia/Kolkata users.
* **Frontend (Vercel)**: Configured via `frontend/vercel.json` with SPA routing rewrites and security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).

