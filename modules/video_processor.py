# For easy reference and getting the processor idea check the scripts/ffmpeg.py file
import json, subprocess, re
import asyncio
from datetime import datetime
from typing import Optional, Protocol, AsyncGenerator, Any, Union
from dataclasses import dataclass
from .logger import logger
from datetime import datetime
from enum import Enum
from io import BytesIO

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


@dataclass
class TextSegment:
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


@dataclass
class SpeedSegment:
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


@dataclass
class WatermarkOverlay:
    """Watermark image overlay on video."""

    path: str
    position: WatermarkPosition = WatermarkPosition.SAFE_BOTTOM
    opacity: float = 0.7


@dataclass
class AudioOverlay:
    """Background or mix-in audio (e.g. music)."""

    path: str
    mix_volume: float = 1.0  # 0–1 relative to main audio
    loop: bool = False


@dataclass
class BackgroundColor:
    """Solid background color. only_color=True means output is just the color (no source video)."""

    color: str = "black"  # FFmpeg color name or 0xRRGGBB
    only_color: bool = False  # if True, output is solid color only (no video)


@dataclass
class TranscodeOptions:
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


def _build_concat_manifest(paths: list[str]) -> str:
    """Build FFmpeg concat demuxer manifest. Escapes single quotes in paths."""
    lines = []
    for p in paths:
        escaped = (p or "").replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    return "\n".join(lines) + "\n"


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

        error: Optional[str] = None
        if process.returncode != 0:
            error = "\n".join(std_error[-100:])
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


class VideoBuilder:
    """Filter-based builder: collect watermark, text, speed, audio overlays and export in one go."""

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
        self._speed_segments: list[SpeedSegment] = []
        self._background_audio: Optional[AudioOverlay] = None
        self._background_color: Optional[BackgroundColor] = None
        self._transcode: Optional[TranscodeOptions] = None

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

    def add_watermark(self, overlay: WatermarkOverlay) -> "VideoBuilder":
        """Add watermark overlay."""
        self._watermark = overlay
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

    def speed_control(
        self,
        segment: Union[SpeedSegment, list[SpeedSegment], float],
    ) -> "VideoBuilder":
        """Add one or more speed segments, or a single global speed (float)."""
        if isinstance(segment, (int, float)):
            self._speed_segments.append(SpeedSegment(0, -1, float(segment)))
        elif isinstance(segment, list):
            self._speed_segments.extend(segment)
        else:
            self._speed_segments.append(segment)
        return self

    def add_background_audio(
        self,
        path: Optional[str] = None,
        mix_volume: float = 1.0,
        loop: bool = False,
        overlay: Optional[AudioOverlay] = None,
    ) -> "VideoBuilder":
        """Add background/mix-in audio."""
        if overlay is not None:
            self._background_audio = overlay
        elif path is not None:
            self._background_audio = AudioOverlay(
                path=path, mix_volume=mix_volume, loop=loop
            )
        return self

    def set_background_color(self, overlay: BackgroundColor) -> "VideoBuilder":
        """Set solid background color. only_color=True gives a full black (or colored) screen only."""
        self._background_color = overlay
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
    ) -> "VideoBuilder":
        """Compress video with optional target size (MB) and scale. Uses libx264, aac 128k."""
        self._transcode = TranscodeOptions(
            codec="libx264",
            preset=preset,
            crf=23,
            audio_codec="aac",
            audio_bitrate="128k",
            target_size_mb=target_size_mb,
            scale=scale,
        )
        return self

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

        parts: list[str] = []

        # Solid background color only (no source video)
        if self._background_color is not None and self._background_color.only_color:
            c = self._background_color.color
            parts.append(f"color=c={c}:s={w}x{h}:d={effective_duration}:r=30[bg]")
            parts.append(
                f"[0:a]atrim=start={self._trim_start or 0}:end={trim_end},asetpts=PTS-STARTPTS[a_trim]"
            )
            video_in = "[bg]"
            audio_in = "[a_trim]"
        else:
            if (
                self._background_color is not None
                and not self._background_color.only_color
            ):
                parts.append(
                    f"color=c={self._background_color.color}:s={w}x{h}:d={effective_duration}:r=30[bg];"
                )

            if self._trim_start is not None:
                parts.append(
                    f"[0:v]trim=start={self._trim_start}:end={trim_end},setpts=PTS-STARTPTS[v_trim];"
                    f"[0:a]atrim=start={self._trim_start}:end={trim_end},asetpts=PTS-STARTPTS[a_trim]"
                )
                video_in = "[v_trim]"
                audio_in = "[a_trim]"

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
            parts.append(
                f"{audio_in}[{audio_overlay_index}:a]amix=inputs=2:duration=first:weights='1 {self._background_audio.mix_volume}'[a_mix]"
            )
            audio_in = "[a_mix]"

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
            or self._watermark is not None
            or self._background_audio is not None
            or self._background_color is not None
            or opts.target_size_mb is not None
            or opts.scale is not None
        )
        if not has_filters:
            return [
                ffmpeg,
                "-i",
                self.input_path,
                "-c",
                "copy",
                "-f",
                self._video_format.value,
                "-movflags",
                "+frag_keyframe+empty_moov",
            ]
        extra_inputs, filter_complex = self._build_filter_complex(
            info.duration, info.width, info.height, opts.scale
        )
        duration_sec = info.duration or 1.0
        movflags = opts.movflags or "+frag_keyframe+empty_moov"
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
            self._video_format.value,
            "-movflags",
            movflags,
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

    async def export(self) -> AsyncGenerator[bytes, None, None]:
        """Build one ffmpeg command with all filters and stream output."""
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
        """Run export and return the whole output as bytes (full video in memory)."""
        result = bytearray()
        async for chunk in self.export():
            result.extend(chunk)
        return bytes(result)

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
        complete_callback: Optional[OnCompleteCallback] = None,
        progress_callback: Optional[ProgressCallaback] = None,
    ) -> bytes:
        """Concatenate multiple videos and return the full output as bytes."""
        result = bytearray()
        async for chunk in VideoBuilder.concat_videos(
            input_paths,
            video_format=video_format,
            complete_callback=complete_callback,
            progress_callback=progress_callback,
        ):
            result.extend(chunk)
        return bytes(result)
