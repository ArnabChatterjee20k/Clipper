from prometheus_client import (
    CollectorRegistry,
    Counter,
    Histogram,
    Gauge,
)

registry = CollectorRegistry()

job_status_total = Counter(
    "job_status_total",
    "Total jobs by status (queued, processing, completed, error, cancelled)",
    ["status"],
    registry=registry,
)

job_enqueue_duration_seconds = Histogram(
    "job_enqueue_duration_seconds",
    "Time spent enqueuing a job (insert into DB)",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
    registry=registry,
)

job_processing_duration_seconds = Histogram(
    "job_processing_duration_seconds",
    "Time spent processing a job from dequeue to complete or error",
    ["status"],  # status: completed | error;
    buckets=(1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0),
    registry=registry,
)

worker_jobs_picked_total = Counter(
    "worker_jobs_picked_total",
    "Total jobs picked up by workers",
    ["worker_id"],
    registry=registry,
)

job_queue_depth = Gauge(
    "job_queue_depth",
    "Current number of jobs in queue or in processing",
    ["status"],  # queued | processing
    registry=registry,
)
