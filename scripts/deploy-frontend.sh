#!/usr/bin/env bash
set -euo pipefail

AWS_S3_BUCKET="${AWS_S3_BUCKET:?AWS_S3_BUCKET is required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_CLOUDFRONT_ID="${AWS_CLOUDFRONT_ID:-}"
AWS_S3_PREFIX="${AWS_S3_PREFIX:-}"
API_BASE="${API_BASE:?API_BASE is required (for example https://feedback-coach-api.int-tools.cmtelematics.com)}"
WS_BASE="${WS_BASE:-}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

case "${API_BASE}" in
  https://*)
    DEFAULT_WS_BASE="wss://${API_BASE#https://}"
    ;;
  http://*)
    DEFAULT_WS_BASE="ws://${API_BASE#http://}"
    ;;
  *)
    echo "ERROR: API_BASE must start with http:// or https://" >&2
    exit 1
    ;;
esac

if [ -z "${WS_BASE}" ]; then
  WS_BASE="${DEFAULT_WS_BASE}"
fi

if [ -n "${AWS_S3_PREFIX}" ]; then
  S3_DEST="s3://${AWS_S3_BUCKET}/${AWS_S3_PREFIX#/}/"
else
  S3_DEST="s3://${AWS_S3_BUCKET}/"
fi

log "Checking AWS identity..."
aws sts get-caller-identity --region "${AWS_REGION}" > /dev/null

if [ ! -d "public" ]; then
  echo "ERROR: public directory not found. Run from the repo root." >&2
  exit 1
fi

DIST_DIR="$(mktemp -d)"
cp -r public/. "${DIST_DIR}/"
ASSET_VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

log "Injecting frontend runtime config..."
sed -i.bak "s|</head>|<script>window.FEEDBACK_COACH_API_BASE='${API_BASE}';window.FEEDBACK_COACH_WS_BASE='${WS_BASE}';</script></head>|" "${DIST_DIR}/index.html"
rm -f "${DIST_DIR}/index.html.bak"

log "Versioning frontend asset references..."
sed -i.bak \
  -e "s|href=\"style.css\"|href=\"style.css?v=${ASSET_VERSION}\"|g" \
  -e "s|src=\"app.js\"|src=\"app.js?v=${ASSET_VERSION}\"|g" \
  "${DIST_DIR}/index.html"
rm -f "${DIST_DIR}/index.html.bak"

log "Syncing static assets to ${S3_DEST}..."
aws s3 sync "${DIST_DIR}/" "${S3_DEST}" \
  --region "${AWS_REGION}" \
  --exclude "*.html" \
  --cache-control "public, max-age=31536000, immutable"

log "Uploading HTML with no-cache headers..."
for html in "${DIST_DIR}"/*.html; do
  [ -f "${html}" ] || continue
  filename="$(basename "${html}")"
  aws s3 cp "${html}" "${S3_DEST}${filename}" \
    --region "${AWS_REGION}" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html"
done

log "Creating 404.html SPA fallback..."
aws s3 cp "${DIST_DIR}/index.html" "${S3_DEST}404.html" \
  --region "${AWS_REGION}" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

if [ -n "${AWS_CLOUDFRONT_ID}" ]; then
  log "Invalidating CloudFront distribution ${AWS_CLOUDFRONT_ID}..."
  aws cloudfront create-invalidation \
    --distribution-id "${AWS_CLOUDFRONT_ID}" \
    --paths "/*" \
    --region "${AWS_REGION}" \
    --query 'Invalidation.Id' \
    --output text
fi

rm -rf "${DIST_DIR}"

log "Frontend deploy complete -> ${S3_DEST}"
