from pydantic import BaseModel
from typing import List
from .requests import VideoOperationStep


class FileResponse(BaseModel):
    type: str
    filename: str
    id: int
    url: str


class FileListResponse(BaseModel):
    files: List[FileResponse]
    total: int


class VideoEditResponse(BaseModel):
    id: str
    media: str
    operations: List[VideoOperationStep]


class VideoWorkflowEditResponse(BaseModel):
    workflows: List[VideoEditResponse]
