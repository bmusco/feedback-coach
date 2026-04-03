.PHONY: run deploy deploy-api deploy-api-dry deploy-frontend

-include .env
export

run:
	npm start

deploy: deploy-frontend deploy-api

deploy-frontend:
	./scripts/deploy-frontend.sh

deploy-api:
	./scripts/deploy.sh

deploy-api-dry:
	DRY_RUN=1 ./scripts/deploy.sh
