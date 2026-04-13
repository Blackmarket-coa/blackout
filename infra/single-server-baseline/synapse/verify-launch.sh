#!/usr/bin/env bash
set -euo pipefail

# Synapse launch verification runner.
# Validates:
# - login/register behavior
# - /sync success
# - room + space creation
# - DM messaging
# - media upload limits
# - account recovery endpoint posture
# - federation readiness (optional)

BASE_URL="${BASE_URL:-https://matrix.theblackout.app}"
SERVER_NAME="${SERVER_NAME:-theblackout.app}"
SHARED_SECRET="${SHARED_SECRET:-}"
ADMIN_USER="${ADMIN_USER:-}"
ADMIN_PASS="${ADMIN_PASS:-}"
TEST_USER="${TEST_USER:-}"
TEST_PASS="${TEST_PASS:-}"
TEST_USER2="${TEST_USER2:-}"
TEST_PASS2="${TEST_PASS2:-}"
MAX_UPLOAD_BYTES="${MAX_UPLOAD_BYTES:-104857600}" # 100 MiB
ENABLE_FEDERATION_TEST="${ENABLE_FEDERATION_TEST:-false}"
RECOVERY_EMAIL="${RECOVERY_EMAIL:-noreply@theblackout.app}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1"; exit 2; }
}
need curl
need jq
need python3

step() { echo; echo "==> $*"; }
ok() { echo "✔ $*"; }
fail() { echo "✖ $*" >&2; exit 1; }

post_json() {
  local url="$1"; shift
  curl -sS -H 'Content-Type: application/json' -X POST "$url" "$@"
}

assert_json_field() {
  local json="$1" expr="$2" message="$3"
  echo "$json" | jq -e "$expr" >/dev/null || fail "$message :: response=$(echo "$json" | jq -c .)"
}

register_via_shared_secret() {
  local user="$1" pass="$2" admin_flag="$3"
  [[ -n "$SHARED_SECRET" ]] || fail "SHARED_SECRET is required to test registration path."

  local nonce_json nonce mac payload
  nonce_json="$(curl -sS "$BASE_URL/_synapse/admin/v1/register")"
  nonce="$(echo "$nonce_json" | jq -r '.nonce // empty')"
  [[ -n "$nonce" ]] || fail "unable to fetch shared-secret registration nonce"

  mac="$(python3 - "$SHARED_SECRET" "$nonce" "$user" "$pass" "$admin_flag" <<'PY'
import hmac, hashlib, sys
secret, nonce, user, pw, admin = sys.argv[1:]
msg = b"\x00".join([nonce.encode(), user.encode(), pw.encode(), admin.encode()])
print(hmac.new(secret.encode(), msg, hashlib.sha1).hexdigest())
PY
)"

  payload="$(jq -n \
    --arg nonce "$nonce" \
    --arg username "$user" \
    --arg password "$pass" \
    --arg mac "$mac" \
    --argjson admin "$admin_flag" \
    '{nonce:$nonce, username:$username, password:$password, admin:$admin, mac:$mac}')"

  post_json "$BASE_URL/_synapse/admin/v1/register" -d "$payload"
}

login() {
  local user="$1" pass="$2"
  post_json "$BASE_URL/_matrix/client/v3/login" \
    -d "$(jq -n --arg user "$user" --arg pass "$pass" \
      '{type:"m.login.password", identifier:{type:"m.id.user", user:$user}, password:$pass}')"
}

step "0) Preflight"
if [[ -n "$SHARED_SECRET" ]]; then
  : "${TEST_USER:=launchbot}"
  : "${TEST_PASS:=Launchbot-$(date +%s)-A9!}"
  : "${TEST_USER2:=launchpeer}"
  : "${TEST_PASS2:=Launchpeer-$(date +%s)-B7!}"
  ok "shared-secret mode enabled; ephemeral test users will be created"
else
  [[ -n "$TEST_USER" && -n "$TEST_PASS" ]] || \
    fail "set SHARED_SECRET or provide TEST_USER and TEST_PASS for an existing account"
  ok "credential mode enabled; using existing test account credentials"
fi

step "1) Registration/login behavior"
if [[ -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]]; then
  admin_login="$(login "$ADMIN_USER" "$ADMIN_PASS")"
  assert_json_field "$admin_login" '.access_token | length > 0' "admin login failed"
  ok "admin login returned access token"
else
  echo "INFO: ADMIN_USER/ADMIN_PASS not set; skipping admin login."
fi

if [[ -n "$SHARED_SECRET" ]]; then
  reg1="$(register_via_shared_secret "$TEST_USER" "$TEST_PASS" false)"
  assert_json_field "$reg1" '.user_id | startswith("@")' "shared-secret registration for TEST_USER failed"
  ok "shared-secret registration succeeded for $TEST_USER"
else
  echo "INFO: SHARED_SECRET not set; skipping shared-secret registration success check."
fi

open_reg_resp="$(post_json "$BASE_URL/_matrix/client/v3/register" -d '{"username":"openregtest","password":"NotUsed-123"}')"
if echo "$open_reg_resp" | jq -e '.errcode=="M_FORBIDDEN" or .errcode=="M_UNAUTHORIZED" or .flows' >/dev/null; then
  ok "open registration is not silently enabled"
else
  fail "unexpected register response; expected forbidden/auth flow"
fi

