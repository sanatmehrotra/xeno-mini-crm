"""
Async SQLAlchemy engine and session factory.

Usage in routers/services:
    async with get_db() as db:
        result = await db.execute(...)

Or via FastAPI dependency injection:
    async def endpoint(db: AsyncSession = Depends(get_db_dep)):
        ...
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Create async engine — echo=False in prod; can toggle via env if needed
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,       # detect stale connections before use
    pool_size=10,
    max_overflow=20,
)

# Session factory — expire_on_commit=False avoids lazy-load issues after commit
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for manual DB sessions (e.g. background tasks)."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db_dep() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields an AsyncSession and commits/rolls back on exit.
    Use as: db: AsyncSession = Depends(get_db_dep)
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
