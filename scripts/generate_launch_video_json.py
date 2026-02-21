#!/usr/bin/env python3
"""
Generate the Clipper launch video JSON from the AI Director specification.

This produces the operations array compatible with the VideoBuilder DSL
(FFmpeg-based video engine). Follows the 6-act story arc from instructions.md:

  Hook → Problem Build-up → Reveal → Features Flow → Hero Moment → CTA Ending

Usage:
  python scripts/generate_launch_video_json.py
  python scripts/generate_launch_video_json.py --output launch_spec.json

Output format matches VideoEditRequest:
  { "media": "...", "operations": [ { "op": "...", ... } ] }
"""

import json
import argparse
from pathlib import Path


def generate_launch_video_operations(
    media: str = "",
    audio_path: str = "poco_loco.mp3",
    total_duration_sec: float = 40.0,
) -> dict:
    """
    Build the operations list for a 30–40 second Clipper launch video.
    Think like an Apple product launch trailer, not subtitles.
    """
    ops = []

    # --- Trim to 40 seconds ---
    ops.append({"op": "trim", "start_sec": 0, "end_sec": 40})

    # --- Background: black, no source video (only_color) ---
    ops.append(
        {
            "op": "backgroundColor",
            "overlay": {"color": "black", "only_color": True},
        }
    )

    # --- Audio: background music (mute source media so only music plays) ---
    ops.append(
        {
            "op": "audio",
            "path": audio_path,
            "mix_volume": 0.5,
            "mute_source": True,
        }
    )

    # --- ACT 1: HOOK (0–4s) — Create curiosity ---
    # Dark background, minimal text, slow appearance, one phrase at a time
    ops.append(
        {
            "op": "textSequence",
            "items": [
                {
                    "text": "Editing videos is slow.",
                    "start_sec": 0.0,
                    "end_sec": 1.5,
                    "fontsize": 52,
                    "fontcolor": "white",
                    "fade_in_ms": 300,
                    "fade_out_ms": 300,
                },
                {
                    "text": "Cloud editors leak privacy.",
                    "start_sec": 1.5,
                    "end_sec": 3.0,
                    "fontsize": 52,
                    "fontcolor": "white",
                    "fade_in_ms": 300,
                    "fade_out_ms": 300,
                },
                {
                    "text": "Rendering takes forever.",
                    "start_sec": 3.0,
                    "end_sec": 4.5,
                    "fontsize": 52,
                    "fontcolor": "white",
                    "fade_in_ms": 300,
                    "fade_out_ms": 300,
                },
            ],
        }
    )

    # --- ACT 2: PROBLEM BUILDUP (4–10s) — Music energy rising ---
    # Pain points rapidly, 0.5–1s per word, match beat rhythm
    ops.append(
        {
            "op": "textSequence",
            "items": [
                {
                    "text": "Uploading...",
                    "start_sec": 4.5,
                    "end_sec": 5.2,
                    "fontsize": 48,
                    "fontcolor": "white",
                    "fade_in_ms": 150,
                    "fade_out_ms": 150,
                },
                {
                    "text": "Waiting...",
                    "start_sec": 5.2,
                    "end_sec": 5.9,
                    "fontsize": 48,
                    "fontcolor": "white",
                    "fade_in_ms": 150,
                    "fade_out_ms": 150,
                },
                {
                    "text": "Rendering...",
                    "start_sec": 5.9,
                    "end_sec": 6.6,
                    "fontsize": 48,
                    "fontcolor": "white",
                    "fade_in_ms": 150,
                    "fade_out_ms": 150,
                },
                {
                    "text": "Retrying...",
                    "start_sec": 6.6,
                    "end_sec": 7.3,
                    "fontsize": 48,
                    "fontcolor": "white",
                    "fade_in_ms": 150,
                    "fade_out_ms": 150,
                },
            ],
        }
    )

    # --- ACT 3: REVEAL (10–15s) — Music drop moment ---
    # BIG reveal, larger font, longer duration, cinematic pause
    ops.append(
        {
            "op": "textSequence",
            "items": [
                {
                    "text": "Meet Clipper.",
                    "start_sec": 10.0,
                    "end_sec": 12.5,
                    "fontsize": 72,
                    "fontcolor": "white",
                    "fade_in_ms": 400,
                    "fade_out_ms": 400,
                },
                {
                    "text": "Your Local AI Video Editor.",
                    "start_sec": 12.5,
                    "end_sec": 15.0,
                    "fontsize": 64,
                    "fontcolor": "white",
                    "fade_in_ms": 400,
                    "fade_out_ms": 400,
                },
            ],
        }
    )

    # --- ACT 4: FEATURES FLOW (15–28s) — One feature per beat ---
    ops.append(
        {
            "op": "textSequence",
            "items": [
                {
                    "text": "Edit locally",
                    "start_sec": 15.0,
                    "end_sec": 17.0,
                    "fontsize": 56,
                    "fontcolor": "white",
                    "fade_in_ms": 200,
                    "fade_out_ms": 200,
                },
                {
                    "text": "AI-powered workflows",
                    "start_sec": 17.0,
                    "end_sec": 19.0,
                    "fontsize": 56,
                    "fontcolor": "white",
                    "fade_in_ms": 200,
                    "fade_out_ms": 200,
                },
                {
                    "text": "Instant rendering",
                    "start_sec": 19.0,
                    "end_sec": 21.0,
                    "fontsize": 56,
                    "fontcolor": "white",
                    "fade_in_ms": 200,
                    "fade_out_ms": 200,
                },
                {
                    "text": "Programmable video pipelines",
                    "start_sec": 21.0,
                    "end_sec": 23.5,
                    "fontsize": 56,
                    "fontcolor": "white",
                    "fade_in_ms": 200,
                    "fade_out_ms": 200,
                },
                {
                    "text": "No uploads required",
                    "start_sec": 23.5,
                    "end_sec": 26.0,
                    "fontsize": 56,
                    "fontcolor": "white",
                    "fade_in_ms": 200,
                    "fade_out_ms": 200,
                },
            ],
        }
    )

    # --- ACT 5: HERO MOMENT (28–35s) — Karaoke-style highlight ---
    ops.append(
        {
            "op": "karaoke",
            "sentence": "Create videos at the speed of thought.",
            "start_sec": 28.0,
            "end_sec": 35.0,
            "fontsize": 60,
            "fontcolor": "white",
            "highlight_fontcolor": "yellow",
        }
    )

    # --- ACT 6: CTA ENDING (35–40s) — Final branding ---
    ops.append(
        {
            "op": "textSequence",
            "items": [
                {
                    "text": "Clipper",
                    "start_sec": 35.0,
                    "end_sec": 37.0,
                    "fontsize": 64,
                    "fontcolor": "white",
                    "fade_in_ms": 300,
                    "fade_out_ms": 300,
                },
                {
                    "text": "Edit. Generate. Ship.",
                    "start_sec": 37.0,
                    "end_sec": 40.0,
                    "fontsize": 52,
                    "fontcolor": "white",
                    "fade_in_ms": 300,
                    "fade_out_ms": 300,
                },
            ],
        }
    )

    # --- Compress output to target size ---
    ops.append(
        {
            "op": "compress",
            "target_size_mb": 10,
            "preset": "medium",
        }
    )

    # Optional: add watermark/logo if you have a path
    # ops.append({
    #     "op": "watermark",
    #     "overlay": {"path": "logo.png", "position": "SAFE_BOTTOM", "opacity": 0.8},
    # })

    return {
        "media": media,
        "operations": ops,
    }


def main():
    parser = argparse.ArgumentParser(description="Generate Clipper launch video JSON")
    parser.add_argument(
        "--media",
        default="",
        help="Input media URL/path (empty for color-only background)",
    )
    parser.add_argument(
        "--audio",
        default="http://minik:9000/primary/youtube_34b2e0aed8d2404f9456517c7cecd982_youtube_download_61567_1771677315022_abe66cb3_audio_7c41bc17-1552-405f-8d62-4c61d0c06827_0.mp3?AWSAccessKeyId=minio-root-user&Signature=3yD1ktZXbwZngfvy3w15mfKoRpo%3D&Expires=1771685731",
        help="Background music path",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Write JSON to file (default: stdout)",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indent (default: 2)",
    )
    args = parser.parse_args()

    spec = generate_launch_video_operations(
        media=args.media,
        audio_path=args.audio,
    )
    json_str = json.dumps(spec, indent=args.indent)

    if args.output:
        Path(args.output).write_text(json_str, encoding="utf-8")
        print(f"Wrote {args.output}")
    else:
        print(json_str)


if __name__ == "__main__":
    main()
