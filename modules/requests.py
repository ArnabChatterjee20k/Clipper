from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Literal, Union, Annotated, Any, Self
from .video_processor import (
    WatermarkOverlay,
    TextSegment,
    SpeedSegment,
    AudioOverlay,
    BackgroundColor,
    TranscodeOptions,
)
from datetime import datetime


def _to_data_dict(obj: Any) -> Any:
    """Convert model to dict for JSON; leave dict/list as-is."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return obj


class FileResponse(BaseModel):
    type: str
    filename: str
    id: int
    url: str


class FileListResponse(BaseModel):
    files: List[FileResponse]
    total: int


class VideoEditOperation(BaseModel):
    op: str

    def get_data(self) -> Any:
        """Standardized payload for load(op, data=...). Override in subclasses if needed."""
        return self.model_dump(exclude=["op"])


class TrimOp(VideoEditOperation):
    op: Literal["trim"]
    start_sec: int = 0
    end_sec: int = -1
    duration: Optional[float] = None


class WatermarkOp(VideoEditOperation):
    op: Literal["watermark"]
    overlay: WatermarkOverlay

    def get_data(self) -> Any:
        return _to_data_dict(self.overlay)


class TextOp(VideoEditOperation):
    op: Literal["text"]
    segment: list[TextSegment]

    def get_data(self) -> Any:
        return [_to_data_dict(s) for s in self.segment]


class SpeedOp(VideoEditOperation):
    op: Literal["speed"]
    segment: list[SpeedSegment]

    def get_data(self) -> Any:
        return [_to_data_dict(s) for s in self.segment]


class AudioOp(VideoEditOperation):
    op: Literal["audio"]
    path: Optional[str] = None
    mix_volume: float = 1.0
    loop: bool = False
    overlay: Optional[AudioOverlay] = None

    def get_data(self) -> Any:
        if self.overlay is not None:
            return _to_data_dict(self.overlay)
        return self.model_dump(exclude=["op"])


class BackgroundColorOp(VideoEditOperation):
    op: Literal["backgroundColor"]
    overlay: BackgroundColor

    def get_data(self) -> Any:
        return _to_data_dict(self.overlay)


class TranscodeOp(VideoEditOperation):
    op: Literal["transcode"]
    codec: str = "libx264"
    preset: str = "medium"
    crf: int = 23
    audio_codec: str = "aac"
    movflags: Optional[str] = None
    options: Optional[TranscodeOptions] = None

    def get_data(self) -> Any:
        if self.options is not None:
            return _to_data_dict(self.options)
        return self.model_dump(exclude=["op", "options"])


class CompressOp(VideoEditOperation):
    op: Literal["compress"]
    target_size_mb: Optional[float] = None
    scale: Optional[str] = None
    preset: str = "medium"


class ConcatOp(VideoEditOperation):
    op: Literal["concat"]
    input_paths: list[str]  # at least 2 paths for concat_videos

    def get_data(self) -> Any:
        return {"input_paths": self.input_paths}


class ExtractAudioOp(VideoEditOperation):
    op: Literal["extractAudio"]

    def get_data(self) -> Any:
        return {}


class GifOp(VideoEditOperation):
    op: Literal["gif"]
    start_time: str = "00:00:00"
    duration: int = 5
    fps: int = 10
    scale: int = 480
    output_codec: str = "gif"


# discriminator works only on Union and not on the list
VideoOperationStep = Annotated[
    Union[
        TrimOp,
        TextOp,
        SpeedOp,
        WatermarkOp,
        AudioOp,
        BackgroundColorOp,
        TranscodeOp,
        CompressOp,
        ConcatOp,
        ExtractAudioOp,
        GifOp,
    ],
    Field(discriminator="op"),
]


class VideoEditRequest(BaseModel):
    media: str
    operations: List[VideoOperationStep]


class VideoWorkflowCreateRequest(BaseModel):
    name: str
    steps: List[List[VideoOperationStep]]
    search: Optional[str] = None
    id: Optional[int] = None
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()


class EditUpdateRequest(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    error: Optional[str] = None


class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    search: Optional[str] = None
    steps: Optional[List[List[dict]]] = None


class WorkflowRetryRequest(BaseModel):
    uid: str
