# Step 2 FastAPI Prototype

Async job API for the new keyword expansion step.

## Scope

- Fixed market: `Thailand`
- Fixed language: `th`
- Expands all `seed_keywords` via DataForSEO Labs keyword suggestions
- Pulls ranked organic keywords for each competitor domain to full exhaustion
- Deduplicates by keyword after removing spaces
- Uses `keyword_info.search_volume` first
- If `search_volume` is missing or `0`, falls back to the latest `monthly_searches` value
- Includes `main_intent` when available
- Exports both JSON results and CSV

## Environment

Set these environment variables before running:

- `DFS_API_LOGIN`
- `DFS_API_PASSWORD`

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r step2_api/requirements.txt
```

## Run

```bash
uvicorn step2_api.app:app --reload --port 8010
```

## Endpoints

### `POST /jobs/expand`

Request body:

```json
{
  "seed_keywords": ["โซล่าเซลล์", "solar cell", "ออนกริด"],
  "competitor_domains": ["example.com", "example.org"]
}
```

Notes:

- `competitor_domains` is optional
- Seed expansion paginates to full exhaustion using `limit=500`, `offset=0,500,1000...`
- Competitor expansion paginates to full exhaustion using `limit=200`, `offset=0,200,400...`

### `GET /jobs/{job_id}`

Returns job status and progress.

### `GET /jobs/{job_id}/result`

Returns full JSON result after completion.

### `GET /jobs/{job_id}/csv`

Downloads the completed CSV output.

## Output format

CSV:

```csv
keyword,search_volume,main_intent
โซล่าเซลล์,40500,transactional
solar cell,9900,commercial
โซล่าเซลล์ facebook,-,
```

## Notes

- This is an in-memory prototype. Jobs disappear if the server restarts.
- Concurrency is capped inside the process to stay well below DataForSEO Labs limits.
