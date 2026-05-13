#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-}"
TAG="${2:-latest}"

if [[ -z "$IMAGE" ]]; then
  echo "Usage: scripts/push-step3-dockerhub.sh <dockerhub-user-or-org>/<repo> [tag]"
  echo "Example: scripts/push-step3-dockerhub.sh convertcake/martech-seo-step3 latest"
  exit 1
fi

FULL_IMAGE="${IMAGE}:${TAG}"

docker build \
  --platform linux/amd64 \
  -f Dockerfile.step3 \
  -t "$FULL_IMAGE" \
  .

docker push "$FULL_IMAGE"

echo "Pushed: $FULL_IMAGE"
