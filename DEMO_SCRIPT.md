# BrandTrace — Live Demo Walkthrough Script
> **Challenge**: Inkloom AI Brand Governance Challenge (Round 2)  
> **Core Principle**: THE LLM EXTRACTS, THE BACKEND VERIFIES, HUMANS DECIDE.  
> **System Stated State**: All dates are interpreted in `Asia/Kolkata` (IST) before UTC conversion.

---

## Quick Setup (1-Command Reset)
```bash
# In project root:
make seed
# Or:
python seed/run_seed.py
```
Starts backend on `http://localhost:8000` and frontend on `http://localhost:5173`.

---

## 7-Step Judging Walkthrough

### Step 1: Upload Brand Fact (F001 v1) & Truth Graph
* **Goal**: Establish the factual baseline in the Truth Graph.
* **UI Action**:
  1. Open frontend (`http://localhost:5173`).
  2. In the top bar, set role to **Admin**.
  3. Navigate to **Tab 3: Truth Graph**.
  4. Observe **F001 (`X1 Pro price`)** at **v1 (`₹4,999`)** sourced from `Price_List_Sep.pdf` (p. 2), valid from `1 Sep 2026` to `30 Nov 2026 IST`.
* **API Check**:
  ```bash
  curl -X GET "http://localhost:8000/facts/F001" -H "X-User-Role: Admin"
  ```

---

### Step 2: Seed the 5 Real-World Content Pieces
* **Goal**: Inspect diverse content pieces across multiple channels and lifecycle states.
* **UI Action**:
  1. Navigate to **Tab 1: Content Findings**.
  2. Use the dropdown to cycle through the 5 seeded pieces:
     * **LinkedIn Launch Post**: State = `approved` (not yet live).
     * **Festive Email Campaign**: State = `approved` (mentions 20% off).
     * **Instagram Poster Caption**: State = `draft` (mentions 25% off).
     * **Product Brochure PDF**: State = `live` at public URL.
     * **Q3 Launch Webinar Post**: State = `archived` on 31 Oct 2026 (prior to 1 Dec revision).

---

### Step 3: Run Verification (Detect Price Mismatch & Unsupported Superlatives)
* **Goal**: Demonstrate that the LLM extracts tokens, the backend verifies deterministically, and unbacked claims are marked `Unverified` (never auto-rejected).
* **Test Copy**:
  > *"Meet the X1 Pro, now just Rs 4,999... Guaranteed 100% satisfaction. Offer ends 31 Dec."*
* **UI Action**:
  1. Select or create the test post.
  2. Click **Run Verification**.
  3. Observe the structured findings:
     * **Price Mismatch (if F001 is on v2 ₹5,499)**: Flagged as **Critical Contradicted** (`Rs 4,999` vs `Rs 5,499`).
     * **Satisfaction Guarantee**: Flagged as **Medium Unverified** (no approved source exists; sent to human review queue; **never auto-rejected**).
     * Derived Content Status: **"Needs human review"** (approval blocked).
  4. Inspect the 3 re-verified fix recommendations:
     * *Minimal*: `"Rs 5,499"`
     * *Professional*: `"The official price is Rs 5,499 (effective 1 Dec 2026)."`
     * *Marketing*: `"Get the latest X1 Pro at just Rs 5,499!"`
* **API Check**:
  ```bash
  curl -X POST "http://localhost:8000/content/ci_phase2_exit/check" -H "X-User-Role: Creator"
  ```

---

### Step 4: Campaign Coherence Lite (Named Improvement #2)
* **Goal**: Flag cross-channel contradictions deterministically with zero LLM variance.
* **UI Action**:
  1. Navigate to **Tab 4: Campaign Coherence**.
  2. Select campaign **"Festive Launch"** (Approved offer: `20% off launch discount`).
  3. Click **Check Coherence**.
  4. **Outcome**:
     * Instantly flags **High Tier Conflict**: Email says **`20% off`**, but Instagram Poster says **`25% off`**.
     * No LLM hallucinations or scores: pure deterministic attribute matching across the campaign graph.
* **API Check**:
  ```bash
  curl -X POST "http://localhost:8000/campaigns/camp_festive_launch/check-coherence" -H "X-User-Role: Creator"
  ```

---

### Step 5: Change Fact Price & Preview Blast Radius (Named Improvement #1)
* **Goal**: Execute atomic transaction with pre-commit preview.
* **UI Action**:
  1. Set role to **Admin**.
  2. Navigate to **Tab 3: Truth Graph**.
  3. Propose Revision:
     * New Value: `₹5,499`
     * Effective Date: `2026-12-01` (Asia/Kolkata midnight IST)
     * Source: `Price_List_Dec.pdf` (Page 3)
  4. Click **Preview What This Change Will Do** before committing!
  5. Inspect the modal blast radius:
     * **2 Re-opened** (LinkedIn + Email)
     * **1 Stale** (Instagram draft)
     * **1 RED ALERT** (Live Brochure)
     * **1 Left alone** (Webinar archived before 1 Dec)
  6. Click **Commit Version & Cascade Impact**.
* **API Check**:
  ```bash
  curl -X POST "http://localhost:8000/facts/F001/versions" \
    -H "X-User-Role: Admin" \
    -H "Content-Type: application/json" \
    -d '{"value":"₹5,499","unit":"INR","valid_from":"2026-12-01T00:00:00+05:30","source_id":"src_price_list_sep","source_page":3,"reason":"Dec Festive revision"}'
  ```

---

### Step 6: Inspect Impact List & Bulk Action
* **Goal**: Verify state changes and bulk notifications.
* **UI Action**:
  1. Navigate to **Tab 2: Change Impact**.
  2. Observe the exact 5 outcomes:
     * `LinkedIn Launch Post` (Approved → **Re-review required**, approval timestamp invalidated).
     * `Festive Email Campaign` (Approved → **Re-review required**, approval timestamp invalidated).
     * `Instagram Poster Caption` (Draft → **Marked stale**, suggested fix pre-filled).
     * `Product Brochure PDF` (Live → **RED ALERT**, live asset remains untouched; never auto-edited or unpublished).
     * `Q3 Launch Webinar Post` (Archived prior to 1 Dec → **Left alone**, 0 alerts).
  3. Click **Export CSV** to download the auditable blast radius spreadsheet.
  4. Click **Request Re-review (All)** to notify content owners.

---

### Step 7: Editorial Approval Gate & Tamper-Proof Audit Trail
* **Goal**: Verify human decision gate, permission matrix, and append-only audit trigger.
* **UI Action**:
  1. Set role to **Creator**:
     * Try approving content → **HTTP 403 Forbidden** (Creators cannot approve).
  2. Set role to **Reviewer**:
     * Try approving an asset with an open Critical finding → **HTTP 422 Unprocessable Content** (Gate strictly rejects approval!).
     * Dismiss finding with reason: `"Approved exception by Marketing Director"` → Logged into **Tab 5: Precedents**.
     * Content is now unblocked and can be approved.
  3. Navigate to **Tab 6: Audit Trail**:
     * Filter by `Action: VERSION_CHANGE`, `APPROVE`, `PUBLISH_STATUS`.
     * Note the **Append-Only Immutability Badge**: Enforced at the PostgreSQL level by trigger `trg_audit_logs_block_update` and `trg_audit_logs_block_delete`.

