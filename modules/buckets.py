import boto3, botocore
import asyncio
from urllib.parse import urlparse
from typing import BinaryIO

PRIMARY_BUCKET = "primary"


def get_client():
    return boto3.client(
        "s3",
        aws_access_key_id="minio-root-user",
        aws_secret_access_key="minio-root-password",
        endpoint_url="http://localhost:9000",
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
    await asyncio.to_thread(
        lambda: client.upload_fileobj(file, bucketname, filename if file else file.name)
    )
    return True


def get_url(filename: str, bucketname: str, upload=False):
    # https://stackoverflow.com/questions/65198959/aws-s3-generate-presigned-url-vs-generate-presigned-post-for-uploading-files
    # put_object for upload
    client = get_client()
    return client.generate_presigned_url(
        "get_object" if not upload else "put_object",
        Params={"Bucket": bucketname, "Key": filename},
        ExpiresIn=7200,
    )


def get_filename_from_url(url: str) -> str:
    parsed_url = urlparse(url)
    return parsed_url.path.split("/")[-1] if parsed_url else ""
