
import json
import random
from datetime import datetime, timedelta, timezone

random.seed(42)

# ── Reference date ─────────────────────────────────────────────────────────────
REF_DATE = datetime(2026, 6, 15, tzinfo=timezone.utc)
TWELVE_MONTHS_AGO = datetime(2025, 6, 15, tzinfo=timezone.utc)

# ── Catalog ────────────────────────────────────────────────────────────────────
CATALOG = [
    {"name": "Dark Roast 250g",              "price": 449},
    {"name": "Cold Brew Kit",                "price": 899},
    {"name": "Single Origin Araku",          "price": 699},
    {"name": "Espresso Blend 500g",          "price": 799},
    {"name": "Filter Coffee Subscription",   "price": 1299},
    {"name": "BrewBharat Gift Box",          "price": 1899},
    {"name": "Moka Pot Bundle",              "price": 2499},
]

CITIES = ["Mumbai", "Delhi", "Bangalore", "Chennai",
          "Hyderabad", "Pune", "Kolkata", "Ahmedabad"]

CHANNELS_ACQUISITION = ["organic", "paid_instagram", "paid_google",
                         "referral", "influencer"]

ALL_TAGS = ["vip", "repeat_buyer", "lapsed", "new", "high_value",
            "coffee_lover", "gifter", "bulk_buyer"]

# ── Indian names ───────────────────────────────────────────────────────────────
MALE_FIRST = [
    "Aarav","Arjun","Vikram","Rohan","Kabir","Aditya","Rahul","Karan","Siddharth",
    "Ravi","Manish","Deepak","Suresh","Rajesh","Ankit","Gaurav","Nikhil","Varun",
    "Amit","Sunil","Pranav","Yash","Dhruv","Ishaan","Vivek","Sachin","Harsh","Dev",
    "Akash","Neeraj","Tarun","Mohit","Shivam","Vishal","Akshay","Prateek","Kunal",
    "Puneet","Sandeep","Ritesh","Piyush","Ayush","Shubham","Abhinav","Jayesh",
    "Vignesh","Kartik","Lakshman","Tejas","Param"
]
FEMALE_FIRST = [
    "Priya","Ananya","Neha","Sneha","Kavya","Pooja","Riya","Shruti","Meera","Divya",
    "Anjali","Swati","Nandini","Isha","Aditi","Kritika","Simran","Preeti","Nisha",
    "Aishwarya","Shreya","Pallavi","Tanvi","Tanya","Sonal","Sonali","Ritika",
    "Payal","Rekha","Usha","Laxmi","Komal","Jyoti","Bharti","Manisha","Deepika",
    "Rukmini","Lavanya","Vrinda","Madhuri","Aparna","Nalini","Chitra","Hema",
    "Yamini","Sujatha","Rohini","Gayathri","Malathi","Sindhu"
]
LAST_NAMES = [
    "Sharma","Patel","Singh","Kumar","Verma","Gupta","Joshi","Nair","Reddy","Rao",
    "Mehta","Shah","Iyer","Pillai","Menon","Bhat","Naidu","Kapoor","Malhotra",
    "Agarwal","Jain","Chopra","Saxena","Srivastava","Mishra","Pandey","Tiwari",
    "Dubey","Shukla","Trivedi","Desai","Parekh","Modi","Bhatt","Oza","Kulkarni",
    "Patil","Deshpande","Joshi","Gaikwad","Chowdhury","Banerjee","Mukherjee",
    "Das","Sen","Bose","Datta","Ghosh","Roy","Chatterjee"
]

EMAIL_DOMAINS = ["gmail.com","yahoo.com","outlook.com","hotmail.com",
                 "icloud.com","protonmail.com","rediffmail.com"]

def rand_dt(start: datetime, end: datetime) -> datetime:
    delta = end - start
    secs = random.randint(0, int(delta.total_seconds()))
    return start + timedelta(seconds=secs)

def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def make_name(gender: str):
    if gender == "M":
        first = random.choice(MALE_FIRST)
    else:
        first = random.choice(FEMALE_FIRST)
    last = random.choice(LAST_NAMES)
    return first, last

