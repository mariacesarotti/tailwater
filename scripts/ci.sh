#!/usr/bin/env bash
set -euo pipefail

echo "== atelier"
(cd atelier && uv sync --locked && uv run ruff check . && uv run ruff format --check . && uv run mypy src)

echo "== web"
(cd web && npm ci && npm test && npm run build)

echo "CI local ok"