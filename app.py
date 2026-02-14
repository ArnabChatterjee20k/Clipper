import io, asyncio
from uuid import uuid4
from typing import Annotated
from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response
from modules.logger import logger
from modules.buckets import load_buckets, upload_file, get_url, PRIMARY_BUCKET
from modules.db import (
    DBSession,
    load_schemas,
    create,
    read,
    create_many,
    File as FileModel,
    Bucket,
)
from modules.worker import Job, JobStatus, Worker
from modules.video_processor import VideoBuilder
from dataclasses import asdict
from modules.responses import (
    FileResponse,
    FileListResponse,
    VideoEditResponse,
    VideoWorkflowEditResponse,
)
from modules.requests import VideoEditRequest, VideoWorkflowEditRequest
from modules.metrics import registry
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from consumers import ConsumerManager
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifecycle(app):
    await load_buckets()
    await load_schemas()
    consumer = ConsumerManager()
    await consumer.start()
    yield
    await consumer.stop()


app = FastAPI(lifespan=lifecycle)


# @app.middleware("http")
# async def exception_handler(request: Request, call_next):
#     try:
#         return await call_next(request)
#     except Exception as e:
#         logger.error(e)
#         return JSONResponse(content="Something went wrong", status_code=500)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.route("/metrics")
def metrics(*args):
    data = generate_latest(registry)
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


# bucket/files
@app.post("/bucket/upload")
async def upload_file_to_bucket(file: Annotated[UploadFile, File()], db: DBSession):
    # TODO: restrict to image/videos only
    async with db.transaction():
        name = file.filename or f"upload-{uuid4().hex}"
        file_id = await create(
            db,
            "files",
            **asdict(FileModel(name=name, bucketname=PRIMARY_BUCKET)),
        )
        out_file = io.BytesIO(await file.read())
        out_file.name = file.filename
        await upload_file(out_file)
    return FileResponse(
        type=file.content_type,
        filename=file.filename,
        id=file_id,
        url=get_url(file.filename, PRIMARY_BUCKET),
    )


@app.get("/bucket/")
async def list_files(db: DBSession, page: int = 1, limit: int = 20):
    # TODO: add filtering for created at and updated at and for filetype
    page = max(page, 0)
    files = await read(db, "files", {}, "AND", limit, page)
    result = [
        FileResponse(
            type=file.get("filetype", "") or "",
            url=get_url(file.get("name"), PRIMARY_BUCKET),
            filename=file.get("name"),
            id=file.get("id"),
        )
        for file in files
    ]
    return FileListResponse(files=result, total=len(result))


# TODO: add delete files from bucket, cancel edit, retry edit endpoint


@app.post("/edits")
async def edit_video(edit: VideoEditRequest, db: DBSession):
    uid = uuid4()
    builder = VideoBuilder(edit.media)
    # validating first then enqueueing
    for operation in edit.operations:
        builder = builder.load(operation.op, data=operation.get_data())
    actions = [{"op": o.op, "data": o.get_data()} for o in edit.operations]
    await Worker.enqueue(
        db,
        Job(
            uid=str(uid),
            input=edit.media,
            action=actions,
            status=JobStatus.QUEUED.value,
        ),
    )
    return VideoEditResponse(id=str(uid), operations=edit.operations, media=edit.media)


@app.get("/edits/status")
async def stream_jobs(uid: str, db: DBSession):

    async def event_stream():
        last_seen = {}

        while True:
            jobs = await read(db, "jobs", filters={"uid": uid}, limit=1)
            jobs = [Job(**job) for job in jobs]
            for job in jobs:
                jid = job.id
                version = job.updated_at

                if last_seen.get(jid) != version:
                    last_seen[jid] = version
                    yield f"event: job_update\ndata: {job.model_dump_json()}\n\n"

            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/workflows/")
async def create_workflow(db: DBSession, workflows: VideoWorkflowEditRequest):
    # TODO: add operational step for the concat videos and dag in worker to use output from first step in current step as input
    # also alter the database
    uid = uuid4()
    jobs = []
    responses = []
    for version, workflow in enumerate(workflows.workflows):
        builder = VideoBuilder(workflow.media)
        for operation in workflow.operations:
            builder = builder.load(operation.op, data=operation.get_data())
        actions = [{"op": o.op, "data": o.get_data()} for o in workflow.operations]
        jobs.append(
            Job(
                uid=str(uid),
                input=workflow.media,
                action=actions,
                status=JobStatus.QUEUED.value,
                output_version=version,
            )
        )
        responses.append(
            VideoEditResponse(
                id=str(uid),
                operations=workflow.operations,
                media=workflow.media,
            )
        )
    await Worker.enqueue(db, jobs)
    return VideoWorkflowEditResponse(workflows=responses)