def make_email(first: str, last: str, idx: int) -> str:
    variants = [
        f"{first.lower()}.{last.lower()}",
        f"{first.lower()}{last.lower()}",
        f"{first.lower()}{random.randint(10,999)}",
        f"{first.lower()}_{last.lower()}{random.randint(1,99)}",
    ]
    username = random.choice(variants)
    domain = random.choice(EMAIL_DOMAINS)
    # ensure uniqueness with suffix
    return f"{username}{idx}@{domain}"

def make_phone() -> str:
    prefix = random.choice(["6","7","8","9"])
    rest = "".join([str(random.randint(0,9)) for _ in range(9)])
    return f"+91{prefix}{rest}"

def rand_channel() -> str:
    r = random.random()
    if r < 0.70: return "online"
    if r < 0.90: return "app"
    return "offline"

def rand_items(target_amount: float):
    """Pick 1-3 items whose total ≈ target_amount (within ±20%)."""
    n_items = random.randint(1, 3)
    chosen = random.choices(CATALOG, k=n_items)
    items = []
    for item in chosen:
        qty = 1
        items.append({"name": item["name"], "price": item["price"], "quantity": qty})
    return items

def items_total(items) -> float:
    return sum(i["price"] * i["quantity"] for i in items)

# ══════════════════════════════════════════════════════════════════════════════
# Build customer segments
# ══════════════════════════════════════════════════════════════════════════════

customers = []
cust_idx = 1

def make_customer(idx, segment):
    gender = random.choice(["M", "F"])
    first, last = make_name(gender)
    email = make_email(first, last, idx)
    phone = make_phone()
    city = random.choice(CITIES)
    acq = random.choice(CHANNELS_ACQUISITION)

    # Defaults overridden per segment
    if segment == "high_active":
        order_count = random.randint(12, 30)
        total_spent = round(random.uniform(15001, 45000), 2)
        tier = random.choice(["gold", "platinum"])
        # last purchase within 30 days of REF_DATE
        last_purchase = rand_dt(REF_DATE - timedelta(days=29), REF_DATE - timedelta(days=1))
        # first purchase 18-36 months ago (before 12 month window for historical depth)
        created_at = rand_dt(REF_DATE - timedelta(days=1095), REF_DATE - timedelta(days=400))
        first_purchase = rand_dt(created_at, created_at + timedelta(days=10))
        tags = ["vip", "high_value", "repeat_buyer", "coffee_lover"]

    elif segment == "high_lapsed":
        order_count = random.randint(8, 20)
        total_spent = round(random.uniform(10001, 35000), 2)
        tier = random.choice(["silver", "gold"])
        # last purchase > 30 days ago
        last_purchase = rand_dt(TWELVE_MONTHS_AGO, REF_DATE - timedelta(days=31))
        created_at = rand_dt(REF_DATE - timedelta(days=1095), REF_DATE - timedelta(days=400))
        first_purchase = rand_dt(created_at, created_at + timedelta(days=10))
        tags = ["lapsed", "high_value", "repeat_buyer"]
        if random.random() < 0.4:
            tags.append("gifter")

    elif segment == "medium_active":
        order_count = random.randint(3, 10)
        total_spent = round(random.uniform(2000, 10000), 2)
        tier = random.choice(["bronze", "silver"])
        last_purchase = rand_dt(REF_DATE - timedelta(days=60), REF_DATE - timedelta(days=1))
        created_at = rand_dt(REF_DATE - timedelta(days=730), REF_DATE - timedelta(days=200))
        first_purchase = rand_dt(created_at, created_at + timedelta(days=15))
        tags = ["repeat_buyer", "coffee_lover"]
        if random.random() < 0.3:
            tags.append("bulk_buyer")

    elif segment == "low_onetime":
        order_count = 1
        total_spent = round(random.uniform(299, 1999), 2)
        tier = "bronze"
        last_purchase = rand_dt(TWELVE_MONTHS_AGO, REF_DATE - timedelta(days=5))
        created_at = rand_dt(TWELVE_MONTHS_AGO, last_purchase - timedelta(days=1))
        first_purchase = last_purchase
        tags = ["new"] if (REF_DATE - created_at).days < 90 else []
        if random.random() < 0.3:
            tags.append("gifter")

    elif segment == "new":
        order_count = random.randint(0, 2)
        total_spent = round(random.uniform(0, 3000), 2) if order_count > 0 else 0.0
        tier = "bronze"
        created_at = rand_dt(REF_DATE - timedelta(days=59), REF_DATE - timedelta(days=1))
        first_purchase = rand_dt(created_at, REF_DATE - timedelta(days=1)) if order_count > 0 else None
        last_purchase = first_purchase
        tags = ["new"]
        if order_count == 0:
            total_spent = 0.0
    else:
        raise ValueError(f"Unknown segment: {segment}")

    cust = {
        "external_id": f"CUST_{idx:03d}",
        "name": f"{first} {last}",
        "email": email,
        "phone": phone,
        "total_spent": total_spent,
        "order_count": order_count,
        "first_purchase_at": iso(first_purchase) if (segment != "new" or order_count > 0) else None,
        "last_purchase_at": iso(last_purchase) if (segment != "new" or order_count > 0) else None,
        "created_at": iso(created_at),
        "attributes": {
            "city": city,
            "gender": gender,
            "acquisition_channel": acq,
            "tier": tier,
        },
        "tags": list(set(tags)),
        "_segment": segment,  # internal field for order generation, removed later
        "_order_count": order_count,
    }
    return cust

