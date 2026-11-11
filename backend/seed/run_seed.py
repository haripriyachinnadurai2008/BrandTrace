#!/usr/bin/env python
"""
BrandTrace Seed Runner.
Executes complete database teardown, schema creation, trigger setup,
and populates the demo organization 'Aura Audio', facts, campaigns, 5 pieces, evidence sources, precedents, and initial audit trail.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from seed.seed_data import seed_database

def main():
    import argparse
    parser = argparse.ArgumentParser(description="BrandTrace database seed runner")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop and recreate tables before seeding demo data",
    )
    args = parser.parse_args()
    print("=" * 65)
    print(" BRANDTRACE DATABASE SEED RUNNER")
    print("=" * 65)
    try:
        res = seed_database(reset=args.reset)
        print("[SUCCESS] Database seeded successfully:")
        for k, v in res.items():
            print(f"  • {k}: {v}")
        print("\nAll 5 demo pieces ready for verification, coherence, and impact cascade.")
    except Exception as e:
        print(f"[ERROR] Failed to seed database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

