#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MONGO_PORT="${MONGO_PORT:-27029}"
API_PORT="${API_PORT:-3302}"
DB_NAME="${DB_NAME:-yapi_next_self_assess}"
MONGO_CONTAINER="${MONGO_CONTAINER:-yapi-next-self-assess-mongo-$$}"
MONGO_URL="mongodb://127.0.0.1:${MONGO_PORT}/${DB_NAME}"
BASE_URL="http://127.0.0.1:${API_PORT}"
API_BASE="${BASE_URL}/api"
BENCH_NODE_PATH="${ROOT_DIR}/apps/api/node_modules${NODE_PATH:+:${NODE_PATH}}"

MENU_SEED_API_COUNT="${MENU_SEED_API_COUNT:-10000}"
MENU_SEED_BATCH_SIZE="${MENU_SEED_BATCH_SIZE:-1000}"
MENU_TOTAL_REQUESTS="${MENU_TOTAL_REQUESTS:-300}"
MENU_CONCURRENCY="${MENU_CONCURRENCY:-20}"
MENU_TARGET_P95="${MENU_TARGET_P95:-500}"

EXPORT_TOTAL_REQUESTS="${EXPORT_TOTAL_REQUESTS:-50}"
EXPORT_CONCURRENCY="${EXPORT_CONCURRENCY:-8}"
EXPORT_TARGET_P95="${EXPORT_TARGET_P95:-2000}"

IMPORT_API_COUNT="${IMPORT_API_COUNT:-1000}"
IMPORT_SYNC_MODE="${IMPORT_SYNC_MODE:-merge}"
IMPORT_TARGET_MS="${IMPORT_TARGET_MS:-60000}"
ROUNDTRIP_TARGET_RATIO="${ROUNDTRIP_TARGET_RATIO:-99}"
ROUNDTRIP_SPEC_FILE="${ROUNDTRIP_SPEC_FILE:-${ROOT_DIR}/test/swagger.v3.json}"

REPORT_DIR="${REPORT_DIR:-${ROOT_DIR}/reports}"
REPORT_FILE="${REPORT_FILE:-${REPORT_DIR}/next-self-assess-$(date +%Y%m%d-%H%M%S).json}"

COOKIE_JAR="$(mktemp -t yapi-next-selfassess-cookie.XXXXXX)"
API_LOG="$(mktemp -t yapi-next-selfassess-api.XXXXXX)"
API_PID=""

mkdir -p "${REPORT_DIR}"

cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" >/dev/null 2>&1; then
    kill "${API_PID}" >/dev/null 2>&1 || true
    wait "${API_PID}" >/dev/null 2>&1 || true
  fi
  docker rm -f "${MONGO_CONTAINER}" >/dev/null 2>&1 || true
  rm -f "${COOKIE_JAR}" "${API_LOG}"
}
trap cleanup EXIT

log() {
  printf '[self-assess] %s\n' "$*"
}

fail() {
  printf '[self-assess] ERROR: %s\n' "$*" >&2
  if [[ -f "${API_LOG}" ]]; then
    printf '[self-assess] ---- api log ----\n' >&2
    tail -n 120 "${API_LOG}" >&2 || true
  fi
  exit 1
}

json_errcode() {
  node -e 'const obj=JSON.parse(process.argv[1]); process.stdout.write(String(obj.errcode));' "$1"
}

json_pick() {
  node -e '
const obj = JSON.parse(process.argv[1]);
const path = process.argv[2].split(".").filter(Boolean);
let cur = obj;
for (const seg of path) {
  if (Array.isArray(cur)) {
    const idx = Number(seg);
    cur = Number.isFinite(idx) ? cur[idx] : undefined;
  } else {
    cur = cur ? cur[seg] : undefined;
  }
}
if (cur === undefined || cur === null) process.exit(2);
if (typeof cur === "object") process.stdout.write(JSON.stringify(cur));
else process.stdout.write(String(cur));
' "$1" "$2"
}

