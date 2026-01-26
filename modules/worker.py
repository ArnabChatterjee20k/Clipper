import asyncio
import asyncpg, json
from dataclasses import asdict
from .logger import logger
from dataclasses import asdict
from .db import get_db, create, Job, JobStatus


# TODO: Add dead-jobs(cancellation status), heartbeat(progress update for long running jobs to know its running or not), logging worker health -> also need to check whether the worker is still processing or not
# holding a lock and processing and then unlock is a good idea?
# TODO: get job status, improve the start-stop logic
class Worker:
    def __init__(self, retries=5, wait_time_seconds=1, id=""):
        self._db = None
        self._max_retries = retries
        self._wait = wait_time_seconds
        self._running = False
        self._id = id

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
        while self._running:
            job = await self.dequeue()
            if not job:
                await asyncio.sleep(self._wait)
                continue
            logger.info(f"Worker {self._id} processing: {json.dumps(asdict(job))}")
            # process media
            logger.info(
                f"Worker {self._id} finished processing: {json.dumps(asdict(job))}"
            )

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
        # using a CTE to select and update in a single query -> Atomic update(select+update) -> no need of explicit transaction
        # TODO: study why it is good for concurrency and why FOR UPDATE works better with CTE and not with subqueries
        # TODO: look at the performance
        # TODO: need to think about the retrial here -> one worker would get busy or shall skip and let the other does the thing?
        sql = f"""
                WITH current_job AS(
                    SELECT id
                    FROM jobs
                    WHERE status = '{JobStatus.QUEUED.value}' AND retries <= {self._max_retries}
                    ORDER BY created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE jobs
                SET status = '{JobStatus.PROCESSING.value}', updated_at = CURRENT_TIMESTAMP
                FROM current_job
                WHERE jobs.id = current_job.id
                RETURNING jobs.*
            """
        jobs: list[asyncpg.Record] = await (await self._get_db()).fetch(sql)
        if not jobs:
            return None
        job = jobs[0]
        return Job(
            id=job.get("id"),
            filename=job.get("filename"),
            action=json.loads(job.get("action")),
            created_at=job.get("created_at"),
            updated_at=job.get("updated_at"),
            filetype=job.get("filetype"),
            retries=job.get("retries"),
            status=job.get("status"),
            version=job.get("version"),
        )

    async def cancel(self, job_id: int) -> Job:
        sql = f"""
                WITH current_job AS(
                    SELECT id
                    FROM jobs
                    WHERE id=$1
                    FOR UPDATE
                )
                UPDATE jobs
                SET status = '{JobStatus.CANCELLED.value}', updated_at = CURRENT_TIMESTAMP
                FROM current_job
                WHERE jobs.id = current_job.id
                RETURNING jobs.*
            """
        # using parameterised query for user input and not for the internal enum value
        jobs: list[asyncpg.Record] = await (await self._get_db()).fetch(sql, job_id)
        if not jobs:
            return None
        job = jobs[0]
        return Job(
            id=job.get("id"),
            filename=job.get("filename"),
            action=json.loads(job.get("action")),
            created_at=job.get("created_at"),
            updated_at=job.get("updated_at"),
            filetype=job.get("filetype"),
            retries=job.get("retries"),
            status=job.get("status"),
            version=job.get("version"),
        )

    async def complete(self, job_id: int):
        sql = f"""
                WITH current_job AS(
                    SELECT id
                    FROM jobs
                    WHERE id=$1
                    FOR UPDATE
                )
                UPDATE jobs
                SET status = '{JobStatus.COMPLETED.value}', updated_at = CURRENT_TIMESTAMP
                FROM current_job
                WHERE jobs.id = current_job.id
                RETURNING jobs.*
            """
        jobs: list[asyncpg.Record] = await (await self._get_db()).fetch(sql, job_id)
        if not jobs:
            return None
        job = jobs[0]
        return Job(
            id=job.get("id"),
            filename=job.get("filename"),
            action=json.loads(job.get("action")),
            created_at=job.get("created_at"),
            updated_at=job.get("updated_at"),
            filetype=job.get("filetype"),
            retries=job.get("retries"),
            status=job.get("status"),
            version=job.get("version"),
        )

    @staticmethod
    async def enqueue(db: asyncpg.Connection, job: Job):
        job.action = json.dumps(job.action)
        await create(db, "jobs", **asdict(job))


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
