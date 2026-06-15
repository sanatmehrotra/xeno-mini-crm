"""
Tests for the segmentation engine (compile_rules, preview, compute_members).

Coverage required by spec:
- Each op (eq, neq, gt, gte, lt, lte, in, contains, between)
- Nested AND/OR
- Invalid field → 422
- Invalid op → 422
"""

import pytest
from fastapi import HTTPException

from app.services.segment_service import compile_rules, preview


class TestCompileRules:
    """Unit tests for compile_rules — no DB needed."""

    def test_eq(self):
        expr = compile_rules({"field": "total_spent", "op": "eq", "value": 1000})
        assert expr is not None

    def test_gte(self):
        expr = compile_rules({"field": "total_spent", "op": "gte", "value": 5000})
        assert expr is not None

    def test_lte(self):
        expr = compile_rules({"field": "order_count", "op": "lte", "value": 5})
        assert expr is not None

    def test_in_op(self):
        expr = compile_rules({"field": "total_spent", "op": "in", "value": [100, 200, 300]})
        assert expr is not None

    def test_between(self):
        expr = compile_rules({"field": "total_spent", "op": "between", "value": [1000, 5000]})
        assert expr is not None

    def test_tags_contains(self):
        expr = compile_rules({"field": "tags", "op": "contains", "value": "vip"})
        assert expr is not None

    def test_attributes_eq(self):
        expr = compile_rules({"field": "attributes.city", "op": "eq", "value": "Delhi"})
        assert expr is not None

    def test_attributes_in(self):
        expr = compile_rules(
            {"field": "attributes.city", "op": "in", "value": ["Delhi", "Mumbai"]}
        )
        assert expr is not None

    def test_days_since_last_purchase(self):
        expr = compile_rules({"field": "days_since_last_purchase", "op": "gte", "value": 30})
        assert expr is not None

    def test_nested_and_or(self):
        rules = {
            "operator": "AND",
            "conditions": [
                {"field": "total_spent", "op": "gte", "value": 5000},
                {
                    "operator": "OR",
                    "conditions": [
                        {"field": "tags", "op": "contains", "value": "vip"},
                        {"field": "attributes.city", "op": "in", "value": ["Delhi", "Mumbai"]},
                    ],
                },
            ],
        }
        expr = compile_rules(rules)
        assert expr is not None

    def test_invalid_field_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            compile_rules({"field": "not_a_real_field", "op": "eq", "value": 1})
        assert exc.value.status_code == 422

    def test_invalid_op_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            compile_rules({"field": "total_spent", "op": "like", "value": "%foo%"})
        assert exc.value.status_code == 422

    def test_invalid_group_operator_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            compile_rules({
                "operator": "XOR",
                "conditions": [{"field": "total_spent", "op": "gt", "value": 0}],
            })
        assert exc.value.status_code == 422

    def test_between_wrong_value_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            compile_rules({"field": "total_spent", "op": "between", "value": 1000})
        assert exc.value.status_code == 422


@pytest.mark.asyncio
class TestPreviewSegment:
    """Integration tests for preview() — requires DB."""

    async def test_preview_returns_count_and_sample(self, db):
        """Insert a customer and verify preview returns it."""
        from app.models.customer import Customer
        import uuid

        customer = Customer(
            id=uuid.uuid4(),
            name="Test User",
            email="test@example.com",
            total_spent=10000,
            order_count=5,
        )
        db.add(customer)
        await db.flush()

        rules = {"field": "total_spent", "op": "gte", "value": 5000}
        count, sample = await preview(db, rules)
        assert count >= 1
        assert any(c.email == "test@example.com" for c in sample)

    async def test_preview_empty_result(self, db):
        """A very high threshold returns zero results."""
        rules = {"field": "total_spent", "op": "gte", "value": 999999999}
        count, sample = await preview(db, rules)
        assert count == 0
        assert sample == []
