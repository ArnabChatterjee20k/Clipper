"""
E2E tests for Worker: enqueue job, process with mocked export/upload, assert COMPLETED.
Uses same DB as other e2e tests. Mocks VideoBuilder.export_to_bytes and upload_file.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from modules.db import read, delete
from modules.worker import Job, JobStatus, Worker


def _body(media: str, operations: list) -> dict:
    return {"media": media, "operations": operations}


@pytest.mark.e2e
async def test_worker_processes_queued_job_to_completed(
    client, db, demo_media_url, delete_jobs_by_uid
):
    """Enqueue a job via API, run worker._process_job with mocks, complete(); assert DB COMPLETED."""
    body = _body(demo_media_url, [{"op": "trim", "start_sec": 0, "end_sec": 10}])
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]

    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        job_id = row["id"]
        job = Job(
            id=job_id,
            uid=str(row["uid"]),
            input=row["input"],
            action=list(row["action"]),
            status=row["status"],
            output_version=row.get("output_version", 0),
            retries=row.get("retries", 0),
        )

        mock_builder = MagicMock()
        mock_builder.load.return_value = mock_builder
        mock_builder.export_to_bytes = AsyncMock(return_value=b"e2e_fake_output")
        mock_builder._audio_bitrate = "192k"
        mock_builder._video_format = "mp4"
        mock_builder._audio_format = "libmp3lame"

        worker = Worker(retries=2, wait_time_seconds=0, id="e2e-test")
        worker._db = db

        with (
            patch("modules.worker.VideoBuilder", return_value=mock_builder),
            patch("modules.worker.upload_file", new_callable=AsyncMock),
        ):
            await worker._process_job(job)

        rows = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(rows) >= 1
        assert rows[0]["output"] is not None
        assert "filename" in rows[0]["output"]

        await worker.complete(job_id)

        rows2 = await read(db, "jobs", {"uid": uid}, limit=5)
        assert rows2[0]["status"] == JobStatus.COMPLETED.value
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_worker_processes_gif_job_output_has_gif_extension(
    client, db, demo_media_url, delete_jobs_by_uid
):
    """GIF job: worker uses .gif extension in output filename."""
    body = _body(
        demo_media_url,
        [
            {
                "op": "gif",
                "start_time": "00:00:00",
                "duration": 2,
                "fps": 5,
                "scale": 240,
            }
        ],
    )
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]

    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        job_id = row["id"]
        job = Job(
            id=job_id,
            uid=str(row["uid"]),
            input=row["input"],
            action=list(row["action"]),
            status=row["status"],
            output_version=row.get("output_version", 0),
            retries=row.get("retries", 0),
        )

        mock_builder = MagicMock()
        mock_builder.load.return_value = mock_builder
        mock_builder.export_to_bytes = AsyncMock(return_value=b"gif_bytes")
        mock_builder._audio_bitrate = "192k"
        mock_builder._video_format = "mp4"
        mock_builder._audio_format = "libmp3lame"
        mock_builder._gif_options = True  # so worker uses .gif extension

        worker = Worker(retries=2, wait_time_seconds=0, id="e2e-gif")
        worker._db = db

        with (
            patch("modules.worker.VideoBuilder", return_value=mock_builder),
            patch("modules.worker.upload_file", new_callable=AsyncMock),
        ):
            await worker._process_job(job)

        rows = await read(db, "jobs", {"uid": uid}, limit=5)
        assert rows[0]["output"] is not None
        out = rows[0]["output"]
        if isinstance(out, str):
            out = json.loads(out)
        assert out["filename"].endswith(".gif")
    finally:
        await delete_jobs_by_uid(uid)
