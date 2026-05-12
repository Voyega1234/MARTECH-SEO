# Step 2 Docker Hub Deployment

Step 2 is the FastAPI keyword expansion service. It should remain a separate
container service because it runs asynchronous jobs and calls DataForSEO.

Step 3 now runs inside the main Vercel app through `/api/keywords`, so it does
not need a separate container image in the normal deployment path.

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

Do not set `VITE_STEP3_API_BASE_URL` unless you intentionally want to point
Step 3 to an external API. The default internal path is `/api/keywords`.
