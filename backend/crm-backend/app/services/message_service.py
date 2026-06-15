"""
Message personalization — renders a template string with customer variables.

Supported placeholders:
  {name}                 → customer.name
  {email}                → customer.email
  {days_inactive}        → days since last_purchase_at (int)
  {total_spent}          → customer.total_spent formatted
  {order_count}          → customer.order_count
  {city}                 → customer.attributes.get("city", "")
  {tier}                 → customer.attributes.get("tier", "")

Unknown placeholders are left as-is (str.format_map with a default-dict).
"""

from datetime import datetime, timezone
from string import Formatter


class _DefaultDict(dict):
    """Returns the key itself for any missing placeholder."""
    def __missing__(self, key: str) -> str:
        return f"{{{key}}}"


def personalize(template: str, customer) -> str:
    """
    Render template with customer-specific values.
    Unknown placeholders are preserved unchanged.
    """
    now = datetime.now(timezone.utc)
    days_inactive = (
        (now - customer.last_purchase_at).days
        if customer.last_purchase_at
        else 0
    )
    values = _DefaultDict(
        name=customer.name,
        email=customer.email,
        days_inactive=days_inactive,
        total_spent=f"₹{float(customer.total_spent):,.0f}",
        order_count=customer.order_count,
        city=customer.attributes.get("city", "") if customer.attributes else "",
        tier=customer.attributes.get("tier", "") if customer.attributes else "",
    )
    # Use Formatter to safely handle unknown keys
    return template.format_map(values)
