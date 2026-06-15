"""
Test configuration and fixtures.

Uses a real Postgres test DB (same image as dev, different database name).
Alembic migrations run once per session; tables are truncated between tests.

To run:
    pytest tests/ -v

Requires the Postgres service to be running (docker-compose up postgres).
"""

import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.core.database import Base
from app.main import app

# Test DB — separate database to avoid clobbering dev data
TEST_DB_URL = settings.database_url.replace("/xeno_crm", "/xeno_crm_test")

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    """Create all tables once per session using SQLAlchemy create_all."""
    import app.models  # ensure all models are registered
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(autouse=True)
async def truncate_tables():
    """Truncate all tables between tests to ensure isolation."""
    yield
    async with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    """Yield a test DB session."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncClient:
    """Yield an httpx AsyncClient wired to the test app."""
    # Override the DB dependency
    from app.core.database import get_db_dep

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db_dep] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
