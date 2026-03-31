from __future__ import annotations

import asyncio
import csv
import io
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, field_validator

load_dotenv()

DFS_BASE_URL = "https://api.dataforseo.com/v3"
DFS_LOCATION_NAME = "Thailand"
DFS_LANGUAGE_CODE = "th"
DEFAULT_SEED_PAGE_SIZE = 500
DEFAULT_COMPETITOR_PAGE_SIZE = 200
MAX_CONCURRENT_DFS_CALLS = 5
MIN_SECONDS_BETWEEN_CALLS = 0.06
MAX_RETRIES = 3


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class ExpandRequest(BaseModel):
    seed_keywords: list[str] = Field(min_length=1)
    competitor_domains: list[str] = Field(default_factory=list)
    location_name: str = Field(default=DFS_LOCATION_NAME)
    seed_limit_per_page: int = Field(default=DEFAULT_SEED_PAGE_SIZE, ge=1, le=1000)
    competitor_limit_per_page: int = Field(default=DEFAULT_COMPETITOR_PAGE_SIZE, ge=1, le=1000)
    competitor_top_rank: int | None = Field(default=10, ge=1, le=100)

    @field_validator("seed_keywords", mode="before")
    @classmethod
    def clean_seed_keywords(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            raise ValueError("seed_keywords must be a list")
        cleaned = [clean_text(item) for item in value if clean_text(item)]
        if not cleaned:
            raise ValueError("seed_keywords must contain at least one keyword")
        return dedupe_preserve_order(cleaned)

    @field_validator("competitor_domains", mode="before")
    @classmethod
    def clean_competitor_domains(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("competitor_domains must be a list")
        domains = [normalize_domain(item) for item in value if clean_text(item)]
        return dedupe_preserve_order([domain for domain in domains if domain])

    @field_validator("location_name", mode="before")
    @classmethod
    def clean_location_name(cls, value: Any) -> str:
        cleaned = clean_text(value)
        return cleaned or DFS_LOCATION_NAME


class JobSummary(BaseModel):
    total_seed_keywords: int
    total_competitor_domains: int
    total_seed_rows: int
    total_competitor_rows: int
    deduped_keywords: int
    total_api_calls: int


class KeywordResultRow(BaseModel):
    keyword: str
    search_volume: int | str
    source_refs: list[str] = Field(default_factory=list)


class SourceCatalog(BaseModel):
    s: list[str]
    c: list[str]


class JobResult(BaseModel):
    summary: JobSummary
    source_catalog: SourceCatalog
    keywords: list[KeywordResultRow]


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus


class JobProgress(BaseModel):
    phase: str
    total_seed_keywords: int = 0
    completed_seed_keywords: int = 0
    total_competitor_domains: int = 0
    completed_competitor_domains: int = 0
    total_api_calls: int = 0
    current_item: str | None = None
    message: str | None = None


class JobDetail(BaseModel):
    job_id: str
    status: JobStatus
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    progress: JobProgress
    error: str | None = None
    result: JobResult | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class StoredJob:
    job_id: str
    request: ExpandRequest
    status: JobStatus = JobStatus.queued
    created_at: str = field(default_factory=utc_now)
    started_at: str | None = None
    completed_at: str | None = None
    progress: dict[str, Any] = field(
        default_factory=lambda: {
            "phase": "queued",
            "total_seed_keywords": 0,
            "completed_seed_keywords": 0,
            "total_competitor_domains": 0,
            "completed_competitor_domains": 0,
            "total_api_calls": 0,
            "current_item": None,
            "message": "Waiting to start",
        }
    )
    error: str | None = None
    result: dict[str, Any] | None = None
    csv_text: str | None = None
    task: asyncio.Task[Any] | None = None


def clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def normalize_domain(value: Any) -> str:
    raw = clean_text(value).lower()
    if not raw:
        return ""
    raw = re.sub(r"^https?://", "", raw)
    raw = re.sub(r"^www\.", "", raw)
    raw = raw.split("/")[0]
    return raw


def normalize_keyword_key(keyword: str) -> str:
    return re.sub(r"\s+", "", clean_text(keyword)).lower()


def parse_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(float(stripped))
        except ValueError:
            return None
    return None


def latest_monthly_search_volume(monthly_searches: Any) -> int | None:
    if not isinstance(monthly_searches, list):
        return None

    latest_key: tuple[int, int] | None = None
    latest_value: int | None = None

    for item in monthly_searches:
        if not isinstance(item, dict):
            continue
        year = parse_int(item.get("year"))
        month = parse_int(item.get("month"))
        volume = parse_int(item.get("search_volume"))
        if year is None or month is None or volume is None:
            continue
        current_key = (year, month)
        if latest_key is None or current_key > latest_key:
            latest_key = current_key
            latest_value = volume

    return latest_value


def resolve_effective_volume(keyword_info: dict[str, Any] | None) -> int | None:
    if not isinstance(keyword_info, dict):
        return None

    direct_volume = parse_int(keyword_info.get("search_volume"))
    if direct_volume is not None and direct_volume > 0:
        return direct_volume

    fallback_volume = latest_monthly_search_volume(keyword_info.get("monthly_searches"))
    if fallback_volume is not None:
        return fallback_volume

    return direct_volume


class ProcessRateLimiter:
    def __init__(self, max_concurrent: int, min_interval_seconds: float) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._lock = asyncio.Lock()
        self._min_interval_seconds = min_interval_seconds
        self._last_call_at = 0.0

    async def __aenter__(self) -> None:
        await self._semaphore.acquire()
        async with self._lock:
            loop = asyncio.get_running_loop()
            now = loop.time()
            wait_for = self._min_interval_seconds - (now - self._last_call_at)
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._last_call_at = loop.time()

    async def __aexit__(self, exc_type, exc, tb) -> None:
        self._semaphore.release()


class DataForSEOClient:
    def __init__(self) -> None:
        login = os.getenv("DFS_API_LOGIN")
        password = os.getenv("DFS_API_PASSWORD")
        if not login or not password:
            raise RuntimeError("DFS_API_LOGIN and DFS_API_PASSWORD must be set")

        self._client = httpx.AsyncClient(
            base_url=DFS_BASE_URL,
            auth=(login, password),
            timeout=httpx.Timeout(60.0, connect=30.0),
            headers={"Content-Type": "application/json"},
        )
        self._rate_limiter = ProcessRateLimiter(MAX_CONCURRENT_DFS_CALLS, MIN_SECONDS_BETWEEN_CALLS)

    async def close(self) -> None:
        await self._client.aclose()

    async def post_live(self, path: str, payload: list[dict[str, Any]]) -> dict[str, Any]:
        last_error: Exception | None = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                async with self._rate_limiter:
                    response = await self._client.post(path, json=payload)

                if response.status_code >= 500 or response.status_code == 429:
                    raise RuntimeError(f"DataForSEO HTTP {response.status_code}: {response.text[:300]}")

                response.raise_for_status()
                data = response.json()

                if parse_int(data.get("status_code")) != 20000:
                    raise RuntimeError(
                        f"DataForSEO top-level error {data.get('status_code')}: {data.get('status_message')}"
                    )

                task = (((data.get("tasks") or [None])[0]) or {})
                if parse_int(task.get("status_code")) != 20000:
                    raise RuntimeError(
                        f"DataForSEO task error {task.get('status_code')}: {task.get('status_message')}"
                    )

                return data
            except Exception as exc:  # pragma: no cover - exercised in runtime, not unit-tested here
                last_error = exc
                if attempt == MAX_RETRIES:
                    break
                await asyncio.sleep(attempt)

        raise RuntimeError(f"DataForSEO request failed after {MAX_RETRIES} attempts: {last_error}")


def extract_task_result(data: dict[str, Any]) -> dict[str, Any]:
    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise RuntimeError("DataForSEO response missing tasks")

    task = tasks[0]
    results = task.get("result")
    if not isinstance(results, list) or not results:
        return {"items": [], "items_count": 0, "total_count": 0}

    result = results[0]
    if not isinstance(result, dict):
        return {"items": [], "items_count": 0, "total_count": 0}
    return result


def extract_seed_rows(result: dict[str, Any], seed_index: int) -> list[dict[str, Any]]:
    items = result.get("items")
    if not isinstance(items, list):
        return []

    rows: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        keyword = clean_text(item.get("keyword"))
        if not keyword:
            continue
        rows.append(
            {
                "keyword": keyword,
                "search_volume": resolve_effective_volume(item.get("keyword_info")),
                "source_refs": [f"s{seed_index}"],
            }
        )
    return rows


def extract_competitor_rows(result: dict[str, Any], competitor_index: int) -> list[dict[str, Any]]:
    items = result.get("items")
    if not isinstance(items, list):
        return []

    rows: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        keyword_data = item.get("keyword_data")
        if not isinstance(keyword_data, dict):
            continue
        keyword = clean_text(keyword_data.get("keyword"))
        if not keyword:
            continue
        rows.append(
            {
                "keyword": keyword,
                "search_volume": resolve_effective_volume(keyword_data.get("keyword_info")),
                "source_refs": [f"c{competitor_index}"],
            }
        )
    return rows


async def expand_seed_keyword(
    client: DataForSEOClient,
    location_name: str,
    page_size: int,
    seed_index: int,
    seed_keyword: str,
    progress: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    page = 0

    while True:
        page += 1
        progress["current_item"] = f"Seed: {seed_keyword} (page {page})"

        payload = [
            {
                "keyword": seed_keyword,
                "location_name": location_name,
                "language_code": DFS_LANGUAGE_CODE,
                "limit": page_size,
                "offset": offset,
                "order_by": ["keyword_info.search_volume,desc"],
            }
        ]

        data = await client.post_live("/dataforseo_labs/google/keyword_suggestions/live", payload)
        progress["total_api_calls"] += 1
        result = extract_task_result(data)
        current_rows = extract_seed_rows(result, seed_index)
        rows.extend(current_rows)

        if len(current_rows) < page_size:
            break
        offset += page_size

    return rows


async def fetch_competitor_keywords(
    client: DataForSEOClient,
    location_name: str,
    page_size: int,
    top_rank: int | None,
    competitor_index: int,
    domain: str,
    progress: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    page = 0

    while True:
        page += 1
        progress["current_item"] = f"Competitor: {domain} (page {page})"
        payload = [
            {
                "target": domain,
                "location_name": location_name,
                "language_code": DFS_LANGUAGE_CODE,
                "item_types": ["organic"],
                "limit": page_size,
                "offset": offset,
                "order_by": ["keyword_data.keyword_info.search_volume,desc"],
                **(
                    {
                        "filters": [
                            ["ranked_serp_element.serp_item.rank_group", "<=", top_rank],
                        ]
                    }
                    if top_rank is not None
                    else {}
                ),
            }
        ]

        data = await client.post_live("/dataforseo_labs/google/ranked_keywords/live", payload)
        progress["total_api_calls"] += 1
        result = extract_task_result(data)
        current_rows = extract_competitor_rows(result, competitor_index)
        rows.extend(current_rows)

        if len(current_rows) < page_size:
            break

        offset += page_size

    return rows


def dedupe_keywords(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}

    for row in rows:
        keyword = clean_text(row.get("keyword"))
        if not keyword:
            continue

        normalized_key = normalize_keyword_key(keyword)
        volume = row.get("search_volume")
        current = deduped.get(normalized_key)

        if current is None:
            deduped[normalized_key] = {
                "keyword": keyword,
                "search_volume": volume,
                "source_refs": list(row.get("source_refs") or []),
            }
            continue

        current_volume = current.get("search_volume")
        current_score = current_volume if isinstance(current_volume, int) else -1
        next_score = volume if isinstance(volume, int) else -1
        current["source_refs"] = dedupe_preserve_order(
            [*current.get("source_refs", []), *(row.get("source_refs") or [])]
        )

        if next_score > current_score:
            current["keyword"] = keyword
            current["search_volume"] = volume

    return sorted(
        deduped.values(),
        key=lambda item: (
            -(item["search_volume"] if isinstance(item["search_volume"], int) else 0),
            item["keyword"],
        ),
    )


def resolve_source_ref_label(source_ref: str, seeds: list[str], competitors: list[str]) -> str:
    ref = clean_text(source_ref)
    if len(ref) < 2:
        return ref

    prefix = ref[0]
    try:
        index = int(ref[1:])
    except ValueError:
        return ref

    if prefix == "s" and 0 <= index < len(seeds):
        return seeds[index]
    if prefix == "c" and 0 <= index < len(competitors):
        return competitors[index]
    return ref


def build_csv_text(rows: list[dict[str, Any]], seeds: list[str], competitors: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["keyword", "search_volume", "source_refs"])
    for row in rows:
        value = row["search_volume"] if isinstance(row["search_volume"], int) else "-"
        source_labels = [
            resolve_source_ref_label(source_ref, seeds, competitors)
            for source_ref in (row.get("source_refs") or [])
        ]
        writer.writerow(
            [
                row["keyword"],
                value,
                "|".join(source_labels),
            ]
        )
    return buffer.getvalue()


jobs: dict[str, StoredJob] = {}
jobs_lock = asyncio.Lock()


async def run_expand_job(job_id: str) -> None:
    async with jobs_lock:
        job = jobs[job_id]
        job.status = JobStatus.running
        job.started_at = utc_now()
        job.progress = {
            "phase": "seed_expansion",
            "total_seed_keywords": len(job.request.seed_keywords),
            "completed_seed_keywords": 0,
            "total_competitor_domains": len(job.request.competitor_domains),
            "completed_competitor_domains": 0,
            "total_api_calls": 0,
            "current_item": None,
            "message": "Starting seed keyword expansion",
        }

    client = DataForSEOClient()
    location_name = job.request.location_name
    seed_page_size = job.request.seed_limit_per_page
    competitor_page_size = job.request.competitor_limit_per_page
    competitor_top_rank = job.request.competitor_top_rank
    seed_rows: list[dict[str, Any]] = []
    competitor_rows: list[dict[str, Any]] = []

    try:
        for seed_index, seed_keyword in enumerate(job.request.seed_keywords):
            current_rows = await expand_seed_keyword(
                client=client,
                location_name=location_name,
                page_size=seed_page_size,
                seed_index=seed_index,
                seed_keyword=seed_keyword,
                progress=job.progress,
            )
            seed_rows.extend(current_rows)
            job.progress["completed_seed_keywords"] += 1

        job.progress["phase"] = "competitor_expansion"
        job.progress["message"] = "Collecting competitor ranking keywords"

        for competitor_index, domain in enumerate(job.request.competitor_domains):
            current_rows = await fetch_competitor_keywords(
                client=client,
                location_name=location_name,
                page_size=competitor_page_size,
                top_rank=competitor_top_rank,
                competitor_index=competitor_index,
                domain=domain,
                progress=job.progress,
            )
            competitor_rows.extend(current_rows)
            job.progress["completed_competitor_domains"] += 1

        job.progress["phase"] = "dedupe"
        job.progress["current_item"] = None
        job.progress["message"] = "Combining and deduplicating keywords"

        merged_rows = dedupe_keywords(seed_rows + competitor_rows)
        csv_text = build_csv_text(
            merged_rows,
            seeds=job.request.seed_keywords,
            competitors=job.request.competitor_domains,
        )
        result = {
            "summary": {
                "total_seed_keywords": len(job.request.seed_keywords),
                "total_competitor_domains": len(job.request.competitor_domains),
                "total_seed_rows": len(seed_rows),
                "total_competitor_rows": len(competitor_rows),
                "deduped_keywords": len(merged_rows),
                "total_api_calls": job.progress["total_api_calls"],
            },
            "source_catalog": {
                "s": job.request.seed_keywords,
                "c": job.request.competitor_domains,
            },
            "keywords": [
                {
                    "keyword": row["keyword"],
                    "search_volume": row["search_volume"] if isinstance(row["search_volume"], int) else "-",
                    "source_refs": row.get("source_refs") or [],
                }
                for row in merged_rows
            ],
        }

        async with jobs_lock:
            job.status = JobStatus.completed
            job.completed_at = utc_now()
            job.progress["phase"] = "completed"
            job.progress["message"] = "Keyword expansion complete"
            job.result = result
            job.csv_text = csv_text
    except Exception as exc:
        async with jobs_lock:
            job.status = JobStatus.failed
            job.completed_at = utc_now()
            job.error = str(exc)
            job.progress["phase"] = "failed"
            job.progress["message"] = "Keyword expansion failed"
            job.progress["current_item"] = None
    finally:
        await client.close()


def serialize_job(job: StoredJob, include_result: bool = False) -> JobDetail:
    result = None
    if include_result and job.result is not None:
        result = JobResult.model_validate(job.result)
    return JobDetail(
        job_id=job.job_id,
        status=job.status,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        progress=JobProgress.model_validate(job.progress or {}),
        error=job.error,
        result=result,
    )


app = FastAPI(title="Step 2 — Keyword Expansion", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "location_name": DFS_LOCATION_NAME,
        "language_code": DFS_LANGUAGE_CODE,
    }


@app.post("/jobs/expand", response_model=JobResponse)
async def create_expand_job(request: ExpandRequest) -> JobResponse:
    job_id = str(uuid.uuid4())
    job = StoredJob(job_id=job_id, request=request)

    async with jobs_lock:
        jobs[job_id] = job
        job.task = asyncio.create_task(run_expand_job(job_id))

    return JobResponse(job_id=job_id, status=job.status)


@app.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(job_id: str) -> JobDetail:
    async with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return serialize_job(job, include_result=False)


@app.get("/jobs/{job_id}/result", response_model=JobDetail)
async def get_job_result(job_id: str) -> JobDetail:
    async with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status != JobStatus.completed:
            raise HTTPException(status_code=409, detail=f"Job is {job.status.value}")
        return serialize_job(job, include_result=True)


@app.get("/jobs/{job_id}/csv")
async def download_job_csv(job_id: str) -> PlainTextResponse:
    async with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status != JobStatus.completed or job.csv_text is None:
            raise HTTPException(status_code=409, detail=f"Job is {job.status.value}")
        return PlainTextResponse(
            job.csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="keyword_expand_{job_id}.csv"'},
        )
