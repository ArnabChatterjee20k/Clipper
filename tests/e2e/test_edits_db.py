"""
E2E tests: POST /edits for each operation type, assert values stored in DB, then delete.
Uses a placeholder media URL (no bucket/file required). Requires Postgres.

Run: pytest tests/e2e -v -m e2e
Requires: postgresql://clipper:clipper@localhost:5432/clipper.
"""

import pytest

from modules.db import read


def _body(media: str, operations: list) -> dict:
    return {"media": media, "operations": operations}


@pytest.mark.e2e
async def test_edit_trim_stored_in_db(client, db, demo_media_url, delete_jobs_by_uid):
    body = _body(demo_media_url, [{"op": "trim", "start_sec": 0, "end_sec": 10}])
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    data = r.json()
    uid = data["id"]
    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        assert row["input"] == demo_media_url
        assert row["status"] == "queued"
        action = list(row["action"])
        assert len(action) == 1
        assert action[0]["op"] == "trim"
        assert action[0]["data"]["start_sec"] == 0
        assert action[0]["data"]["end_sec"] == 10
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_compress_stored_in_db(
    client, db, demo_media_url, delete_jobs_by_uid
):
    body = _body(
        demo_media_url, [{"op": "compress", "target_size_mb": 5.0, "preset": "fast"}]
    )
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        assert row["input"] == demo_media_url
        assert row["action"][0]["op"] == "compress"
        assert row["action"][0]["data"]["target_size_mb"] == 5.0
        assert row["action"][0]["data"]["preset"] == "fast"
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_text_stored_in_db(client, db, demo_media_url, delete_jobs_by_uid):
    body = _body(
        demo_media_url,
        [
            {
                "op": "text",
                "segment": [
                    {"start_sec": 0, "end_sec": 5, "text": "Hello"},
                    {"start_sec": 5, "end_sec": -1, "text": "World", "fontsize": 32},
                ],
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
        assert row["input"] == demo_media_url
        action = row["action"]
        assert len(action) == 1 and action[0]["op"] == "text"
        data = action[0]["data"]
        assert isinstance(data, list) and len(data) == 2
        assert (
            data[0]["text"] == "Hello"
            and data[0]["start_sec"] == 0
            and data[0]["end_sec"] == 5
        )
        assert data[1]["text"] == "World" and data[1]["fontsize"] == 32
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_speed_stored_in_db(client, db, demo_media_url, delete_jobs_by_uid):
    body = _body(
        demo_media_url,
        [{"op": "speed", "segment": [{"start_sec": 0, "end_sec": 10, "speed": 1.5}]}],
    )
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        assert row["action"][0]["op"] == "speed"
        assert row["action"][0]["data"][0]["speed"] == 1.5
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_watermark_stored_in_db(
    client, db, demo_media_url, delete_jobs_by_uid
):
    # position: WatermarkPosition value (e.g. SAFE_BOTTOM = "(W-w)/2:H-h-80")
    body = _body(
        demo_media_url,
        [
            {
                "op": "watermark",
                "overlay": {
                    "path": "/tmp/logo.png",
                    "position": "(W-w)/2:H-h-80",
                    "opacity": 0.8,
                },
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
        assert row["action"][0]["op"] == "watermark"
        d = row["action"][0]["data"]
        assert d["path"] == "/tmp/logo.png" and d["opacity"] == 0.8
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_audio_stored_in_db(client, db, demo_media_url, delete_jobs_by_uid):
    body = _body(
        demo_media_url,
        [
            {
                "op": "audio",
                "overlay": {"path": "/tmp/music.mp3", "mix_volume": 0.5, "loop": True},
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
        assert row["action"][0]["op"] == "audio"
        d = row["action"][0]["data"]
        assert (
            d["path"] == "/tmp/music.mp3"
            and d["mix_volume"] == 0.5
            and d["loop"] is True
        )
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_background_color_stored_in_db(
    client, db, demo_media_url, delete_jobs_by_uid
):
    body = _body(
        demo_media_url,
        [{"op": "backgroundColor", "overlay": {"color": "black", "only_color": False}}],
    )
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        assert row["action"][0]["op"] == "backgroundColor"
        assert row["action"][0]["data"]["color"] == "black"
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_transcode_stored_in_db(
    client, db, demo_media_url, delete_jobs_by_uid
):
    body = _body(
        demo_media_url,
        [{"op": "transcode", "codec": "libx264", "preset": "slow", "crf": 18}],
    )
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        assert row["action"][0]["op"] == "transcode"
        d = row["action"][0]["data"]
        assert d["codec"] == "libx264" and d["preset"] == "slow" and d["crf"] == 18
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_extract_audio_stored_in_db(
    client, db, demo_media_url, delete_jobs_by_uid
):
    body = _body(demo_media_url, [{"op": "extractAudio"}])
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        assert row["input"] == demo_media_url
        assert row["action"][0]["op"] == "extractAudio"
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_concat_stored_in_db(client, db, demo_media_url, delete_jobs_by_uid):
    # concat requires input_paths (at least 2)
    body = _body(
        demo_media_url,
        [
            {
                "op": "concat",
                "input_paths": [demo_media_url, "https://example.com/other.mp4"],
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
        assert row["action"][0]["op"] == "concat"
        assert row["action"][0]["data"]["input_paths"] == [
            demo_media_url,
            "https://example.com/other.mp4",
        ]
    finally:
        await delete_jobs_by_uid(uid)


@pytest.mark.e2e
async def test_edit_multi_ops_stored_in_db(
    client, db, demo_media_url, delete_jobs_by_uid
):
    body = _body(
        demo_media_url,
        [
            {"op": "trim", "start_sec": 0, "end_sec": 20},
            {
                "op": "text",
                "segment": [{"start_sec": 0, "end_sec": -1, "text": "Multi"}],
            },
            {"op": "compress", "preset": "medium"},
        ],
    )
    r = await client.post("/edits", json=body)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        jobs = await read(db, "jobs", {"uid": uid}, limit=5)
        assert len(jobs) >= 1
        row = jobs[0]
        action = row["action"]
        assert len(action) == 3
        assert action[0]["op"] == "trim" and action[0]["data"]["end_sec"] == 20
        assert action[1]["op"] == "text" and action[1]["data"][0]["text"] == "Multi"
        assert action[2]["op"] == "compress"
    finally:
        await delete_jobs_by_uid(uid)