step "2) /sync success"
login1="$(login "$TEST_USER" "$TEST_PASS")"
assert_json_field "$login1" '.access_token | length > 0' "test user login failed"
token1="$(echo "$login1" | jq -r '.access_token')"
sync1="$(curl -sS -H "Authorization: Bearer $token1" "$BASE_URL/_matrix/client/v3/sync?timeout=0")"
assert_json_field "$sync1" '.next_batch | length > 0' "sync did not return next_batch"
ok "sync returned next_batch token"

step "3) Room + space creation"
create_room="$(post_json "$BASE_URL/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $token1" \
  -d '{"name":"Launch Smoke Room","preset":"private_chat"}')"
assert_json_field "$create_room" '.room_id | startswith("!")' "room creation failed"
room_id="$(echo "$create_room" | jq -r '.room_id')"
ok "room created: $room_id"

create_space="$(post_json "$BASE_URL/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $token1" \
  -d '{"name":"Launch Smoke Space","creation_content":{"type":"m.space"},"preset":"private_chat"}')"
assert_json_field "$create_space" '.room_id | startswith("!")' "space creation failed"
space_id="$(echo "$create_space" | jq -r '.room_id')"
ok "space created: $space_id"

step "4) DM messaging"
if [[ -n "$SHARED_SECRET" ]]; then
  reg2="$(register_via_shared_secret "$TEST_USER2" "$TEST_PASS2" false)"
  assert_json_field "$reg2" '.user_id | startswith("@")' "shared-secret registration for TEST_USER2 failed"
  login2="$(login "$TEST_USER2" "$TEST_PASS2")"
  assert_json_field "$login2" '.access_token | length > 0' "TEST_USER2 login failed"
  token2="$(echo "$login2" | jq -r '.access_token')"

  dm_create="$(post_json "$BASE_URL/_matrix/client/v3/createRoom" \
    -H "Authorization: Bearer $token1" \
    -d "$(jq -n --arg invitee "@${TEST_USER2}:${SERVER_NAME}" \
      '{is_direct:true,preset:"trusted_private_chat",invite:[$invitee]}')")"
  assert_json_field "$dm_create" '.room_id | startswith("!")' "dm room creation failed"
  dm_id="$(echo "$dm_create" | jq -r '.room_id')"

  txid="$(date +%s)"
  send_msg="$(put_url="$BASE_URL/_matrix/client/v3/rooms/${dm_id}/send/m.room.message/${txid}"; \
    curl -sS -X PUT -H "Authorization: Bearer $token1" -H "Content-Type: application/json" \
      "$put_url" -d '{"msgtype":"m.text","body":"launch-smoke"}')"
  assert_json_field "$send_msg" '.event_id | startswith("$")' "dm send failed"
  ok "dm send succeeded in $dm_id"

  dm_sync="$(curl -sS -H "Authorization: Bearer $token2" "$BASE_URL/_matrix/client/v3/sync?timeout=0")"
  echo "$dm_sync" | jq -e --arg dm "$dm_id" '.rooms.join[$dm] != null' >/dev/null || \
    fail "invite/join not visible to second user"
  ok "dm room visible to second user"
else
  echo "INFO: SHARED_SECRET not set; skipping DM cross-account checks."
fi

step "5) Media upload limits"
small_file="$tmpdir/small.bin"
dd if=/dev/zero of="$small_file" bs=1024 count=64 status=none
small_resp="$(curl -sS -X POST -H "Authorization: Bearer $token1" \
  -H "Content-Type: application/octet-stream" --data-binary @"$small_file" \
  "$BASE_URL/_matrix/media/v3/upload?filename=small.bin")"
assert_json_field "$small_resp" '.content_uri | startswith("mxc://")' "small media upload failed"
ok "small upload accepted"

large_file="$tmpdir/large.bin"
dd if=/dev/zero of="$large_file" bs=1 count=0 status=none
truncate -s $((MAX_UPLOAD_BYTES + 1024)) "$large_file"
large_status="$(curl -sS -o "$tmpdir/large.out" -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $token1" -H "Content-Type: application/octet-stream" \
  --data-binary @"$large_file" "$BASE_URL/_matrix/media/v3/upload?filename=large.bin")"
if [[ "$large_status" == "413" ]] || jq -e '.errcode=="M_TOO_LARGE"' "$tmpdir/large.out" >/dev/null 2>&1; then
  ok "large upload correctly rejected"
else
  fail "large upload was not rejected as expected (status=$large_status body=$(cat "$tmpdir/large.out"))"
fi

step "6) Account recovery flow endpoint posture"
recovery_req="$(post_json "$BASE_URL/_matrix/client/v3/account/password/email/requestToken" \
  -d "$(jq -n --arg email "$RECOVERY_EMAIL" \
    '{client_secret:"launch-check",email:$email,send_attempt:1}')")"
if echo "$recovery_req" | jq -e '.sid or .errcode' >/dev/null; then
  ok "account recovery endpoint is reachable (response captured)"
else
  fail "account recovery endpoint returned unexpected payload"
fi

step "7) Federation readiness (optional)"
if [[ "$ENABLE_FEDERATION_TEST" == "true" ]]; then
  fed_version="$(curl -sS "$BASE_URL/_matrix/federation/v1/version")"
  assert_json_field "$fed_version" '.server.name | length > 0' "federation version endpoint failed"

  wk_server="$(curl -sS "https://${SERVER_NAME}/.well-known/matrix/server")"
  assert_json_field "$wk_server" '.["m.server"] | length > 0' "well-known matrix/server missing"
  ok "federation endpoints ready"
else
  echo "INFO: ENABLE_FEDERATION_TEST=false; skipping federation checks."
fi

echo
ok "Launch verification completed."
