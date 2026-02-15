from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
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


class VideoWorkflowStep(BaseModel):
    uid: str
    media: Optional[str]
    operations: List[VideoOperationStep]


class VideoWorkflowExecutionResponse(BaseModel):
    workflows: List[VideoWorkflowStep]


class EditListResponse(BaseModel):
    edits: List[Any]
    total: int


class WorkflowResponse(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    search: Optional[str] = None
    steps: Optional[List] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WorkflowListResponse(BaseModel):
    workflows: List[WorkflowResponse]
    total: int


class WorkflowRetryResponse(BaseModel):
    uid: str
    workflow_id: int
    requeued: int
    jobs: List[Any]
