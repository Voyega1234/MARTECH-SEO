# Step 3 Cloud Run Deployment

Step 3 is the Node/Express keyword AI API from `server/index.ts`.

Use this as an external API when grouping, PAA, or relevance jobs can exceed
Vercel function limits.

## Build And Push To Docker Hub

Login first:

```bash
docker login
```

Build and push:

```bash
scripts/push-step3-dockerhub.sh <dockerhub-user-or-org>/<repo> latest
```

Example:

```bash
scripts/push-step3-dockerhub.sh nattametee1234/martech-seo-step3 latest
```

Image URL:

```bash
docker.io/<dockerhub-user-or-org>/<repo>:latest
```

## Deploy To Cloud Run

```bash
gcloud run deploy martech-seo-step3 \
  --image docker.io/<dockerhub-user-or-org>/<repo>:latest \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --timeout 3600 \
  --memory 1Gi \
  --set-env-vars ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY,CLAUDE_MODEL=claude-sonnet-4-6,CLAUDE_RELEVANCE_MODEL=claude-haiku-4-5,DFS_API_LOGIN=YOUR_DFS_LOGIN,DFS_API_PASSWORD=YOUR_DFS_PASSWORD,SUPABASE_URL=YOUR_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Health check:

```bash
curl https://STEP3_SERVICE_URL/api/health
```

Keyword API base:

```bash
https://STEP3_SERVICE_URL/api/keywords
```

## Vercel Env

Set this in the frontend Vercel project:

```bash
VITE_STEP3_API_BASE_URL=https://STEP3_SERVICE_URL/api/keywords
```

Keep Step 2 pointed at the Vercel proxy or external Step 2 URL:

```bash
STEP2_API_ORIGIN=http://srv934175.hstgr.cloud:8010
```

Do not set `VITE_STEP2_API_BASE_URL` unless you intentionally want browser-side
direct calls to Step 2.
