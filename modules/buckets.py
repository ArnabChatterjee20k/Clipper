import boto3, botocore
import asyncio
from urllib.parse import urlparse
from typing import BinaryIO
import os

PRIMARY_BUCKET = "primary"

env_mode = os.getenv("CLIPPER_ENV", "dev").lower()
is_in_container = env_mode == "production"


def get_client():
    endpoint_url = os.getenv("CLIPPER_MINIK_ENDPOINT_URL", "http://localhost:9000")
    access_key_id = os.getenv("CLIPPER_AWS_ACCESS_KEY_ID")
    secret_access_key = os.getenv("CLIPPER_AWS_SECRET_ACCESS_KEY")

    return boto3.client(
        "s3",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        endpoint_url=endpoint_url,
    )


async def load_buckets():
    await create_bucket(PRIMARY_BUCKET)


# not a public bucket
async def create_bucket(bucketname: str):
    client = get_client()
    try:
        await asyncio.to_thread(
            lambda a: client.head_bucket(Bucket=bucketname), bucketname
        )
        return True
    except botocore.exceptions.ClientError as e:
        error_code = int(e.response["Error"]["Code"])
        if error_code == 404:
            await asyncio.to_thread(lambda a: client.create_bucket(Bucket=bucketname))
            return True
    return False


async def upload_file(
    file: BinaryIO, bucketname: str = PRIMARY_BUCKET, filename: str = None
):
    client = get_client()
    # Ensure file position is at the beginning for upload
    if hasattr(file, "seek"):
        file.seek(0)
    await asyncio.to_thread(
        lambda: client.upload_fileobj(
            file,
            bucketname,
            filename if filename else (file.name if hasattr(file, "name") else None),
        )
    )
    return True


def get_url(filename: str, bucketname: str, upload=False):
    # https://stackoverflow.com/questions/65198959/aws-s3-generate-presigned-url-vs-generate-presigned-post-for-uploading-files
    # put_object for upload
    if not filename:
        raise ValueError("filename must be a non-empty string for presigned URL")
    client = get_client()
    url: str = client.generate_presigned_url(
        "get_object" if not upload else "put_object",
        Params={"Bucket": bucketname, "Key": filename},
        ExpiresIn=7200,
    )
    return url


def get_filename_from_url(url: str) -> str:
    """Extract filename from URL, handling YouTube URLs and presigned URLs."""
    parsed_url = urlparse(url)

    # Handle YouTube URLs - extract video ID or use a default name
    if "youtube.com" in parsed_url.netloc or "youtu.be" in parsed_url.netloc:
        # Try to extract video ID from query params
        from urllib.parse import parse_qs

        query_params = parse_qs(parsed_url.query)
        if "v" in query_params:
            video_id = query_params["v"][0]
            return f"youtube_{video_id}"
        # For youtu.be short URLs, the ID is in the path
        if "youtu.be" in parsed_url.netloc:
            video_id = parsed_url.path.lstrip("/")
            if video_id:
                return f"youtube_{video_id}"
        return "youtube_video"

    # For presigned URLs or regular URLs, extract filename from path
    path = parsed_url.path
    if path:
        filename = path.split("/")[-1]
        # Remove query string if present in filename (shouldn't happen but be safe)
        if "?" in filename:
            filename = filename.split("?")[0]
        if filename:
            return filename

    # Fallback: generate a name from the URL
    return "video"


async def delete_file(filename: str, bucketname: str = PRIMARY_BUCKET) -> None:
    """Remove object from S3. No-op if object does not exist."""
    client = get_client()
    await asyncio.to_thread(
        lambda: client.delete_object(Bucket=bucketname, Key=filename)
    )
