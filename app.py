import io
from typing import Union, Annotated
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import JSONResponse
from modules.logger import logger
from modules.buckets import load_buckets, upload_file, get_url, PRIMARY_BUCKET
from modules.db import DBSession, load_schemas, create, read, File as FileModel
from dataclasses import asdict
from modules.responses import FileResponse, FileListResponse
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifecycle(app):
    await load_buckets()
    await load_schemas()
    yield


app = FastAPI(lifespan=lifecycle)


@app.middleware("http")
async def exception_handler(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logger.error(e)
        return JSONResponse(content="Something went wrong", status_code=500)


# bucket/files
@app.post("/bucket/upload")
async def upload_file_to_bucket(file: Annotated[UploadFile, File()], db: DBSession):
    # TODO: restrict to image/videos only
    async with db.transaction():
        file_id = await create(
            db,
            "files",
            **asdict(FileModel(name=file.filename, bucketname=PRIMARY_BUCKET)),
        )
        out_file = io.BytesIO(await file.read())
        out_file.name = file.filename
        await upload_file(out_file)
    return FileResponse(type=file.content_type, filename=file.filename, file_id=file_id)


@app.get("/bucket/")
async def list_files(db: DBSession, page: int = 1, limit: int = 20):
    page = max(page, 0)
    files = await read(db, "files", {}, "AND", limit, page)
    result = [
        FileResponse(
            type=file.get("filetype", ""),
            url=get_url(file.get("name"), PRIMARY_BUCKET),
            filename=file.get("name"),
            id=file.get("id"),
        )
        for file in files
    ]
    return FileListResponse(files=result, total=len(result))


@app.get("/bucket/{id}")
async def get_file(id: str):
    pass
