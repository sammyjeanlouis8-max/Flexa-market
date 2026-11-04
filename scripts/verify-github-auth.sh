#!/usr/bin/env bash
# Verify GitHub auth configuration without printing secret values.
set -euo pipefail

echo "=== Flexa Market GitHub auth check (redacted) ==="

token_present=0
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN: present (value redacted)"
  token_present=1
else
  echo "GITHUB_TOKEN: MISSING"
fi

if [ -n "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN: present (value redacted)"
  token_present=1
else
  echo "GH_TOKEN: not set (optional alias)"
fi

if [ "$token_present" -eq 0 ]; then
  echo
  echo "Add a Cursor Runtime Secret named GITHUB_TOKEN, then start a NEW Cloud Agent."
  echo "Paste location: Cursor Dashboard → Cloud Agents → Environment → Secrets"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI: not installed in this environment"
  exit 0
fi

# Auth status may print the login name, never the token.
if gh auth status >/dev/null 2>&1; then
  echo "gh auth status: OK"
  gh api user --jq '"authenticated_as=" + (.login // "unknown")' 2>/dev/null || true
else
  echo "gh auth status: not authenticated with current secret"
  echo "Ensure the PAT is valid and named GITHUB_TOKEN or GH_TOKEN as a Runtime Secret."
  exit 1
fi

echo "=== Check complete (no secrets printed) ==="
