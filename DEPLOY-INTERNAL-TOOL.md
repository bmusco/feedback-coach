# Feedback Coach - Internal Tool Deployment

`feedback-coach` is a split internal-tool deployment:

- Frontend: static files from `public/` served from S3 + CloudFront
- API: Node + WebSocket server in ECS Fargate
- Runtime dependency: Claude CLI must be authenticated inside the container

## Architecture

```text
User -> https://feedback-coach.int-tools.cmtelematics.com
          |
          +-> CloudFront / S3 (index.html, app.js, style.css)

Frontend JS -> https://feedback-coach-api.int-tools.cmtelematics.com
               |
               +-> ALB -> ECS Fargate -> Node server -> Claude CLI
```

## Prerequisites

- AWS CLI v2 with a valid `cmtaws sso login`
- Docker with `linux/amd64` build support
- Access to `terraform-dev`
- Claude CLI credentials prepared for the ECS task runtime

## One-Time Setup

### 1. Frontend infrastructure

Copy [`deploy/terraform/frontend/terragrunt.hcl`](/Users/bmusco/cmt/feedback-coach/deploy/terraform/frontend/terragrunt.hcl) into `terraform-dev`:

```bash
cp -r deploy/terraform/frontend \
  ../terraform-dev/environments/internal-tools/cloudfront/feedback-coach/
```

Expected outputs after apply:

- S3 bucket: `feedback-coach-int-tools`
- Website domain: `feedback-coach.int-tools.cmtelematics.com`
- CloudFront distribution ID: capture this for deploys and the Jamf ticket

### 2. API infrastructure

Provision or confirm:

- ECR repository for `feedback-coach`
- ECS service named `feedback-coach`
- ALB / listener / target group for `feedback-coach-api.int-tools.cmtelematics.com`
- Task definition exposing port `3333`
- Health check path `/api/health`

Recommended task environment:

```text
PORT=3333
CLAUDE_CLI=/home/appuser/.local/bin/claude
```

### 3. Claude CLI auth inside the container

The image installs Claude CLI, but the container still needs authenticated Claude config at runtime. A practical pattern is to package the `~/.claude` directory into Secrets Manager and unpack it in the task startup flow, or otherwise mount equivalent auth files into `/home/appuser/.claude`.

### 4. Jamf / access ticket

Open the internal access ticket with:

> Internal tool launch: please restrict Jamf trust IP for this app and allowlist `https://feedback-coach.int-tools.cmtelematics.com`. AWS context: S3 bucket `feedback-coach-int-tools`, CloudFront distribution ID `<DIST_ID>`, region `us-east-1`.

If you keep the API on a separate user-facing hostname, include `https://feedback-coach-api.int-tools.cmtelematics.com` too.

## Local verification

```bash
npm start
curl http://localhost:3456/api/health
```

## Deploy

Create a local `.env` from [`.env.example`](/Users/bmusco/cmt/feedback-coach/.env.example), fill the real values, then run:

```bash
make deploy-frontend
make deploy-api
```

Or deploy both:

```bash
make deploy
```

## Future operator workflow

1. Update code in `feedback-coach`
2. Confirm `.env` has the right `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_ID`, `API_BASE`, `ECR_REPO`, `ECS_CLUSTER`, and `ECS_SERVICE`
3. Run `make deploy`
4. Verify:
   - `https://feedback-coach.int-tools.cmtelematics.com` loads
   - Starting a session connects to the API successfully
   - `https://feedback-coach-api.int-tools.cmtelematics.com/api/health` returns healthy status

## Troubleshooting

1. Frontend loads but chat never starts: confirm `API_BASE` and `WS_BASE` point at the live API hostname
2. Browser refresh 404s: confirm CloudFront custom error responses or uploaded `404.html`
3. ECS task fails immediately: verify Claude auth files are available in the container
4. `make deploy-api` fails immediately: verify the ECR repo exists in `us-east-1`, the ECS service exists in `us-east-2`, and `.env` includes `ECS_REGION=us-east-2`
5. Stale UI after deploy: invalidate CloudFront or hard refresh after `make deploy-frontend`
