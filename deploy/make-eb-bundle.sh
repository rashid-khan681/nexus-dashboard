#!/usr/bin/env bash
# Creates dist/nexus-eb.zip, the bundle you upload to Elastic Beanstalk.
# It contains: docker-compose.yml, the nginx proxy, and the platform hook. It never contains .env.
#
# Usage (from the repository root):
#   ./deploy/make-eb-bundle.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)"
OUT="${ROOT}/dist/nexus-eb.zip"

cp "${ROOT}/deploy/eb/docker-compose.yml" "${STAGE}/docker-compose.yml"
mkdir -p "${STAGE}/nginx" "${STAGE}/.platform/hooks/postdeploy"
cp "${ROOT}/nginx/Dockerfile" "${ROOT}/nginx/nginx.conf" "${STAGE}/nginx/"
cp "${ROOT}/deploy/eb/hooks/01_setup_healthd_permissions.sh" "${STAGE}/.platform/hooks/postdeploy/"
chmod +x "${STAGE}/.platform/hooks/postdeploy/01_setup_healthd_permissions.sh"

mkdir -p "${ROOT}/dist"
rm -f "${OUT}"
(cd "${STAGE}" && zip -r -X "${OUT}" . -x ".env" -x "*.DS_Store")
rm -rf "${STAGE}"

echo "Created ${OUT}"
unzip -l "${OUT}"