assert_ok() {
  local step="$1"
  local resp="$2"
  local code
  code="$(json_errcode "${resp}" 2>/dev/null || true)"
  if [[ "${code}" != "0" ]]; then
    fail "${step} failed: ${resp}"
  fi
}

request_get() {
  local path="$1"
  curl -sS -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" "${API_BASE}${path}"
}

request_post() {
  local path="$1"
  local body="$2"
  curl -sS -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" \
    -H 'Content-Type: application/json' \
    -X POST "${API_BASE}${path}" \
    --data "${body}"
}

extract_json_from_file() {
  local file="$1"
  awk 'BEGIN{printJson=0} /^\{/{printJson=1} printJson{print}' "${file}"
}

json_field() {
  local json="$1"
  local path="$2"
  printf '%s' "${json}" | node -e '
const fs = require("fs");
const obj = JSON.parse(fs.readFileSync(0, "utf8"));
const path = process.argv[1].split(".").filter(Boolean);
let cur = obj;
for (const seg of path) {
  if (Array.isArray(cur)) {
    const idx = Number(seg);
    cur = Number.isFinite(idx) ? cur[idx] : undefined;
  } else {
    cur = cur ? cur[seg] : undefined;
  }
}
if (cur === undefined || cur === null) process.exit(2);
if (typeof cur === "object") process.stdout.write(JSON.stringify(cur));
else process.stdout.write(String(cur));
' "${path}"
}

run_bench_capture_json() {
  local label="$1"
  shift
  local output_file
  output_file="$(mktemp -t yapi-next-selfassess-${label}.XXXXXX)"
  if ! "$@" >"${output_file}" 2>&1; then
    cat "${output_file}" >&2
    rm -f "${output_file}"
    fail "${label} benchmark command failed"
  fi
  cat "${output_file}" >&2
  local json
  json="$(extract_json_from_file "${output_file}")"
  rm -f "${output_file}"
  if [[ -z "${json//[$'\t\r\n ']/}" ]]; then
    fail "${label} benchmark did not produce JSON output"
  fi
  printf '%s' "${json}"
}

run_cmd_capture_output() {
  local label="$1"
  shift
  local output_file
  output_file="$(mktemp -t yapi-next-selfassess-${label}.XXXXXX)"
  if ! "$@" >"${output_file}" 2>&1; then
    cat "${output_file}" >&2
    rm -f "${output_file}"
    fail "${label} command failed"
  fi
  cat "${output_file}" >&2
  local output
  output="$(cat "${output_file}")"
  rm -f "${output_file}"
  printf '%s' "${output}"
}

create_project_with_token() {
  local name="$1"
  local group_id="$2"
  local basepath="$3"

  local resp
  resp="$(request_post '/project/add' "{\"name\":\"${name}\",\"group_id\":${group_id},\"basepath\":\"${basepath}\",\"project_type\":\"private\"}")"
  assert_ok "project/add:${name}" "${resp}"
  local project_id
  project_id="$(json_pick "${resp}" 'data._id')"

  resp="$(request_get "/project/token?project_id=${project_id}")"
  assert_ok "project/token:${name}" "${resp}"
  local token
  token="$(json_pick "${resp}" 'data')"
  printf '%s %s\n' "${project_id}" "${token}"
}

log "checking prerequisites"
command -v docker >/dev/null 2>&1 || fail 'docker not found'
command -v node >/dev/null 2>&1 || fail 'node not found'
command -v npm >/dev/null 2>&1 || fail 'npm not found'
command -v curl >/dev/null 2>&1 || fail 'curl not found'

log "starting mongo container ${MONGO_CONTAINER}"
docker run -d --name "${MONGO_CONTAINER}" -p "${MONGO_PORT}:27017" mongo:7 >/dev/null
for _ in $(seq 1 40); do
  if docker exec "${MONGO_CONTAINER}" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "${MONGO_CONTAINER}" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1 || fail 'mongo not ready'

cd "${ROOT_DIR}"
log "building api"
npm run build --prefix apps/api >/dev/null

