.PHONY: seed test dev-backend dev-frontend reset

# ── Paths ─────────────────────────────────────────────────────────────────────
BACKEND_DIR := backend
PYTHON      := python

# ── Seed ──────────────────────────────────────────────────────────────────────
# make seed  → drops all tables, recreates schema, inserts demo data
seed:
	cd $(BACKEND_DIR) && $(PYTHON) -c "from seed.seed_data import seed_database; r=seed_database(); print('Seed result:', r)"

# ── Test ──────────────────────────────────────────────────────────────────────
test:
	cd $(BACKEND_DIR) && $(PYTHON) -m pytest tests/ -v --tb=short

# ── Dev servers ───────────────────────────────────────────────────────────────
dev-backend:
	cd $(BACKEND_DIR) && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && pnpm run dev

# ── Reset ─────────────────────────────────────────────────────────────────────
reset: seed
	@echo "Database reset and re-seeded."

