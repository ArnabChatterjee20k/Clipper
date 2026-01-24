from .logger import logger
import enum
from dataclasses import dataclass, field
from typing import Annotated, Optional
from datetime import datetime
from fastapi import Depends
import asyncpg


class JobStatus(enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"


async def get_db():
    conn: asyncpg.Connection = await asyncpg.connect(
        "postgresql://clipper:clipper@localhost:5432/clipper"
    )
    yield conn


DBSession = Annotated[asyncpg.Connection, Depends(get_db)]


@dataclass
class Bucket:
    id: Optional[int] = field(init=False, default=-1)
    name: str
    create_at: datetime = datetime.now()


@dataclass
class File:
    id: Optional[int] = field(init=False, default=-1)
    name: str
    bucketname: str
    created_at: datetime = datetime.now()


@dataclass
class Job:
    id: Optional[int] = field(init=False, default=-1)
    filename: str
    # typo due to the schema, should be filetype
    filtype: str
    action: dict
    status: str
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()
    version: int = 0
    retries: int = 0


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


async def create(db: asyncpg.Connection, table: str, **records) -> int:
    if "id" in records:
        records.pop("id")
    columns, values_placeholder, values = prepare(records)
    sql = f"INSERT INTO {table} ({columns}) values ({values_placeholder}) returning id"
    result = await db.fetch(sql, *values)
    return (result[0] if result else {}).get("id")


async def update(
    db: asyncpg.Connection,
    table: str,
    record: dict,
    filters: dict,
    filter_condition: str = "AND",
):
    # columns, values_placeholder, values = prepare(record)

    # sql = f'UPDATE {table} SET {columns} WHERE '
    pass


async def read(db: asyncpg.Connection, table: str, **records):
    pass


async def delete(db: asyncpg.Connection, table: str, **records):
    pass


def get_placeholder(size: int) -> str:
    placeholder = []
    for i in range(size):
        placeholder.append(f"${i+1}")
    return ",".join(placeholder)


def prepare(records: dict):
    columns = ",".join(records.keys())
    values_placeholder = get_placeholder(len(records.keys()))
    values = list(records.values())
    return columns, values_placeholder, values
