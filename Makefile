SHELL := /bin/bash

.PHONY: dev deploy

dev:
	npm ci
	npm run dev

deploy:
	@if ! command -v flyctl >/dev/null 2>&1; then \
		echo "flyctl is required for deployment. Install it from https://fly.io/docs/flyctl/install/"; \
		exit 1; \
	fi
	flyctl deploy --remote-only --depot=false
