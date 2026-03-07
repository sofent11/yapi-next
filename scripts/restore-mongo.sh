#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "==========================================================="
    echo "Usage: $0 <path-to-mongodump>"
    echo "Example (Directory): $0 ./dump"
    echo "Example (Archive):   $0 ./dump.archive"
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

# Clean up any existing dump targets in the container to prevent collision or space issues
docker exec "$MONGO_CONTAINER" rm -rf /tmp/yapi_dump_target

if [ -d "$DUMP_PATH" ]; then
    echo "=> Copying backup directory '$DUMP_PATH' to container..."
    docker cp "$DUMP_PATH/." "$MONGO_CONTAINER":/tmp/yapi_dump_target
    echo "=> Starting mongorestore from directory... (database: yapi)"
    docker exec "$MONGO_CONTAINER" mongorestore --drop --nsInclude="*.*" --nsFrom="prod-mongodb.*" --nsTo="yapi.*" /tmp/yapi_dump_target
else
    echo "=> Copying backup archive '$DUMP_PATH' to container..."
    docker cp "$DUMP_PATH" "$MONGO_CONTAINER":/tmp/yapi_dump_target
    echo "=> Starting mongorestore from archive... (database: yapi)"
    docker exec "$MONGO_CONTAINER" mongorestore --drop --nsInclude="*.*" --nsFrom="prod-mongodb.*" --nsTo="yapi.*" --archive=/tmp/yapi_dump_target
fi

# Clean up the payload inside container
docker exec "$MONGO_CONTAINER" rm -rf /tmp/yapi_dump_target

echo "=> Restore finished successfully!"
