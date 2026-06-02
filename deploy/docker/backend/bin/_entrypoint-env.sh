#!/bin/sh
# Assemble the connection strings the @blackout/api runtime expects
# (DATABASE_URL / BLACKOUT_DB_MODE / REDIS_URL) from the discrete DB_* / CACHE_*
# vars and the *_PASSWORD_FILE docker secrets the production compose stack
# mounts. The application code reads DATABASE_URL and REDIS_URL directly, while
# compose can only inject secret *files*, so the entrypoint bridges the two.
#
# Sourced by the bin/* entrypoints. Idempotent: a no-op when DATABASE_URL /
# credentialed REDIS_URL are already set (e.g. a plain `docker run` with envs).
set -eu

_read_secret() {
  # $1 = explicit value, $2 = *_FILE path. Echoes the resolved secret (no newline).
  if [ -n "${1:-}" ]; then
    printf '%s' "$1"
  elif [ -n "${2:-}" ] && [ -f "$2" ]; then
    # Trim a single trailing newline so file-based secrets match inline ones.
    printf '%s' "$(cat "$2")"
  fi
}

_urlencode() {
  # URL-encode arbitrary secret bytes so they're safe inside a connection URL.
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] || ""))' "$1"
}

# Postgres: build DATABASE_URL and switch to postgres mode when a DB host is
# wired but no explicit DATABASE_URL was provided.
if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_HOST:-}" ]; then
  _db_pw="$(_read_secret "${DB_PASSWORD:-}" "${DB_PASSWORD_FILE:-}")"
  _db_pw_enc="$(_urlencode "$_db_pw")"
  _db_user_enc="$(_urlencode "${DB_USER:-blackout}")"
  export DATABASE_URL="postgres://${_db_user_enc}:${_db_pw_enc}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-blackout}"
  : "${BLACKOUT_DB_MODE:=postgres}"
  export BLACKOUT_DB_MODE
  unset _db_pw _db_pw_enc _db_user_enc
fi

# Redis: fold the cache password secret into REDIS_URL when it lacks credentials.
_cache_pw="$(_read_secret "${CACHE_PASSWORD:-}" "${CACHE_PASSWORD_FILE:-}")"
if [ -n "$_cache_pw" ]; then
  _cache_pw_enc="$(_urlencode "$_cache_pw")"
  case "${REDIS_URL:-}" in
    *@*)
      : # already carries credentials, leave it alone
      ;;
    redis://* | rediss://*)
      _scheme="${REDIS_URL%%://*}"
      _hostport="${REDIS_URL#*://}"
      export REDIS_URL="${_scheme}://:${_cache_pw_enc}@${_hostport}"
      unset _scheme _hostport
      ;;
    "")
      export REDIS_URL="redis://:${_cache_pw_enc}@${CACHE_HOST:-cache}:${CACHE_PORT:-6379}"
      ;;
  esac
  unset _cache_pw_enc
fi
unset _cache_pw
