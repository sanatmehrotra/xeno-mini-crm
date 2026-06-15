import json

c = json.load(open(r'c:\Users\SANAT\Desktop\crm\xeno-mini-crm\crm-backend\seed_data\customers.json', encoding='utf-8'))
o = json.load(open(r'c:\Users\SANAT\Desktop\crm\xeno-mini-crm\crm-backend\seed_data\orders.json', encoding='utf-8'))

cust_emails = {x["email"] for x in c}
bad = [x for x in o if x["customer_email"] not in cust_emails]
amounts = [x["amount"] for x in o]

print(f"customers={len(c)}, orders={len(o)}")
print(f"bad_orders={len(bad)}")
print(f"amount_range={min(amounts):.2f}-{max(amounts):.2f}")
tier_dist = {}
for cust in c:
    t = cust["attributes"]["tier"]
    tier_dist[t] = tier_dist.get(t, 0) + 1
print(f"tier_dist={tier_dist}")
seg_tags = {}
for cust in c:
    for tag in cust["tags"]:
        seg_tags[tag] = seg_tags.get(tag, 0) + 1
print(f"tag_dist={seg_tags}")