log "starting api on port ${API_PORT}"
PORT="${API_PORT}" MONGO_URL="${MONGO_URL}" node "${ROOT_DIR}/apps/api/dist/main.js" >"${API_LOG}" 2>&1 &
API_PID="$!"
for _ in $(seq 1 40); do
  if curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "${API_BASE}/health" >/dev/null 2>&1 || fail 'api not ready'

now_ts="$(date +%s)"
email="selfassess${now_ts}@example.com"
username="selfassess${now_ts}"
password='SelfAssess123!'

log "register benchmark user"
resp="$(request_post '/user/reg' "{\"email\":\"${email}\",\"username\":\"${username}\",\"password\":\"${password}\"}")"
assert_ok 'user/reg' "${resp}"

resp="$(request_get '/group/list')"
assert_ok 'group/list' "${resp}"
group_id="$(json_pick "${resp}" 'data.0._id')"
[[ -n "${group_id}" ]] || fail 'group/list did not return any group'

read -r menu_project_id menu_token < <(create_project_with_token "menu-export-${now_ts}" "${group_id}" "/perf/menu")
read -r import_project_id import_token < <(create_project_with_token "import-${now_ts}" "${group_id}" "/perf/import")
read -r roundtrip_project_id roundtrip_token < <(create_project_with_token "roundtrip-${now_ts}" "${group_id}" "/perf/roundtrip")

log "running index migration twice for idempotence"
index_pass1_log="$(run_cmd_capture_output "index-pass-1" env \
  MONGO_URL="${MONGO_URL}" \
  node "${ROOT_DIR}/apps/api/scripts/create-indexes.js")"
index_pass2_log="$(run_cmd_capture_output "index-pass-2" env \
  MONGO_URL="${MONGO_URL}" \
  node "${ROOT_DIR}/apps/api/scripts/create-indexes.js")"
index_pass2_created_count="$(printf '%s\n' "${index_pass2_log}" | grep -c '^\[ok\]' || true)"

log "checking required indexes"
index_json="$(run_bench_capture_json "check-indexes" env \
  MONGO_URL="${MONGO_URL}" \
  node "${ROOT_DIR}/apps/api/scripts/check-indexes.js")"

if (( MENU_SEED_BATCH_SIZE <= 0 )); then
  fail "MENU_SEED_BATCH_SIZE must be > 0"
fi
log "seeding ${MENU_SEED_API_COUNT} interfaces for menu/export project (batch=${MENU_SEED_BATCH_SIZE})"
seed_remaining="${MENU_SEED_API_COUNT}"
seed_offset=0
seed_batch_count=0
seed_total_duration_ms=0
seed_max_duration_ms=0
seed_last_batch_json='{}'
while (( seed_remaining > 0 )); do
  seed_batch_size="${MENU_SEED_BATCH_SIZE}"
  if (( seed_remaining < seed_batch_size )); then
    seed_batch_size="${seed_remaining}"
  fi
  seed_batch_count=$((seed_batch_count + 1))
  log "seed batch ${seed_batch_count}: count=${seed_batch_size}, offset=${seed_offset}"
  seed_batch_json="$(run_bench_capture_json "seed-menu-${seed_batch_count}" env \
    NODE_PATH="${BENCH_NODE_PATH}" \
    BASE_URL="${BASE_URL}" \
    PROJECT_ID="${menu_project_id}" \
    TOKEN="${menu_token}" \
    API_COUNT="${seed_batch_size}" \
    PATH_OFFSET="${seed_offset}" \
    SYNC_MODE="${IMPORT_SYNC_MODE}" \
    TARGET_MS="9999999" \
    node "${ROOT_DIR}/scripts/perf/bench-import.js")"
  seed_batch_errcode="$(json_field "${seed_batch_json}" "errcode")"
  if [[ "${seed_batch_errcode}" != "0" ]]; then
    fail "seed import batch ${seed_batch_count} failed: ${seed_batch_json}"
  fi
  seed_batch_duration_ms="$(json_field "${seed_batch_json}" "durationMs")"
  seed_total_duration_ms=$((seed_total_duration_ms + seed_batch_duration_ms))
  if (( seed_batch_duration_ms > seed_max_duration_ms )); then
    seed_max_duration_ms="${seed_batch_duration_ms}"
  fi
  seed_last_batch_json="${seed_batch_json}"
  seed_remaining=$((seed_remaining - seed_batch_size))
  seed_offset=$((seed_offset + seed_batch_size))
