"""
Unit tests for Worker: dequeue, _process_job with mocked export/upload.
Requires Postgres (same as e2e). Mocks VideoBuilder.export_to_bytes and upload_file.
"""

import json
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from modules.db import create, delete, read
from modules.worker import Job, JobStatus, Worker


@pytest.fixture
async def db():
    """DB connection for worker tests. Ensures tables exist."""
    from modules.db import get_db, load_schemas

    await load_schemas()
    async for conn in get_db():
        yield conn
        break


@pytest.fixture
def worker(db):
    """Worker instance with injected db (we'll set _db in test)."""
    w = Worker(retries=2, wait_time_seconds=0, id="test")
    return w


@pytest.mark.e2e
async def test_dequeue_returns_none_when_no_jobs(worker, db):
    """Dequeue with empty queue returns None."""
    worker._db = db
    job = await worker.dequeue()
    assert job is None


@pytest.mark.e2e
async def test_dequeue_returns_job_when_queued(worker, db):
    """Dequeue picks a queued job and sets status to PROCESSING."""
    job = Job(
        uid=str(uuid4()),
        input="https://example.com/demo.mp4",
        action=[{"op": "trim", "data": {"start_sec": 0, "end_sec": 10}}],
        status=JobStatus.QUEUED.value,
    )
    job_id = await create(db, "jobs", **job.model_dump())
    assert job_id is not None
    try:
        worker._db = db
        out = await worker.dequeue()
        assert out is not None
        assert out.id == job_id
        assert out.status == JobStatus.PROCESSING.value
        rows = await read(db, "jobs", {"id": job_id}, limit=1)
        assert len(rows) == 1
        assert rows[0]["status"] == JobStatus.PROCESSING.value
    finally:
        await delete(db, "jobs", id=job_id)


@pytest.mark.e2e
async def test_process_job_sets_output_and_completes(worker, db):
    """_process_job builds builder, exports (mocked), updates job output; complete() sets COMPLETED."""
    job = Job(
        uid=str(uuid4()),
        input="https://example.com/demo.mp4",
        action=[{"op": "trim", "data": {"start_sec": 0, "end_sec": 5}}],
        status=JobStatus.QUEUED.value,
    )
    job_id = await create(db, "jobs", **job.model_dump())
    job.id = job_id
    try:
        worker._db = db

        mock_builder = MagicMock()
        mock_builder.load.return_value = mock_builder
        mock_builder.export_to_bytes = AsyncMock(return_value=b"fake_video_bytes")
        mock_builder._audio_bitrate = "192k"
        mock_builder._video_format = "mp4"
        mock_builder._audio_format = "libmp3lame"

        with (
            patch("modules.worker.VideoBuilder", return_value=mock_builder),
            patch("modules.worker.upload_file", new_callable=AsyncMock),
        ):
            await worker._process_job(job)
            mock_builder.load.assert_called()
            mock_builder.export_to_bytes.assert_awaited_once()

        rows = await read(db, "jobs", {"id": job_id}, limit=1)
        assert len(rows) == 1
        assert rows[0]["output"] is not None
        out = rows[0]["output"]
        if isinstance(out, str):
            out = json.loads(out)
        assert "filename" in out
        assert "demo_" in out["filename"] and ".mp4" in out["filename"]

        await worker.complete(job_id)
        rows2 = await read(db, "jobs", {"id": job_id}, limit=1)
        assert rows2[0]["status"] == JobStatus.COMPLETED.value
    finally:
        await delete(db, "jobs", id=job_id)


@pytest.mark.e2e
async def test_error_updates_job_status_and_retries(worker, db):
    """error() sets status to ERROR and increments retries."""
    job = Job(
        uid=str(uuid4()),
        input="https://example.com/x.mp4",
        action=[],
        status=JobStatus.PROCESSING.value,
    )
    job_id = await create(db, "jobs", **job.model_dump())
    job.id = job_id
    try:
        worker._db = db
        await worker.error(job, "Test failure")
        rows = await read(db, "jobs", {"id": job_id}, limit=1)
        assert len(rows) == 1
        assert rows[0]["status"] == JobStatus.ERROR.value
        assert rows[0]["error"] == "Test failure"
        assert rows[0]["retries"] == 1
    finally:
        await delete(db, "jobs", id=job_id)
