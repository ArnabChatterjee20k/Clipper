from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Union, Annotated
from .video_processor import (
    WatermarkOverlay,
    TextSegment,
    SpeedSegment,
    AudioOverlay,
    BackgroundColor,
    TranscodeOptions,
)


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


class TrimOp(VideoEditOperation):
    op: Literal["trim"]
    start_sec: int = 0
    end_sec: int = -1
    duration: Optional[float] = None


class WatermarkOp(VideoEditOperation):
    op: Literal["watermark"]
    overlay: WatermarkOverlay


class TextOp(VideoEditOperation):
    op: Literal["text"]
    segment: list[TextSegment]


class SpeedOp(VideoEditOperation):
    op: Literal["speed"]
    segment: list[SpeedSegment]


class AudioOp(VideoEditOperation):
    op: Literal["audio"]
    path: Optional[str] = (None,)
    mix_volume: float = (1.0,)
    loop: bool = (False,)
    overlay: Optional[AudioOverlay] = (None,)


class BackgroundColorOp(VideoEditOperation):
    op: Literal["backgroundColor"]
    overlay: BackgroundColor


class TranscodeOp(VideoEditOperation):
    op: Literal["transcode"]
    codec: str = ("libx264",)
    preset: str = ("medium",)
    crf: int = (23,)
    audio_codec: str = ("aac",)
    movflags: Optional[str] = (None,)
    options: Optional[TranscodeOptions] = None


class CompressOp(VideoEditOperation):
    op: Literal["compress"]
    target_size_mb: Optional[float] = (None,)
    scale: Optional[str] = (None,)
    preset: str = ("medium",)


class ConcatOp(VideoEditOperation):
    op: Literal["concat"]


class ExtractAudioOp(VideoEditOperation):
    op: Literal["extractAudio"]


# discriminator works only on Union and not on the list
VideoOperationStep = Annotated[
    Union[
        TrimOp,
        TextOp,
        SpeedOp,
        AudioOp,
        BackgroundColorOp,
        TranscodeOp,
        ConcatOp,
        ExtractAudioOp,
    ],
    Field(discriminator="op"),
]


class VideoEditRequest(BaseModel):
    media: str
    operations: List[VideoOperationStep]