done

log "checking core query plans (no COLLSCAN)"
resp="$(request_get "/interface/getCatMenu?project_id=${menu_project_id}")"
assert_ok "interface/getCatMenu:${menu_project_id}" "${resp}"
menu_cat_id="$(json_pick "${resp}" 'data.0._id')"
[[ -n "${menu_cat_id}" ]] || fail "cannot resolve category id for project ${menu_project_id}"
query_plan_json="$(run_bench_capture_json "check-query-plans" env \
  MONGO_URL="${MONGO_URL}" \
  PROJECT_ID="${menu_project_id}" \
  CATID="${menu_cat_id}" \
  SAMPLE_PATH="/perf/v1/resource/0" \
  SAMPLE_METHOD="GET" \
  node "${ROOT_DIR}/apps/api/scripts/check-query-plans.js")"

log "running menu benchmark"
menu_json="$(run_bench_capture_json "bench-menu" env \
  NODE_PATH="${BENCH_NODE_PATH}" \
  BASE_URL="${BASE_URL}" \
  PROJECT_ID="${menu_project_id}" \
  TOKEN="${menu_token}" \
  TOTAL_REQUESTS="${MENU_TOTAL_REQUESTS}" \
  CONCURRENCY="${MENU_CONCURRENCY}" \
  TARGET_P95="${MENU_TARGET_P95}" \
  node "${ROOT_DIR}/scripts/perf/bench-menu.js")"

log "running export benchmark"
export_json="$(run_bench_capture_json "bench-export" env \
  NODE_PATH="${BENCH_NODE_PATH}" \
  BASE_URL="${BASE_URL}" \
  PROJECT_ID="${menu_project_id}" \
  TOKEN="${menu_token}" \
  FORMAT="openapi3" \
  TOTAL_REQUESTS="${EXPORT_TOTAL_REQUESTS}" \
  CONCURRENCY="${EXPORT_CONCURRENCY}" \
  TARGET_P95="${EXPORT_TARGET_P95}" \
  node "${ROOT_DIR}/scripts/perf/bench-export.js")"

log "running import benchmark"
import_json="$(run_bench_capture_json "bench-import" env \
  NODE_PATH="${BENCH_NODE_PATH}" \
  BASE_URL="${BASE_URL}" \
  PROJECT_ID="${import_project_id}" \
  TOKEN="${import_token}" \
  API_COUNT="${IMPORT_API_COUNT}" \
  SYNC_MODE="${IMPORT_SYNC_MODE}" \
  TARGET_MS="${IMPORT_TARGET_MS}" \
  node "${ROOT_DIR}/scripts/perf/bench-import.js")"

log "running openapi round-trip benchmark"
roundtrip_json="$(run_bench_capture_json "bench-roundtrip" env \
  NODE_PATH="${BENCH_NODE_PATH}" \
  BASE_URL="${BASE_URL}" \
  PROJECT_ID="${roundtrip_project_id}" \
  TOKEN="${roundtrip_token}" \
  SPEC_FILE="${ROUNDTRIP_SPEC_FILE}" \
  TARGET_RATIO="${ROUNDTRIP_TARGET_RATIO}" \
  node "${ROOT_DIR}/scripts/perf/bench-roundtrip.js")"

