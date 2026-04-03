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
from fastapi.middleware.cors import CORSMiddleware
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
    project_id: str | None = None
    seed_keywords: list[str] = Field(min_length=1)
    competitor_domains: list[str] = Field(default_factory=list)
    client_websites: list[str] = Field(default_factory=list)
    persist_raw_keywords: bool = Field(default=False)
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

    @field_validator("client_websites", mode="before")
    @classmethod
    def clean_client_websites(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("client_websites must be a list")
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
    total_client_websites: int
    total_seed_rows: int
    total_competitor_rows: int
    total_client_website_rows: int
    deduped_keywords: int
    total_api_calls: int


class KeywordResultRow(BaseModel):
    keyword: str
    search_volume: int | str
    volume_source: str | None = None
    latest_monthly_search_volume: int | None = None
    cpc: float | None = None
    competition: float | None = None
    low_top_of_page_bid: float | None = None
    high_top_of_page_bid: float | None = None
    best_competitor_rank_group: int | None = None
    best_competitor_rank_absolute: int | None = None
    best_client_website_rank_group: int | None = None
    best_client_website_rank_absolute: int | None = None
    source_count: int = 0
    source_refs: list[str] = Field(default_factory=list)


class SourceCatalog(BaseModel):
    s: list[str]
    c: list[str]
    w: list[str]


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
    total_client_websites: int = 0
    completed_client_websites: int = 0
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
            "total_client_websites": 0,
            "completed_client_websites": 0,
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


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
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


def resolve_effective_volume_details(keyword_info: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(keyword_info, dict):
        return {
            "search_volume": None,
            "latest_monthly_search_volume": None,
            "volume_source": "missing",
        }

    direct_volume = parse_int(keyword_info.get("search_volume"))
    fallback_volume = latest_monthly_search_volume(keyword_info.get("monthly_searches"))

    if direct_volume is not None and direct_volume > 0:
        return {
            "search_volume": direct_volume,
            "latest_monthly_search_volume": fallback_volume,
            "volume_source": "search_volume",
        }

    if fallback_volume is not None:
        return {
            "search_volume": fallback_volume,
            "latest_monthly_search_volume": fallback_volume,
            "volume_source": "monthly_searches",
        }

    return {
        "search_volume": direct_volume,
        "latest_monthly_search_volume": None,
        "volume_source": "missing",
    }


def extract_rank_fields(item: dict[str, Any]) -> tuple[int | None, int | None]:
    ranked_serp_element = item.get("ranked_serp_element")
    if not isinstance(ranked_serp_element, dict):
        return None, None

    serp_item = ranked_serp_element.get("serp_item")
    serp_source = serp_item if isinstance(serp_item, dict) else ranked_serp_element

    return (
        parse_int(serp_source.get("rank_group")),
        parse_int(serp_source.get("rank_absolute")),
    )


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


class SupabasePersistence:
    def __init__(self) -> None:
        self._url = (
            clean_text(os.getenv("SUPABASE_URL"))
            or clean_text(os.getenv("VITE_SUPABASE_URL"))
        ).rstrip("/")
        self._service_role_key = clean_text(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
        self._enabled = bool(self._url and self._service_role_key)
        self._client: httpx.AsyncClient | None = None

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            if not self._enabled:
                raise RuntimeError("Supabase persistence is not configured")
            self._client = httpx.AsyncClient(
                base_url=f"{self._url}/rest/v1",
                timeout=httpx.Timeout(60.0, connect=30.0),
                headers={
                    "apikey": self._service_role_key,
                    "Authorization": f"Bearer {self._service_role_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        client = await self._get_client()
        response = await client.request(method, path, json=json, params=params, headers=headers)
        response.raise_for_status()
        if not response.text:
            return None
        return response.json()

    async def create_run(self, job_id: str, request: ExpandRequest) -> None:
        if not self.enabled or not request.project_id:
            return

        payload = {
            "id": job_id,
            "project_id": request.project_id,
            "location_name": request.location_name,
            "language_code": DFS_LANGUAGE_CODE,
            "seed_limit_per_page": request.seed_limit_per_page,
            "competitor_limit_per_page": request.competitor_limit_per_page,
            "competitor_top_rank": request.competitor_top_rank or 10,
            "status": JobStatus.queued.value,
            "total_seed_keywords": len(request.seed_keywords),
            "total_competitor_domains": len(request.competitor_domains),
            "total_client_websites": len(request.client_websites),
            "error_message": None,
        }
        try:
            await self._request(
                "POST",
                "/keyword_expansion_runs",
                json=payload,
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
        except httpx.HTTPStatusError:
            legacy_payload = {k: v for k, v in payload.items() if k != "total_client_websites"}
            await self._request(
                "POST",
                "/keyword_expansion_runs",
                json=legacy_payload,
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )

    async def update_run(
        self,
        job_id: str,
        *,
        status: JobStatus,
        progress: dict[str, Any],
        error_message: str | None = None,
        started_at: str | None = None,
        completed_at: str | None = None,
        total_seed_rows: int | None = None,
        total_competitor_rows: int | None = None,
        total_client_website_rows: int | None = None,
        deduped_keywords: int | None = None,
    ) -> None:
        if not self.enabled:
            return

        payload: dict[str, Any] = {
            "status": status.value,
            "total_api_calls": progress.get("total_api_calls", 0),
            "error_message": error_message,
        }
        if started_at is not None:
            payload["started_at"] = started_at
        if completed_at is not None:
            payload["completed_at"] = completed_at
        if total_seed_rows is not None:
            payload["total_seed_rows"] = total_seed_rows
        if total_competitor_rows is not None:
            payload["total_competitor_rows"] = total_competitor_rows
        if total_client_website_rows is not None:
            payload["total_client_website_rows"] = total_client_website_rows
        if deduped_keywords is not None:
            payload["deduped_keywords"] = deduped_keywords

        try:
            await self._request(
                "PATCH",
                "/keyword_expansion_runs",
                json=payload,
                params={"id": f"eq.{job_id}"},
                headers={"Prefer": "return=minimal"},
            )
        except httpx.HTTPStatusError:
            legacy_payload = {k: v for k, v in payload.items() if k != "total_client_website_rows"}
            await self._request(
                "PATCH",
                "/keyword_expansion_runs",
                json=legacy_payload,
                params={"id": f"eq.{job_id}"},
                headers={"Prefer": "return=minimal"},
            )

    async def insert_seeds_and_competitors(self, job_id: str, request: ExpandRequest) -> None:
        if not self.enabled or not request.project_id:
            return

        if request.seed_keywords:
            seed_rows = [
                {
                    "run_id": job_id,
                    "project_id": request.project_id,
                    "seed_index": index,
                    "seed_keyword": seed_keyword,
                }
                for index, seed_keyword in enumerate(request.seed_keywords)
            ]
            await self._request(
                "POST",
                "/keyword_expansion_seeds",
                json=seed_rows,
                headers={"Prefer": "return=minimal"},
            )

        if request.competitor_domains:
            competitor_rows = [
                {
                    "run_id": job_id,
                    "project_id": request.project_id,
                    "competitor_index": index,
                    "domain": domain,
                }
                for index, domain in enumerate(request.competitor_domains)
            ]
            await self._request(
                "POST",
                "/keyword_expansion_competitors",
                json=competitor_rows,
                headers={"Prefer": "return=minimal"},
            )

        if request.client_websites:
            competitor_count = len(request.competitor_domains)
            client_rows = [
                {
                    "run_id": job_id,
                    "project_id": request.project_id,
                    "competitor_index": competitor_count + index,
                    "domain": domain,
                }
                for index, domain in enumerate(request.client_websites)
            ]
            await self._request(
                "POST",
                "/keyword_expansion_competitors",
                json=client_rows,
                headers={"Prefer": "return=minimal"},
            )

    async def insert_keywords_and_sources(
        self,
        job_id: str,
        project_id: str,
        rows: list[dict[str, Any]],
        seeds: list[str],
        competitors: list[str],
        client_websites: list[str],
    ) -> None:
        if not self.enabled:
            return

        keyword_rows = [
            {
                "run_id": job_id,
                "project_id": project_id,
                "keyword": row["keyword"],
                "normalized_keyword": normalize_keyword_key(row["keyword"]),
                "search_volume": row.get("search_volume"),
                "latest_monthly_search_volume": row.get("latest_monthly_search_volume"),
                "volume_source": row.get("volume_source") or "missing",
                "cpc": row.get("cpc"),
                "competition": row.get("competition"),
                "low_top_of_page_bid": row.get("low_top_of_page_bid"),
                "high_top_of_page_bid": row.get("high_top_of_page_bid"),
                "monthly_searches_json": row.get("monthly_searches_json"),
                "source_ref_count": len(row.get("source_refs") or []),
            }
            for row in rows
        ]

        inserted_keywords = await self._request(
            "POST",
            "/keyword_expansion_keywords",
            json=keyword_rows,
            headers={"Prefer": "return=representation"},
        )

        keyword_id_by_normalized = {
            item["normalized_keyword"]: item["id"]
            for item in (inserted_keywords or [])
            if isinstance(item, dict) and item.get("normalized_keyword") and item.get("id")
        }

        source_rows: list[dict[str, Any]] = []
        for row in rows:
            keyword_id = keyword_id_by_normalized.get(normalize_keyword_key(row["keyword"]))
            if not keyword_id:
                continue
            for source in row.get("sources") or []:
                source_type = source.get("source_type")
                source_index = source.get("source_index")
                if source_type not in {"seed", "competitor", "client_website"} or source_index is None:
                    continue
                source_value = ""
                if source_type == "seed" and 0 <= source_index < len(seeds):
                    source_value = seeds[source_index]
                elif source_type == "competitor" and 0 <= source_index < len(competitors):
                    source_value = competitors[source_index]
                elif source_type == "client_website" and 0 <= source_index < len(client_websites):
                    source_value = client_websites[source_index]
                source_rows.append(
                    {
                        "run_id": job_id,
                        "project_id": project_id,
                        "keyword_id": keyword_id,
                        "source_type": source_type,
                        "source_index": source_index,
                        "source_value": source_value,
                        "rank_group": source.get("rank_group"),
                        "rank_absolute": source.get("rank_absolute"),
                    }
                )

        if source_rows:
            await self._request(
                "POST",
                "/keyword_expansion_keyword_sources",
                json=source_rows,
                headers={"Prefer": "return=minimal"},
            )


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
        keyword_info = item.get("keyword_info")
        volume_details = resolve_effective_volume_details(keyword_info)
        rows.append(
            {
                "keyword": keyword,
                "search_volume": volume_details["search_volume"],
                "latest_monthly_search_volume": volume_details["latest_monthly_search_volume"],
                "volume_source": volume_details["volume_source"],
                "cpc": parse_float((keyword_info or {}).get("cpc")),
                "competition": parse_float((keyword_info or {}).get("competition")),
                "low_top_of_page_bid": parse_float((keyword_info or {}).get("low_top_of_page_bid")),
                "high_top_of_page_bid": parse_float((keyword_info or {}).get("high_top_of_page_bid")),
                "monthly_searches_json": (keyword_info or {}).get("monthly_searches"),
                "sources": [
                    {
                        "ref": f"s{seed_index}",
                        "source_type": "seed",
                        "source_index": seed_index,
                        "rank_group": None,
                        "rank_absolute": None,
                    }
                ],
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
        keyword_info = keyword_data.get("keyword_info")
        volume_details = resolve_effective_volume_details(keyword_info)
        serp_item = (((item.get("ranked_serp_element") or {}).get("serp_item")) or {})
        rows.append(
            {
                "keyword": keyword,
                "search_volume": volume_details["search_volume"],
                "latest_monthly_search_volume": volume_details["latest_monthly_search_volume"],
                "volume_source": volume_details["volume_source"],
                "cpc": parse_float((keyword_info or {}).get("cpc")),
                "competition": parse_float((keyword_info or {}).get("competition")),
                "low_top_of_page_bid": parse_float((keyword_info or {}).get("low_top_of_page_bid")),
                "high_top_of_page_bid": parse_float((keyword_info or {}).get("high_top_of_page_bid")),
                "monthly_searches_json": (keyword_info or {}).get("monthly_searches"),
                "sources": [
                    {
                        "ref": f"c{competitor_index}",
                        "source_type": "competitor",
                        "source_index": competitor_index,
                        "rank_group": parse_int(serp_item.get("rank_group")),
                        "rank_absolute": parse_int(serp_item.get("rank_absolute")),
                    }
                ],
            }
        )
    return rows


def extract_client_website_rows(result: dict[str, Any], website_index: int) -> list[dict[str, Any]]:
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
        keyword_info = keyword_data.get("keyword_info")
        volume_details = resolve_effective_volume_details(keyword_info)
        serp_item = (((item.get("ranked_serp_element") or {}).get("serp_item")) or {})
        rows.append(
            {
                "keyword": keyword,
                "search_volume": volume_details["search_volume"],
                "latest_monthly_search_volume": volume_details["latest_monthly_search_volume"],
                "volume_source": volume_details["volume_source"],
                "cpc": parse_float((keyword_info or {}).get("cpc")),
                "competition": parse_float((keyword_info or {}).get("competition")),
                "low_top_of_page_bid": parse_float((keyword_info or {}).get("low_top_of_page_bid")),
                "high_top_of_page_bid": parse_float((keyword_info or {}).get("high_top_of_page_bid")),
                "monthly_searches_json": (keyword_info or {}).get("monthly_searches"),
                "sources": [
                    {
                        "ref": f"w{website_index}",
                        "source_type": "client_website",
                        "source_index": website_index,
                        "rank_group": parse_int(serp_item.get("rank_group")),
                        "rank_absolute": parse_int(serp_item.get("rank_absolute")),
                    }
                ],
            }
        )
    return rows


def get_best_rank_for_source_type(
    sources: list[dict[str, Any]],
    source_type: str,
) -> tuple[int | None, int | None]:
    ranked_sources = [
        source
        for source in sources
        if isinstance(source, dict) and source.get("source_type") == source_type
    ]
    if not ranked_sources:
        return None, None

    best_group: int | None = None
    best_absolute: int | None = None

    for source in ranked_sources:
        rank_group = source.get("rank_group")
        rank_absolute = source.get("rank_absolute")
        if isinstance(rank_group, int) and (best_group is None or rank_group < best_group):
            best_group = rank_group
        if isinstance(rank_absolute, int) and (best_absolute is None or rank_absolute < best_absolute):
            best_absolute = rank_absolute

    return best_group, best_absolute


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
                "latest_monthly_search_volume": row.get("latest_monthly_search_volume"),
                "volume_source": row.get("volume_source") or "missing",
                "cpc": row.get("cpc"),
                "competition": row.get("competition"),
                "low_top_of_page_bid": row.get("low_top_of_page_bid"),
                "high_top_of_page_bid": row.get("high_top_of_page_bid"),
                "monthly_searches_json": row.get("monthly_searches_json"),
                "sources": list(row.get("sources") or []),
                "source_refs": [source.get("ref") for source in (row.get("sources") or []) if source.get("ref")],
            }
            continue

        current_volume = current.get("search_volume")
        current_score = current_volume if isinstance(current_volume, int) else -1
        next_score = volume if isinstance(volume, int) else -1
        source_map = {
            source["ref"]: source
            for source in current.get("sources", [])
            if isinstance(source, dict) and source.get("ref")
        }
        for source in row.get("sources") or []:
            ref = source.get("ref")
            if not ref:
                continue
            existing = source_map.get(ref)
            if existing is None:
                source_map[ref] = source
                continue
            existing_rank = existing.get("rank_group")
            next_rank = source.get("rank_group")
            if isinstance(next_rank, int) and (
                not isinstance(existing_rank, int) or next_rank < existing_rank
            ):
                source_map[ref] = source

        current["sources"] = list(source_map.values())
        current["source_refs"] = dedupe_preserve_order(list(source_map.keys()))
        (
            current["best_competitor_rank_group"],
            current["best_competitor_rank_absolute"],
        ) = get_best_rank_for_source_type(current["sources"], "competitor")
        (
            current["best_client_website_rank_group"],
            current["best_client_website_rank_absolute"],
        ) = get_best_rank_for_source_type(current["sources"], "client_website")

        if next_score > current_score:
            current["keyword"] = keyword
            current["search_volume"] = volume
            current["latest_monthly_search_volume"] = row.get("latest_monthly_search_volume")
            current["volume_source"] = row.get("volume_source") or "missing"
            current["cpc"] = row.get("cpc")
            current["competition"] = row.get("competition")
            current["low_top_of_page_bid"] = row.get("low_top_of_page_bid")
            current["high_top_of_page_bid"] = row.get("high_top_of_page_bid")
            current["monthly_searches_json"] = row.get("monthly_searches_json")

    for row in deduped.values():
        (
            row["best_competitor_rank_group"],
            row["best_competitor_rank_absolute"],
        ) = get_best_rank_for_source_type(row.get("sources") or [], "competitor")
        (
            row["best_client_website_rank_group"],
            row["best_client_website_rank_absolute"],
        ) = get_best_rank_for_source_type(row.get("sources") or [], "client_website")

    return sorted(
        deduped.values(),
        key=lambda item: (
            -(item["search_volume"] if isinstance(item["search_volume"], int) else 0),
            item["keyword"],
        ),
    )


def resolve_source_ref_label(
    source_ref: str,
    seeds: list[str],
    competitors: list[str],
    client_websites: list[str],
) -> str:
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
    if prefix == "w" and 0 <= index < len(client_websites):
        return client_websites[index]
    return ref


def build_csv_text(
    rows: list[dict[str, Any]],
    seeds: list[str],
    competitors: list[str],
    client_websites: list[str],
) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["keyword", "search_volume", "source_refs"])
    for row in rows:
        value = row["search_volume"] if isinstance(row["search_volume"], int) else "-"
        source_labels = [
            resolve_source_ref_label(source_ref, seeds, competitors, client_websites)
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
            "total_client_websites": len(job.request.client_websites),
            "completed_client_websites": 0,
            "total_api_calls": 0,
            "current_item": None,
            "message": "Starting seed keyword expansion",
        }

    client = DataForSEOClient()
    persistence = SupabasePersistence()
    location_name = job.request.location_name
    seed_page_size = job.request.seed_limit_per_page
    competitor_page_size = job.request.competitor_limit_per_page
    competitor_top_rank = job.request.competitor_top_rank
    seed_rows: list[dict[str, Any]] = []
    competitor_rows: list[dict[str, Any]] = []
    client_website_rows: list[dict[str, Any]] = []

    try:
        await persistence.create_run(job_id, job.request)
        await persistence.update_run(
            job_id,
            status=JobStatus.running,
            progress=job.progress,
            started_at=job.started_at,
        )
        await persistence.insert_seeds_and_competitors(job_id, job.request)

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

        job.progress["phase"] = "client_website_expansion"
        job.progress["message"] = "Collecting client website ranking keywords"

        for website_index, domain in enumerate(job.request.client_websites):
            current_rows = await fetch_competitor_keywords(
                client=client,
                location_name=location_name,
                page_size=competitor_page_size,
                top_rank=competitor_top_rank,
                competitor_index=website_index,
                domain=domain,
                progress=job.progress,
            )
            normalized_rows = []
            for row in current_rows:
                next_sources = []
                for source in row.get("sources") or []:
                    next_sources.append(
                        {
                            **source,
                            "ref": f"w{website_index}",
                            "source_type": "client_website",
                            "source_index": website_index,
                        }
                    )
                normalized_rows.append({**row, "sources": next_sources})

            client_website_rows.extend(normalized_rows)
            job.progress["completed_client_websites"] += 1

        job.progress["phase"] = "dedupe"
        job.progress["current_item"] = None
        job.progress["message"] = "Combining and deduplicating keywords"

        merged_rows = dedupe_keywords(seed_rows + competitor_rows + client_website_rows)
        csv_text = build_csv_text(
            merged_rows,
            seeds=job.request.seed_keywords,
            competitors=job.request.competitor_domains,
            client_websites=job.request.client_websites,
        )
        result = {
            "summary": {
                "total_seed_keywords": len(job.request.seed_keywords),
                "total_competitor_domains": len(job.request.competitor_domains),
                "total_client_websites": len(job.request.client_websites),
                "total_seed_rows": len(seed_rows),
                "total_competitor_rows": len(competitor_rows),
                "total_client_website_rows": len(client_website_rows),
                "deduped_keywords": len(merged_rows),
                "total_api_calls": job.progress["total_api_calls"],
            },
            "source_catalog": {
                "s": job.request.seed_keywords,
                "c": job.request.competitor_domains,
                "w": job.request.client_websites,
            },
            "keywords": [
                {
                    "keyword": row["keyword"],
                    "search_volume": row["search_volume"] if isinstance(row["search_volume"], int) else "-",
                    "volume_source": row.get("volume_source"),
                    "latest_monthly_search_volume": row.get("latest_monthly_search_volume"),
                    "cpc": row.get("cpc"),
                    "competition": row.get("competition"),
                    "low_top_of_page_bid": row.get("low_top_of_page_bid"),
                    "high_top_of_page_bid": row.get("high_top_of_page_bid"),
                    "best_competitor_rank_group": row.get("best_competitor_rank_group"),
                    "best_competitor_rank_absolute": row.get("best_competitor_rank_absolute"),
                    "best_client_website_rank_group": row.get("best_client_website_rank_group"),
                    "best_client_website_rank_absolute": row.get("best_client_website_rank_absolute"),
                    "source_count": len(row.get("source_refs") or []),
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

        if job.request.project_id and job.request.persist_raw_keywords:
            await persistence.insert_keywords_and_sources(
                job_id=job_id,
                project_id=job.request.project_id,
                rows=merged_rows,
                seeds=job.request.seed_keywords,
                competitors=job.request.competitor_domains,
                client_websites=job.request.client_websites,
            )
        await persistence.update_run(
            job_id,
            status=JobStatus.completed,
            progress=job.progress,
            completed_at=job.completed_at,
            total_seed_rows=len(seed_rows),
            total_competitor_rows=len(competitor_rows),
            total_client_website_rows=len(client_website_rows),
            deduped_keywords=len(merged_rows),
        )
    except Exception as exc:
        async with jobs_lock:
            job.status = JobStatus.failed
            job.completed_at = utc_now()
            job.error = str(exc)
            job.progress["phase"] = "failed"
            job.progress["message"] = "Keyword expansion failed"
            job.progress["current_item"] = None
        try:
            await persistence.update_run(
                job_id,
                status=JobStatus.failed,
                progress=job.progress,
                error_message=str(exc),
                completed_at=job.completed_at,
                total_seed_rows=len(seed_rows),
                total_competitor_rows=len(competitor_rows),
                total_client_website_rows=len(client_website_rows),
            )
        except Exception:
            pass
    finally:
        await client.close()
        await persistence.close()


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
