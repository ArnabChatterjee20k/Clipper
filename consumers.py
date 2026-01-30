from modules.worker import Job, JobStatus, Worker, get_db, WorkerPool
from modules.logger import logger
import asyncio, signal, functools
import requests


async def push():
    async for db in get_db():
        for _ in range(10000):
            await Worker.enqueue(
                db,
                Job(
                    filename="test",
                    action={"type": "test"},
                    status=JobStatus.QUEUED.value,
                    filetype="test",
                ),
            )


async def shutdown(sig, pool):
    print(f"Caught signal: {sig.name}")
    await pool.stop()
    print("Shutdown complete.")
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def main():
    pool = WorkerPool(3)
    try:
        await pool.start()

        loop = asyncio.get_running_loop()
        shutdown_event = asyncio.Event()

        def signal_handler(sig):
            print(f"Signal {sig.name} received, initiating shutdown...")
            shutdown_event.set()

        for s in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(s, functools.partial(signal_handler, s))

        await shutdown_event.wait()
        await pool.stop()

    except Exception as e:
        logger.error(f"Error in main: {e}")
        await pool.stop()
    finally:
        print("Cleanup complete.")


# asyncio.run(main())
from modules.video_processor import VideoProcessor
from modules.buckets import get_url, PRIMARY_BUCKET, upload_file
import io


async def main():
    post_url: str = get_url("thumbnail.png", PRIMARY_BUCKET, True)
    # post_url = post_url.replace('localhost','minik')
    # we cant stream the output directly via the presigned url
    processor = VideoProcessor(
        complete_callaback=lambda result: print("result", result),
        progress_callback=lambda progress: print("progress", progress),
    )
    result = bytearray()
    inputs = [
        "http://localhost:9000/primary/BigBuckBunny.mp4?AWSAccessKeyId=minio-root-user&Signature=oW18ctRwb%2BtfsUAdsN%2BvaK8uji8%3D&Expires=1769803710",
        "http://localhost:9000/primary/BigBuckBunny.mp4?AWSAccessKeyId=minio-root-user&Signature=oW18ctRwb%2BtfsUAdsN%2BvaK8uji8%3D&Expires=1769803710",
    ]
    watermark = "http://minik:9000/primary/Screenshot%202026-01-10%20at%201.09.40%E2%80%AFAM.png?AWSAccessKeyId=minio-root-user&Signature=rgwS1gVMfMM01amaIElBFCjztIg%3D&Expires=1769803710"
    inputs = list(map(lambda i: i.replace("localhost", "minik"), inputs))
    async for chunk in processor.add_watermark(inputs[0], watermark=watermark):
        result.extend(chunk)

    await upload_file(io.BytesIO(result), PRIMARY_BUCKET, filename="result.mp3")


asyncio.run(main())