menu_ok="$(json_field "${menu_json}" "ok")"
export_ok="$(json_field "${export_json}" "ok")"
import_ok="$(json_field "${import_json}" "ok")"
roundtrip_ok="$(json_field "${roundtrip_json}" "ok")"
index_plan_ok="$(json_field "${index_json}" "ok")"
query_plan_ok="$(json_field "${query_plan_json}" "ok")"
index_idempotent_ok="false"
if [[ "${index_pass2_created_count}" == "0" ]]; then
  index_idempotent_ok="true"
fi
menu_p95="$(json_field "${menu_json}" "p95")"
export_p95="$(json_field "${export_json}" "p95")"
import_duration_ms="$(json_field "${import_json}" "durationMs")"
roundtrip_ratio="$(json_field "${roundtrip_json}" "consistencyRatio")"

overall_ok="false"
if [[ "${menu_ok}" == "true" && "${export_ok}" == "true" && "${import_ok}" == "true" && "${roundtrip_ok}" == "true" && "${index_plan_ok}" == "true" && "${query_plan_ok}" == "true" && "${index_idempotent_ok}" == "true" ]]; then
  overall_ok="true"
fi

cat >"${REPORT_FILE}" <<EOF
{
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "baseUrl": "${BASE_URL}",
  "dataset": {
    "menuProjectId": ${menu_project_id},
    "menuSeedApiCount": ${MENU_SEED_API_COUNT},
    "importProjectId": ${import_project_id},
    "importApiCount": ${IMPORT_API_COUNT},
    "roundtripProjectId": ${roundtrip_project_id},
    "roundtripSpecFile": "$(printf '%s' "${ROUNDTRIP_SPEC_FILE}")"
  },
  "thresholds": {
    "menuP95Ms": ${MENU_TARGET_P95},
    "exportP95Ms": ${EXPORT_TARGET_P95},
    "importDurationMs": ${IMPORT_TARGET_MS},
    "roundtripConsistencyRatio": ${ROUNDTRIP_TARGET_RATIO}
  },
  "results": {
    "indexMigration": {
      "pass1Log": "$(printf '%s' "${index_pass1_log}" | sed 's/"/\\"/g' | tr '\n' '|')",
      "pass2Log": "$(printf '%s' "${index_pass2_log}" | sed 's/"/\\"/g' | tr '\n' '|')",
      "pass2CreatedCount": ${index_pass2_created_count}
    },
    "indexCheck": ${index_json},
    "queryPlanCheck": ${query_plan_json},
    "seedImport": {
      "batchSize": ${MENU_SEED_BATCH_SIZE},
      "batchCount": ${seed_batch_count},
      "totalDurationMs": ${seed_total_duration_ms},
      "maxBatchDurationMs": ${seed_max_duration_ms},
      "lastBatch": ${seed_last_batch_json}
    },
    "menu": ${menu_json},
    "export": ${export_json},
    "import": ${import_json},
    "roundtrip": ${roundtrip_json}
  },
  "summary": {
    "menuP95Ms": ${menu_p95},
    "exportP95Ms": ${export_p95},
    "importDurationMs": ${import_duration_ms},
    "roundtripConsistencyRatio": ${roundtrip_ratio},
    "menuPass": ${menu_ok},
    "exportPass": ${export_ok},
    "importPass": ${import_ok},
    "roundtripPass": ${roundtrip_ok},
    "indexPlanPass": ${index_plan_ok},
    "queryPlanPass": ${query_plan_ok},
    "indexIdempotentPass": ${index_idempotent_ok},
    "overallPass": ${overall_ok}
  }
}
EOF

log "summary: menu_p95=${menu_p95}ms, export_p95=${export_p95}ms, import_duration=${import_duration_ms}ms, roundtrip_ratio=${roundtrip_ratio}%, index_plan=${index_plan_ok}, query_plan=${query_plan_ok}, index_idempotent=${index_idempotent_ok}, overall=${overall_ok}"
log "report: ${REPORT_FILE}"

if [[ "${overall_ok}" != "true" ]]; then
  fail "threshold check failed; see report ${REPORT_FILE}"
fi

log "self assessment passed"
