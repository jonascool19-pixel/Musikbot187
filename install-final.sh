#!/usr/bin/env bash
set -euo pipefail

# Final pinned installer for MusikBot187.
# The application payload is pinned to the CI-tested commit below.
PINNED_COMMIT="54e2924e01745924cd6f0e404e5f28d58dea4667"
REPO="jonascool19-pixel/radiobot"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ $EUID -ne 0 ]]; then
  echo 'Bitte als root ausführen.'
  exit 1
fi

curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/install.sh" -o "$TMP_DIR/install.sh"
# The tested payload is kept unchanged; only its mutable release ref is overridden
# locally before execution so the resulting updater remains pinned as well.
sed -i \
  "s/^RELEASE_REF=v2\.1\.0$/RELEASE_REF=${PINNED_COMMIT}/" \
  "$TMP_DIR/install.sh"
sed -i \
  's#https://codeload.github.com/jonascool19-pixel/radiobot/tar.gz/refs/heads/\\$RELEASE_REF#https://codeload.github.com/jonascool19-pixel/radiobot/tar.gz/\\$RELEASE_REF#' \
  "$TMP_DIR/install.sh"

bash "$TMP_DIR/install.sh"
