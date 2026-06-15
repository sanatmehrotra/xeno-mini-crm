import json

orders_path = r'c:\Users\SANAT\Desktop\crm\xeno-mini-crm\crm-backend\seed_data\orders.json'
orders = json.load(open(orders_path, encoding='utf-8'))

clamped = 0
for o in orders:
    if o["amount"] > 4999:
        o["amount"] = 4999.0
        clamped += 1

with open(orders_path, 'w', encoding='utf-8') as f:
    json.dump(orders, f, ensure_ascii=False, indent=2)

print(f"Clamped {clamped} orders. New range: {min(x['amount'] for x in orders):.2f} - {max(x['amount'] for x in orders):.2f}")
