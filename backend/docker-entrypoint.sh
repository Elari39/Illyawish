#!/bin/sh
set -eu

data_dir="/data"
sqlite_dir="$data_dir"
upload_dir="$data_dir/uploads"

umask 0000

mkdir -p "$sqlite_dir" "$upload_dir"
chmod 0777 "$data_dir" "$upload_dir"

if [ -e "$data_dir/app.json" ]; then
  chmod 0644 "$data_dir/app.json"
fi

for path in \
  "$data_dir/aichat.db" \
  "$data_dir/aichat.db-journal" \
  "$data_dir/aichat.db-shm" \
  "$data_dir/aichat.db-wal"
do
  if [ -e "$path" ]; then
    chmod 0666 "$path"
  fi
done

exec su-exec app "$@"
