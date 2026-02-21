"""Unit tests for VideoBuilder: assert the output ffmpeg commands from _build()."""

import asyncio

import pytest

from unittest.mock import patch

from modules.video_processor import (
    VideoBuilder,
    VideoInfo,
    VideoFormat,
    TextSegment,
    SpeedSegment,
    WatermarkOverlay,
    WatermarkPosition,
    AudioFormat,
    AudioOverlay,
    BackgroundColor,
    TranscodeOptions,
    GifOptions,
    KaraokeText,
    TextSequence,
    TimedText,
    _atempo_chain,
    _build_concat_manifest,
    _resolve_end_sec,
    _parse_ss_seconds,
)

# --- Fixtures and helpers ---


@pytest.fixture
def default_info() -> VideoInfo:
    """VideoInfo for tests (no real file)."""
    return VideoInfo(duration=30.0, width=1920, height=1080)


def info(duration: float = 30.0, width: int = 1920, height: int = 1080) -> VideoInfo:
    """Build VideoInfo with optional overrides."""
    return VideoInfo(duration=duration, width=width, height=height)


def cmd_get(cmd: list[str], flag: str) -> str | None:
    """Return value after flag, or None."""
    try:
        i = cmd.index(flag)
        if i + 1 < len(cmd):
            return cmd[i + 1]
    except ValueError:
        pass
    return None


def filter_complex(cmd: list[str]) -> str | None:
    """Return the -filter_complex value from cmd."""
    return cmd_get(cmd, "-filter_complex")


def assert_cmd_starts_with_ffmpeg_input(cmd: list[str], input_path: str) -> None:
    assert cmd[0] == "ffmpeg"
    assert "-i" in cmd
    assert cmd_get(cmd, "-i") == input_path


# --- _atempo_chain and _resolve_end_sec ---


class TestAtempoChain:
    def test_speed_one(self):
        assert _atempo_chain(1.0) == "atempo=1.0"

    def test_speed_half(self):
        assert _atempo_chain(0.5) == "atempo=0.5"

    def test_speed_double(self):
        assert _atempo_chain(2.0) == "atempo=2.0"

    def test_speed_four_chains(self):
        assert _atempo_chain(4.0) == "atempo=2.0,atempo=2.0"

    def test_speed_quarter_chains(self):
        assert "atempo=0.5" in _atempo_chain(0.25)
        assert _atempo_chain(0.25).count("atempo=") >= 2

    def test_speed_invalid_raises(self):
        with pytest.raises(ValueError, match="positive"):
            _atempo_chain(0)
        with pytest.raises(ValueError, match="positive"):
            _atempo_chain(-1.0)


class TestResolveEndSec:
    def test_positive_end(self):
        assert _resolve_end_sec(10.0, 30.0) == 10.0

    def test_minus_one_till_end(self):
        assert _resolve_end_sec(-1, 30.0) == 30.0


# --- Export: no filters (copy) ---


class TestExportNoFilters:
    def test_copy_no_filter_complex(self, default_info):
        b = VideoBuilder("input.mp4")
        cmd = b._build(default_info)
        assert_cmd_starts_with_ffmpeg_input(cmd, "input.mp4")
        assert cmd_get(cmd, "-c") == "copy"
        assert cmd_get(cmd, "-f") == "mp4"
        assert "-filter_complex" not in cmd

    @pytest.mark.parametrize(
        "video_format,expected_f",
        [
            (VideoFormat.MP4, "mp4"),
            (VideoFormat.MATROSKA, "matroska"),
            (VideoFormat.WEBM, "webm"),
        ],
    )
    def test_video_format_reflected_in_f(self, default_info, video_format, expected_f):
        b = VideoBuilder("in.mov", video_format=video_format)
        cmd = b._build(default_info)
        assert cmd_get(cmd, "-f") == expected_f


# --- Export: trim ---


class TestExportTrim:
    def test_trim_start_end(self, default_info):
        b = VideoBuilder("input.mp4").trim(start_sec=0, end_sec=10)
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "trim=start=0:end=10" in fc
        assert "setpts=PTS-STARTPTS" in fc

    def test_trim_duration(self, default_info):
        b = VideoBuilder("input.mp4").trim(start_sec=5, duration=15)
        cmd = b._build(info(duration=100.0))
        fc = filter_complex(cmd)
        assert fc is not None
        assert "trim=start=5:end=20" in fc

    def test_trim_end_minus_one_till_end(self, default_info):
        b = VideoBuilder("input.mp4").trim(start_sec=0, end_sec=-1)
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "trim=start=0:end=30" in fc


