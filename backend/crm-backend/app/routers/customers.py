"""
Customers router — /api/v1/customers

Auth: required on all routes (applied at include_router in main.py, Phase 8).
Currently no auth dependency — it will be injected in Phase 8.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_dep
from app.schemas.common import success
from app.schemas.customer import CustomerCreate, CustomerImport, CustomerOut
from app.schemas.order import OrderOut
from app.services import customer_service, order_service

router = APIRouter(prefix="/customers", tags=["?? Customers"])


@router.get("")
async def list_customers(
    db: AsyncSession = Depends(get_db_dep),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    sort_by: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    customers, total = await customer_service.list_customers(
        db, page=page, limit=limit, search=search, sort_by=sort_by, order=order
    )
    data = [CustomerOut.model_validate(c) for c in customers]
    return success(
        [d.model_dump() for d in data],
        meta={"page": page, "per_page": limit, "total": total},
    )


@router.post("", status_code=201)
async def create_customer(
    payload: CustomerCreate,
    db: AsyncSession = Depends(get_db_dep),
):
    customer = await customer_service.create_customer(db, payload)
    return success(CustomerOut.model_validate(customer).model_dump())


@router.post("/import")
async def import_customers(
    records: list[CustomerImport],
    db: AsyncSession = Depends(get_db_dep),
):
    result = await customer_service.import_customers(db, records)
    return success(result)


@router.get("/{customer_id}")
async def get_customer(
    customer_id: str,
    db: AsyncSession = Depends(get_db_dep),
):
    import uuid as _uuid
    customer = await customer_service.get_customer(db, _uuid.UUID(customer_id))
    # Also return the customer's recent orders
    orders = await order_service.list_orders(db, customer_id=customer.id, from_dt=None, to_dt=None)
    return success({
        **CustomerOut.model_validate(customer).model_dump(),
        "recent_orders": [OrderOut.model_validate(o).model_dump() for o in orders[:10]],
    })
