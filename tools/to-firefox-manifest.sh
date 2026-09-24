#!/usr/bin/env bash
# Swaps a manifest.json's MV3 background field from Chrome's
# "service_worker" form to Firefox's "scripts" array form, in place.
#
# This is the one place this swap is implemented. tools/build.sh calls it to
# produce the Firefox package, and .github/workflows/ci.yml's web-ext lint
# step calls it against a disposable copy of the manifest so the two never
# drift out of sync with each other.
set -euo pipefail

MANIFEST="${1:?usage: to-firefox-manifest.sh <path-to-manifest.json>}"

sed -i 's/"service_worker": "worker.js"/"scripts": ["worker.js"]/' "$MANIFEST"
