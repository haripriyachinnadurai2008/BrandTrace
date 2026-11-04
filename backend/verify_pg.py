"""
Quick verification that PGLite PostgreSQL is reachable and pg_trgm works.
Run from: backend/ directory.
"""
import psycopg2

print("Connecting to PGLite PostgreSQL on 127.0.0.1:5432...")
conn = psycopg2.connect(
    host="127.0.0.1",
    port=5432,
    dbname="brandtrace_db",
    user="brandtrace",
    password="brandtrace",
    connect_timeout=5
)
conn.autocommit = True
cur = conn.cursor()

# Enable pg_trgm
cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
print("pg_trgm extension: OK")

# Test similarity function
cur.execute("SELECT similarity('X1 Pro', 'X1 Pro Max');")
row = cur.fetchone()
print(f"\nSELECT similarity('X1 Pro', 'X1 Pro Max') = {row[0]}")

# Test that it's real PostgreSQL
cur.execute("SELECT version();")
ver = cur.fetchone()
print(f"\nPostgreSQL version: {ver[0]}")

cur.close()
conn.close()
print("\n[OK] PGLite PostgreSQL is reachable and pg_trgm is active.")
