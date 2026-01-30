import json, subprocess, re
import asyncio
from datetime import datetime
from typing import Optional, Protocol
from dataclasses import dataclass
from .logger import logger
from datetime import datetime
from enum import Enum
from io import BytesIO

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


class WatermarkPosition(str, Enum):
    # corners
    TOP_LEFT = "10:10"
    TOP_CENTER = "(W-w)/2:10"
    TOP_RIGHT = "W-w-10:10"

    MIDDLE_LEFT = "10:(H-h)/2"
    CENTER = "(W-w)/2:(H-h)/2"
    MIDDLE_RIGHT = "W-w-10:(H-h)/2"

    BOTTOM_LEFT = "10:H-h-10"
    BOTTOM_CENTER = "(W-w)/2:H-h-10"
    BOTTOM_RIGHT = "W-w-10:H-h-10"

    # social-safe (reels / shorts / tiktok)
    SAFE_TOP = "(W-w)/2:80"
    SAFE_BOTTOM = "(W-w)/2:H-h-80"


class AudioFormat(str, Enum):
    MP3 = "libmp3lame"
    AAC = "aac"
    WAV = "pcm_s16le"
    FLAC = "flac"


def get_progress(total_duration: int, line: str, progress_callback: ProgressCallaback):
    match = re.search(r"out_time_ms=(\d+)", line)
    if match:
        current_ms = int(match.group(1))
        current_sec = current_ms / 1_000_000
        progress = (
            min(100, (current_sec / total_duration) * 100) if total_duration > 0 else 0
        )
        progress_callback(progress)


def get_cmd(input: list[str]):
    return [
        "docker",
        "compose",
        "exec",
        "-i",
        "-T",
        "clipper",
        *input,
    ]


# make sure to pass -f in the command to determine the output type as we are not passing output externally
# so -f determines the output container
async def execute(
    cmd: list[str],
    input: str,
    chunk_size: int = 8192,
    complete_callaback: Optional[OnCompleteCallback] = None,
    progress_callback: Optional[ProgressCallaback] = None,
    stdin: str = None,
):
    start_time = datetime.now()
    video_info: VideoInfo = await asyncio.to_thread(
        lambda: VideoProcessor.get_video_info(input)
    )
    total_duration = video_info.duration

    cmd = [
        *cmd,
        "-progress",
        "pipe:2",
        "pipe:1",
    ]

    logger.info(cmd)
    process = await asyncio.subprocess.create_subprocess_exec(
        *cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=asyncio.subprocess.PIPE if stdin else None,
    )

    # Write stdin in background if provided
    async def write_stdin():
        if stdin is not None:
            process.stdin.write(stdin)
            await process.stdin.drain()
            process.stdin.close()
            await process.stdin.wait_closed()

    stdin_task = asyncio.create_task(write_stdin())

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
        await asyncio.gather(process.wait(), stdin_task, std_error_task)

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


class VideoProcessor:
    def __init__(
        self,
        complete_callaback: Optional[OnCompleteCallback] = None,
        progress_callback: Optional[ProgressCallaback] = None,
    ):
        self.complete_callaback = complete_callaback
        self.progress_callback = progress_callback

        self._chunk_size = 8192

    @staticmethod
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

    @property
    def chunk_size(self) -> int:
        return self._chunk_size

    @chunk_size.setter
    def chunk_size(self, value: int):
        self._chunk_size = value

    async def generate_thumbnail(
        self, input: str, timestamp: str = "00:00:01", size: str = "1280x720"
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
            ]
        )

        async for chunk in execute(
            cmd,
            input,
            self.chunk_size,
            complete_callaback=self.complete_callaback,
            progress_callback=self.progress_callback,
        ):
            yield chunk

    async def add_watermark(
        self,
        input: str,
        watermark: str,
        position: WatermarkPosition = WatermarkPosition.SAFE_BOTTOM,
        opacity: float = 0.7,
        output_format: str = "mp4",
    ):
        cmd = get_cmd(
            [
                ffmpeg,
                "-i",
                input,
                "-i",
                watermark,
                "-filter_complex",
                f"[1]format=rgba,colorchannelmixer=aa={opacity}[wm];[0][wm]overlay={position.value}",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "23",
                "-c:a",
                "copy",
                "-f",
                output_format,
                "-movflags",
                "+frag_keyframe+empty_moov",  # required for pipe (non-seekable) output
            ]
        )

        async for chunk in execute(
            cmd, input, self.chunk_size, self.complete_callaback, self.progress_callback
        ):
            yield chunk

    async def extract_audio(
        self,
        input: str,
        audio_format: AudioFormat = AudioFormat.MP3,
        bitrate: str = "192k",
        output_format: str = "mp3",
    ):
        codec = audio_format.value

        cmd = get_cmd(
            [
                ffmpeg,
                "-i",
                input,
                "-vn",
                "-c:a",
                codec,
                "-b:a",
                bitrate,
                "-f",
                output_format,
            ]
        )

        async for chunk in execute(
            cmd,
            input,
            self.chunk_size,
            complete_callaback=self.complete_callaback,
            progress_callback=self.progress_callback,
        ):
            yield chunk

    async def create_gif(
        self,
        input: str,
        start_time: str = "00:00:00",
        duration: int = 5,
        fps: int = 10,
        scale: int = 480,
        output_codec="gif",
    ):
        cmd = get_cmd(
            [
                ffmpeg,
                "-ss",
                start_time,
                "-t",
                str(duration),
                "-i",
                input,
                "-vf",
                f"fps={fps},scale={scale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
                "-loop",
                "0",
                "-f",
                output_codec,
            ]
        )

        async for chunk in execute(
            cmd,
            input,
            self.chunk_size,
            complete_callaback=self.complete_callaback,
            progress_callback=self.progress_callback,
        ):
            yield chunk

    async def concatenete_videos(self, inputs: list[str], output_codec="mp4"):
        # ffmpeg needs a list of video inputs as continous text
        manifest_buffer = BytesIO()
        for input in inputs:
            manifest_buffer.write(f"file '{input}' \n".encode())

        cmd = get_cmd(
            [
                "-i",
                "-T",
                "ffmpeg",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                "pipe:0",
                "-c",
                "copy",
                "-f",
                output_codec,
                "-movflags",
                "+frag_keyframe+empty_moov",
            ]
        )

        async for chunk in execute(
            cmd,
            input,
            self.chunk_size,
            stdin=manifest_buffer.read().decode(),
            complete_callaback=self.complete_callaback,
            progress_callback=self.progress_callback,
        ):
            yield chunk

    def transcode(self):
        pass

    def trim(self):
        pass

    def add_audio(self):
        pass
    
    # kind of instagram -> all text to different frames in a single command
    def add_text(self):
        pass

    #  Vertical → horizontal

    # YouTube → Shorts

    # Instagram safe crops
    def resize(self):
        pass

    def speed_control(self):
        pass
