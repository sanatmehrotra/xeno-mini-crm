"""
Seed script — loads BrewBharat sample data into crm-backend via HTTP.

Usage (from inside the container or with the service running locally):
    python scripts/seed.py [--base-url http://localhost:8000] [--token <jwt>]

The script calls:
  POST /api/v1/customers/import  (275 customers, in batches)
  POST /api/v1/orders/import     (1200 orders, in batches)
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

SEED_DIR = Path(__file__).parent.parent / "seed_data"
CUSTOMER_BATCH = 50   # smaller batches for remote DB (Supabase latency)
ORDER_BATCH    = 50


def load_json(filename: str) -> list:
    path = SEED_DIR / filename
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description="Seed BrewBharat demo data")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument(
        "--token",
        default="",
        help="JWT bearer token (leave empty to skip auth — only if auth not yet enabled)",
    )
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"

    customers = load_json("customers.json")
    orders    = load_json("orders.json")

    # ── Customers ────────────────────────────────────────────────────────────
    print(f"Seeding {len(customers)} customers in batches of {CUSTOMER_BATCH}...")
    total_cust_created = total_cust_skipped = 0
    with httpx.Client(timeout=120.0) as client:
        for i in range(0, len(customers), CUSTOMER_BATCH):
            batch = customers[i : i + CUSTOMER_BATCH]
            resp = client.post(
                f"{base}/api/v1/customers/import",
                json=batch,
                headers=headers,
            )
            resp.raise_for_status()
            result = resp.json()
            # Support both {"created":x,"skipped":y} and {"data":{...}} shapes
            data = result.get("data", result)
            created = data.get("created", 0)
            skipped = data.get("skipped", 0)
            total_cust_created += created
            total_cust_skipped += skipped
            batch_num = i // CUSTOMER_BATCH + 1
            total_batches = (len(customers) + CUSTOMER_BATCH - 1) // CUSTOMER_BATCH
            print(f"  Customers batch {batch_num}/{total_batches}: created={created} skipped={skipped}")

    print(f"  Total customers: created={total_cust_created} skipped={total_cust_skipped}")

    # ── Orders ────────────────────────────────────────────────────────────────
    print(f"\nSeeding {len(orders)} orders in batches of {ORDER_BATCH}...")
    total_ord_created = total_ord_skipped = 0
    with httpx.Client(timeout=120.0) as client:
        for i in range(0, len(orders), ORDER_BATCH):
            batch = orders[i : i + ORDER_BATCH]
            resp = client.post(
                f"{base}/api/v1/orders/import",
                json=batch,
                headers=headers,
            )
            resp.raise_for_status()
            result = resp.json().get("data", resp.json())
            created = result.get("created", 0)
            skipped = result.get("skipped", 0)
            total_ord_created += created
            total_ord_skipped += skipped
            batch_num = i // ORDER_BATCH + 1
            total_batches = (len(orders) + ORDER_BATCH - 1) // ORDER_BATCH
            print(f"  Orders batch {batch_num}/{total_batches}: created={created} skipped={skipped}")

    print(f"\n✓ Done!")
    print(f"  Customers : created={total_cust_created}  skipped={total_cust_skipped}")
    print(f"  Orders    : created={total_ord_created}  skipped={total_ord_skipped}")


if __name__ == "__main__":
    main()
