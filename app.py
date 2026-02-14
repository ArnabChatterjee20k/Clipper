import io, asyncio
from uuid import uuid4
from typing import Annotated, Optional
from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response
from modules.logger import logger
from modules.buckets import (
    load_buckets,
    upload_file,
    get_url,
    delete_file as s3_delete_file,
    PRIMARY_BUCKET,
)
from modules.db import (
    DBSession,
    load_schemas,
    create,
    read,
    delete as db_delete,
    File as FileModel,
)
from modules.worker import Job, JobStatus, Worker
from modules.video_processor import VideoBuilder
from dataclasses import asdict
from modules.responses import (
    FileResponse,
    FileListResponse,
    VideoEditResponse,
    VideoWorkflowStep,
    VideoWorkflowExecutionResponse,
)
from modules.requests import VideoEditRequest, VideoWorkflowCreateRequest
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


@app.delete("/bucket/files/{file_id}")
async def delete_file_from_bucket(file_id: int, db: DBSession):
    row = await db.fetchrow("SELECT * FROM files WHERE id = $1", file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    name = row.get("name")
    bucketname = row.get("bucketname") or PRIMARY_BUCKET
    try:
        await s3_delete_file(name, bucketname)
    except Exception:
        pass  # object may already be missing
    async with db.transaction():
        await db_delete(db, "files", id=file_id)
    return Response(status_code=204)


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
    # Ensure uid matches DB UUID type (asyncpg expects UUID for uuid columns)
    from uuid import UUID

    try:
        uid_val = UUID(uid)
    except ValueError:
        uid_val = uid

    async def event_stream():
        last_seen = {}

        while True:
            jobs = await read(db, "jobs", filters={"uid": uid_val}, limit=1)
            jobs = [Job(**job) for job in jobs]
            for job in jobs:
                jid = job.id
                version = job.updated_at

                if last_seen.get(jid) != version:
                    last_seen[jid] = version
                    yield f"event: job_update\ndata: {job.model_dump_json()}\n\n"

            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/workflows", response_model=VideoWorkflowCreateRequest)
async def create_workflow(db: DBSession, workflow: VideoWorkflowCreateRequest):
    for step in workflow.steps:
        builder = VideoBuilder("")
        # validation
        for operation in step:
            builder = builder.load(operation.op, data=operation.get_data())

    workflow_id = await create(db, "workflows", **workflow.model_dump())
    workflow.id = workflow_id
    return workflow


@app.post("/workflows/execute")
async def execute_workflow(
    db: DBSession,
    media: str,
    id: Optional[str] = None,
    name: Optional[str] = None,
    search: Optional[str] = None,
):
    # TODO: add operational step for the concat videos and dag in worker to use output from first step in current step as input
    # also alter the database
    # the workflow will be coming from the database
    if not any((id, name, search)):
        return HTTPException(
            403, "Any of id, name or search should be give for executing workflows"
        )
    filters = {}
    if id:
        filters['id'] = id
    if name:
        filters["name"] = name
    if search:
        # should be done with like operator
        filters['search'] = search

    workflow = await read(db, "workflows", filters)
    if not workflow:
        return HTTPException(404, "No workflows found")
    workflow = workflow[0]
    workflow = VideoWorkflowCreateRequest(**workflow)
    uid = uuid4()
    jobs = []
    responses = []
    for version, workflow in enumerate(workflow.steps):
        actions = [{"op": o.op, "data": o.get_data()} for o in workflow]
        jobs.append(
            Job(
                uid=str(uid),
                input="",
                action=actions,
                status=JobStatus.QUEUED.value,
                output_version=version,
            )
        )

        responses.append(
            VideoWorkflowStep(uid=str(uid), operations=workflow, media=media)
        )
    jobs[0].input = media
    await Worker.enqueue(db, jobs)
    return VideoWorkflowExecutionResponse(workflows=responses)
