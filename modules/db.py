from .logger import logger
import enum
from typing import Annotated
from fastapi import Depends
import asyncpg


class JobStatus(enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"


async def get_db():
    conn: asyncpg.Connection = await asyncpg.connect(
        "postgresql://clipper:clipper@localhost/clipper"
    )
    yield conn


DBSession = Annotated[asyncpg.Connection, Depends(get_db)]


async def load_schemas():
    async for db in get_db():
        logger.info("creating buckets table")
        await db.execute("""
                CREATE TABLE IF NOT EXISTS buckets(
                    id serial PRIMARY KEY,
                    name VARCHAR(50),
                    created_at timestamp
                )
            """)
        logger.info("buckets table created")

        logger.info("creating files table")
        await db.execute("""
                CREATE TABLE IF NOT EXISTS files(
                    id serial PRIMARY KEY,
                    name VARCHAR(50),
                    bucketname VARCHAR(50),
                    created_at timestamp
                )
            """)
        logger.info("files table created")

        logger.info("creating jobs table")
        await db.execute(f"""
                CREATE TABLE IF NOT EXISTS jobs(
                    id serial PRIMARY KEY,
                    filename VARCHAR(50) NOT NULL,
                    filtype  VARCHAR(20),
                    bucketname VARCHAR(50),
                    created_at timestamp NOT NULL,
                    updated_at timestamp NOT NULL,
                    version smallint DEFAULT 0,
                    action jsonb NOT NULL,
                    status VARCHAR(20) DEFAULT '{JobStatus.QUEUED.value}',
                    retries smallint DEFAULT 0
                )
            """)
        logger.info("jobs table created")