# Segment sizes: 50 + 60 + 80 + 50 + 35 = 275
segments_plan = (
    [("high_active",   50)] +
    [("high_lapsed",   60)] +
    [("medium_active", 80)] +
    [("low_onetime",   50)] +
    [("new",           35)]
)

for seg_name, count in segments_plan:
    for _ in range(count):
        c = make_customer(cust_idx, seg_name)
        customers.append(c)
        cust_idx += 1

# ══════════════════════════════════════════════════════════════════════════════
# Generate orders
# ══════════════════════════════════════════════════════════════════════════════

# Build per-customer order budget
# We'll generate orders so total matches customer.total_spent
# and order_count matches customer.order_count

orders = []
ord_idx = 1

def distribute_orders_for_customer(cust, ord_start_idx):
    """Generate orders for one customer. Returns list of order dicts."""
    seg = cust["_segment"]
    n = cust["_order_count"]
    email = cust["email"]
    total_target = cust["total_spent"]

    if n == 0 or total_target == 0:
        return [], ord_start_idx

    # Determine time window for orders
    if seg == "high_active":
        # Orders spread over last 18 months, with several recent ones
        start_window = REF_DATE - timedelta(days=548)
        end_window = REF_DATE - timedelta(days=1)
    elif seg == "high_lapsed":
        # Orders up to 31 days ago
        start_window = REF_DATE - timedelta(days=548)
        end_window = REF_DATE - timedelta(days=31)
    elif seg == "medium_active":
        start_window = REF_DATE - timedelta(days=365)
        end_window = REF_DATE - timedelta(days=1)
    elif seg == "low_onetime":
        # Single order — use last_purchase date
        lp_str = cust["last_purchase_at"]
        lp = datetime.strptime(lp_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        start_window = lp - timedelta(hours=12)
        end_window = lp + timedelta(hours=12)
    elif seg == "new":
        created_str = cust["created_at"]
        created = datetime.strptime(created_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        start_window = created
        end_window = REF_DATE - timedelta(days=1)
    else:
        start_window = TWELVE_MONTHS_AGO
        end_window = REF_DATE - timedelta(days=1)

    # Clamp window to our 12-month data range for orders
    start_window = max(start_window, TWELVE_MONTHS_AGO)
    end_window = min(end_window, REF_DATE - timedelta(days=1))
    if start_window >= end_window:
        start_window = end_window - timedelta(hours=6)

    # Split total_spent into n orders
    # Ensure each order is between 299 and 4999
    order_amounts = []
    remaining = total_target
    for i in range(n):
        left = n - i
        if left == 1:
            amt = remaining
        else:
            lo = max(299.0, remaining - (left - 1) * 4999)
            hi = min(4999.0, remaining - (left - 1) * 299)
            if lo > hi:
                lo, hi = 299.0, 4999.0
            amt = random.uniform(lo, hi)
        order_amounts.append(round(amt, 2))
        remaining -= amt

    # Fix any rounding drift
    if order_amounts:
        order_amounts[-1] = round(order_amounts[-1] + (total_target - sum(order_amounts)), 2)
        order_amounts[-1] = max(299.0, min(4999.0, order_amounts[-1]))

    # Generate timestamps
    timestamps = sorted([rand_dt(start_window, end_window) for _ in range(n)])

    result_orders = []
    idx = ord_start_idx
    for amt, ts in zip(order_amounts, timestamps):
        # Pick items that roughly add up to amt
        best_items = None
        best_diff = float("inf")
        for _ in range(30):
            n_items = random.randint(1, 3)
            candidate = random.choices(CATALOG, k=n_items)
            total = sum(c["price"] for c in candidate)
            diff = abs(total - amt)
            if diff < best_diff:
                best_diff = diff
                best_items = [{"name": c["name"], "price": c["price"], "quantity": 1}
                              for c in candidate]

        o = {
            "external_id": f"ORD_{idx:04d}",
            "customer_email": email,
            "amount": round(items_total(best_items), 2),
            "items": best_items,
            "channel": rand_channel(),
            "status": "completed",
            "ordered_at": iso(ts),
        }
        result_orders.append(o)
        idx += 1

    return result_orders, idx

for cust in customers:
    cust_orders, ord_idx = distribute_orders_for_customer(cust, ord_idx)
    orders.extend(cust_orders)

# ── Pad or trim to exactly 1200 orders ────────────────────────────────────────
TARGET_ORDERS = 1200

if len(orders) < TARGET_ORDERS:
    # Add extra orders for high_active / medium_active customers
    eligible = [c for c in customers if c["_segment"] in ("high_active", "medium_active")]
    while len(orders) < TARGET_ORDERS:
        cust = random.choice(eligible)
        seg = cust["_segment"]
        if seg == "high_active":
            start_w = max(TWELVE_MONTHS_AGO, REF_DATE - timedelta(days=548))
            end_w = REF_DATE - timedelta(days=1)
        else:
            start_w = TWELVE_MONTHS_AGO
            end_w = REF_DATE - timedelta(days=1)
        ts = rand_dt(start_w, end_w)
        n_items = random.randint(1, 3)
        chosen = random.choices(CATALOG, k=n_items)
        items = [{"name": c["name"], "price": c["price"], "quantity": 1} for c in chosen]
        orders.append({
            "external_id": f"ORD_{ord_idx:04d}",
            "customer_email": cust["email"],
            "amount": round(items_total(items), 2),
            "items": items,
            "channel": rand_channel(),
            "status": "completed",
            "ordered_at": iso(ts),
        })
        ord_idx += 1

elif len(orders) > TARGET_ORDERS:
    # Trim from the end (new/low segments)
    orders = orders[:TARGET_ORDERS]

# Re-number order IDs after padding/trim
for i, o in enumerate(orders):
    o["external_id"] = f"ORD_{(i+1):04d}"

# ── Strip internal fields from customers ──────────────────────────────────────
for c in customers:
    c.pop("_segment", None)
    c.pop("_order_count", None)

# ── Write files ───────────────────────────────────────────────────────────────
import os
OUT_DIR = r"c:\Users\SANAT\Desktop\crm\xeno-mini-crm\crm-backend\seed_data"
os.makedirs(OUT_DIR, exist_ok=True)

cust_path = os.path.join(OUT_DIR, "customers.json")
ord_path  = os.path.join(OUT_DIR, "orders.json")

with open(cust_path, "w", encoding="utf-8") as f:
    json.dump(customers, f, ensure_ascii=False, indent=2)

with open(ord_path, "w", encoding="utf-8") as f:
    json.dump(orders, f, ensure_ascii=False, indent=2)

print(f"✅ customers.json written: {len(customers)} customers")
print(f"✅ orders.json written:    {len(orders)} orders")

# Sanity checks
emails_in_customers = {c["email"] for c in customers}
bad_orders = [o for o in orders if o["customer_email"] not in emails_in_customers]
print(f"   Orders with unknown customer email: {len(bad_orders)}")
print(f"   Amount range: {min(o['amount'] for o in orders):.2f} – {max(o['amount'] for o in orders):.2f}")
tier_dist = {}
for c in customers:
    t = c["attributes"]["tier"]
    tier_dist[t] = tier_dist.get(t, 0) + 1
print(f"   Tier distribution: {tier_dist}")
