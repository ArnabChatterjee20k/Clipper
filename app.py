import io
from typing import Union, Annotated
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import JSONResponse
from modules.buckets import load_buckets, upload_file
from modules.responses import FileResponse
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifecycle(app):
    await load_buckets()
    yield


app = FastAPI(lifespan=lifecycle)


@app.middleware("http")
async def exception_handler(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        print(str(e))
        return JSONResponse(content="Something went wrong", status_code=500)


# bucket/files
@app.post("/bucket/upload")
async def upload_file_to_bucket(file: Annotated[UploadFile, File()]):
    out_file = io.BytesIO(await file.read())
    out_file.name = file.filename
    await upload_file(out_file)
    return FileResponse(type=file.content_type, filename=file.filename)


@app.get("/bucket/")
async def list_files():
    pass


@app.get("/bucket/{id}")
async def get_file(id: str):
    pass


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}
