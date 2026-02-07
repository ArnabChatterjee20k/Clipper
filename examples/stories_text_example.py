"""
Stories-style text overlay example (Instagram/Stories-like).

Creates a video with centered text on a solid colored bar, like:
  "Weekend coming at you like.." on a yellow background.

Usage:
  python examples/stories_text_example.py [input_video.mp4] [output.mp4]

  Or set INPUT_URL / OUTPUT_PATH; with no args uses a default input and
  writes to stories_output.mp4 in the current directory.
"""

import asyncio
import io
import sys
from pathlib import Path

# Add project root so we can import modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.video_processor import VideoProcessor, VideoBuilder, TextSegment

# Stories-style: solid bar + text color
STORIES_STYLE = {
    "fontsize": 42,
    "x": "(w-tw)/2",  # center horizontally
    "y": "(h-th)/2",  # center vertically (use "h-th-80" for lower-third)
    "fontcolor": "black",
    "background": True,
    "boxcolor": "yellow@1",  # solid yellow bar (0xFFD700@1 for gold)
    "boxborderw": 14,
}


async def main():
    input_path = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "http://minik:9000/primary/BigBuckBunny.mp4?AWSAccessKeyId=minio-root-user&Signature=rUSlbfIv3E%2BcQg783FlBoeDIhqI%3D&Expires=1769885543"
    )
    output_path = sys.argv[2] if len(sys.argv) > 2 else "stories_output.mp4"

    processor = VideoProcessor(
        complete_callaback=lambda r: print("Done:", r),
        progress_callback=lambda p: print(f"Progress: {p:.0f}%", end="\r"),
    )

    # Stories-like: one line on a yellow bar, visible from 0s to end
    segments = [
        TextSegment(
            start_sec=0,
            end_sec=-1,  # till end
            text="Weekend coming at you like..",
            **STORIES_STYLE,
        ),
    ]

    # One-shot API (uses builder under the hood)
    # Alternative builder API: async for chunk in (VideoBuilder(input_path).add_text(segments).export()): ...
    # Optional: second line at a different time (e.g. lower third)
    # segments.append(
    #     TextSegment(
    #         start_sec=5,
    #         end_sec=15,
    #         text="Say hi!",
    #         fontsize=36,
    #         x="(w-tw)/2",
    #         y="h-th-80",
    #         fontcolor="white",
    #         background=True,
    #         boxcolor="black@0.6",
    #         boxborderw=10,
    #     ),
    # )

    result = bytearray()
    async for chunk in processor.add_text(input_path, segments):
        result.extend(chunk)

    with open(output_path, "wb") as f:
        f.write(result)

    print(f"\nWrote {len(result)} bytes to {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
