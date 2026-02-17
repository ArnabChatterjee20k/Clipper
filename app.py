import io, asyncio, json
from datetime import datetime
from uuid import uuid4, UUID
from typing import Annotated, Optional
from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
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
    update as db_update,
    delete as db_delete,
    File as FileModel,
)
from modules.worker import Job, JobStatus, Worker, WorkerPool
from modules.video_processor import VideoBuilder
from dataclasses import asdict
from modules.responses import (
    FileResponse,
    FileListResponse,
    VideoEditResponse,
    VideoWorkflowStep,
    VideoWorkflowExecutionResponse,
    EditListResponse,
    WorkflowResponse,
    WorkflowListResponse,
    WorkflowRetryResponse,
)
from modules.requests import (
    VideoEditRequest,
    VideoWorkflowCreateRequest,
    EditUpdateRequest,
    WorkflowUpdateRequest,
    WorkflowRetryRequest,
)
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
    yield {"worker_pool": consumer._pool}
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
    async with db.transaction():
        try:
            # lets try to delete from db first as if s3 upload issue then db will be automatically rolledback
            await db_delete(db, "files", id=file_id)
            await s3_delete_file(name, bucketname)
        except Exception:
            raise HTTPException(
                status_code=500, detail="Error occured while deleting the file"
            )
    return Response(status_code=204)


@app.post("/edits")
async def edit_video(edit: VideoEditRequest, db: DBSession):
    uid = uuid4()
    builder = VideoBuilder(edit.media)
    # validating first then enqueueing
    for operation in edit.operations:
        if operation == "download_from_youtube":
            pass
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


def _job_row_to_kwargs(row) -> dict:
    """Convert a DB row to kwargs for Job, parsing jsonb fields if they come back as strings."""
    d = dict(row)
    for key in ("output", "action"):
        if isinstance(d.get(key), str):
            try:
                d[key] = json.loads(d[key])
            except (ValueError, TypeError):
                pass
    return d


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
            jobs = [Job(**_job_row_to_kwargs(job)) for job in jobs]
            for job in jobs:
                jid = job.id
                version = job.updated_at

                if last_seen.get(jid) != version:
                    last_seen[jid] = version
                    yield f"event: job_update\ndata: {job.model_dump_json()}\n\n"

            await asyncio.sleep(2)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/edits")
