# Deployment: Vercel + Render

Recommended production split:

- `Vercel`: frontend only
- `Render Step 2`: FastAPI keyword expansion service
- `Render Step 3`: Node/Express keyword AI service from `server/index.ts`

## Why

Step 3 uses long-running Claude jobs and should not rely on Vercel function limits or in-memory serverless execution.

## Frontend env vars on Vercel

Set these in Vercel project settings:

```bash
VITE_STEP2_API_BASE_URL=https://cvc-keyword-expansion.onrender.com
VITE_STEP3_API_BASE_URL=https://YOUR-STEP3-SERVICE.onrender.com/api/keywords
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Notes:

- `VITE_STEP2_API_BASE_URL` should point to the FastAPI service root.
- `VITE_STEP3_API_BASE_URL` should include `/api/keywords` because the Express server mounts keyword routes there.
- Step 2 allows browser CORS from any origin because it does not rely on cookies or browser credentials.

## Step 2 service on Render

Deploy the FastAPI app from `step2_api/`.

Required env vars:

```bash
DFS_API_LOGIN=...
DFS_API_PASSWORD=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Start command example:

```bash
.venv/bin/uvicorn step2_api.app:app --host 0.0.0.0 --port $PORT
```

## Step 3 service on Render

Deploy the Node app from the repo root using `server/index.ts`.

Required env vars:

```bash
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-sonnet-4-6
CLAUDE_RELEVANCE_MODEL=claude-haiku-4-5
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...   # optional
SERVER_PORT=$PORT
```

Build command:

```bash
npm install
```

Start command:

```bash
node --import tsx server/index.ts
```

## Frontend behavior after this change

The app now uses:

- `VITE_STEP2_API_BASE_URL` for Step 2 job creation, polling, result, and CSV
- `VITE_STEP3_API_BASE_URL` for:
  - seed generation
  - relevance filter
  - grouping plan
  - grouping final
  - grouping jobs

If `VITE_STEP3_API_BASE_URL` is not set, the app falls back to local/Vercel-relative `/api/keywords`.
