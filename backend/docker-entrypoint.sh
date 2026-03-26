#!/bin/sh
set -eu

sqlite_dir="$(dirname "${SQLITE_PATH:-/data/aichat.db}")"
upload_dir="${UPLOAD_DIR:-/data/uploads}"

mkdir -p "$sqlite_dir" "$upload_dir"
chown -R app:app "$sqlite_dir" "$upload_dir"

exec su-exec app "$@"