async def list_edits(
    db: DBSession,
    uid: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    last_id: int = 0,
):
    filters = {}
    if uid is not None:
        try:
            filters["uid"] = UUID(uid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid uid")
    if status is not None:
        filters["status"] = status
    rows = await read(db, "jobs", filters, "AND", limit=limit, last_id=last_id)
    result = [Job(**_job_row_to_kwargs(r)).model_dump(mode="json") for r in rows]
    return EditListResponse(edits=result, total=len(result))


@app.get("/edits/{edit_id}")
async def get_edit(edit_id: int, db: DBSession):
    rows = await read(db, "jobs", {"id": edit_id}, "AND", limit=1, last_id=0)
    if not rows:
        raise HTTPException(status_code=404, detail="Edit not found")
    return Job(**_job_row_to_kwargs(rows[0])).model_dump(mode="json")


@app.patch("/edits/{edit_id}")
async def update_edit(edit_id: int, body: EditUpdateRequest, db: DBSession):
    row = await db.fetchrow("SELECT id FROM jobs WHERE id = $1", edit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Edit not found")
    set_values = body.model_dump(exclude_unset=True)
    if not set_values:
        row = await db.fetchrow("SELECT * FROM jobs WHERE id = $1", edit_id)
        return Job(**_job_row_to_kwargs(row)).model_dump(mode="json")
    updated = await db_update(db, "jobs", set_values, id=edit_id)
    return Job(**_job_row_to_kwargs(updated[0])).model_dump(mode="json")


@app.post("/edits/{edit_id}/retry")
async def retry_edit(edit_id: int, db: DBSession):
    row = await db.fetchrow("SELECT * FROM jobs WHERE id = $1", edit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Edit not found")
    current_status = row.get("status")
    # Allow retry for error, cancelled, and completed jobs
    if current_status not in (
        JobStatus.ERROR.value,
        JobStatus.CANCELLED.value,
        JobStatus.COMPLETED.value,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Can only retry edits with status error, cancelled, or completed, got {current_status}",
        )
    updated = await db_update(
        db,
        "jobs",
        {"status": JobStatus.QUEUED.value, "error": None, "retries": 0},
        id=edit_id,
    )
    return Job(**_job_row_to_kwargs(updated[0])).model_dump(mode="json")


@app.post("/edits/{edit_id}/cancel")
async def cancel_edit(edit_id: int, db: DBSession, request: Request):
    pool: WorkerPool = request.state.worker_pool
    row = await db.fetchrow("SELECT id FROM jobs WHERE id = $1", edit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Edit not found")
    async with db.transaction():
        updated = await db_update(
            db, "jobs", {"status": JobStatus.CANCELLED.value}, id=edit_id
        )
        await pool.cancel(edit_id)
    return Job(**_job_row_to_kwargs(updated[0])).model_dump(mode="json")


def _workflow_row_to_response(row) -> WorkflowResponse:
    return WorkflowResponse(
        id=row.get("id"),
        name=row.get("name"),
        search=row.get("search"),
        steps=row.get("steps"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


@app.get("/workflows")
async def list_workflows(
    db: DBSession,
    limit: int = 20,
    last_id: int = 0,
):
    rows = await read(db, "workflows", {}, "AND", limit=limit, last_id=last_id)
    result = [_workflow_row_to_response(r) for r in rows]
    return WorkflowListResponse(workflows=result, total=len(result))


@app.get("/workflows/executions")
async def list_all_executions(db: DBSession, limit: int = 100, last_id: int = 0):
    """Get all workflow executions with workflow names."""
    rows = await db.fetch(
        """
        SELECT we.*, w.name as workflow_name
        FROM workflow_executions we
        LEFT JOIN workflows w ON we.workflow_id = w.id
        WHERE we.id > $1
        ORDER BY we.id ASC
        LIMIT $2
        """,
        last_id,
        limit,
    )
    return {"executions": [dict(r) for r in rows], "total": len(rows)}


@app.get("/workflows/executions/{execution_id}/jobs")
async def list_execution_jobs(execution_id: int, db: DBSession):
    """List all jobs (steps) for a given workflow execution."""
    row = await db.fetchrow(
        "SELECT uid FROM workflow_executions WHERE id = $1",
        execution_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Execution not found")
    uid = row.get("uid")
    if not uid:
        raise HTTPException(status_code=404, detail="Execution has no associated jobs")

    jobs = await read(
        db,
        "jobs",
        {"uid": uid},
        "AND",
        limit=100,
        last_id=0,
    )
    job_models = [Job(**_job_row_to_kwargs(j)).model_dump(mode="json") for j in jobs]
    return {"uid": str(uid), "jobs": job_models}


@app.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: int, db: DBSession):
    rows = await read(db, "workflows", {"id": workflow_id}, "AND", limit=1, last_id=0)
    if not rows:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _workflow_row_to_response(rows[0])


@app.get("/workflows/{workflow_id}/executions")
async def list_workflow_executions(
    workflow_id: int, db: DBSession, limit: int = 50, last_id: int = 0
):
    """List executions for a specific workflow."""
    rows = await read(
        db,
        "workflow_executions",
        {"workflow_id": workflow_id},
        "AND",
        limit=limit,
        last_id=last_id,
    )
    return {"executions": [dict(r) for r in rows], "total": len(rows)}


async def list_execution_jobs(execution_id: int, db: DBSession):
    """List all jobs (steps) for a given workflow execution."""
    row = await db.fetchrow(
        "SELECT uid FROM workflow_executions WHERE id = $1",
        execution_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Execution not found")
    uid = row.get("uid")
    if not uid:
        raise HTTPException(status_code=404, detail="Execution has no associated jobs")

    jobs = await read(
        db,
        "jobs",
        {"uid": uid},
        "AND",
        limit=100,
        last_id=0,
    )
    job_models = [Job(**_job_row_to_kwargs(j)).model_dump(mode="json") for j in jobs]
    return {"uid": str(uid), "jobs": job_models}


@app.post("/workflows", response_model=VideoWorkflowCreateRequest)
async def create_workflow(db: DBSession, workflow: VideoWorkflowCreateRequest):
    for step in workflow.steps:
        builder = VideoBuilder("")
        # validation
        for operation in step:
            if operation == "download_from_youtube":
                pass
            builder = builder.load(operation.op, data=operation.get_data())

    workflow_id = await create(db, "workflows", **workflow.model_dump())
    workflow.id = workflow_id
    return workflow


@app.patch("/workflows/{workflow_id}")
async def update_workflow(workflow_id: int, body: WorkflowUpdateRequest, db: DBSession):
    row = await db.fetchrow("SELECT id FROM workflows WHERE id = $1", workflow_id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    set_values = body.model_dump(exclude_unset=True)
    if not set_values:
        row = await db.fetchrow("SELECT * FROM workflows WHERE id = $1", workflow_id)
        return _workflow_row_to_response(row)
    set_values["updated_at"] = datetime.utcnow()
    if "steps" in set_values and set_values["steps"] is not None:
        for step in set_values["steps"]:
            builder = VideoBuilder("")
            for op_dict in step:
                op = op_dict.get("op")
                data = {k: v for k, v in op_dict.items() if k != "op"}
                if op == "download_from_youtube":
                    pass
                builder = builder.load(op, data=data)
    updated = await db_update(db, "workflows", set_values, id=workflow_id)
    return _workflow_row_to_response(updated[0])


@app.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: int, db: DBSession):
    row = await db.fetchrow("SELECT id FROM workflows WHERE id = $1", workflow_id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await db_delete(db, "workflows", id=workflow_id)
    return {"id": workflow_id, "deleted": True}


@app.post("/workflows/{workflow_id}/retry")
async def retry_workflow(workflow_id: int, body: WorkflowRetryRequest, db: DBSession):
    try:
        uid_val = UUID(body.uid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid uid")
    row = await db.fetchrow("SELECT id FROM workflows WHERE id = $1", workflow_id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    rows = await db.fetch(
        """
        UPDATE jobs
        SET status = $1, error = NULL, retries = 0, updated_at = CURRENT_TIMESTAMP
        WHERE uid = $2 AND status IN ($3, $4)
        RETURNING *
        """,
        JobStatus.QUEUED.value,
        uid_val,
        JobStatus.ERROR.value,
        JobStatus.CANCELLED.value,
    )
    return WorkflowRetryResponse(
        uid=body.uid,
        workflow_id=workflow_id,
        requeued=len(rows),
        jobs=[Job(**_job_row_to_kwargs(r)).model_dump(mode="json") for r in rows],
    )


@app.post("/workflows/execute")
async def execute_workflow(
    db: DBSession,
    media: str,
    id: Optional[str] = None,
    name: Optional[str] = None,
    search: Optional[str] = None,
):
    if not any((id, name, search)):
        return HTTPException(
            403, "Any of id, name or search should be give for executing workflows"
        )
    filters = {}
    if id:
        try:
            filters["id"] = int(id)  # Convert string to int for database query
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid workflow id")
    if name:
        filters["name"] = name
    if search:
        # should be done with like operator
        filters["search"] = search

    workflow_rows = await read(db, "workflows", filters, condition="OR")
    if not workflow_rows:
        return HTTPException(404, "No workflows found")
    workflow_row = workflow_rows[0]
    workflow_id = workflow_row.get("id")
    workflow_req = VideoWorkflowCreateRequest(**workflow_row)
    uid = uuid4()

    jobs = []
    responses = []
    for version, step in enumerate(workflow_req.steps):
        actions = [{"op": o.op, "data": o.get_data()} for o in step]
        jobs.append(
            Job(
                uid=str(uid),
                input="",
                action=actions,
                status=JobStatus.QUEUED.value,
                output_version=version,
            )
        )

        responses.append(VideoWorkflowStep(uid=str(uid), operations=step, media=media))
    jobs[0].input = media
    await Worker.enqueue(db, jobs)

    # Track workflow execution (link workflow_id + uid)
    if workflow_id:
        now = datetime.utcnow()
        await create(
            db,
            "workflow_executions",
            workflow_id=workflow_id,
            uid=str(uid),
            created_at=now,
            updated_at=now,
        )

    return VideoWorkflowExecutionResponse(workflows=responses)
