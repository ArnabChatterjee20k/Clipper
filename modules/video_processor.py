import json, subprocess, re
import asyncio
from datetime import datetime
from typing import Optional, Protocol
from dataclasses import dataclass
from .logger import logger
from datetime import datetime

ffprobe = "ffprobe"
ffmpeg = "ffmpeg"


@dataclass
class ExecutionResult:
    processing_time: int
    start_time: str
    end_time: str
    error: Optional[str] = None


@dataclass
class VideoInfo:
    duration: Optional[float] = None
    size: Optional[int] = None
    bitrate: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    codec: Optional[str] = None
    fps: Optional[str] = None
    error: Optional[str] = None


class ProgressCallaback(Protocol):
    def __call__(self, progress: int) -> None: ...


class OnCompleteCallback(Protocol):
    def __call__(self, result: ExecutionResult) -> None: ...


def get_progress(total_duration: int, line: str, progress_callback: ProgressCallaback):
    match = re.search(r"out_time_ms=(\d+)", line)
    if match:
        current_ms = int(match.group(1))
        current_sec = current_ms / 1_000_000
        progress = (
            min(100, (current_sec / total_duration) * 100) if total_duration > 0 else 0
        )
        progress_callback(progress)


async def execute(
    cmd: list[str],
    input: str,
    chunk_size: int = 8192,
    complete_callaback: Optional[OnCompleteCallback] = None,
    progress_callback: Optional[ProgressCallaback] = None,
):
    start_time = datetime.now()
    video_info = await asyncio.to_thread(lambda: get_video_info(input))
    total_duration = video_info.duration

    process = await asyncio.subprocess.create_subprocess_exec(
        *cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    std_error = []

    async def read_stderr():
        while True:
            line = await process.stderr.readline()
            if not line:
                break
            line = line.decode(errors="replace").rstrip()
            std_error.append(line)
            if progress_callback:
                get_progress(total_duration, line, progress_callback)

    std_error_task = asyncio.create_task(read_stderr())

    try:
        while True:
            chunk = await process.stdout.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        await asyncio.gather(process.wait(), std_error_task)

        end_time = datetime.now()

        error = None
        if process.returncode != 0:
            error = std_error[-100:]
        result = ExecutionResult(
            start_time=start_time,
            end_time=end_time,
            processing_time=(end_time - start_time).total_seconds(),
            error=error,
        )

        if complete_callaback:
            complete_callaback(result)


def get_cmd(input: list[str]):
    return ["docker", "compose", "exec", "clipper", *input]


def get_video_info(input: str) -> VideoInfo:

    cmd = get_cmd(
        [
            ffprobe,
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            input,
        ]
    )
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        # a video can contain multiple streams => audio, video,etc
        output = json.loads(result.stdout)
        streams = output.get("streams", [])
        video_stream = next(
            (stream for stream in streams if stream["codec_type"] == "video"), None
        )
        if not video_stream:
            return VideoInfo(error="Not a video stream")
        return VideoInfo(
            duration=float(output["format"].get("duration", 0)),
            size=int(output["format"].get("size", 0)),
            bitrate=int(output["format"].get("bit_rate", 0)),
            width=video_stream.get("width"),
            height=video_stream.get("height"),
            codec=video_stream.get("codec_name"),
            fps=eval(video_stream.get("r_frame_rate", "0/1")),
        )
    except Exception as e:
        return VideoInfo(error=e)


def transcode(self):
    pass


def trim(self):
    pass


async def generate_thumbnail(
    input: str,
    output: str,
    timestamp: str = "00:00:01",
    size: str = "1280x720",
    chunk_size=8192,
):
    cmd = get_cmd(
        [
            ffmpeg,
            "-ss",
            timestamp,  # seek BEFORE decode (faster)
            "-i",
            input,
            "-frames:v",
            "1",
            "-vf",
            f"scale={size}",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "pipe:1",
            "-progress",
            "pipe:2",
        ]
    )

    async for chunk in execute(
        cmd,
        input,
        chunk_size,
        complete_callaback=lambda e: print(e),
        progress_callback=lambda e: print(e),
    ):
        yield chunk


def add_watermark(self):
    pass


def extract_audio(self):
    pass


def concatenete_videos(self):
    pass
