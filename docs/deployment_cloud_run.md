# Cloud Run Deployment

This repo is set up for:

- Frontend on Vercel
- Step 2 FastAPI on Cloud Run
- Step 3 Express server on Cloud Run

## Prerequisites

- `gcloud` installed and authenticated
- billing enabled on the GCP project
- Artifact Registry enabled
- Cloud Run enabled
- Cloud Build enabled

Set these shell variables first:

```bash
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export REGION="asia-southeast1"
export REPO="martech-seo"
```

## 1. Create Artifact Registry

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION"
```

## 2. Deploy Step 2

Build from the `step2_api` folder:

```bash
gcloud builds submit ./step2_api \
  --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/martech-seo-step2"
```

Deploy:

```bash
gcloud run deploy martech-seo-step2 \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/martech-seo-step2" \
  --region "$REGION" \
  --allow-unauthenticated \
  --timeout 3600 \
  --set-env-vars DFS_API_LOGIN=YOUR_DFS_LOGIN,DFS_API_PASSWORD=YOUR_DFS_PASSWORD,SUPABASE_URL=YOUR_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Step 2 health:

```bash
curl https://STEP2_URL/health
```

## 3. Deploy Step 3

Build from the repo root:

```bash
gcloud builds submit . \
  --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/martech-seo-step3" \
  --file Dockerfile.step3
```

Deploy:

```bash
gcloud run deploy martech-seo-step3 \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/martech-seo-step3" \
  --region "$REGION" \
  --allow-unauthenticated \
  --timeout 3600 \
  --set-env-vars ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY,CLAUDE_MODEL=claude-sonnet-4-6,CLAUDE_RELEVANCE_MODEL=claude-haiku-4-5,SUPABASE_URL=YOUR_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Optional:

- add `GEMINI_API_KEY` only if you want Gemini available

Step 3 health:

```bash
curl https://STEP3_URL/api/health
```

## 4. Point Vercel to Cloud Run

Set these Vercel environment variables:

```bash
VITE_STEP2_API_BASE_URL=https://STEP2_URL
VITE_STEP3_API_BASE_URL=https://STEP3_URL/api/keywords
```

## Notes

- Step 2 already allows browser CORS without an origin allowlist.
- Step 3 already uses open CORS in Express.
- Step 3 now supports `PORT`, which Cloud Run injects automatically.
