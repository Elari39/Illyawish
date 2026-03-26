#!/bin/sh
set -eu

data_dir="/data"
sqlite_dir="$data_dir"
upload_dir="$data_dir/uploads"

mkdir -p "$sqlite_dir" "$upload_dir"
chown -R app:app "$data_dir"

exec su-exec app "$@"
