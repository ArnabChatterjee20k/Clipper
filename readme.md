# Clipper

A local-first media editor API for editing images and videos via HTTP. Upload media to object storage, define edit pipelines (trim, compress, text overlays, watermarks, and more), and process them through a worker queue—all running on your own infrastructure.

---

## What is Clipper?

Clipper is an MVP media processing platform that lets you:

- **Upload** images and videos to S3-compatible storage (MinIO)
- **Edit** videos with a composable pipeline of operations (trim, compress, text overlays, karaoke, watermarks, speed changes, etc.)
- **Create workflows** — reusable multi-step pipelines you can execute on any input
- **Track jobs** via Server-Sent Events (SSE) for real-time status updates
- **Monitor** via Prometheus metrics (queue depth, processing time, job status)

Everything runs locally or in Docker. No cloud lock-in, no auth layer by design—ideal for internal tools, prototyping, and self-hosted automation.

---

## Speciality

- **Operation-based builder** — Edits are expressed as a list of `{ op, data }` objects. The `VideoBuilder` validates and chains them in a single FFmpeg pass where possible.
- **Workflow reuse** — Define a pipeline once (e.g. “trim → compress → add watermark”), then run it on any media by ID, name, or search tag.
- **PostgreSQL as queue** — Jobs live in Postgres. Workers poll for `queued` jobs, process them, and update status. No Redis or separate queue service needed.
- **Streamable output** — Outputs use Matroska for streaming where applicable; MP4 transcoding is supported via the `transcode` op.
- **Rich video ops** — Karaoke-style word-by-word subtitles, timed text sequences, background audio, watermarks, speed segments, GIF export, and more.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Clipper    │     │  Postgres   │     │   MinIO     │
│  (FastAPI)  │────▶│  (DB+Queue) │     │   (S3)      │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │            ┌──────▼──────┐
       │            │   Workers   │
       │            │  (FFmpeg)   │
       │            └─────────────┘
       │
┌──────▼──────┐     ┌─────────────┐
│  Console    │     │ Prometheus  │
│  (React)    │     │  Grafana    │
└─────────────┘     └─────────────┘
```

| Component        | Tech                     |
|-----------------|--------------------------|
| API Server      | Python, FastAPI          |
| Database & Queue| PostgreSQL               |
| Object Storage  | MinIO (S3-compatible)    |
| Processing      | FFmpeg, PIL              |
| Frontend        | React, Vite, Tailwind    |
| Observability   | Prometheus, Grafana      |

---

## Supported Operations

| Operation         | Description                                      |
|-------------------|--------------------------------------------------|
| `trim`            | Trim video by start/end seconds                  |
| `compress`        | Compress with preset (e.g. `medium`)             |
| `concat`          | Concatenate multiple videos                      |
| `extractAudio`    | Extract audio track                              |
| `text`            | Add text overlays with time ranges               |
| `textSequence`    | Multiple timed text segments                     |
| `karaoke`         | Karaoke-style word-by-word subtitles             |
| `speed`           | Variable speed segments                          |
| `watermark`       | Image watermark overlay                          |
| `audio`           | Background audio overlay                         |
| `backgroundColor` | Set background color                             |
| `transcode`       | Transcode format/codec                           |
| `gif`             | Export to GIF                                    |
| `download_from_youtube` | Download from YouTube (via yt-dlp)         |

---

## Quick Start

### Docker Compose (recommended)

```bash
cp .env.example .env.docker   # adjust if needed
docker compose up -d
```

- API: http://localhost:8002  
- Console: http://localhost:8002/app/  
- MinIO: http://localhost:9001  
- Prometheus: http://localhost:8001  

### Local development

1. Start Postgres and MinIO (e.g. via `docker compose up -d postgres minik`).
2. Copy `.env.example` to `.env` and set `CLIPPER_DB_URI`, MinIO creds, and S3 URLs.
3. Install Python deps: `uv pip install -e .` (or `pip install -e .`).
4. Run the API: `uvicorn app:app --reload`.
5. Run the console: `cd clipper-console && pnpm install && pnpm dev` — dev server proxies to the API.

---

## Dashboard

<!-- Add a screenshot of the dashboard here -->

> Add your dashboard screenshot above.

---

## Project Structure

```
clipper/
├── app.py              # FastAPI app, routes
├── consumers.py        # Worker pool, PostgreSQL polling
├── modules/
│   ├── video_processor.py   # VideoBuilder, FFmpeg ops
│   ├── worker.py            # Job queue, dequeue, process
│   ├── db.py                # Schema, CRUD
│   ├── buckets.py           # MinIO/S3 integration
│   ├── video_downloader.py  # YouTube download
│   └── metrics.py           # Prometheus metrics
├── clipper-console/    # React frontend
│   └── src/
│       ├── pages/      # Buckets, Edits, Workflows, API
│       └── components/
├── presets/            # FFmpeg presets
├── tests/
├── dockerfile
└── docker-compose.yml
```

---

## API Overview

| Resource   | Endpoints |
|-----------|-----------|
| Bucket    | `POST /bucket/upload`, `GET /bucket/`, `DELETE /bucket/files/{id}` |
| Edits     | `POST /edits`, `GET /edits`, `GET /edits/{id}`, `GET /edits/status?uid=`, `PATCH`, `POST retry/cancel` |
| Workflows | `POST /workflows`, `GET /workflows`, `POST /workflows/execute`, `GET /workflows/{id}/executions` |
| Metrics   | `GET /metrics` (Prometheus scrape) |

See the in-app **API** page for example `curl` commands.

---

## Examples

### AI code editors & programmatic video generation

Edits are plain JSON: a `media` URL plus an array of `{ op, ... }` operations. This makes Clipper ideal for AI-assisted workflows. For example:

- **Cursor, Copilot, or Claude** can generate or modify edit specs. Paste a spec into a prompt, and the AI can suggest operations, fix timings, or add new effects.
- **`launch.json`** — A full launch-video spec in the repo root. It uses `textSequence`, `karaoke`, `audio`, `backgroundColor`, `compress`, and `trim` to produce a polished product trailer. Use it as a template or feed it to an AI to tweak.
- **`scripts/generate_launch_video_json.py`** — Generates such specs from a structured director prompt. Run it, then submit the output to `POST /edits` to render.

```bash
# Generate a launch video spec
python scripts/generate_launch_video_json.py --output launch.json

# Submit to Clipper (replace media URL with your own)
curl -X POST 'http://localhost:8002/edits' \
  -H 'Content-Type: application/json' \
  -d @launch.json
```

---

## TODO

- [ ] Add connection pooling
- [ ] Add caching
- [ ] Solve MP4 streaming — MP4 can't be streamed via `pipe:1`; the full file must be available first. Options: use `+frag_keyframe+empty_moov` for live-style streaming, or prefer Matroska and transcode to MP4 when needed.
- [ ] Best frame extractor
- [ ] AI editing
- [ ] Deletion queue

---

## License

See repository for license details.
