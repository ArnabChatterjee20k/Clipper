import asyncpg, json
from dataclasses import asdict
from .db import get_db, create, Job, JobStatus


class Worker:
    def __init__(self):
        self._db = None
        self._max_retries = 5
        self._running = False

    async def _get_db(self) -> asyncpg.Connection:
        if self._db:
            return self._db
        async for db in get_db():
            self._db = db
        return self._db

    async def start(self):
        await self._get_db()
        self._running = True
        return True

    async def stop(self):
        for _ in range(5):
            try:
                await self._get_db().close()
                return True
            except:
                pass
            finally:
                self._running = False

    async def dequeue(self) -> Job:
        # using a CTE to select and update in a single query -> Atomic update(select+update)
        # TODO: study why it is good for concurrency and why FOR UPDATE works better with CTE and not with subqueries
        # TODO: look at the performance
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
                    WHERE id={job_id}
                    FOR UPDATE
                )
                UPDATE jobs
                SET status = '{JobStatus.CANCELLED.value}', updated_at = CURRENT_TIMESTAMP
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

    @staticmethod
    async def enqueue(db: asyncpg.Connection, job: Job):
        job.action = json.dumps(job.action)
        await create(db, "jobs", **asdict(job))
