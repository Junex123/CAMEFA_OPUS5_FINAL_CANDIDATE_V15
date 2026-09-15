#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-camefa-engine-$(date +%Y%m%d).zip}"

echo "==> install"
pnpm install --frozen-lockfile

echo "==> typecheck"
pnpm turbo run typecheck || { echo "TYPECHECK FAILED — not packing"; exit 1; }

echo "==> test"
pnpm turbo run test || { echo "TESTS FAILED — not packing"; exit 1; }

echo "==> build"
pnpm turbo run build || { echo "BUILD FAILED — not packing"; exit 1; }

echo "==> pack $OUT"
git ls-files -z \
  | grep -zv '^\.env' \
  | xargs -0 zip -q "$OUT"
zip -q "$OUT" pnpm-lock.yaml 2>/dev/null || true

echo "OK: $OUT ($(du -h "$OUT" | cut -f1))"