# --- Export: text ---


class TestExportText:
    def test_single_text_drawtext_comma_separated(self, default_info):
        b = VideoBuilder("input.mp4").add_text(
            TextSegment(start_sec=0, end_sec=-1, text="Hello", fontsize=24)
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "drawtext=" in fc
        assert "text='Hello'" in fc
        assert "enable=" in fc
        assert "fontsize=24" in fc

    def test_multiple_text_segments_comma_chain(self, default_info):
        b = VideoBuilder("input.mp4").add_text(
            [
                TextSegment(start_sec=0, end_sec=10, text="First"),
                TextSegment(start_sec=5, end_sec=15, text="Second"),
            ]
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "First" in fc and "Second" in fc
        assert ",drawtext=" in fc

    def test_text_with_styling_fontcolor_box(self, default_info):
        b = VideoBuilder("input.mp4").add_text(
            TextSegment(
                start_sec=0,
                end_sec=-1,
                text="Title",
                fontcolor="white",
                background=True,
                boxcolor="black@0.6",
                boxborderw=10,
            )
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "fontcolor=white" in fc
        assert "box=1" in fc
        assert "boxcolor=black@0.6" in fc
        assert "boxborderw=10" in fc

    def test_text_end_sec_minus_one_uses_duration(self, default_info):
        b = VideoBuilder("input.mp4").add_text(
            TextSegment(start_sec=0, end_sec=-1, text="Till end")
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        # end_sec=-1 resolves to duration (30 or 30.0 depending on float format)
        assert "between(t," in fc and "30" in fc


# --- Export: karaoke ---


class TestExportKaraoke:
    def test_karaoke_auto_timings_adds_word_overlays(self, default_info):
        b = VideoBuilder("input.mp4").add_karaoke_text(
            KaraokeText(sentence="one two", start_sec=0, end_sec=2, fontsize=30)
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "subtitles=" in fc


class TestTextSequenceValidation:
    def test_text_sequence_requires_at_least_one_item(self):
        with pytest.raises(ValueError, match="at least one item"):
            TextSequence(items=[])

    def test_text_sequence_item_end_must_be_after_start(self):
        with pytest.raises(ValueError, match="end_sec must be greater"):
            TextSequence(items=[TimedText(text="bad", start_sec=2, end_sec=1)])

    def test_text_sequence_valid_item(self):
        seq = TextSequence(items=[TimedText(text="ok", start_sec=0, end_sec=2)])
        assert len(seq.items) == 1


# --- Export: speed ---


class TestExportSpeed:
    def test_single_speed_setpts_atempo(self, default_info):
        b = VideoBuilder("input.mp4").trim(start_sec=0, end_sec=20).speed_control(1.5)
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "setpts=PTS/1.5" in fc
        assert "atempo=1.5" in fc

    def test_speed_one_no_speed_filter(self, default_info):
        b = VideoBuilder("input.mp4").trim(0, 10).speed_control(1.0)
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "setpts=PTS/1.0" not in fc or "atempo=1.0" not in fc

    def test_multiple_speed_segments_concat(self, default_info):
        b = VideoBuilder("input.mp4").speed_control(
            [
                SpeedSegment(start_sec=0, end_sec=10, speed=1.0),
                SpeedSegment(start_sec=10, end_sec=20, speed=2.0),
            ]
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "concat=" in fc
        assert "atempo" in fc

    def test_speed_gt_two_chains_atempo(self, default_info):
        b = VideoBuilder("input.mp4").speed_control(4.0)
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "atempo=2.0" in fc
        assert "atempo=2.0,atempo=2.0" in fc or fc.count("atempo=2.0") >= 2


# --- Export: watermark ---


class TestExportWatermark:
    def test_watermark_extra_input_and_overlay(self, default_info):
        b = VideoBuilder("input.mp4").add_watermark(
            WatermarkOverlay(
                path="logo.png", position=WatermarkPosition.SAFE_BOTTOM, opacity=0.7
            )
        )
        cmd = b._build(default_info)
        assert cmd.count("-i") >= 2
        assert "input.mp4" in cmd and "logo.png" in cmd
        fc = filter_complex(cmd)
        assert fc is not None
        assert "overlay=" in fc
        assert "colorchannelmixer=aa=0.7" in fc

    def test_watermark_position_reflected(self, default_info):
        b = VideoBuilder("input.mp4").add_watermark(
            WatermarkOverlay(
                path="logo.png", position=WatermarkPosition.CENTER, opacity=0.5
            )
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert WatermarkPosition.CENTER.value in fc


# --- Export: background audio ---


class TestExportBackgroundAudio:
    def test_background_audio_amix(self, default_info):
        b = VideoBuilder("input.mp4").add_background_audio(
            path="music.mp3", mix_volume=0.3
        )
        cmd = b._build(default_info)
        assert cmd.count("-i") >= 2
        assert "music.mp3" in cmd
        fc = filter_complex(cmd)
        assert fc is not None
        assert "amix=" in fc
        assert "0.3" in fc

    def test_background_audio_mute_source_false_mixes_both(self, default_info):
        """Default: source and background both play (weight 1 for source)."""
        b = VideoBuilder("input.mp4").add_background_audio(
            AudioOverlay(path="music.mp3", mix_volume=0.5, mute_source=False)
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "amix=" in fc
        # weights='1 0.5' = source at 1, background at 0.5
        assert "weights='1 0.5'" in fc

    def test_background_audio_mute_source_true_silences_source(self, default_info):
        """mute_source=True: only background plays (weight 0 for source)."""
        b = VideoBuilder("input.mp4").add_background_audio(
            AudioOverlay(path="music.mp3", mix_volume=0.5, mute_source=True)
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "amix=" in fc
        # weights='0 0.5' = source muted, only background at 0.5
        assert "weights='0 0.5'" in fc

    def test_background_audio_mute_source_with_watermark(self, default_info):
        """mute_source works when watermark is also present (extra input order)."""
        b = (
            VideoBuilder("input.mp4")
            .add_watermark(WatermarkOverlay(path="logo.png"))
            .add_background_audio(
                AudioOverlay(path="music.mp3", mix_volume=0.7, mute_source=True)
            )
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "weights='0 0.7'" in fc

    @patch("modules.video_processor._get_media_duration", return_value=60.0)
    def test_background_audio_longer_extends_video_with_tpad(
        self, mock_dur, default_info
    ):
        """When background audio (60s) is longer than video (30s), extend video with tpad."""
        b = VideoBuilder("input.mp4").add_background_audio(
            path="long_music.mp3", mix_volume=0.5
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        # Video is 30s, audio 60s → pad 30s with last frame
        assert "tpad=" in fc
        assert "stop_duration=30" in fc
        assert "stop_mode=clone" in fc
        assert "duration=longest" in fc

    @patch("modules.video_processor._get_media_duration", return_value=60.0)
    def test_background_audio_longer_extends_only_color_canvas(
        self, mock_dur, default_info
    ):
        """When only_color and audio longer, color canvas uses extended duration."""
        b = (
            VideoBuilder("input.mp4")
            .set_background_color(BackgroundColor(color="black", only_color=True))
            .add_background_audio(path="long_music.mp3", mix_volume=0.5)
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        # Color filter d= should be 60 (audio length), not 30 (video)
        assert "color=c=black" in fc
        assert "d=60" in fc

    @patch("modules.video_processor._get_media_duration", return_value=60.0)
    def test_explicit_trim_respected_no_extend_when_audio_longer(
        self, mock_dur, default_info
    ):
        """When trim is explicit (end_sec=40), do NOT extend video even if audio is 60s."""
        b = (
            VideoBuilder("input.mp4")
            .trim(start_sec=0, end_sec=40)
            .add_background_audio(path="long_music.mp3", mix_volume=0.5)
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        # No tpad (video stays 40s, not extended to 60s)
        assert "tpad=" not in fc
        # Mix is trimmed to 40s so audio plays for full trim duration (no silence at end)
        assert "atrim=start=0:end=40" in fc

    @patch("modules.video_processor._get_media_duration", return_value=60.0)
    def test_mute_source_explicit_trim_uses_only_background_audio(
        self, mock_dur, default_info
    ):
        """When mute_source + trim to 40s, use only background audio (no source). Plays full 40s."""
        b = (
            VideoBuilder("input.mp4")
            .trim(start_sec=0, end_sec=40)
            .add_background_audio(
                AudioOverlay(path="long_music.mp3", mix_volume=0.5, mute_source=True)
            )
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        # Uses only [1:a] (background), no amix with source
        assert "[1:a]atrim=start=0:end=40" in fc
        assert "volume=0.5" in fc

    def test_only_color_mute_source_trim_no_unconnected_a_trim(self, default_info):
        """only_color + mute_source + trim: must not create [a_trim] (causes unconnected output)."""
        b = (
            VideoBuilder("input.mp4")
            .trim(start_sec=0, end_sec=40)
            .set_background_color(BackgroundColor(color="black", only_color=True))
            .add_background_audio(
                AudioOverlay(path="music.mp3", mix_volume=0.5, mute_source=True)
            )
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        # Must use only [1:a], no [0:a]atrim->[a_trim] (which would be orphaned)
        assert "[1:a]atrim=start=0:end=40" in fc
        # No amix (we use background only)
        assert "amix=" not in fc


# --- Export: background color ---


class TestExportBackgroundColor:
    def test_only_color_black_screen(self, default_info):
        b = VideoBuilder("input.mp4").set_background_color(
            BackgroundColor(color="black", only_color=True)
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "color=c=black" in fc
        assert "s=1920x1080" in fc

    def test_video_on_color_background(self, default_info):
        b = (
            VideoBuilder("input.mp4")
            .trim(0, 5)
            .set_background_color(BackgroundColor(color="0x333333", only_color=False))
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "color=c=0x333333" in fc
        assert "[bg]" in fc and "overlay=" in fc


# --- Export: transcode / compress ---


class TestExportTranscode:
    def test_transcode_kwargs(self, default_info):
        b = (
            VideoBuilder("input.mp4")
            .trim(start_sec=0, end_sec=5)
            .transcode(codec="libx264", preset="fast", crf=26, audio_codec="aac")
        )
        cmd = b._build(default_info)
        assert cmd_get(cmd, "-c:v") == "libx264"
        assert cmd_get(cmd, "-preset") == "fast"
        assert cmd_get(cmd, "-crf") == "26"
        assert cmd_get(cmd, "-c:a") == "aac"

    def test_transcode_options_object(self, default_info):
        b = (
            VideoBuilder("input.mp4")
            .trim(0, 5)
            .transcode(
                options=TranscodeOptions(
                    codec="libx264", preset="slow", crf=18, audio_bitrate="192k"
                )
            )
        )
        cmd = b._build(default_info)
        assert cmd_get(cmd, "-preset") == "slow"
        assert cmd_get(cmd, "-crf") == "18"
        assert cmd_get(cmd, "-b:a") == "192k"

    def test_compress_target_size_mb(self, default_info):
        b = VideoBuilder("input.mp4").trim(0, 10).compress(target_size_mb=5.0)
        cmd = b._build(info(duration=30.0))
        assert "-b:v" in cmd
        assert "-maxrate" in cmd
        assert "-bufsize" in cmd
        bv = cmd_get(cmd, "-b:v")
        assert bv is not None and bv.endswith("k")

    def test_compress_scale_in_filter(self, default_info):
        b = VideoBuilder("input.mp4").compress(scale="1280:-1")
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "scale=1280:-1" in fc

    def test_compress_preset(self, default_info):
        b = VideoBuilder("input.mp4").trim(0, 5).compress(preset="fast")
        cmd = b._build(default_info)
        assert cmd_get(cmd, "-preset") == "fast"


# --- Export: combined pipeline ---


class TestExportCombined:
    def test_trim_text_watermark_speed_single_cmd(self, default_info):
        b = (
            VideoBuilder("input.mp4")
            .trim(start_sec=0, end_sec=30)
            .add_text(TextSegment(start_sec=0, end_sec=-1, text="Title"))
            .speed_control(1.5)
            .add_watermark(WatermarkOverlay(path="logo.png"))
        )
        cmd = b._build(default_info)
        assert "-filter_complex" in cmd
        fc = filter_complex(cmd)
        assert fc is not None
        assert "trim=" in fc
        assert "drawtext=" in fc
        assert "setpts=PTS/1.5" in fc
        assert "atempo=1.5" in fc
        assert "overlay=" in fc
        assert "-map" in cmd
        assert "[v_out]" in cmd and "[a_out]" in cmd


# --- Extract audio ---


class TestExtractAudio:
    def test_default_mp3_no_filter(self, default_info):
        b = VideoBuilder("input.mp4")
        cmd = b._build(default_info, "extract_audio")
        assert_cmd_starts_with_ffmpeg_input(cmd, "input.mp4")
        assert "-vn" in cmd
        assert cmd_get(cmd, "-c:a") == "libmp3lame"
        assert cmd_get(cmd, "-f") == "mp3"
        assert cmd_get(cmd, "-b:a") == "192k"
        assert "-filter_complex" not in cmd

    @pytest.mark.parametrize(
        "audio_format,expected_codec,expected_f",
        [
            (AudioFormat.AAC, "aac", "ipod"),
            (AudioFormat.WAV, "pcm_s16le", "wav"),
            (AudioFormat.FLAC, "flac", "flac"),
        ],
    )
    def test_constructor_audio_format(
        self, default_info, audio_format, expected_codec, expected_f
    ):
        b = VideoBuilder("input.mp4", audio_format=audio_format)
        cmd = b._build(default_info, "extract_audio")
        assert cmd_get(cmd, "-c:a") == expected_codec
        assert cmd_get(cmd, "-f") == expected_f

    def test_trim_from_builder_ss_t(self, default_info):
        b = VideoBuilder("input.mp4").trim(start_sec=10, end_sec=25)
        cmd = b._build(info(duration=60.0), "extract_audio")
        assert cmd_get(cmd, "-ss") == "10"
        assert cmd_get(cmd, "-t") == "15"

    def test_trim_duration_from_builder(self, default_info):
        b = VideoBuilder("input.mp4").trim(start_sec=0, duration=45.0)
        cmd = b._build(default_info, "extract_audio")
        assert cmd_get(cmd, "-t") == "45.0"

    def test_audio_bitrate_from_constructor(self, default_info):
        b = VideoBuilder("input.mp4", audio_bitrate="256k")
        cmd = b._build(default_info, "extract_audio")
        assert cmd_get(cmd, "-b:a") == "256k"

    def test_speed_uses_filter_complex_atempo(self, default_info):
        b = VideoBuilder("input.mp4").speed_control(1.5)
        cmd = b._build(default_info, "extract_audio")
        assert "-filter_complex" in cmd
        fc = filter_complex(cmd)
        assert "atempo=1.5" in fc

    def test_trim_and_speed_filter_complex(self, default_info):
        b = VideoBuilder("input.mp4").trim(5, 20).speed_control(2.0)
        cmd = b._build(default_info, "extract_audio")
        assert "-filter_complex" in cmd
        fc = filter_complex(cmd)
        assert "atrim=" in fc
        assert "atempo=" in fc
        assert "-map" in cmd
        assert "[a_out]" in cmd

    def test_extract_audio_multiple_speed_segments(self, default_info):
        b = VideoBuilder("input.mp4").speed_control(
            [
                SpeedSegment(start_sec=0, end_sec=10, speed=1.0),
                SpeedSegment(start_sec=10, end_sec=20, speed=1.5),
            ]
        )
        cmd = b._build(default_info, "extract_audio")
        fc = filter_complex(cmd)
        assert fc is not None
        assert "concat=" in fc
        assert "atempo" in fc


# --- Builder load (JSON ops) ---


class TestBuilderLoad:
    def test_load_audio_with_mute_source(self, default_info):
        """load() applies audio op with mute_source from JSON data."""
        b = VideoBuilder("input.mp4").load(
            "audio",
            data={
                "path": "bg.mp3",
                "mix_volume": 0.4,
                "loop": False,
                "mute_source": True,
            },
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "weights='0 0.4'" in fc

    def test_load_audio_without_mute_source_defaults_to_mix(self, default_info):
        """load() with no mute_source mixes source + background (weight 1)."""
        b = VideoBuilder("input.mp4").load(
            "audio",
            data={"path": "bg.mp3", "mix_volume": 0.8},
        )
        cmd = b._build(default_info)
        fc = filter_complex(cmd)
        assert fc is not None
        assert "weights='1 0.8'" in fc


# --- Builder chaining ---


class TestBuilderChaining:
    def test_trim_returns_self(self):
        b = VideoBuilder("x.mp4")
        assert b.trim(0, 10) is b

    def test_add_text_returns_self(self):
        b = VideoBuilder("x.mp4")
        assert b.add_text(TextSegment(start_sec=0, end_sec=5, text="Hi")) is b

    def test_speed_control_returns_self(self):
        b = VideoBuilder("x.mp4")
        assert b.speed_control(1.5) is b

    def test_add_watermark_returns_self(self):
        b = VideoBuilder("x.mp4")
        assert b.add_watermark(WatermarkOverlay(path="l.png")) is b

    def test_transcode_returns_self(self):
        b = VideoBuilder("x.mp4")
        assert b.transcode(crf=28) is b

    def test_compress_returns_self(self):
        b = VideoBuilder("x.mp4")
        assert b.compress(scale="640:-1") is b

    def test_create_gif_returns_self(self):
        b = VideoBuilder("x.mp4")
        opts = GifOptions(start_time="00:00:01", duration=5, fps=10, scale=480)
        assert b.create_gif(opts) is b
        assert b._gif_options is opts


# --- GIF ---


class TestParseSsSeconds:
    def test_zero(self):
        assert _parse_ss_seconds("00:00:00") == 0.0

    def test_one_minute(self):
        assert _parse_ss_seconds("00:01:00") == 60.0

    def test_hms(self):
        assert _parse_ss_seconds("01:30:45") == 3600 + 30 * 60 + 45

    def test_with_ms(self):
        assert _parse_ss_seconds("00:00:01.5") == 1.5


class TestGifBuild:
    def test_build_gif_cmd_defaults(self):
        b = VideoBuilder("input.mp4")
        b._gif_options = GifOptions()
        cmd = b._build_gif_cmd()
        assert "-ss" in cmd
        assert cmd[cmd.index("-ss") + 1] == "00:00:00"
        assert "-t" in cmd
        assert cmd[cmd.index("-t") + 1] == "5"
        assert "-i" in cmd
        assert cmd[cmd.index("-i") + 1] == "input.mp4"
        assert "fps=10" in cmd[cmd.index("-vf") + 1]
        assert "scale=480" in cmd[cmd.index("-vf") + 1]
        assert "palettegen" in cmd[cmd.index("-vf") + 1]
        assert "-loop" in cmd
        assert cmd[cmd.index("-loop") + 1] == "0"
        assert "-f" in cmd
        assert cmd[cmd.index("-f") + 1] == "gif"

    def test_build_gif_cmd_custom(self):
        b = VideoBuilder("video.mov")
        b._gif_options = GifOptions(
            start_time="00:01:30",
            duration=3,
            fps=8,
            scale=320,
        )
        cmd = b._build_gif_cmd()
        assert cmd[cmd.index("-ss") + 1] == "00:01:30"
        assert cmd[cmd.index("-t") + 1] == "3"
        vf = cmd[cmd.index("-vf") + 1]
        assert "fps=8" in vf
        assert "scale=320" in vf


# --- Concat ---


class TestConcatManifest:
    def test_manifest_two_paths(self):
        manifest = _build_concat_manifest(["a.mp4", "b.mp4"])
        lines = manifest.strip().split("\n")
        assert len(lines) == 2
        assert lines[0] == "file 'a.mp4'"
        assert lines[1] == "file 'b.mp4'"
        assert manifest.endswith("\n")

    def test_manifest_escapes_single_quotes(self):
        manifest = _build_concat_manifest(["path/with'quote.mp4"])
        assert "file '" in manifest
        assert "''" in manifest or "'\\''" in manifest


class TestConcatVideos:
    def test_requires_at_least_two_paths_empty(self):
        with pytest.raises(ValueError, match="at least 2"):
            asyncio.run(VideoBuilder.concat_videos([]).__anext__())

    def test_requires_at_least_two_paths_one(self):
        async def run():
            async for _ in VideoBuilder.concat_videos(["only.mp4"]):
                pass

        with pytest.raises(ValueError, match="at least 2"):
            asyncio.run(run())
