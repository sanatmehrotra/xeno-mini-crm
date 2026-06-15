"""
Orders router — /api/v1/orders
"""

from datetime import datetime

import uuid as _uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_dep
from app.schemas.common import success
from app.schemas.order import OrderCreate, OrderImport, OrderOut
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["?? Orders"])


@router.get("")
async def list_orders(
    db: AsyncSession = Depends(get_db_dep),
    customer_id: str | None = Query(None),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
):
    cid = _uuid.UUID(customer_id) if customer_id else None
    orders = await order_service.list_orders(db, customer_id=cid, from_dt=from_, to_dt=to)
    return success([OrderOut.model_validate(o).model_dump() for o in orders])


@router.post("", status_code=201)
async def create_order(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db_dep),
):
    order = await order_service.create_order(db, payload)
    return success(OrderOut.model_validate(order).model_dump())


@router.post("/import")
async def import_orders(
    records: list[OrderImport],
    db: AsyncSession = Depends(get_db_dep),
):
    result = await order_service.import_orders(db, records)
    return success(result)
