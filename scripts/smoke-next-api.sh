#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_PORT="${MONGO_PORT:-27027}"
API_PORT="${API_PORT:-3301}"
DB_NAME="${DB_NAME:-yapi_next_smoke}"
MONGO_CONTAINER="${MONGO_CONTAINER:-yapi-next-smoke-mongo-$$}"
MONGO_URL="mongodb://127.0.0.1:${MONGO_PORT}/${DB_NAME}"
API_BASE="http://127.0.0.1:${API_PORT}/api"

COOKIE_JAR="$(mktemp -t yapi-next-cookie.XXXXXX)"
API_LOG="$(mktemp -t yapi-next-api.XXXXXX)"
API_PID=""

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
  printf '[smoke] %s\n' "$*"
}

fail() {
  printf '[smoke] ERROR: %s\n' "$*" >&2
  if [[ -f "${API_LOG}" ]]; then
    printf '[smoke] ---- api log ----\n' >&2
    tail -n 80 "${API_LOG}" >&2 || true
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

urlencode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1]));' "$1"
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

log "checking prerequisites"
command -v docker >/dev/null 2>&1 || fail 'docker not found'
command -v node >/dev/null 2>&1 || fail 'node not found'
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

log 'building api'
cd "${ROOT_DIR}"
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
email="smoke${now_ts}@example.com"
username="smoke${now_ts}"
password='Smoke123!'
project_name="smoke-next-${now_ts}"

log 'register user'
resp="$(request_post '/user/reg' "{\"email\":\"${email}\",\"username\":\"${username}\",\"password\":\"${password}\"}")"
assert_ok 'user/reg' "${resp}"

log 'get user status'
resp="$(request_get '/user/status')"
assert_ok 'user/status' "${resp}"

log 'query groups'
resp="$(request_get '/group/list')"
assert_ok 'group/list' "${resp}"
group_id="$(json_pick "${resp}" 'data.0._id')"
[[ -n "${group_id}" ]] || fail 'group/list did not return any group'

log 'create project'
resp="$(request_post '/project/add' "{\"name\":\"${project_name}\",\"group_id\":${group_id},\"basepath\":\"/api/smoke\",\"project_type\":\"private\"}")"
assert_ok 'project/add' "${resp}"
project_id="$(json_pick "${resp}" 'data._id')"

log 'query project token'
resp="$(request_get "/project/token?project_id=${project_id}")"
assert_ok 'project/token' "${resp}"
project_token="$(json_pick "${resp}" 'data')"

log 'read category menu'
resp="$(request_get "/interface/getCatMenu?project_id=${project_id}")"
assert_ok 'interface/getCatMenu' "${resp}"
cat_id="$(json_pick "${resp}" 'data.0._id')"

log 'add one interface'
resp="$(request_post '/interface/add' "{\"project_id\":${project_id},\"catid\":${cat_id},\"title\":\"smoke-api\",\"path\":\"/smoke/manual\",\"method\":\"GET\"}")"
assert_ok 'interface/add' "${resp}"
interface_id="$(json_pick "${resp}" 'data._id')"

log 'check interface list/tree endpoints'
resp="$(request_get "/interface/list_menu?project_id=${project_id}")"
assert_ok 'interface/list_menu' "${resp}"
resp="$(request_get "/interface/tree?project_id=${project_id}&page=1&limit=20&include_list=true")"
assert_ok 'interface/tree' "${resp}"
resp="$(request_get "/interface/tree/node?catid=${cat_id}&page=1&limit=20")"
assert_ok 'interface/tree/node' "${resp}"

log 'import openapi3 via /spec/import'
import_payload="$(node -e '
const projectId = Number(process.argv[1]);
const token = process.argv[2];
const payload = {
  project_id: projectId,
  token,
  source: "json",
  format: "openapi3",
  syncMode: "merge",
  json: {
    openapi: "3.0.0",
    info: { title: "smoke-spec", version: "1.0.0" },
    paths: {
      "/smoke/spec": {
        get: {
          summary: "spec-import",
          responses: {
            "200": { description: "ok" }
          }
        }
      }
    }
  }
};
process.stdout.write(JSON.stringify(payload));
' "${project_id}" "${project_token}")"
resp="$(request_post '/spec/import' "${import_payload}")"
assert_ok 'spec/import' "${resp}"

log 'export openapi3 via /spec/export'
resp="$(request_get "/spec/export?project_id=${project_id}&format=openapi3&token=$(urlencode "${project_token}")")"
assert_ok 'spec/export' "${resp}"
node -e '
const obj = JSON.parse(process.argv[1]);
if (!obj.data || !obj.data.paths || !obj.data.paths["/smoke/spec"]) process.exit(1);
' "${resp}" || fail 'spec/export content check failed'

log 'compat export swagger2 via /plugin/exportSwagger'
swagger_body="$(request_get "/plugin/exportSwagger?pid=${project_id}&type=OpenAPIV2&token=$(urlencode "${project_token}")")"
node -e '
const obj = JSON.parse(process.argv[1]);
if (!obj || obj.swagger !== "2.0") process.exit(1);
' "${swagger_body}" || fail 'plugin/exportSwagger did not return swagger2 content'

