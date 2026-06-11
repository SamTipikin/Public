#!/usr/bin/env bash
#
# Snap Spacing to Variable — one-shot GitHub setup + push.
# Run from Terminal:  bash push-to-github.sh
#
set -euo pipefail

# ---- edit these two if you like ---------------------------------
REPO_NAME="snap-to-variable"
VISIBILITY="public"          # public | private
# -----------------------------------------------------------------

# Always operate from the folder this script lives in.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Clean out any half-initialised repo from earlier attempts.
rm -rf .git

git init -q
git config user.email "sam@denormalized.co"
git config user.name  "Sam"

# Don't commit local noise.
[ -f .gitignore ] || printf "node_modules/\n.DS_Store\n" > .gitignore

git add manifest.json code.js ui.html .gitignore
git commit -q -m "Snap Spacing to Variable — live auto layout spacing to variable binding"
git branch -M main

# Create the GitHub repo (under your authenticated account) and push.
gh repo create "$REPO_NAME" --"$VISIBILITY" --source=. --remote=origin --push

echo
echo "Done. Repo URL:"
gh repo view "$REPO_NAME" --json url -q .url
