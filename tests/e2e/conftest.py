"""
E2E fixtures: app client, DB connection, media URL, and cleanup.
Requires Postgres at postgresql://clipper:clipper@localhost:5432/clipper.
No bucket or file upload; we use a placeholder URL and only assert DB values.
Requires: pytest-asyncio, httpx (install with uv sync --group dev).
"""

import httpx
import pytest
from httpx import ASGITransport


# Patch lifecycle dependencies so we only need Postgres (no Minio, no worker pool)
@pytest.fixture(autouse=True)
def _patch_lifespan_deps(monkeypatch):
    async def noop(*args, **kwargs):
        pass

    async def noop_self(self, *args, **kwargs):
        pass

    monkeypatch.setattr("modules.buckets.load_buckets", noop)
    monkeypatch.setattr("consumers.ConsumerManager.start", noop_self)
    monkeypatch.setattr("consumers.ConsumerManager.stop", noop_self)


# Any URL for DB tests; we don't upload or process the file, only assert stored values.
DEMO_MEDIA_URL = "https://example.com/demo.mp4"


@pytest.fixture
def demo_media_url():
    """URL used as media in edit requests (no bucket/file required)."""
    return DEMO_MEDIA_URL


@pytest.fixture
async def db():
    """Single DB connection for assertions and cleanup (same DB as app)."""
    from modules.db import get_db

    async for conn in get_db():
        yield conn
        break


@pytest.fixture
async def client(db):
    """Async HTTP client with app lifespan (tables created, no Minio/workers)."""
    from app import app

    # Run app lifespan so load_schemas() runs
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest.fixture
async def delete_jobs_by_uid(db):
    """Fixture that returns a cleanup function to delete jobs by uid."""

    async def _delete(uid: str):
        from modules.db import delete

        await delete(db, "jobs", uid=uid)

    return _delete
