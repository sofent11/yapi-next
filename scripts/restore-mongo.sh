#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "==========================================================="
    echo "Usage: $0 <path-to-mongodump>"
    echo "Example (Directory): $0 ./dump"
    echo "Example (Archive):   $0 ./dump.archive"
    echo "Example (Zip):       $0 ./dump.zip"
    echo "==========================================================="
    exit 1
fi

DUMP_PATH="$1"

if [ ! -e "$DUMP_PATH" ]; then
    echo "Error: File or directory '$DUMP_PATH' does not exist."
    exit 1
fi

# Ensure we are in the project root directory where docker-compose.yml lives
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! docker compose version >/dev/null 2>&1; then
    echo "Error: 'docker compose' is not available. Please ensure Docker is installed."
    exit 1
fi

MONGO_CONTAINER=$(docker compose ps -q mongo)

if [ -z "$MONGO_CONTAINER" ]; then
    echo "Error: The 'mongo' service is not running. Start it with 'docker compose up -d mongo'."
    exit 1
fi

echo "=> Found mongo container ID: $MONGO_CONTAINER"

HOST_TMP_DIR=""

cleanup() {
    docker exec "$MONGO_CONTAINER" rm -rf /tmp/yapi_dump_target >/dev/null 2>&1 || true
    if [ -n "$HOST_TMP_DIR" ] && [ -d "$HOST_TMP_DIR" ]; then
        rm -rf "$HOST_TMP_DIR"
    fi
}

trap cleanup EXIT

find_restore_dir() {
    local base_dir="$1"
    local direct_match

    if find "$base_dir" -type f \( -name '*.bson' -o -name '*.metadata.json' \) | grep -q .; then
        echo "$base_dir"
        return 0
    fi

    direct_match="$(find "$base_dir" -mindepth 1 -maxdepth 1 -type d | while read -r candidate; do
        if find "$candidate" -type f \( -name '*.bson' -o -name '*.metadata.json' \) | grep -q .; then
            echo "$candidate"
            break
        fi
    done)"

    if [ -n "$direct_match" ]; then
        echo "$direct_match"
        return 0
    fi

    return 1
}

restore_from_directory() {
    local source_dir="$1"
    echo "=> Copying backup directory '$source_dir' to container..."
    docker exec "$MONGO_CONTAINER" mkdir -p /tmp/yapi_dump_target
    tar -C "$source_dir" -cf - . | docker exec -i "$MONGO_CONTAINER" sh -lc 'tar -C /tmp/yapi_dump_target -xf -'
    echo "=> Starting mongorestore from directory... (database: yapi)"
    docker exec "$MONGO_CONTAINER" mongorestore --drop --nsInclude="*.*" --nsFrom="prod-mongodb.*" --nsTo="yapi.*" /tmp/yapi_dump_target
}

if [ -d "$DUMP_PATH" ]; then
    restore_from_directory "$DUMP_PATH"
elif [[ "$DUMP_PATH" == *.zip ]]; then
    if ! command -v unzip >/dev/null 2>&1; then
        echo "Error: 'unzip' is required to restore from a .zip backup."
        exit 1
    fi

    HOST_TMP_DIR="$(mktemp -d)"
    echo "=> Extracting zip archive '$DUMP_PATH' to temporary directory..."
    unzip -q "$DUMP_PATH" -d "$HOST_TMP_DIR"

    RESTORE_DIR="$(find_restore_dir "$HOST_TMP_DIR" || true)"
    if [ -z "$RESTORE_DIR" ]; then
        echo "Error: No mongodump contents (*.bson or *.metadata.json) found in zip archive '$DUMP_PATH'."
        exit 1
    fi

    restore_from_directory "$RESTORE_DIR"
else
    echo "=> Copying backup archive '$DUMP_PATH' to container..."
    docker cp "$DUMP_PATH" "$MONGO_CONTAINER":/tmp/yapi_dump_target
    echo "=> Starting mongorestore from archive... (database: yapi)"
    docker exec "$MONGO_CONTAINER" mongorestore --drop --nsInclude="*.*" --nsFrom="prod-mongodb.*" --nsTo="yapi.*" --archive=/tmp/yapi_dump_target
fi

echo "=> Restore finished successfully!"
