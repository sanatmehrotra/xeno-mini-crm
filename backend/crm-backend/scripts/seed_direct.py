"""
Direct seed script — bypasses HTTP API and inserts straight into Supabase
via asyncpg bulk INSERT. Much faster than going through FastAPI for remote DB.

Usage:
    python scripts/seed_direct.py

Reads DATABASE_URL from .env automatically.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
import uuid as _uuid
from datetime import datetime, timezone

def parse_dt(s):
    """Parse ISO8601 string to timezone-aware datetime, or return None."""
    if not s:
        return None
    # Handle trailing Z
    s = s.replace('Z', '+00:00')
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

SEED_DIR = Path(__file__).parent.parent / "seed_data"
RAW_URL  = os.environ["DATABASE_URL"]

# asyncpg needs plain postgresql:// not postgresql+asyncpg://
DSN = RAW_URL.replace("postgresql+asyncpg://", "postgresql://")
# Strip query params — pass them as kwargs instead
if "?" in DSN:
    DSN, _ = DSN.split("?", 1)


def load_json(name: str) -> list:
    with open(SEED_DIR / name, encoding="utf-8") as f:
        return json.load(f)


async def seed_customers(conn: asyncpg.Connection, customers: list) -> tuple[int, int]:
    """Bulk-upsert customers. Returns (created, skipped)."""
    created = skipped = 0
    # Use executemany for fast bulk insert; ON CONFLICT DO NOTHING = skip duplicates
    rows = [
        (
            _uuid.uuid4(),                         # id (no DB default)
            c["external_id"],
            c["name"],
            c["email"],
            c.get("phone"),
            float(c.get("total_spent", 0)),
            int(c.get("order_count", 0)),
            parse_dt(c.get("first_purchase_at")),
            parse_dt(c.get("last_purchase_at")),
            json.dumps(c.get("attributes", {})),  # jsonb
            c.get("tags", []),                     # text[] -- pass as Python list
        )
        for c in customers
    ]

    result = await conn.executemany(
        """
        INSERT INTO customers
            (id, external_id, name, email, phone,
             total_spent, order_count,
             first_purchase_at, last_purchase_at,
             attributes, tags)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
        ON CONFLICT (email) DO NOTHING
        """,
        rows,
    )
    # executemany returns a status string like "INSERT 0 N"
    # Count manually: if conflict, row not inserted
    inserted = int(result.split()[-1]) if result else 0
    created  = inserted
    skipped  = len(rows) - inserted
    return created, skipped


async def seed_orders(conn: asyncpg.Connection, orders: list, email_to_id: dict) -> tuple[int, int]:
    """Bulk-insert orders using customer_id resolved from email map."""
    created = skipped = 0
    rows = []
    for o in orders:
        cid = email_to_id.get(o.get("customer_email"))
        if not cid:
            skipped += 1
            continue
        rows.append((
            _uuid.uuid4(),
            cid,
            o["external_id"],
            float(o.get("amount", 0)),
            json.dumps(o.get("items", [])),
            o.get("channel", "online"),
            o.get("status", "completed"),
            parse_dt(o.get("ordered_at")),
        ))

    if not rows:
        return 0, skipped

    result = await conn.executemany(
        """
        INSERT INTO orders
            (id, customer_id, external_id,
             amount, items, channel, status, ordered_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
        ON CONFLICT (external_id) DO NOTHING
        """,
        rows,
    )
    inserted = int(result.split()[-1]) if result else 0
    created  = inserted
    skipped += len(rows) - inserted
    return created, skipped


async def main():
    print("Loading seed data...")
    customers = load_json("customers.json")
    orders    = load_json("orders.json")
    print(f"  {len(customers)} customers, {len(orders)} orders")

    print(f"\nConnecting to Supabase...")
    conn = await asyncpg.connect(DSN, ssl="require", timeout=30)
    print("  Connected [OK]")

    try:
        # ── Customers ─────────────────────────────────────────────────────────
        CBATCH = 100
        print(f"\nInserting customers in batches of {CBATCH}...")
        total_cc = total_cs = 0
        for i in range(0, len(customers), CBATCH):
            batch = customers[i : i + CBATCH]
            c, s  = await seed_customers(conn, batch)
            total_cc += c
            total_cs += s
            bn = i // CBATCH + 1
            tb = (len(customers) + CBATCH - 1) // CBATCH
            print(f"  Customers {bn}/{tb}: inserted={c}  skipped={s}")

        # ── Build email -> UUID map from DB ───────────────────────────────────
        print("\nFetching email->id map from DB...")
        rows_map = await conn.fetch("SELECT id, email FROM customers")
        email_to_id = {r["email"]: r["id"] for r in rows_map}
        print(f"  {len(email_to_id)} customers mapped")

        # ── Orders ────────────────────────────────────────────────────────────
        OBATCH = 100
        print(f"\nInserting orders in batches of {OBATCH}...")
        total_oc = total_os = 0
        for i in range(0, len(orders), OBATCH):
            batch = orders[i : i + OBATCH]
            c, s  = await seed_orders(conn, batch, email_to_id)
            total_oc += c
            total_os += s
            bn = i // OBATCH + 1
            tb = (len(orders) + OBATCH - 1) // OBATCH
            print(f"  Orders {bn}/{tb}: inserted={c}  skipped={s}")

    finally:
        await conn.close()

    print(f"\n[DONE] Seed complete!")
    print(f"  Customers : inserted={total_cc}  skipped={total_cs}")
    print(f"  Orders    : inserted={total_oc}  skipped={total_os}")


if __name__ == "__main__":
    asyncio.run(main())
