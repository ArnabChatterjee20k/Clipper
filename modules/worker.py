import io
import asyncio
import asyncpg
import json
import time
from dataclasses import asdict
from .logger import logger
from .db import (
    get_db,
    create,
    create_many,
    Job,
    JobStatus,
    OutputFile,
    File as BucketFileModel,
)
from .video_processor import VideoBuilder
from .video_downloader import download_youtube_to_bucket
from .buckets import upload_file, PRIMARY_BUCKET, get_filename_from_url, get_url
from .metrics import (
    job_enqueue_duration_seconds,
    job_processing_duration_seconds,
    worker_jobs_picked_total,
    job_status_total,
    job_queue_depth,
)


# TODO: Add dead-jobs(cancellation status), heartbeat(progress update for long running jobs to know its running or not), logging worker health -> also need to check whether the worker is still processing or not
# holding a lock and processing and then unlock is a good idea?
# TODO: add a new processor for check completed jobs and moving the output to different bucket and archive the other results
# Implementing it would require to extract Worker as a base class then have deque as abstract method. ArchivalWorker, DeletionWorker would use Worker as base and we can append in the workers according to the necessity
class Worker:
    def __init__(self, retries=5, wait_time_seconds=1, id=""):
        self._db = None
        self._max_retries = retries
        self._wait = wait_time_seconds
        self._running = False
        self._id = id
        self._current_job_id = None

    async def _get_db(self) -> asyncpg.Connection:
        # TODO: should be a connection pool
        if self._db:
            return self._db
        async for db in get_db():
            self._db = db
        return self._db

    async def start(self):
        await self._get_db()
        self._running = True
        logger.info(f"Worker {self._id} started")
        job = None
        while self._running:
            try:
                job = await self.dequeue()
                if not job:
                    await asyncio.sleep(self._wait)
                    continue
                self._current_job_id = job.id
                job_status_total.labels(status=JobStatus.PROCESSING.value).inc()
                worker_jobs_picked_total.labels(worker_id=self._id).inc()
                job_queue_depth.labels(status=JobStatus.PROCESSING.value).inc()
                job_queue_depth.labels(status=JobStatus.QUEUED.value).dec()
                logger.info(f"Worker {self._id} processing: {job.model_dump_json()}")
                await self._process_job(job)
                await self.complete(job.id)
                logger.info(
                    f"Worker {self._id} finished processing: {job.model_dump_json()}"
                )
            except Exception as e:
                err = str(e)

                logger.error(f"Worker {self._id} error: {err}")

                if job is not None:
                    try:
                        await self.error(job, err)
                    except Exception as db_err:
                        logger.error(
                            f"Worker {self._id} failed to update error state: {db_err}"
                        )
                await asyncio.sleep(self._wait)
            finally:
                self._current_job_id = None
                job_queue_depth.labels(status=JobStatus.PROCESSING.value).dec()

    async def _process_job(self, job: Job):
        db = await self._get_db()

        async def update_job_progress(result: int):
            try:
                sql = f"""
                    UPDATE jobs
                    SET progress = {int(min(100, max(0, round(result))))}, updated_at = CURRENT_TIMESTAMP
                    WHERE jobs.id = '{job.id}'
                    RETURNING jobs.*
                """
                await db.fetch(sql)
                logger.info(
                    f"[Worker {self._id}] [Job {job.id}] [Workflow {job.uid}] Progress: {result}"
                )
            except Exception as e:
                logger.error(
                    f"[Worker {self._id}] [Job {job.id}] [Workflow {job.uid}] Failed to update progress: {e}"
                )

        start_time = time.monotonic()

        # HACK: very hacky way if in a single edit if there is yt video then we are downloading it first in the single worker
        # best way would be to schedule two jobs first -> download , builder -> a mini workflow
        # TODO: handle the validation in the api side only -> download should be always very first operation
        download_op = next(
            (op for op in job.action if op.get("op") == "download_from_youtube"), None
        )

        input_url = job.input
        builder = None
        result = None
        output_filename = None

        if download_op is not None:
            youtube_url = job.input
            opts = download_op.get("data") or {}

            filename, presigned_url = await download_youtube_to_bucket(
                youtube_url, opts, db=db
            )
            presigned_url = presigned_url.replace("localhost", "minik")
            logger.info(
                f"[Worker {self._id}] [Job {job.id}] [Workflow {job.uid}] "
                f"Downloaded YouTube media to bucket as {filename} (url={presigned_url})"
            )

            output_filename = filename
            input_url = presigned_url

        has_other_ops = any(
            op.get("op") != "download_from_youtube" for op in job.action
        )

        if has_other_ops:
            builder = VideoBuilder(
                input_url,
                complete_callback=lambda e: logger.info(
                    f"[Worker {self._id}] [Job {job.id}] [Workflow {job.uid}] Completed"
                ),
                progress_callback=update_job_progress,
            )
            extract_audio = False
            for operation in job.action:
                op = operation.get("op")
                data = operation.get("data")
                if op == "download_from_youtube":
                    continue
                if op == "extractAudio":
                    extract_audio = True
                    continue
                builder = builder.load(op, data=data)
            if extract_audio:
                result = await builder.extract_audio_to_bytes()
            else:
                result = await builder.export_to_bytes()
            full_filename = get_filename_from_url(input_url)
            base, _, ext = full_filename.rpartition(".")
            base = base or full_filename

            if not base or base == "":
                base = "video"

            if extract_audio:
                audio_ext_map = {
                    "libmp3lame": "mp3",
                    "aac": "m4a",
                    "pcm_s16le": "wav",
                    "flac": "flac",
                }
                ext = audio_ext_map.get(getattr(builder, "_audio_format", ""), "mp3")
            elif getattr(builder, "_gif_options", None) is not None:
                ext = "gif"
            elif not ext or ext == "":
                ext = "mp4"

            valid_extensions = [
                "mp4",
                "webm",
                "mkv",
                "mp3",
                "m4a",
                "wav",
                "flac",
                "gif",
                "mov",
                "avi",
            ]
            if ext.lower() not in valid_extensions:
                ext = "mp4"

            suffix = "audio" if extract_audio else "output"
            output_filename = f"{base}_{suffix}_{job.uid}_{job.output_version}.{ext}"
        try:
            async with db.transaction():
                sql = f"""
                    UPDATE jobs
                    SET output = $1, updated_at = CURRENT_TIMESTAMP
                    WHERE jobs.id = '{job.id}'
                    RETURNING jobs.*
                """
                await db.fetch(
                    sql,
                    json.dumps(
                        asdict(
                            OutputFile(
                                filename=output_filename,
                                audio_bitrate=(
                                    builder._audio_bitrate if builder else "192k"
                                ),
                                video_format=(
                                    builder._video_format if builder else "mp4"
                                ),
                                audio_format=(
                                    builder._audio_format if builder else "aac"
                                ),
                            )
                        )
                    ),
                )
                await create(
                    db,
                    "files",
                    **asdict(
                        BucketFileModel(name=output_filename, bucketname=PRIMARY_BUCKET)
                    ),
                )

                if result is not None:
                    await upload_file(
                        io.BytesIO(result),
                        PRIMARY_BUCKET,
                        filename=output_filename,
                    )
            duration_ms = (time.monotonic() - start_time) * 1000
            job_processing_duration_seconds.labels(
                status=JobStatus.COMPLETED.value
            ).observe(duration_ms)
            job_status_total.labels(status=JobStatus.COMPLETED.value).inc()
            logger.info(
                f"[Worker {self._id}] [Job {job.id or ''}] [Workflow {job.uid or ''}] [OUTPUT FILE]  {output_filename}"
            )
        except Exception as e:
            duration_ms = (time.monotonic() - start_time) * 1000
            job_status_total.labels(status=JobStatus.ERROR.value).inc()
            job_processing_duration_seconds.labels(
                status=JobStatus.ERROR.value
            ).observe(duration_ms)
            logger.error(
                f"[Worker {self._id}] [Job {job.id or ''}] [Workflow {job.uid or ''}] [ERROR OUTPUT UPLOAD] Error {e}"
            )
            await self.error(job, str(e))

    async def stop(self):
        self._running = False
        logger.info(f"Stopping Worker {self._id}")
        for _ in range(5):
            try:
                await self.cancel()
                await self._get_db().close()
                return True
            except:
                pass
        logger.info(f"Worker {self._id} stopped")

    async def dequeue(self) -> Job:
        # using a CTE to select and update in a single query -> Atomic update(read+modify+write) -> no need of explicit transaction
        # also making sure to have a DAG pattern as well so that deque. Ex -> dont deque 1 if 0 doesn't exists
        # TODO: need to think about the retrial here -> one worker would get busy or shall skip and let the other does the thing?
        sql = f"""
                WITH current_job AS (
                    SELECT 
                        j.*,
                        (
                            SELECT prev.output
                            FROM jobs prev
                            WHERE prev.uid = j.uid
                            AND prev.output_version = j.output_version - 1
                            LIMIT 1
                        ) AS previous_output
                    FROM jobs j
                    WHERE 
                        j.status = '{JobStatus.QUEUED.value}'
                        AND j.retries <= {self._max_retries}
                        AND NOT EXISTS (
                            SELECT 1
                            FROM jobs prev
                            WHERE prev.uid = j.uid
                            AND prev.output_version = j.output_version - 1
                            AND prev.status <> '{JobStatus.COMPLETED.value}'
                        )
                    ORDER BY j.created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE jobs
                SET 
                    status = '{JobStatus.PROCESSING.value}',
                    updated_at = CURRENT_TIMESTAMP
                FROM current_job
                WHERE jobs.id = current_job.id
                RETURNING jobs.*, current_job.previous_output;
            """
        jobs: list[asyncpg.Record] = await (await self._get_db()).fetch(sql)
        if not jobs:
            return None
        job = jobs[0]
        input_val = job.get("input") or get_url(
            json.loads(job.get("previous_output")).get("filename"),
            bucketname=PRIMARY_BUCKET,
        )
        return Job(
            id=job.get("id"),
            uid=str(job.get("uid")),
            input=input_val,
            action=job.get("action"),
            created_at=str(job.get("created_at")),
            updated_at=str(job.get("updated_at")),
            retries=job.get("retries"),
            status=job.get("status"),
            output_version=job.get("output_version"),
        )

    async def cancel(self, job_id: int) -> Job:
        sql = f"""
                UPDATE jobs
                SET status = '{JobStatus.CANCELLED.value}', updated_at = CURRENT_TIMESTAMP
                WHERE jobs.id = '{job_id}'
                RETURNING jobs.*
            """
        # using parameterised query for user input and not for the internal enum value
        jobs: list[asyncpg.Record] = await (await self._get_db()).fetch(sql)
        if not jobs:
            return None
        job = jobs[0]
        return Job(
            id=job.get("id"),
            uid=str(job.get("uid")),
            input=job.get("input"),
            action=job.get("action"),
            created_at=str(job.get("created_at")),
            updated_at=str(job.get("updated_at")),
            retries=job.get("retries"),
            status=job.get("status"),
            output_version=job.get("output_version"),
        )

    async def complete(self, job_id: int):
        sql = f"""
                UPDATE jobs
                SET status = '{JobStatus.COMPLETED.value}', updated_at = CURRENT_TIMESTAMP
                WHERE jobs.id = '{job_id}'
                RETURNING jobs.*
            """
        jobs: list[asyncpg.Record] = await (await self._get_db()).fetch(sql)
        if not jobs:
            return None
        job = jobs[0]
        return Job(
            id=job.get("id"),
            uid=str(job.get("uid")),
            input=job.get("input"),
            action=job.get("action"),
            created_at=str(job.get("created_at")),
            updated_at=str(job.get("updated_at")),
            retries=job.get("retries"),
            status=job.get("status"),
            output_version=job.get("output_version"),
        )

    async def error(self, job: Job, err: str):
        sql = f"""
                UPDATE jobs
                SET status = '{JobStatus.ERROR.value}', 
                    updated_at = CURRENT_TIMESTAMP,
                    retries = jobs.retries + 1,
                    error = $1
                WHERE jobs.id = '{job.id}'
                RETURNING jobs.*
            """
        try:
            await (await self._get_db()).fetch(sql, err)
        except Exception as e:
            logger.error(
                f"[Worker {self._id}] [Job {job.id or ''}] [Workflow {job.uid or ''}] [SQL {sql}] [ERROR REPORTED {err}] Error {e}"
            )

    @staticmethod
    async def enqueue(db: asyncpg.Connection, job: Job | list[Job]):
        with job_enqueue_duration_seconds.time():
            if isinstance(job, list):
                for j in job:
                    job_status_total.labels(status=j.status).inc()
                    job_queue_depth.labels(status=j.status).inc()
                await create_many(db, "jobs", [j.model_dump() for j in job])
                logger.info(f"Enqueued {len(job)} jobs")
            else:
                job_status_total.labels(status=job.status).inc()
                job_queue_depth.labels(status=job.status).inc()
                await create(db, "jobs", **job.model_dump())
                logger.info(f"Enqueued job {job}")


class WorkerPool:
    def __init__(self, max_workers=3, retries=5):
        self._retries = retries
        self._max_workers = max_workers
        self._workers: list[tuple[Worker, asyncio.Task]] = []

    async def start(self):
        logger.info(f"Starting workers....")
        for i in range(self._max_workers):
            worker = Worker(self._retries, id=i + 1)
            self._workers.append([worker, asyncio.create_task(worker.start())])

    async def stop(self):
        for worker, workerTask in self._workers:
            workerTask.cancel()
            await worker.stop()

    async def cancel(self, job_id: str):
        # pgnotify can be used as well here which in turn can be used to run this in a distributed env
        for worker, workerTask in self._workers:
            if worker._current_job_id == job_id:
                logger.warning(f"{worker._id} is having the job")
                cancelled = workerTask.cancel()
                if not cancelled:
                    raise ValueError(f"Not able to cancel the job {job_id}")
