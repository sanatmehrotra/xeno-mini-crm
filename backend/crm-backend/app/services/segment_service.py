"""
Segmentation engine — the core rules compiler and member computation.

Rules format (supports nested AND/OR):
{
  "operator": "AND",
  "conditions": [
    {"field": "total_spent", "op": "gte", "value": 5000},
    {"field": "days_since_last_purchase", "op": "gte", "value": 30},
    {
      "operator": "OR",
      "conditions": [
        {"field": "tags", "op": "contains", "value": "vip"},
        {"field": "attributes.city", "op": "in", "value": ["Delhi", "Mumbai"]}
      ]
    }
  ]
}

Supported fields: total_spent, order_count, days_since_last_purchase,
                  days_since_first_purchase, tags, attributes.<key>
Supported ops:    eq, neq, gt, gte, lt, lte, in, contains, between

Defense: fields and ops are validated against allowlists before compile
         so AI-generated or user-supplied rules can't inject arbitrary SQL.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, insert, or_, select, text
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.models.customer import Customer
from app.models.segment import Segment, SegmentMember

# ---------------------------------------------------------------------------
# Allowlists (defense against AI-generated / user-supplied rules)
# ---------------------------------------------------------------------------

ALLOWED_DIRECT_FIELDS = {
    "total_spent": Customer.total_spent,
    "order_count": Customer.order_count,
}

ALLOWED_OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "between"}


def _validate_field(field: str) -> None:
    """Raise HTTPException 422 if field is not on the allowlist."""
    if (
        field not in ALLOWED_DIRECT_FIELDS
        and field not in ("days_since_last_purchase", "days_since_first_purchase", "tags")
        and not field.startswith("attributes.")
    ):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported segment field: {field}",
        )


def _validate_op(op: str) -> None:
    if op not in ALLOWED_OPS:
        raise HTTPException(status_code=422, detail=f"Unsupported segment op: {op}")


# ---------------------------------------------------------------------------
# Condition compiler
# ---------------------------------------------------------------------------

def _compile_condition(condition: dict) -> ColumnElement:
    """
    Compile a single leaf condition dict to a SQLAlchemy filter expression.
    """
    field: str = condition["field"]
    op: str = condition["op"]
    value = condition["value"]

    _validate_field(field)
    _validate_op(op)

    # --- Direct numeric fields ---
    if field in ALLOWED_DIRECT_FIELDS:
        col = ALLOWED_DIRECT_FIELDS[field]
        return _apply_op(col, op, value)

    # --- days_since_last_purchase ---
    if field == "days_since_last_purchase":
        # EXTRACT(EPOCH FROM (now() - last_purchase_at)) / 86400
        expr = func.extract(
            "epoch",
            func.now() - Customer.last_purchase_at,
        ) / 86400
        return _apply_op(expr, op, value)

    # --- days_since_first_purchase ---
    if field == "days_since_first_purchase":
        expr = func.extract(
            "epoch",
            func.now() - Customer.first_purchase_at,
        ) / 86400
        return _apply_op(expr, op, value)

    # --- tags (TEXT[]) ---
    if field == "tags":
        if op == "contains":
            # Customer has this tag: value = "vip"
            return Customer.tags.contains(array([value]))
        if op == "in":
            # Customer has any of these tags
            conditions = [Customer.tags.contains(array([v])) for v in value]
            return or_(*conditions)
        raise HTTPException(
            status_code=422,
            detail=f"Op '{op}' is not supported for field 'tags'. Use 'contains' or 'in'.",
        )

    # --- attributes.<key> (JSONB) ---
    if field.startswith("attributes."):
        key = field[len("attributes."):]
        json_val = Customer.attributes[key].as_string()
        if op == "in":
            return json_val.in_([str(v) for v in value])
        if op == "eq":
            return json_val == str(value)
        if op == "neq":
            return json_val != str(value)
        raise HTTPException(
            status_code=422,
            detail=f"Op '{op}' is not supported for JSONB attributes. Use 'eq', 'neq', or 'in'.",
        )

    raise HTTPException(status_code=422, detail=f"Cannot compile field: {field}")


def _apply_op(col, op: str, value) -> ColumnElement:
    """Apply a numeric/comparable op to a column expression."""
    if op == "eq":
        return col == value
    if op == "neq":
        return col != value
    if op == "gt":
        return col > value
    if op == "gte":
        return col >= value
    if op == "lt":
        return col < value
    if op == "lte":
        return col <= value
    if op == "in":
        return col.in_(value)
    if op == "between":
        # value must be [low, high]
        if not (isinstance(value, list) and len(value) == 2):
            raise HTTPException(
                status_code=422,
                detail="'between' op requires value = [low, high]",
            )
        return col.between(value[0], value[1])
    raise HTTPException(status_code=422, detail=f"Cannot apply op: {op}")


# ---------------------------------------------------------------------------
# Rules compiler (recursive, handles AND/OR nesting)
# ---------------------------------------------------------------------------

def compile_rules(rules: dict) -> ColumnElement:
    """
    Recursively compile a nested rule tree to a SQLAlchemy ColumnElement.

    A node is either:
      - A group: {"operator": "AND"|"OR", "conditions": [...]}
      - A leaf:  {"field": str, "op": str, "value": ...}
    """
    if "operator" in rules:
        # Group node
        operator = rules["operator"].upper()
        if operator not in ("AND", "OR"):
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported group operator: {operator}. Use AND or OR.",
            )
        compiled = [compile_rules(c) for c in rules["conditions"]]
        return and_(*compiled) if operator == "AND" else or_(*compiled)

    # Leaf node
    return _compile_condition(rules)


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

def _base_query(filter_expr: ColumnElement):
    """Base query: active customers matching the filter."""
    return select(Customer).where(
        Customer.deleted_at.is_(None),
        filter_expr,
    )


async def preview(
    db: AsyncSession, rules: dict, sample_size: int = 10
) -> tuple[int, list[Customer]]:
    """
    Dry-run: return (total_count, sample_customers) without saving anything.
    Raises 422 if rules are invalid.
    """
    filter_expr = compile_rules(rules)
    base = _base_query(filter_expr)

    total_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(total_q)).scalar_one()

    sample_q = base.limit(sample_size)
    sample = list((await db.execute(sample_q)).scalars().all())

    return total, sample


async def create_segment(
    db: AsyncSession,
    name: str,
    rules: dict,
    description: str | None = None,
    nl_query: str | None = None,
) -> Segment:
    """
    Save a segment and immediately compute its members.
    Raises 422 if rules are invalid (compile_rules validates).
    """
    # Validate rules before saving
    compile_rules(rules)

    segment = Segment(name=name, description=description, rules=rules, nl_query=nl_query)
    db.add(segment)
    await db.flush()  # get the UUID

    await compute_members(db, segment)
    await db.refresh(segment)
    return segment


async def compute_members(db: AsyncSession, segment: Segment) -> None:
    """
    Replace all rows in segment_members for this segment with the current
    result of the compiled rules query.
    Runs in the caller's transaction — atomically replaces membership.
    """
    filter_expr = compile_rules(segment.rules)
    base = _base_query(filter_expr)

    # Get matching customer IDs
    id_q = select(Customer.id).where(
        Customer.deleted_at.is_(None),
        filter_expr,
    )
    customer_ids = list((await db.execute(id_q)).scalars().all())

    # Delete old members for this segment
    await db.execute(
        delete(SegmentMember).where(SegmentMember.segment_id == segment.id)
    )

    # Insert new members
    if customer_ids:
        await db.execute(
            insert(SegmentMember).values(
                [{"segment_id": segment.id, "customer_id": cid} for cid in customer_ids]
            )
        )

    # Update segment metadata
    segment.member_count = len(customer_ids)
    segment.last_computed_at = datetime.now(timezone.utc)
    db.add(segment)
    await db.flush()
