from .logger import logger
import enum, json
from dataclasses import dataclass, field
from pydantic import BaseModel, UUID4
from typing import Annotated, Optional, Literal
from datetime import datetime
from fastapi import Depends
import asyncpg


class JobStatus(enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ERROR = "error"


async def get_db():
    conn: asyncpg.Connection = await asyncpg.connect(
        "postgresql://clipper:clipper@localhost:5432/clipper"
    )
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )

    yield conn


DBSession = Annotated[asyncpg.Connection, Depends(get_db)]

CONDITION = Literal["AND", "OR"]
TABLE = Literal["buckets", "files", "jobs"]


@dataclass
class Bucket:
    id: Optional[int] = field(init=False, default=-1)
    name: str
    created_at: datetime = datetime.now()


@dataclass
class File:
    id: Optional[int] = field(init=False, default=-1)
    name: str
    bucketname: str
    created_at: datetime = datetime.now()


class Job(BaseModel):
    uid: UUID4
    input: str
    action: list[dict]
    status: str
    id: Optional[int] = None
    output: Optional[dict] = None
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()
    output_version: int = 0
    retries: int = 0
    progress: int = 0
    error: Optional[str] = None


@dataclass
class OutputFile:
    filename: str
    video_format: str
    audio_format: str
    audio_bitrate: str


# TODO: add indexes
async def load_schemas():
    async for db in get_db():
        logger.info("creating buckets table")
        await db.execute("""
                CREATE TABLE IF NOT EXISTS buckets(
                    id serial PRIMARY KEY,
                    name VARCHAR(200),
                    created_at timestamp
                )
            """)
        logger.info("buckets table created")

        logger.info("creating files table")
        await db.execute("""
                CREATE TABLE IF NOT EXISTS files(
                    id serial PRIMARY KEY,
                    name VARCHAR(200),
                    bucketname VARCHAR(50),
                    filetype  VARCHAR(20),
                    created_at timestamp
                )
            """)
        logger.info("files table created")

        logger.info("creating jobs table")
        # input can be null as well in case of workflows better to check in the validator itself
        await db.execute(f"""
                CREATE TABLE IF NOT EXISTS jobs(
                    id serial PRIMARY KEY,
                    uid UUID NOT NULL,
                    created_at timestamp NOT NULL,
                    updated_at timestamp NOT NULL,
                    output_version smallint DEFAULT 0,
                    input TEXT,
                    output jsonb,
                    action jsonb NOT NULL,
                    status VARCHAR(20) DEFAULT '{JobStatus.QUEUED.value}',
                    retries smallint DEFAULT 0,
                    error TEXT,
                    progress smallint DEFAULT 0
                )
            """)
        logger.info("jobs table created")


async def create(db: asyncpg.Connection, table: TABLE, **records) -> int:
    if "id" in records:
        records.pop("id")
    columns, values_placeholder, values = prepare(records)
    sql = f"INSERT INTO {table} ({columns}) values ({values_placeholder}) returning id"
    result = await db.fetch(sql, *values)
    return (result[0] if result else {}).get("id")


async def create_many(
    db: asyncpg.Connection, table: TABLE, records: list[dict]
) -> list:
    if not records:
        return []
    first = dict(records[0])
    if "id" in first:
        first.pop("id")
    columns = ",".join(first.keys())
    values_placeholder = get_placeholder(len(first))
    sql = f"INSERT INTO {table} ({columns}) VALUES ({values_placeholder})"
    rows = []
    for record in records:
        rec = dict(record)
        if "id" in rec:
            rec.pop("id")
        row = tuple(rec[k] for k in first.keys())
        rows.append(row)
    await db.executemany(sql, rows)
    return []


async def read(
    db: asyncpg.Connection,
    table: TABLE,
    filters: dict,
    condition: CONDITION = "AND",
    limit=1,
    last_id=0,
) -> list[asyncpg.Record]:
    where_columns, where_placeholder, where_values = prepare(filters)
    where_clause_literals = []
    if where_columns and where_placeholder:
        where_clause_literals = [
            f"{col}={placeholder}"
            for col, placeholder in zip([where_columns], [where_placeholder])
        ]
    where_clause_literals.append(f"id > {last_id}")
    where_clause = f" {condition} ".join(where_clause_literals)
    sql = f"SELECT * from {table} WHERE {where_clause} ORDER BY id ASC LIMIT {limit}"
    return await db.fetch(sql, *where_values)


async def delete(db: asyncpg.Connection, table: TABLE, **filters) -> None:
    """Delete rows matching the given filters (e.g. uid=..., id=...)."""
    if not filters:
        return
    parts = [f"{k}=${i+1}" for i, k in enumerate(filters)]
    sql = f"DELETE FROM {table} WHERE " + " AND ".join(parts)
    await db.execute(sql, *filters.values())


def get_placeholder(size: int, start=0) -> str:
    placeholder = []
    for i in range(start, size):
        placeholder.append(f"${i+1}")
    return ",".join(placeholder)


def prepare(records: dict):
    columns = ",".join(records.keys())
    values_placeholder = get_placeholder(len(records.keys()))
    values = list(records.values())
    return columns, values_placeholder, values
