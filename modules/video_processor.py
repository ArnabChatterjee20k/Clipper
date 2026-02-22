# For easy reference and getting the processor idea check the scripts/ffmpeg.py file
import json, subprocess, re, os, uuid
import asyncio
from datetime import datetime
from typing import Optional, Protocol, AsyncGenerator, Any, Union, Type
from dataclasses import dataclass
from pydantic import BaseModel, model_validator
from .logger import logger
from datetime import datetime
from enum import Enum

ffprobe = "ffprobe"
ffmpeg = "ffmpeg"

# Timeout for ffprobe (seconds); prevents hang on bad/remote input
FFPROBE_TIMEOUT = 60


def _safe_float(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _safe_int(v: Any, default: int = 0) -> int:
    if v is None:
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _parse_fps(r_frame_rate: str) -> float:
    """Parse ffprobe r_frame_rate (e.g. '30/1') without eval()."""
    if not r_frame_rate or "/" not in r_frame_rate:
        return 0.0
    parts = r_frame_rate.split("/", 1)
    try:
        num, den = int(parts[0].strip()), int(parts[1].strip())
        return num / den if den else 0.0
    except (ValueError, IndexError, ZeroDivisionError):
        return 0.0


def _parse_ss_seconds(timestr: str) -> float:
    """Parse -ss style timestr (HH:MM:SS or HH:MM:SS.mmm) to seconds."""
    if not timestr:
        return 0.0
    parts = timestr.strip().split(":")
    try:
        h = int(parts[0]) if len(parts) > 0 else 0
        m = int(parts[1]) if len(parts) > 1 else 0
        s = float(parts[2]) if len(parts) > 2 else 0.0
        return h * 3600 + m * 60 + s
    except (ValueError, IndexError):
        return 0.0


@dataclass
class ExecutionResult:
    processing_time: float
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
    fps: Optional[float] = None
    has_audio: bool = False
    error: Optional[str] = None


class TextSegment(BaseModel):
    """Text overlay for a time range. end_sec=-1 means till the end of the video."""

    start_sec: float
    end_sec: float  # -1 = till end
    text: str
    fontsize: int = 24
    x: str = "10"
    y: str = "10"
    fontfile: Optional[str] = None
    # Optional drawtext styling (e.g. for stories-style bars)
    fontcolor: Optional[str] = None
    boxcolor: Optional[str] = None
    boxborderw: Optional[int] = None
    background: Optional[bool] = None


class WordTiming(BaseModel):
    word: str
    start_sec: float
    end_sec: float


class KaraokeText(BaseModel):
    sentence: str
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None
    words: Optional[list[WordTiming]] = None
    fontsize: int = 60
    x: str = "(w-text_w)/2"
    y: str = "h-200"
    fontcolor: str = "white"
    highlight_fontcolor: Optional[str] = None
    boxcolor: str = "black@1.0"
    boxborderw: int = 12
    letter_width: Optional[float] = None
    space_width: Optional[float] = None


class TimedText(BaseModel):
    text: str
    start_sec: float
    end_sec: float
    fontsize: int = 60
    x: str = "(w-text_w)/2"
    y: str = "h-200"
    fontcolor: str = "white"
    boxcolor: Optional[str] = None
    boxborderw: int = 0
    background: bool = False
    fade_in_ms: int = 200
    fade_out_ms: int = 200


class TextSequence(BaseModel):
    items: list[TimedText]

    @model_validator(mode="after")
    def _validate_text_sequence(self) -> "TextSequence":
        if not self.items:
            raise ValueError("textSequence requires at least one item")
        for item in self.items:
            if item.end_sec <= item.start_sec:
                raise ValueError(
                    "textSequence item end_sec must be greater than start_sec"
                )
        return self


class SpeedSegment(BaseModel):
    """Speed override for a time range. end_sec=-1 means till the end of the video."""

    start_sec: float = 0
    end_sec: float = -1
    speed: float = 1.0


def _atempo_chain(speed: float) -> str:
    """atempo only accepts 0.5–2.0 per filter; chain as needed."""
    if speed <= 0:
        raise ValueError("speed must be positive")
    parts = []
    s = speed
    while s > 2.0:
        parts.append("atempo=2.0")
        s /= 2.0
    while s < 0.5:
        parts.append("atempo=0.5")
        s /= 0.5
    parts.append(f"atempo={s}")
    return ",".join(parts)


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


class VideoFormat(str, Enum):
    """Output container/codec for video export (-f)."""

    MP4 = "mp4"
    MATROSKA = "matroska"
    WEBM = "webm"


class AudioFormat(str, Enum):
    """Output format for audio extraction (codec + -f)."""

    MP3 = "libmp3lame"
    AAC = "aac"
    WAV = "pcm_s16le"
    FLAC = "flac"


class WatermarkOverlay(BaseModel):
    """Watermark image overlay on video."""

    path: str
    position: WatermarkPosition = WatermarkPosition.SAFE_BOTTOM
    opacity: float = 0.7


class AudioOverlay(BaseModel):
    """Background or mix-in audio (e.g. music)."""

    path: str
    mix_volume: float = 1.0  # 0–1 relative to main audio
    loop: bool = False
    mute_source: bool = False  # if True, silence source media audio and only play this


class BackgroundColor(BaseModel):
    """Solid background color. only_color=True means output is just the color (no source video)."""

    color: str = "black"  # FFmpeg color name or 0xRRGGBB
    only_color: bool = False  # if True, output is solid color only (no video)


class TranscodeOptions(BaseModel):
    """Encoding options for transcode/compress. Matches common ffmpeg transcode API."""

    codec: str = "libx264"  # video codec (alias video_codec)
    preset: str = "medium"
    crf: int = 23
    audio_codec: str = "aac"
    audio_bitrate: Optional[str] = None  # e.g. "128k"
    movflags: Optional[str] = (
        None  # None = use pipe-friendly; "+faststart" for file output
    )
    # compress-style: optional target size and scale
    target_size_mb: Optional[float] = (
        None  # target file size in MB -> computes -b:v, -maxrate, -bufsize
    )
    scale: Optional[str] = None  # e.g. "1280:-1" -> -vf scale=...


class GifOptions(BaseModel):
    """Options for GIF export (segment of video as animated GIF)."""

    start_time: str = "00:00:00"  # -ss
    duration: int = 5  # -t seconds
    fps: int = 10
    scale: int = 480  # width, height auto
    output_codec: str = "gif"


class ConvertToPlatformOptions(BaseModel):
    """Options for converting Matroska/streamable output to platform-ready MP4.
    LinkedIn, Instagram, etc. require standard MP4 with moov atom at start (+faststart)
    rather than fragmented MP4. This op transcodes the internal Matroska to MP4.
    """

    platform: Optional[str] = None  # "linkedin", "instagram", "youtube", "generic"
    codec: str = "libx264"
    preset: str = "medium"
    crf: int = 23
    audio_codec: str = "aac"
    audio_bitrate: Optional[str] = "128k"
    # Platform-specific max resolution (optional); e.g. "1080:1920" for Instagram Reels
    scale: Optional[str] = None


@dataclass
class OperationSpec:
    """Declarative spec for a builder operation. Every op uses a single 'data' key."""

    method: str
    model: Optional[Type[BaseModel]] = None
    many: bool = False


async def get_progress(
    total_duration: int, line: str, progress_callback: ProgressCallaback
):
    match = re.search(r"out_time_ms=(\d+)", line)
    if match:
        current_ms = int(match.group(1))
        current_sec = current_ms / 1_000_000
        progress = (
            min(100, (current_sec / total_duration) * 100) if total_duration > 0 else 0
        )
        await progress_callback(progress)


def get_cmd(input: list[str]):
    env_mode = os.getenv("CLIPPER_ENV", "").lower()
    is_in_container = env_mode == "production"

    if is_in_container:
        return input

    # On host: use docker compose exec to run inside clipper service
    clipper_service = os.getenv("CLIPPER_CONTAINER_NAME")
    return [
        "docker",
        "compose",
        "exec",
        "-i",
        "-T",
        clipper_service,
        *input,
    ]


def _build_concat_manifest(paths: list[str]) -> str:
    """Build FFmpeg concat demuxer manifest. Escapes single quotes in paths."""
    lines = []
    for p in paths:
        escaped = (p or "").replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    return "\n".join(lines) + "\n"


def _convert_tmp_paths() -> tuple[str, str]:
    """Return (host_dir, container_dir) for convert temp files.
    When running on host with docker exec, media/ is mounted at /code/media in container.
    When in production (in container), both are the same path.
    """
    env_mode = os.getenv("CLIPPER_ENV", "").lower()
    is_in_container = env_mode == "production"
    convert_dir = os.path.join("media", "convert_tmp", uuid.uuid4().hex)
    if is_in_container:
        host_dir = os.path.abspath(convert_dir)
        return host_dir, host_dir
    host_dir = os.path.abspath(convert_dir)
    container_dir = f"/code/{convert_dir}"
    return host_dir, container_dir


def _convert_to_platform_mp4_sync(
    mkv_bytes: bytes, opts: "ConvertToPlatformOptions"
) -> bytes:
    """Convert Matroska bytes to platform-ready MP4 with +faststart.
    Requires temp files because +faststart needs seekable output.
    Uses media/convert_tmp so paths work when ffmpeg runs in docker (media is mounted).
    """
    host_dir, container_dir = _convert_tmp_paths()
    os.makedirs(host_dir, exist_ok=True)
    try:
        path_in_host = os.path.join(host_dir, "input.mkv")
        path_out_host = os.path.join(host_dir, "output.mp4")
        path_in_cmd = os.path.join(container_dir, "input.mkv")
        path_out_cmd = os.path.join(container_dir, "output.mp4")
        with open(path_in_host, "wb") as f:
            f.write(mkv_bytes)
        cmd = [
            ffmpeg,
            "-y",
            "-i",
            path_in_cmd,
            "-c:v",
            opts.codec,
            "-preset",
            opts.preset,
            "-crf",
            str(opts.crf),
            "-c:a",
            opts.audio_codec,
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            path_out_cmd,
        ]
        if opts.audio_bitrate:
            cmd.extend(["-b:a", opts.audio_bitrate])
        if opts.scale:
            cmd.extend(["-vf", f"scale={opts.scale}"])
        subprocess.run(get_cmd(cmd), check=True, capture_output=True, timeout=3600)
        with open(path_out_host, "rb") as f:
            return f.read()
    finally:
        try:
            for name in ("input.mkv", "output.mp4"):
                p = os.path.join(host_dir, name)
                if os.path.exists(p):
                    os.unlink(p)
            os.rmdir(host_dir)
        except OSError:
            pass


# Pipeline always outputs Matroska (streamable); ConvertToPlatform then transcodes to MP4
# with +faststart for LinkedIn, Instagram, etc. Standard MP4 can't stream to pipe:1.
_PIPELINE_VIDEO_FORMAT = VideoFormat.MATROSKA


# make sure to pass -f in the command to determine the output type as we are not passing output externally
# so -f determines the output container
async def execute(
    cmd: list[str],
    input: str,
    chunk_size: int = 8192,
    complete_callback: Optional[OnCompleteCallback] = None,
    progress_callback: Optional[ProgressCallaback] = None,
    stdin: Optional[Union[str, bytes]] = None,
    total_duration: Optional[float] = None,
):
    start_time = datetime.now()
    if total_duration is None:
        video_info: VideoInfo = await asyncio.to_thread(
            lambda: VideoBuilder.get_video_info(input)
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
        stdin=asyncio.subprocess.PIPE if stdin is not None else None,
    )

    # Write stdin in background if provided (subprocess expects bytes)
    async def write_stdin():
        if stdin is not None:
            data = stdin.encode("utf-8") if isinstance(stdin, str) else stdin
            process.stdin.write(data)
            await process.stdin.drain()
            process.stdin.close()
            await process.stdin.wait_closed()

    stdin_task = asyncio.create_task(write_stdin())

    std_error: list[str] = []

    async def read_stderr():
        while True:
            line = await process.stderr.readline()
            if not line:
                break
            line = line.decode(errors="replace").rstrip()
            std_error.append(line)
            if progress_callback and total_duration is not None and total_duration > 0:
                await get_progress(total_duration, line, progress_callback)

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

        error: Optional[str] = None
        if process.returncode != 0:
            error = "\n".join(std_error[-100:])
            raise RuntimeError(
                f"ffmpeg/ffprobe exited with code {process.returncode}: {error}"
            )
        result = ExecutionResult(
            start_time=start_time,
            end_time=end_time,
            processing_time=(end_time - start_time).total_seconds(),
            error=error,
        )

        if complete_callback:
            complete_callback(result)


def _drawtext_enable(start_sec: float, end_sec: float) -> str:
    """FFmpeg enable expression for drawtext (times in output timeline)."""
    return f"between(t,{start_sec},{end_sec})"


def _drawtext_opts(
    seg: TextSegment,
    duration: float,
    trim_start: Optional[float] = None,
    effective_duration: Optional[float] = None,
) -> str:
    """Build drawtext filter options for one TextSegment.
    When trim_start and effective_duration are set, segment times are converted to output timeline.
    """
    if trim_start is not None and effective_duration is not None:
        start_out = max(0.0, seg.start_sec - trim_start)
        end_resolved = _resolve_end_sec(seg.end_sec, duration)
        end_out = min(effective_duration, end_resolved - trim_start)
    else:
        start_out = seg.start_sec
        end_out = _resolve_end_sec(seg.end_sec, duration)
    enable = _drawtext_enable(start_out, end_out)
    text_esc = (seg.text or "").replace("'", "''")
    opts = [
        f"enable='{enable}'",
        f"text='{text_esc}'",
        f"fontsize={seg.fontsize}",
        f"x={seg.x}",
        f"y={seg.y}",
    ]
    if seg.fontfile:
        opts.append(f"fontfile='{seg.fontfile}'")
    if seg.fontcolor:
        opts.append(f"fontcolor={seg.fontcolor}")
    if seg.background:
        opts.append("box=1")
    if seg.boxcolor:
        opts.append(f"boxcolor={seg.boxcolor}")
    if seg.boxborderw is not None:
        opts.append(f"boxborderw={seg.boxborderw}")
    return ":".join(opts)


def _resolve_end_sec(end_sec: float, duration: float) -> float:
    return duration if end_sec < 0 else end_sec


def _get_media_duration(path: str) -> float:
    """Get duration in seconds from any media file (video or audio). Returns 0 on error."""
    cmd = get_cmd(
        [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", path]
    )
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=FFPROBE_TIMEOUT
        )
        data = json.loads(result.stdout)
        fmt = data.get("format") or {}
        return _safe_float(fmt.get("duration"), 0.0)
    except Exception:
        return 0.0


def _ass_escape(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")


def _ass_color(color: Optional[str], default_rgb: str = "FFFFFF") -> str:
    if not color:
        rgb = default_rgb
        alpha = 1.0
    else:
        parts = color.split("@", 1)
        rgb_part = parts[0].strip()
        alpha = 1.0
        if len(parts) == 2:
            try:
                alpha = float(parts[1])
            except ValueError:
                alpha = 1.0
        named = {
            "black": "000000",
            "white": "FFFFFF",
            "red": "FF0000",
            "green": "00FF00",
            "blue": "0000FF",
            "yellow": "FFFF00",
            "cyan": "00FFFF",
            "magenta": "FF00FF",
        }
        if rgb_part.lower() in named:
            rgb = named[rgb_part.lower()]
        else:
            hex_part = rgb_part.lower().replace("#", "").replace("0x", "")
            rgb = hex_part if len(hex_part) == 6 else default_rgb

    alpha = max(0.0, min(1.0, alpha))
    ass_alpha = int(round((1.0 - alpha) * 255))
    rr, gg, bb = rgb[0:2], rgb[2:4], rgb[4:6]
    return f"&H{ass_alpha:02X}{bb}{gg}{rr}&"


def _ass_time(sec: float) -> str:
    if sec < 0:
        sec = 0
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    cs = int(round((s - int(s)) * 100))
    return f"{h}:{m:02d}:{int(s):02d}.{cs:02d}"


def _ass_alignment_and_margins(x: str, y: str) -> tuple[int, int, int, int]:
    align = 2
    margin_l = 20
    margin_r = 20
    margin_v = 200

    x_norm = (x or "").strip()
    y_norm = (y or "").strip()

    if x_norm in ("10", "20"):
        align = 1 if align in (2, 3) else 7
        margin_l = int(float(x_norm))
    elif x_norm in ("W-w-10", "w-text_w-10", "W-w-20", "w-text_w-20"):
        align = 3 if align in (2, 3) else 9
        margin_r = int(float(re.sub(r"[^\d.]", "", x_norm)) or 10)
    elif x_norm == "(w-text_w)/2":
        align = 2 if align in (1, 2, 3) else 8

    m = re.match(r"^h-(\d+(?:\.\d+)?)$", y_norm)
    if m:
        align = 2 if align in (1, 2, 3) else 8
        margin_v = int(float(m.group(1)))
    elif y_norm in ("10", "20"):
        align = 8
        margin_v = int(float(y_norm))

    return align, margin_l, margin_r, margin_v


def _ass_style(
    name: str,
    font_size: int,
    font_color: str,
    back_color: str,
    border_style: int,
    border_size: int,
    alignment: int,
    margin_l: int,
    margin_r: int,
    margin_v: int,
) -> str:
    return (
        f"Style: {name},Arial,{font_size},{font_color},{font_color},"
        f"&H00000000,{back_color},0,0,0,0,100,100,0,0,"
        f"{border_style},{border_size},0,{alignment},{margin_l},{margin_r},{margin_v},0"
    )


def _split_sentence_words(sentence: str) -> list[str]:
    return [w for w in re.split(r"\s+", sentence.strip()) if w]


def _word_weight(word: str) -> int:
    cleaned = re.sub(r"[^\w]", "", word)
    return max(1, len(cleaned))


def _auto_word_timings(
    sentence: str, start_sec: float, end_sec: float
) -> list[WordTiming]:
    words = _split_sentence_words(sentence)
    if not words:
        return []
    duration = end_sec - start_sec
    if duration <= 0:
        return []
    weights = [_word_weight(w) for w in words]
    total = sum(weights) or len(words)
    timings: list[WordTiming] = []
    current = start_sec
    for i, word in enumerate(words):
        if i == len(words) - 1:
            end = end_sec
        else:
            end = current + duration * (weights[i] / total)
        timings.append(WordTiming(word=word, start_sec=current, end_sec=end))
        current = end
    return timings


class VideoBuilder:
    """Filter-based builder: collect watermark, text, speed, audio overlays and export in one go."""

    OPERATIONS: dict[str, OperationSpec] = {
        "trim": OperationSpec("trim"),
        "compress": OperationSpec("compress"),
        "concat": OperationSpec("concat_videos"),
        "extractAudio": OperationSpec("extract_audio"),
        "karaoke": OperationSpec(
            method="add_karaoke_text",
            model=KaraokeText,
        ),
        "textSequence": OperationSpec(
            method="add_text_sequence",
            model=TextSequence,
        ),
        "text": OperationSpec(
            method="add_text",
            model=TextSegment,
            many=True,
        ),
        "speed": OperationSpec(
            method="speed_control",
            model=SpeedSegment,
            many=True,
        ),
        "watermark": OperationSpec(
            method="add_watermark",
            model=WatermarkOverlay,
        ),
        "audio": OperationSpec(
            method="add_background_audio",
            model=AudioOverlay,
        ),
        "backgroundColor": OperationSpec(
            method="set_background_color",
            model=BackgroundColor,
        ),
        "transcode": OperationSpec(
            method="transcode",
            model=TranscodeOptions,
        ),
        "gif": OperationSpec(
            method="create_gif",
            model=GifOptions,
        ),
        "convertToPlatform": OperationSpec(
            method="convert_to_platform",
            model=ConvertToPlatformOptions,
        ),
    }

    def __init__(
        self,
        input_path: str,
        video_format: VideoFormat = VideoFormat.MP4,
        audio_format: AudioFormat = AudioFormat.MP3,
        audio_bitrate: str = "192k",
        complete_callback: Optional[OnCompleteCallback] = None,
        progress_callback: Optional[ProgressCallaback] = None,
    ):
        self.input_path = input_path
        self._video_format = video_format
        self._audio_format = audio_format
        self._audio_bitrate = audio_bitrate
        self.complete_callback = complete_callback
        self.progress_callback = progress_callback
        self._chunk_size = 8192
        self._trim_start: Optional[float] = None
        self._trim_end: Optional[float] = None
        self._trim_duration: Optional[float] = None
        self._watermark: Optional[WatermarkOverlay] = None
        self._text_segments: list[TextSegment] = []
        self._karaoke_segments: list[tuple[KaraokeText, list[WordTiming]]] = []
        self._text_sequences: list[TextSequence] = []
        self._speed_segments: list[SpeedSegment] = []
        self._background_audio: Optional[AudioOverlay] = None
        self._background_color: Optional[BackgroundColor] = None
        self._transcode: Optional[TranscodeOptions] = None
        self._gif_options: Optional[GifOptions] = None
        self._convert_to_platform: Optional[ConvertToPlatformOptions] = None

    @staticmethod
    def get_video_info(input_path: str) -> VideoInfo:
        cmd = get_cmd(
            [
                ffprobe,
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                input_path,
            ]
        )
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True,
                timeout=FFPROBE_TIMEOUT,
            )
            output = json.loads(result.stdout)
            streams = output.get("streams", [])
            video_stream = next(
                (s for s in streams if s.get("codec_type") == "video"), None
            )
            if not video_stream:
                return VideoInfo(error="Not a video stream")
            fmt = output.get("format") or {}
            duration = _safe_float(fmt.get("duration"), 0.0)
            if duration <= 0:
                return VideoInfo(error="Invalid or zero duration")
            has_audio = any(s.get("codec_type") == "audio" for s in streams)
            return VideoInfo(
                duration=duration,
                size=_safe_int(fmt.get("size"), 0),
                bitrate=_safe_int(fmt.get("bit_rate"), 0),
                width=video_stream.get("width"),
                height=video_stream.get("height"),
                codec=video_stream.get("codec_name"),
                fps=_parse_fps(video_stream.get("r_frame_rate", "0/1")),
                has_audio=has_audio,
            )
        except subprocess.TimeoutExpired as e:
            return VideoInfo(error=f"ffprobe timeout: {e}")
        except Exception as e:
            return VideoInfo(error=str(e))

    @property
    def effective_output_ext(self) -> str:
        """Output file extension: mp4 when convertToPlatform is set, else mkv."""
        return "mp4" if self._convert_to_platform is not None else "mkv"

    @property
    def chunk_size(self) -> int:
        return self._chunk_size

    @chunk_size.setter
    def chunk_size(self, value: int) -> None:
        self._chunk_size = value

    def trim(
        self,
        start_sec: float = 0,
        end_sec: float = -1,
        *,
        duration: Optional[float] = None,
    ) -> "VideoBuilder":
        """Trim video. end_sec=-1 means till end. Alternatively set duration."""
        self._trim_start = start_sec
        self._trim_end = -1 if duration is not None else end_sec
        self._trim_duration = duration
        return self

    def add_watermark(
        self,
        overlay: Optional[WatermarkOverlay] = None,
        *,
        path: Optional[str] = None,
        position: WatermarkPosition = WatermarkPosition.SAFE_BOTTOM,
        opacity: float = 0.7,
    ) -> "VideoBuilder":
        """Add watermark overlay. Pass overlay or (path with optional position, opacity)."""
        if overlay is not None:
            self._watermark = overlay
        elif path is not None:
            self._watermark = WatermarkOverlay(
                path=path, position=position, opacity=opacity
            )
        return self

    def add_text(
        self,
        segment: Union[TextSegment, list[TextSegment]],
    ) -> "VideoBuilder":
        """Add one or more text overlay segments."""
        if isinstance(segment, list):
            self._text_segments.extend(segment)
        else:
            self._text_segments.append(segment)
        return self

    def add_karaoke_text(self, data: KaraokeText) -> "VideoBuilder":
        """Generate word-highlight subtitles for a sentence using ASS."""
        sentence = (data.sentence or "").strip()
        if not sentence:
            return self

        if data.words:
            timings = sorted(data.words, key=lambda w: w.start_sec)
        else:
            if data.start_sec is None or data.end_sec is None:
                raise ValueError(
                    "karaoke requires start_sec and end_sec when words are not provided"
                )
            timings = _auto_word_timings(sentence, data.start_sec, data.end_sec)
            if not timings:
                return self
        if not timings:
            return self

        self._karaoke_segments.append((data, timings))

        return self

    def add_text_sequence(self, data: TextSequence) -> "VideoBuilder":
        """Add a sequence of timed text items with fade animation using ASS."""
        if data.items:
            self._text_sequences.append(data)
        return self

    def speed_control(
        self,
        segment: Union[SpeedSegment, list[SpeedSegment], float],
    ) -> "VideoBuilder":
        """Add one or more speed segments, or a single global speed (float)."""
        if isinstance(segment, (int, float)):
            self._speed_segments.append(
                SpeedSegment(start_sec=0, end_sec=-1, speed=float(segment))
            )
        elif isinstance(segment, list):
            self._speed_segments.extend(segment)
        else:
            self._speed_segments.append(segment)
        return self

    def add_background_audio(
        self,
        overlay: Optional[AudioOverlay] = None,
        *,
        path: Optional[str] = None,
        mix_volume: float = 1.0,
        loop: bool = False,
    ) -> "VideoBuilder":
        """Add background/mix-in audio. Pass AudioOverlay as first arg (from load) or use path/mix_volume/loop."""
        if overlay is not None:
            self._background_audio = overlay
        elif path is not None:
            self._background_audio = AudioOverlay(
                path=path, mix_volume=mix_volume, loop=loop
            )
        return self

    def set_background_color(
        self,
        overlay: Optional[BackgroundColor] = None,
        *,
        color: str = "black",
        only_color: bool = False,
    ) -> "VideoBuilder":
        """Set solid background color. Pass overlay or (color with optional only_color). only_color=True gives a full black (or colored) screen only."""
        if overlay is not None:
            self._background_color = overlay
        else:
            self._background_color = BackgroundColor(color=color, only_color=only_color)
        return self

    def transcode(
        self,
        options: Optional[TranscodeOptions] = None,
        *,
        codec: str = "libx264",
        preset: str = "medium",
        crf: int = 23,
        audio_codec: str = "aac",
        movflags: Optional[str] = None,
        **kwargs: Any,
    ) -> "VideoBuilder":
        """Set encoding options. Pass TranscodeOptions or keyword args (codec, preset, crf, audio_codec, movflags)."""
        if options is not None:
            self._transcode = options
        else:
            self._transcode = TranscodeOptions(
                codec=codec,
                preset=preset,
                crf=crf,
                audio_codec=audio_codec,
                movflags=movflags,
                **kwargs,
            )
        return self

    def compress(
        self,
        target_size_mb: Optional[float] = None,
        scale: Optional[str] = None,
        preset: str = "medium",
        codec: Optional[str] = None,
        crf: Optional[int] = None,
        audio_codec: Optional[str] = None,
        audio_bitrate: Optional[str] = None,
        movflags: Optional[str] = None,
        **kwargs: Any,
    ) -> "VideoBuilder":
        """Compress video with optional target size (MB) and scale. Optional transcode overrides (codec, crf, audio_codec, audio_bitrate, movflags)."""
        opts: dict[str, Any] = {
            "codec": codec or "libx264",
            "preset": preset,
            "crf": 23 if crf is None else crf,
            "audio_codec": audio_codec or "aac",
            "audio_bitrate": audio_bitrate or "128k",
            "target_size_mb": target_size_mb,
            "scale": scale,
            "movflags": movflags,
        }
        opts.update(kwargs)
        self._transcode = TranscodeOptions(
            **{k: v for k, v in opts.items() if v is not None}
        )
        return self

    def create_gif(self, options: GifOptions) -> "VideoBuilder":
        """Set GIF export options. When set, export_to_bytes() produces an animated GIF."""
        self._gif_options = options
        return self

    def convert_to_platform(
        self, options: Optional[ConvertToPlatformOptions] = None, **kwargs: Any
    ) -> "VideoBuilder":
        """Convert internal Matroska output to platform-ready MP4 (LinkedIn, Instagram, etc).
        Uses +faststart so moov atom is at the start for streaming/upload compatibility.
        """
        if options is not None:
            self._convert_to_platform = options
        else:
            self._convert_to_platform = ConvertToPlatformOptions(**kwargs)
        return self

    def _karaoke_media_paths(self) -> tuple[str, str]:
        media_host = os.path.abspath("media")
        if os.getenv("CLIPPER_ENV", "").lower() == "production":
            return media_host, media_host
        return media_host, "/code/media"

    def _render_karaoke_ass(
        self,
        data: KaraokeText,
        timings: list[WordTiming],
        width: int,
        height: int,
    ) -> str:
        tokens = _split_sentence_words(data.sentence)
        if len(tokens) != len(timings):
            tokens = [t.word for t in timings]

        base_color = _ass_color(data.fontcolor, "FFFFFF")
        highlight_color = _ass_color(data.highlight_fontcolor or "yellow", "FFFF00")
        back_default = _ass_color("black@0", "000000")
        back_highlight = _ass_color(data.boxcolor or "black@0", "000000")
        bord = max(0, int(data.boxborderw or 0))
        align, margin_l, margin_r, margin_v = _ass_alignment_and_margins(data.x, data.y)

        header = [
            "[Script Info]",
            "ScriptType: v4.00+",
            f"PlayResX: {width}",
            f"PlayResY: {height}",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            _ass_style(
                "Default",
                data.fontsize,
                base_color,
                back_default,
                3,
                0,
                align,
                margin_l,
                margin_r,
                margin_v,
            ),
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]

        events: list[str] = []
        for i, w in enumerate(timings):
            parts: list[str] = []
            for j, tok in enumerate(tokens):
                if j == i:
                    box_tag = f"\\4c{back_highlight}" if data.boxcolor else ""
                    bord_tag = f"\\bord{bord}" if bord > 0 else ""
                    parts.append(
                        f"{{\\1c{highlight_color}{box_tag}{bord_tag}}}{_ass_escape(tok)}{{\\r}}"
                    )
                else:
                    parts.append(_ass_escape(tok))
            text = " ".join(parts)
            events.append(
                f"Dialogue: 0,{_ass_time(w.start_sec)},{_ass_time(w.end_sec)},Default,,0,0,0,,{text}"
            )

        return "\n".join(header + events) + "\n"

    def _build_karaoke_ass_files(self, width: int, height: int) -> list[str]:
        if not self._karaoke_segments:
            return []
        media_host, media_ffmpeg = self._karaoke_media_paths()
        karaoke_dir = os.path.join(media_host, "karaoke")
        os.makedirs(karaoke_dir, exist_ok=True)
        out_paths: list[str] = []
        for data, timings in self._karaoke_segments:
            filename = f"karaoke_{uuid.uuid4().hex}.ass"
            host_path = os.path.join(karaoke_dir, filename)
            ffmpeg_path = f"{media_ffmpeg}/karaoke/{filename}"
            content = self._render_karaoke_ass(data, timings, width, height)
            with open(host_path, "w", encoding="utf-8") as f:
                f.write(content)
            out_paths.append(ffmpeg_path)
        return out_paths

    def _render_text_sequence_ass(
        self, sequence: TextSequence, width: int, height: int
    ) -> str:
        header = [
            "[Script Info]",
            "ScriptType: v4.00+",
            f"PlayResX: {width}",
            f"PlayResY: {height}",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        ]

        styles: list[str] = []
        events: list[str] = []
        for i, item in enumerate(sequence.items):
            base_color = _ass_color(item.fontcolor, "FFFFFF")
            back_color = _ass_color(item.boxcolor or "black@0", "000000")
            align, margin_l, margin_r, margin_v = _ass_alignment_and_margins(
                item.x, item.y
            )
            style_name = f"S{i}"
            border_style = 3 if item.background else 1
            border_size = max(0, int(item.boxborderw or 0)) if item.background else 0
            styles.append(
                _ass_style(
                    style_name,
                    item.fontsize,
                    base_color,
                    back_color,
                    border_style,
                    border_size,
                    align,
                    margin_l,
                    margin_r,
                    margin_v,
                )
            )
            fade_in = max(0, int(item.fade_in_ms or 0))
            fade_out = max(0, int(item.fade_out_ms or 0))
            fade_tag = (
                f"{{\\fad({fade_in},{fade_out})}}" if (fade_in or fade_out) else ""
            )
            text = f"{fade_tag}{_ass_escape(item.text)}"
            events.append(
                f"Dialogue: 0,{_ass_time(item.start_sec)},{_ass_time(item.end_sec)},{style_name},,0,0,0,,{text}"
            )

        return (
            "\n".join(
                header
                + styles
                + [
                    "",
                    "[Events]",
                    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
                ]
                + events
            )
            + "\n"
        )

    def _build_text_sequence_ass_files(self, width: int, height: int) -> list[str]:
        if not self._text_sequences:
            return []
        media_host, media_ffmpeg = self._karaoke_media_paths()
        seq_dir = os.path.join(media_host, "text_sequences")
        os.makedirs(seq_dir, exist_ok=True)
        out_paths: list[str] = []
        for seq in self._text_sequences:
            filename = f"textseq_{uuid.uuid4().hex}.ass"
            host_path = os.path.join(seq_dir, filename)
            ffmpeg_path = f"{media_ffmpeg}/text_sequences/{filename}"
            content = self._render_text_sequence_ass(seq, width, height)
            with open(host_path, "w", encoding="utf-8") as f:
                f.write(content)
            out_paths.append(ffmpeg_path)
        return out_paths

    def _build_filter_complex(
        self,
        duration: float,
        width: Optional[int] = None,
        height: Optional[int] = None,
        scale: Optional[str] = None,
    ) -> tuple[list[str], str]:
        """Build extra inputs (after main) and filter_complex string."""
        extra_inputs: list[str] = []
        video_in = "[0:v]"
        audio_in = "[0:a]"
        w = width or 1920
        h = height or 1080
        trim_end = duration
        if self._trim_end is not None and self._trim_end >= 0:
            trim_end = self._trim_end
        if self._trim_duration is not None and self._trim_start is not None:
            trim_end = self._trim_start + self._trim_duration
        effective_duration = (
            (trim_end - (self._trim_start or 0))
            if self._trim_start is not None
            else duration
        )
        # When background audio is longer than video, extend output to match.
        # Do NOT extend when trim was explicitly given (user set end_sec or duration).
        trim_explicit = (
            self._trim_end is not None and self._trim_end >= 0
        ) or self._trim_duration is not None
        output_duration = effective_duration
        if self._background_audio is not None and not trim_explicit:
            audio_dur = _get_media_duration(self._background_audio.path)
            if audio_dur > 0 and audio_dur > effective_duration:
                output_duration = audio_dur

        parts: list[str] = []

        # Solid background color only (no source video)
        # When mute_source+trim_explicit we use only background audio; don't create unused [a_trim]
        use_mute_source_only = (
            self._background_audio is not None
            and self._background_audio.mute_source
            and trim_explicit
        )
        if self._background_color is not None and self._background_color.only_color:
            c = self._background_color.color
            parts.append(f"color=c={c}:s={w}x{h}:d={output_duration}:r=30[bg]")
            if not use_mute_source_only:
                parts.append(
                    f"[0:a]atrim=start={self._trim_start or 0}:end={trim_end},asetpts=PTS-STARTPTS[a_trim]"
                )
                audio_in = "[a_trim]"
            else:
                audio_in = (
                    "[0:a]"  # Placeholder; background_audio block uses only [1:a]
                )
            video_in = "[bg]"
        else:
            if (
                self._background_color is not None
                and not self._background_color.only_color
            ):
                parts.append(
                    f"color=c={self._background_color.color}:s={w}x{h}:d={output_duration}:r=30[bg];"
                )

            if self._trim_start is not None:
                trim_v = f"[0:v]trim=start={self._trim_start}:end={trim_end},setpts=PTS-STARTPTS[v_trim]"
                if not use_mute_source_only:
                    trim_v += f";[0:a]atrim=start={self._trim_start}:end={trim_end},asetpts=PTS-STARTPTS[a_trim]"
                parts.append(trim_v)
                audio_in = "[a_trim]" if not use_mute_source_only else "[0:a]"
                video_in = "[v_trim]"

        speed_segments = []
        for s in self._speed_segments:
            end = _resolve_end_sec(s.end_sec, duration)
            start = s.start_sec
            if self._trim_start is not None:
                start = max(0, s.start_sec - self._trim_start)
                end = min(trim_end - self._trim_start, end - self._trim_start)
            speed_segments.append(
                SpeedSegment(start_sec=start, end_sec=end, speed=s.speed)
            )

        if speed_segments:
            if len(speed_segments) == 1 and speed_segments[0].speed != 1.0:
                seg = speed_segments[0]
                atempo = _atempo_chain(seg.speed)
                parts.append(
                    f"{video_in}setpts=PTS/{seg.speed}[v_spd];"
                    f"{audio_in}{atempo},asetpts=PTS-STARTPTS[a_spd]"
                )
                video_in = "[v_spd]"
                audio_in = "[a_spd]"
            elif len(speed_segments) > 1:
                n = len(speed_segments)
                v_filters = []
                a_filters = []
                for i, seg in enumerate(speed_segments):
                    end = seg.end_sec  # already in trimmed timeline if trim set
                    v_filters.append(
                        f"{video_in}trim=start={seg.start_sec}:end={end},setpts=PTS/{seg.speed},setpts=PTS-STARTPTS[v_s{i}]"
                    )
                    a_filters.append(
                        f"{audio_in}atrim=start={seg.start_sec}:end={end},{_atempo_chain(seg.speed)},asetpts=PTS-STARTPTS[a_s{i}]"
                    )
                parts.append(";".join(v_filters) + ";" + ";".join(a_filters))
                parts.append(
                    f"{''.join(f'[v_s{i}]' for i in range(n))}concat=n={n}:v=1:a=0[v_spd];"
                    f"{''.join(f'[a_s{i}]' for i in range(n))}concat=n={n}:v=0:a=1[a_spd]"
                )
                video_in = "[v_spd]"
                audio_in = "[a_spd]"

        if self._text_segments:
            # Chain multiple drawtext filters with comma; colons only separate options within one filter
            # Pass trim_start and effective_duration so segment times are in output timeline
            drawtext_filters = [
                f"drawtext={_drawtext_opts(seg, duration, self._trim_start, effective_duration)}"
                for seg in self._text_segments
            ]
            text_chain = ",".join(drawtext_filters)
            parts.append(f"{video_in}{text_chain}[v_txt]")
            video_in = "[v_txt]"

        if self._karaoke_segments:
            ass_files = self._build_karaoke_ass_files(w, h)
            for i, path in enumerate(ass_files):
                esc_path = (path or "").replace("'", r"\'")
                parts.append(f"{video_in}subtitles='{esc_path}'[v_kar{i}]")
                video_in = f"[v_kar{i}]"

        if self._text_sequences:
            seq_files = self._build_text_sequence_ass_files(w, h)
            for i, path in enumerate(seq_files):
                esc_path = (path or "").replace("'", r"\'")
                parts.append(f"{video_in}subtitles='{esc_path}'[v_seq{i}]")
                video_in = f"[v_seq{i}]"

        if self._watermark is not None:
            extra_inputs.append(self._watermark.path)
            w = self._watermark
            overlay_filter = (
                f"[1]format=rgba,colorchannelmixer=aa={w.opacity}[wm];"
                f"{video_in}[wm]overlay={w.position.value}[v_wm]"
            )
            parts.append(overlay_filter)
            video_in = "[v_wm]"

        if self._background_audio is not None:
            extra_inputs.append(self._background_audio.path)
            # Background audio input index: 1 if no watermark, 2 if watermark present
            audio_overlay_index = 1 + (1 if self._watermark is not None else 0)
            mix_vol = self._background_audio.mix_volume

            if self._background_audio.mute_source and trim_explicit:
                # mute_source + explicit trim: use ONLY background audio, trimmed to output_duration.
                # Source audio is ignored; avoids silence when source is shorter than trim.
                parts.append(
                    f"[{audio_overlay_index}:a]atrim=start=0:end={output_duration},"
                    f"asetpts=PTS-STARTPTS,volume={mix_vol}[a_mix]"
                )
                audio_in = "[a_mix]"
            else:
                # Mix source + background. When trim_explicit: use longest then atrim to output_duration
                # so background music plays for full trim length even if source audio is shorter.
                src_weight = "0" if self._background_audio.mute_source else "1"
                amix_duration = (
                    "longest"  # always longest; we atrim to output_duration when needed
                )
                parts.append(
                    f"{audio_in}[{audio_overlay_index}:a]amix=inputs=2:duration={amix_duration}:weights='{src_weight} {mix_vol}'[a_mix]"
                )
                audio_in = "[a_mix]"
                if trim_explicit:
                    parts.append(
                        f"{audio_in}atrim=start=0:end={output_duration},asetpts=PTS-STARTPTS[a_trim_out]"
                    )
                    audio_in = "[a_trim_out]"

        # Extend video when background audio is longer (pad with last frame)
        if output_duration > effective_duration and not (
            self._background_color is not None and self._background_color.only_color
        ):
            pad_sec = output_duration - effective_duration
            parts.append(
                f"{video_in}tpad=stop_mode=clone:stop_duration={pad_sec:.2f}[v_pad]"
            )
            video_in = "[v_pad]"

        # Video on solid color background (when set and not only_color)
        if self._background_color is not None and not self._background_color.only_color:
            parts.append(f"[bg]{video_in}overlay=(W-w)/2:(H-h)/2[v_bg]")
            video_in = "[v_bg]"

        # Optional scale (e.g. from compress(scale="1280:-1"))
        if scale:
            parts.append(f"{video_in}scale={scale}[v_scaled]")
            video_in = "[v_scaled]"

        # Pass-through to named outputs (FFmpeg requires a filter between input and output)
        parts.append(f"{video_in}setpts=PTS[v_out];{audio_in}anull[a_out]")
        filter_complex = ";".join(parts)
        return extra_inputs, filter_complex

    def _build_extract_audio_cmd(self, info: VideoInfo) -> list[str]:
        """Build ffmpeg args for extract_audio using constructor audio_format/audio_bitrate and builder trim/speed."""
        total_duration = info.duration or 0
        codec = self._audio_format.value
        format_map = {
            AudioFormat.MP3: "mp3",
            AudioFormat.AAC: "ipod",
            AudioFormat.WAV: "wav",
            AudioFormat.FLAC: "flac",
        }
        out_format = format_map.get(self._audio_format, "mp3")
        trim_end = total_duration
        if self._trim_end is not None and self._trim_end >= 0:
            trim_end = self._trim_end
        if self._trim_duration is not None and self._trim_start is not None:
            trim_end = self._trim_start + self._trim_duration
        start_sec = self._trim_start or 0
        duration_sec = (
            trim_end - start_sec if self._trim_start is not None else total_duration
        )
        if self._trim_start is None:
            duration_sec = total_duration

        # No trim and no speed: simple -vn -c:a -b:a -f
        if self._trim_start is None and not self._speed_segments:
            return [
                ffmpeg,
                "-i",
                self.input_path,
                "-vn",
                "-c:a",
                codec,
                "-b:a",
                self._audio_bitrate,
                "-f",
                out_format,
            ]
        # Trim only (no speed): -ss -t -vn -c:a -b:a -f
        if not self._speed_segments:
            cmd = [ffmpeg, "-i", self.input_path, "-vn", "-c:a", codec]
            if self._trim_start is not None and self._trim_start > 0:
                cmd.extend(["-ss", str(self._trim_start)])
            if self._trim_start is not None:
                cmd.extend(["-t", str(duration_sec)])
            cmd.extend(["-b:a", self._audio_bitrate, "-f", out_format])
            return cmd
        # Speed (with or without trim): filter_complex with atrim + atempo
        audio_in = "[0:a]"
        parts: list[str] = []
        if self._trim_start is not None:
            parts.append(
                f"[0:a]atrim=start={self._trim_start}:end={trim_end},asetpts=PTS-STARTPTS[a_trim]"
            )
            audio_in = "[a_trim]"
        if len(self._speed_segments) == 1 and self._speed_segments[0].speed != 1.0:
            seg = self._speed_segments[0]
            atempo = _atempo_chain(seg.speed)
            parts.append(f"{audio_in}{atempo},asetpts=PTS-STARTPTS[a_out]")
        elif len(self._speed_segments) > 1:
            n = len(self._speed_segments)
            a_filters = []
            for i, seg in enumerate(self._speed_segments):
                seg_end = _resolve_end_sec(seg.end_sec, duration_sec)
                seg_start = seg.start_sec
                if self._trim_start is not None:
                    seg_start = max(0, seg.start_sec - self._trim_start)
                    seg_end = min(duration_sec, seg_end - self._trim_start)
                a_filters.append(
                    f"{audio_in}atrim=start={seg_start}:end={seg_end},{_atempo_chain(seg.speed)},asetpts=PTS-STARTPTS[a_s{i}]"
                )
            parts.append(";".join(a_filters))
            parts.append(
                f"{''.join(f'[a_s{i}]' for i in range(n))}concat=n={n}:v=0:a=1[a_out]"
            )
        else:
            parts.append(f"{audio_in}anull[a_out]")
        filter_complex = ";".join(parts)
        return [
            ffmpeg,
            "-i",
            self.input_path,
            "-filter_complex",
            filter_complex,
            "-map",
            "[a_out]",
            "-c:a",
            codec,
            "-b:a",
            self._audio_bitrate,
            "-f",
            out_format,
        ]

    def _build(self, info: VideoInfo, action: str = "export") -> list[str]:
        """Build the ffmpeg argument list. action='export' or 'extract_audio'. execute() calls this internally."""
        if action == "extract_audio":
            return self._build_extract_audio_cmd(info)
        # export
        opts = self._transcode or TranscodeOptions()
        has_filters = (
            self._trim_start is not None
            or self._speed_segments
            or self._text_segments
            or self._karaoke_segments
            or self._text_sequences
            or self._watermark is not None
            or self._background_audio is not None
            or self._background_color is not None
            or opts.target_size_mb is not None
            or opts.scale is not None
        )
        # Pipeline outputs Matroska (streamable to pipe); ConvertToPlatform transcodes to MP4
        pipeline_format = _PIPELINE_VIDEO_FORMAT
        if not has_filters:
            cmd = [
                ffmpeg,
                "-i",
                self.input_path,
                "-c",
                "copy",
                "-f",
                pipeline_format.value,
            ]
            return cmd
        extra_inputs, filter_complex = self._build_filter_complex(
            info.duration, info.width, info.height, opts.scale
        )
        duration_sec = info.duration or 1.0
        cmd_parts = [
            ffmpeg,
            "-i",
            self.input_path,
            *[x for i in extra_inputs for x in ("-i", i)],
            "-filter_complex",
            filter_complex,
            "-map",
            "[v_out]",
            "-map",
            "[a_out]",
            "-c:v",
            opts.codec,
            "-preset",
            opts.preset,
            "-c:a",
            opts.audio_codec,
            "-f",
            pipeline_format.value,
        ]
        if opts.target_size_mb is not None and opts.target_size_mb > 0:
            target_bitrate = int((opts.target_size_mb * 8192) / duration_sec) - 128
            target_bitrate = max(100, target_bitrate)
            cmd_parts.extend(
                [
                    "-b:v",
                    f"{target_bitrate}k",
                    "-maxrate",
                    f"{int(target_bitrate * 1.5)}k",
                    "-bufsize",
                    f"{target_bitrate * 2}k",
                ]
            )
        else:
            cmd_parts.extend(["-crf", str(opts.crf)])
        if opts.audio_bitrate:
            cmd_parts.extend(["-b:a", opts.audio_bitrate])
        return cmd_parts

    def _build_gif_cmd(self) -> list[str]:
        """Build ffmpeg command for GIF export (palettegen/paletteuse)."""
        o = self._gif_options
        if not o:
            raise RuntimeError("GIF options not set")
        vf = (
            f"fps={o.fps},scale={o.scale}:-1:flags=lanczos,"
            "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
        )
        return [
            ffmpeg,
            "-ss",
            o.start_time,
            "-t",
            str(o.duration),
            "-i",
            self.input_path,
            "-vf",
            vf,
            "-loop",
            "0",
            "-f",
            o.output_codec,
        ]

    async def export(self) -> AsyncGenerator[bytes, None, None]:
        """Build one ffmpeg command with all filters and stream output."""
        if self._gif_options is not None:
            info = await asyncio.to_thread(
                lambda: VideoBuilder.get_video_info(self.input_path)
            )
            if info.error or info.duration is None:
                raise RuntimeError(f"Invalid input or no duration: {info.error}")
            cmd = get_cmd(self._build_gif_cmd())
            total_duration = min(
                self._gif_options.duration,
                (info.duration or 0) - _parse_ss_seconds(self._gif_options.start_time),
            )
            async for chunk in execute(
                cmd,
                self.input_path,
                self._chunk_size,
                complete_callback=self.complete_callback,
                progress_callback=self.progress_callback,
                total_duration=max(0, total_duration),
            ):
                yield chunk
            return
        info = await asyncio.to_thread(
            lambda: VideoBuilder.get_video_info(self.input_path)
        )
        if info.error or info.duration is None:
            raise RuntimeError(f"Invalid input or no duration: {info.error}")
        if not info.has_audio:
            raise RuntimeError("Input has no audio stream; export requires audio")
        cmd = get_cmd(self._build(info))
        async for chunk in execute(
            cmd,
            self.input_path,
            self._chunk_size,
            complete_callback=self.complete_callback,
            progress_callback=self.progress_callback,
        ):
            yield chunk

    async def export_to_bytes(self) -> bytes:
        """Run export and return the whole output as bytes (full video in memory).
        Pipeline outputs Matroska; if convertToPlatform is set, transcodes to MP4 with +faststart.
        """
        result = bytearray()
        async for chunk in self.export():
            result.extend(chunk)
        out = bytes(result)
        if self._convert_to_platform is not None:
            out = await asyncio.to_thread(
                _convert_to_platform_mp4_sync, out, self._convert_to_platform
            )
        return out

    async def extract_audio(self) -> AsyncGenerator[bytes, None]:
        """Extract audio using builder trim/speed and constructor audio_format/audio_bitrate. Streams chunks."""
        info = await asyncio.to_thread(
            lambda: VideoBuilder.get_video_info(self.input_path)
        )
        if info.error or info.duration is None:
            raise RuntimeError(f"Invalid input or no duration: {info.error}")
        if not info.has_audio:
            raise RuntimeError("Input has no audio stream; cannot extract audio")
        cmd = get_cmd(self._build(info, "extract_audio"))
        async for chunk in execute(
            cmd,
            self.input_path,
            self._chunk_size,
            complete_callback=self.complete_callback,
            progress_callback=self.progress_callback,
        ):
            yield chunk

    async def extract_audio_to_bytes(self) -> bytes:
        """Extract audio and return the full output as bytes (uses builder trim/speed and constructor audio format)."""
        result = bytearray()
        async for chunk in self.extract_audio():
            result.extend(chunk)
        return bytes(result)

    @staticmethod
    async def concat_videos(
        input_paths: list[str],
        video_format: VideoFormat = VideoFormat.MP4,
        chunk_size: int = 8192,
        complete_callback: Optional[OnCompleteCallback] = None,
        progress_callback: Optional[ProgressCallaback] = None,
    ) -> AsyncGenerator[bytes, None, None]:
        """Concatenate multiple videos (concat demuxer). Streams output to stdout.
        Requires at least 2 input paths. Uses -c copy; all inputs should have compatible codecs.
        """
        if len(input_paths) < 2:
            raise ValueError("concat_videos requires at least 2 input paths")
        manifest = _build_concat_manifest(input_paths)
        total_duration = 0.0
        for path in input_paths:
            info = await asyncio.to_thread(
                lambda p=path: VideoBuilder.get_video_info(p)
            )
            if info.error or info.duration is None:
                raise RuntimeError(
                    f"Invalid input {path!r}: {info.error or 'no duration'}"
                )
            total_duration += info.duration or 0.0
        cmd = get_cmd(
            [
                ffmpeg,
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                "pipe:0",
                "-c",
                "copy",
                "-f",
                video_format.value,
                "-movflags",
                "+frag_keyframe+empty_moov",
            ]
        )
        async for chunk in execute(
            cmd,
            input_paths[0],
            chunk_size=chunk_size,
            complete_callback=complete_callback,
            progress_callback=progress_callback,
            stdin=manifest,
            total_duration=total_duration,
        ):
            yield chunk

    @staticmethod
    async def concat_videos_to_bytes(
        input_paths: list[str],
        video_format: VideoFormat = VideoFormat.MP4,
        chunk_size: int = 8192,
        complete_callback: Optional[OnCompleteCallback] = None,
        progress_callback: Optional[ProgressCallaback] = None,
    ) -> bytes:
        """Concatenate multiple videos and return the full output as bytes."""
        result = bytearray()
        async for chunk in VideoBuilder.concat_videos(
            input_paths,
            video_format=video_format,
            chunk_size=chunk_size,
            complete_callback=complete_callback,
            progress_callback=progress_callback,
        ):
            result.extend(chunk)
        return bytes(result)

    def load(self, op: str, data: Any = None, **kwargs):
        """Apply one operation from standardized JSON: {"op": "...", "data": {...}} or data: [...]. No if/else."""
        if op == "download_from_youtube":
            return self
        spec = self.OPERATIONS.get(op)
        if not spec:
            raise ValueError(f"{op} is an unknown operation")

        if not hasattr(self, spec.method):
            raise ValueError(f"No processor method found for {op}")

        if spec.model:
            if data is None:
                raise ValueError(f"{op} requires 'data' field")

            if spec.many:
                items = data if isinstance(data, list) else [data]
                data = [
                    spec.model.model_validate(item) if isinstance(item, dict) else item
                    for item in items
                ]
            else:
                if isinstance(data, dict):
                    data = spec.model.model_validate(data)

            return getattr(self, spec.method)(data)

        # No model → passthrough data dict as kwargs
        passthrough = dict(data) if isinstance(data, dict) else {}
        passthrough.update(kwargs)
        return getattr(self, spec.method)(**passthrough)
