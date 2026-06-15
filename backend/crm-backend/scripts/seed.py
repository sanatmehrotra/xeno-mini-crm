"""
Seed script — loads BrewBharat sample data into crm-backend via HTTP.

Usage (from inside the container or with the service running locally):
    python scripts/seed.py [--base-url http://localhost:8000] [--token <jwt>]

The script calls:
  POST /api/v1/customers/import  (all 275 customers)
  POST /api/v1/orders/import     (all 1200 orders, in batches)
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

SEED_DIR = Path(__file__).parent.parent / "seed_data"
BATCH_SIZE = 100  # orders are imported in batches to avoid large payloads


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
    orders = load_json("orders.json")

    print(f"Seeding {len(customers)} customers...")
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            f"{base}/api/v1/customers/import",
            json=customers,
            headers=headers,
        )
        resp.raise_for_status()
        result = resp.json()
        print(f"  Customers: {result}")

        print(f"Seeding {len(orders)} orders in batches of {BATCH_SIZE}...")
        total_created = total_skipped = 0
        for i in range(0, len(orders), BATCH_SIZE):
            batch = orders[i : i + BATCH_SIZE]
            resp = client.post(
                f"{base}/api/v1/orders/import",
                json=batch,
                headers=headers,
            )
            resp.raise_for_status()
            result = resp.json()["data"]
            total_created += result.get("created", 0)
            total_skipped += result.get("skipped", 0)
            print(f"  Batch {i // BATCH_SIZE + 1}: created={result.get('created')} skipped={result.get('skipped')}")

        print(f"\nDone. Orders: created={total_created}, skipped={total_skipped}")


if __name__ == "__main__":
    main()
