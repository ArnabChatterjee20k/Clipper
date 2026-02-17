import asyncio
import os
import tempfile
from datetime import datetime
from io import BytesIO
from typing import Optional, Union
from uuid import uuid4

import yt_dlp

from .buckets import PRIMARY_BUCKET, get_url, upload_file
from .logger import logger
from pydantic import BaseModel


class YouTubeDownloadOptions(BaseModel):
    """Options for downloading video from YouTube."""

    quality: Optional[str] = "best"  # e.g., "best", "worst", "720p", "1080p", etc.
    format: Optional[str] = None  # e.g., "mp4", "webm", etc.
    audio_only: bool = False  # if True, download only audio


async def download_youtube_to_bucket(
    youtube_url: str, opts: Union[YouTubeDownloadOptions, dict]
) -> tuple[str, str]:
    """Download video from YouTube using yt-dlp and upload to the primary bucket.

    Returns a presigned URL pointing at the uploaded object.
    """
    if not youtube_url:
        raise RuntimeError("YouTube URL must be provided for download")

    # Normalize options
    if not isinstance(opts, YouTubeDownloadOptions):
        opts = YouTubeDownloadOptions.model_validate(opts or {})

    # Track downloaded filename from yt-dlp progress hook
    downloaded_filename = [None]

    # Base yt-dlp options
    ydl_opts: dict = {
        "quiet": False,
        "no_warnings": False,
        "nooverwrites": False,  # Allow overwriting existing files
        "nopart": True,  # Don't use .part files (prevents issues with incomplete downloads)
        "writethumbnail": False,
        "writesubtitles": False,
        "writeautomaticsub": False,
        "ignoreerrors": False,
    }

    # Determine output format / quality
    if opts.audio_only:
        ydl_opts["format"] = "bestaudio/best"
        ydl_opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
            }
        ]
        file_ext = "mp3"
    elif opts.format:
        ydl_opts["format"] = (
            f"bestvideo[ext={opts.format}]+bestaudio[ext={opts.format}]/best[ext={opts.format}]/best"
        )
        file_ext = opts.format
    elif opts.quality and opts.quality != "best":
        # Handle quality strings like "720p", "1080p", etc.
        if opts.quality.endswith("p"):
            height = opts.quality[:-1]
            ydl_opts["format"] = (
                f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
            )
        else:
            ydl_opts["format"] = opts.quality
        file_ext = "mp4"
    else:
        file_ext = "mp4"

    # Capture filename from yt-dlp
    def progress_hook(d):
        if d.get("status") == "finished":
            downloaded_filename[0] = d.get("filename")

    ydl_opts["progress_hooks"] = [progress_hook]

    logger.info(f"Downloading from YouTube: {youtube_url} with options: {ydl_opts}")

    # Create a unique temp base path for yt-dlp output
    temp_dir = tempfile.gettempdir()
    unique_id = f"{int(datetime.now().timestamp() * 1000)}_{uuid4().hex[:8]}"
    temp_base = os.path.join(temp_dir, f"youtube_download_{os.getpid()}_{unique_id}")
    temp_path_template = f"{temp_base}.%(ext)s"

    # Clean up any existing files for this pattern
    cleanup_extensions = ["mp4", "webm", "mkv", "mp3", "m4a", "part", "ytdl"]
    for ext in cleanup_extensions:
        candidate = f"{temp_base}.{ext}"
        if os.path.exists(candidate):
            try:
                file_size = os.path.getsize(candidate)
                os.unlink(candidate)
                logger.info(
                    f"Cleaned up existing temp file: {candidate} ({file_size} bytes)"
                )
            except Exception as e:
                logger.warning(f"Failed to clean up {candidate}: {e}")

    # Glob cleanup for any other artifacts
    try:
        import glob

        pattern = f"{temp_base}.*"
        for existing_file in glob.glob(pattern):
            try:
                if os.path.exists(existing_file):
                    os.unlink(existing_file)
                    logger.info(f"Cleaned up existing file: {existing_file}")
            except Exception as e:
                logger.warning(f"Failed to clean up {existing_file}: {e}")
    except Exception as e:
        logger.warning(f"Failed to glob cleanup: {e}")

    # Point yt-dlp at the temp path template
    ydl_opts["outtmpl"] = temp_path_template

    def _download_sync() -> Optional[str]:
        """Blocking part of the download, executed in a thread."""
        import glob

        pattern = f"{temp_base}.*"

        # Ensure we start from a clean slate
        for existing_file in glob.glob(pattern):
            try:
                if os.path.exists(existing_file):
                    file_size = os.path.getsize(existing_file)
                    os.unlink(existing_file)
                    logger.info(
                        f"Removed existing file before download: {existing_file} ({file_size} bytes)"
                    )
            except Exception as e:
                logger.warning(f"Failed to remove {existing_file}: {e}")

        # Double-check nothing is left
        remaining_files = glob.glob(pattern)
        if remaining_files:
            logger.warning(f"Files still exist before download: {remaining_files}")
            for f in remaining_files:
                try:
                    os.unlink(f)
                except Exception:
                    pass

        logger.info(f"Starting yt-dlp download to: {temp_path_template}")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])

            # First, try the explicit filename from the hook
            if downloaded_filename[0] and os.path.exists(downloaded_filename[0]):
                file_path = downloaded_filename[0]
                if os.path.getsize(file_path) > 0:
                    return file_path
                logger.warning(f"Downloaded file is empty: {file_path}")

            # Fall back to checking common extensions
            for ext in ["mp4", "webm", "mkv", "mp3", "m4a", file_ext]:
                candidate = f"{temp_base}.{ext}"
                if os.path.exists(candidate):
                    file_size = os.path.getsize(candidate)
                    if file_size > 0:
                        return candidate
                    logger.warning(f"Found file but it's empty: {candidate}")

        return None

    downloaded_path = await asyncio.to_thread(_download_sync)

    if not downloaded_path or not os.path.exists(downloaded_path):
        raise RuntimeError(
            f"Could not determine downloaded file path for YouTube URL: {youtube_url}"
        )

    file_size = os.path.getsize(downloaded_path)
    if file_size == 0:
        raise RuntimeError(f"Downloaded file is empty (0 bytes): {downloaded_path}")

    logger.info(
        f"Downloaded YouTube video to temp file: {downloaded_path} ({file_size} bytes)"
    )

    # Read the downloaded file into memory and prepare for upload
    def _read_and_prepare_upload():
        with open(downloaded_path, "rb") as f:
            file_data = f.read()
        size = len(file_data)
        logger.info(f"Read {size} bytes from downloaded file: {downloaded_path}")
        if size == 0:
            raise RuntimeError(f"Downloaded file is empty: {downloaded_path}")

        filename = f"youtube_{uuid4().hex}_{os.path.basename(downloaded_path)}"
        buffer = BytesIO(file_data)
        buffer.name = filename
        buffer.seek(0)
        return buffer, filename, size

    buffer, filename, file_size = await asyncio.to_thread(_read_and_prepare_upload)

    # Upload to bucket
    buffer.seek(0)
    logger.info(f"Uploading {file_size} bytes to bucket as {filename}")
    await upload_file(buffer, PRIMARY_BUCKET, filename)
    logger.info(f"Uploaded YouTube video ({file_size} bytes) to bucket: {filename}")

    # Get presigned URL
    presigned_url = get_url(filename, PRIMARY_BUCKET)
    logger.info(f"Generated presigned URL for YouTube video: {presigned_url}")

    # Best-effort cleanup of temp file
    try:
        os.unlink(downloaded_path)
        logger.info(f"Cleaned up temp file: {downloaded_path}")
    except Exception as e:
        logger.warning(f"Failed to clean up temp file {downloaded_path}: {e}")

    return filename, presigned_url
