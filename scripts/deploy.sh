#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_REGION="${ECS_REGION:-${AWS_REGION}}"
ECR_REPO="${ECR_REPO:?ECR_REPO is required (for example 123456789012.dkr.ecr.us-east-1.amazonaws.com/feedback-coach)}"
ECS_CLUSTER="${ECS_CLUSTER:?ECS_CLUSTER is required}"
ECS_SERVICE="${ECS_SERVICE:-feedback-coach}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
DRY_RUN="${DRY_RUN:-}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "Checking AWS identity..."
aws sts get-caller-identity --region "${AWS_REGION}" > /dev/null

log "Building image: feedback-coach:${IMAGE_TAG}"
docker buildx build --platform linux/amd64 --load -t "feedback-coach:${IMAGE_TAG}" .

log "Tagging image for ECR..."
docker tag "feedback-coach:${IMAGE_TAG}" "${ECR_REPO}:${IMAGE_TAG}"
docker tag "feedback-coach:${IMAGE_TAG}" "${ECR_REPO}:latest"
docker tag "feedback-coach:${IMAGE_TAG}" "${ECR_REPO}:main"

log "Authenticating to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REPO%%/*}"

if [ -n "${DRY_RUN}" ]; then
  log "DRY RUN - skipping push and ECS deploy"
  exit 0
fi

log "Pushing ${ECR_REPO}:${IMAGE_TAG}..."
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:latest"
docker push "${ECR_REPO}:main"

log "Updating ECS service ${ECS_SERVICE} in cluster ${ECS_CLUSTER} (${ECS_REGION})..."
aws ecs update-service \
  --region "${ECS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --service "${ECS_SERVICE}" \
  --force-new-deployment \
  --query 'service.deployments[0].status' \
  --output text

log "Waiting for service to stabilize..."
aws ecs wait services-stable \
  --region "${ECS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --services "${ECS_SERVICE}"

log "API deploy complete - ${ECR_REPO}:${IMAGE_TAG}"
