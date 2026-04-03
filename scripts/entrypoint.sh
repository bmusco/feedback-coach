#!/usr/bin/env bash
set -euo pipefail

if [ -n "${CLAUDE_CONFIG_TAR_B64:-}" ]; then
  mkdir -p "${HOME}/.claude"
  printf '%s' "${CLAUDE_CONFIG_TAR_B64}" | base64 -d | tar xz -C "${HOME}"
fi

exec "$@"
