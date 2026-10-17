#!/usr/bin/env bash
# Builds the backend and frontend images for linux/amd64 and pushes them to Docker Hub.
#
# Why amd64: Beanstalk t3.* instances are x86_64. A MacBook with an Apple chip builds arm64 images by
# default, which fail on the instance with "exec format error".
#
# Usage (from the repository root, after `docker login`):
#   ./deploy/build-and-push.sh v2
set -euo pipefail

TAG="${1:-v2}"
HUB_USER="${HUB_USER:-rashidkhan6685}"

echo "Building and pushing ${HUB_USER}/nexus-backend:${TAG} (linux/amd64)"
docker buildx build --platform linux/amd64 -t "${HUB_USER}/nexus-backend:${TAG}" --push ./backend

echo "Building and pushing ${HUB_USER}/nexus-frontend:${TAG} (linux/amd64)"
docker buildx build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_MODE=same-origin \
  -t "${HUB_USER}/nexus-frontend:${TAG}" --push ./frontend

echo "Done. Next: ./deploy/make-eb-bundle.sh"