log 'compat plugin export json/html/markdown'
plugin_json="$(request_get "/plugin/export?pid=${project_id}&type=json&token=$(urlencode "${project_token}")")"
node -e '
const obj = JSON.parse(process.argv[1]);
if (!Array.isArray(obj) || obj.length === 0) process.exit(1);
' "${plugin_json}" || fail 'plugin/export json content check failed'
plugin_md="$(request_get "/plugin/export?pid=${project_id}&type=markdown&token=$(urlencode "${project_token}")")"
[[ "${plugin_md}" == *"# "* ]] || fail 'plugin/export markdown content check failed'
plugin_html="$(request_get "/plugin/export?pid=${project_id}&type=html&token=$(urlencode "${project_token}")")"
[[ "${plugin_html}" == *"<html"* ]] || fail 'plugin/export html content check failed'

log 'compat interUpload openapi3'
inter_upload_payload="$(node -e '
const projectId = Number(process.argv[1]);
const token = process.argv[2];
const payload = {
  project_id: projectId,
  token,
  source: "json",
  format: "openapi3",
  merge: "merge",
  interfaceData: JSON.stringify({
    openapi: "3.0.0",
    info: { title: "interUpload-smoke", version: "1.0.0" },
    paths: {
      "/smoke/inter-upload": {
        post: {
          summary: "compat-upload",
          responses: {
            "200": { description: "ok" }
          }
        }
      }
    }
  })
};
process.stdout.write(JSON.stringify(payload));
' "${project_id}" "${project_token}")"
resp="$(request_post '/interface/interUpload' "${inter_upload_payload}")"
assert_ok 'interface/interUpload' "${resp}"

log 'compat open/project_interface_data'
resp="$(request_get "/open/project_interface_data?project_id=${project_id}&token=$(urlencode "${project_token}")")"
assert_ok 'open/project_interface_data' "${resp}"

log 'compat open/plugin/export-full'
open_full="$(request_get "/open/plugin/export-full?pid=${project_id}&type=json&status=all&token=$(urlencode "${project_token}")")"
node -e '
const obj = JSON.parse(process.argv[1]);
if (!Array.isArray(obj)) process.exit(1);
' "${open_full}" || fail 'open/plugin/export-full content check failed'

log 'compat plugin advanced-mock'
resp="$(request_post '/plugin/advmock/save' "{\"project_id\":${project_id},\"interface_id\":${interface_id},\"enable\":true,\"mock_script\":\"context.mockJson={\\\"ok\\\":1}\"}")"
assert_ok 'plugin/advmock/save' "${resp}"
resp="$(request_get "/plugin/advmock/get?interface_id=${interface_id}")"
assert_ok 'plugin/advmock/get' "${resp}"
resp="$(request_post '/plugin/advmock/case/save' "{\"project_id\":${project_id},\"interface_id\":${interface_id},\"name\":\"smoke-case\",\"res_body\":\"{\\\"code\\\":200}\",\"headers\":[],\"params\":{},\"code\":200,\"delay\":0,\"ip_enable\":false}")"
assert_ok 'plugin/advmock/case/save' "${resp}"
case_id="$(json_pick "${resp}" 'data._id')"
resp="$(request_get "/plugin/advmock/case/list?interface_id=${interface_id}")"
assert_ok 'plugin/advmock/case/list' "${resp}"
resp="$(request_post '/plugin/advmock/case/hide' "{\"id\":\"${case_id}\",\"enable\":false}")"
assert_ok 'plugin/advmock/case/hide' "${resp}"
resp="$(request_post '/plugin/advmock/case/del' "{\"id\":\"${case_id}\"}")"
assert_ok 'plugin/advmock/case/del' "${resp}"

log 'compat plugin wiki'
resp="$(request_post '/plugin/wiki_desc/up' "{\"project_id\":${project_id},\"desc\":\"smoke wiki\",\"markdown\":\"# smoke wiki\"}")"
assert_ok 'plugin/wiki_desc/up' "${resp}"
resp="$(request_get "/plugin/wiki_desc/get?project_id=${project_id}")"
assert_ok 'plugin/wiki_desc/get' "${resp}"

log 'compat plugin auto-sync'
resp="$(request_post '/plugin/autoSync/save' "{\"project_id\":${project_id},\"is_sync_open\":false,\"sync_mode\":\"merge\",\"sync_json_url\":\"https://example.com/openapi.json\",\"sync_cron\":\"*/10 * * * *\"}")"
assert_ok 'plugin/autoSync/save' "${resp}"
resp="$(request_get "/plugin/autoSync/get?project_id=${project_id}")"
assert_ok 'plugin/autoSync/get' "${resp}"

log 'create collection for auto test'
resp="$(request_post '/col/add_col' "{\"project_id\":${project_id},\"name\":\"smoke-col\",\"desc\":\"smoke\"}")"
assert_ok 'col/add_col' "${resp}"
col_id="$(json_pick "${resp}" 'data._id')"

log 'run /open/run_auto_test'
auto_test_resp="$(request_get "/open/run_auto_test?id=${col_id}&project_id=${project_id}&mode=json&token=$(urlencode "${project_token}")")"
node -e '
const obj = JSON.parse(process.argv[1]);
if (!obj || typeof obj !== "object" || !Array.isArray(obj.list)) process.exit(1);
' "${auto_test_resp}" || fail 'open/run_auto_test content check failed'

log 'smoke test passed'
log "project_id=${project_id}, interface_id=${interface_id}, mongo=${MONGO_URL}, api_port=${API_PORT}"
