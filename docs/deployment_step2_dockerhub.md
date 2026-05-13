# Step 2 Docker Hub Deployment

Step 2 is the FastAPI keyword expansion service. It should remain a separate
container service because it runs asynchronous jobs and calls DataForSEO.

Step 3 should be deployed as a separate long-running API when grouping jobs are
large. Vercel can still host the frontend, but long Claude grouping jobs should
run outside Vercel serverless limits.

## Build And Push

Login to Docker Hub first:

```bash
docker login
```

Build and push the Step 2 image:

```bash
scripts/push-step2-dockerhub.sh <dockerhub-user-or-org>/<repo> latest
```

Example:

```bash
scripts/push-step2-dockerhub.sh convertcake/martech-seo-step2 latest
```

The image URL will be:

```bash
docker.io/<dockerhub-user-or-org>/<repo>:latest
```

## Runtime

The container runs:

```bash
uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}
```

Health check:

```bash
curl https://STEP2_SERVICE_URL/health
```

## Required Env Vars

```bash
DFS_API_LOGIN=...
DFS_API_PASSWORD=...
```

Optional persistence env vars:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Frontend Env

Set this in Vercel:

```bash
VITE_STEP2_API_BASE_URL=https://STEP2_SERVICE_URL
```

If Step 3 is deployed as an external API, also set:

```bash
VITE_STEP3_API_BASE_URL=https://STEP3_SERVICE_URL/api/keywords
```
