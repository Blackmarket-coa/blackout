#!/usr/bin/env bash
set -euo pipefail

host="${1:-}"
if [ -z "$host" ]; then
  echo "usage: $0 <host>"
  exit 2
fi

interval="${CHECK_INTERVAL_SEC:-30}"
duration="${CHECK_DURATION_SEC:-1800}"
end=$((SECONDS + duration))
ok=0
fail=0
consecutive_fail=0
max_consecutive_fail=0

while [ "$SECONDS" -lt "$end" ]; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "https://${host}/healthz" || true)
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [ "$code" = "200" ]; then
    ok=$((ok+1))
    consecutive_fail=0
    echo "$ts host=$host code=$code result=ok"
  else
    fail=$((fail+1))
    consecutive_fail=$((consecutive_fail+1))
    if [ "$consecutive_fail" -gt "$max_consecutive_fail" ]; then
      max_consecutive_fail="$consecutive_fail"
    fi
    echo "$ts host=$host code=${code:-ERR} result=fail"
  fi

  sleep "$interval"
done

total=$((ok + fail))
rate=$(awk -v o="$ok" -v t="$total" 'BEGIN{ if (t==0) print 0; else printf "%.4f", (o/t)*100 }')
max_fail_seconds=$((max_consecutive_fail * interval))

echo "summary host=$host ok=$ok fail=$fail success_rate=${rate}% max_consecutive_fail_seconds=${max_fail_seconds}"

pass_rate=$(awk -v r="$rate" 'BEGIN{ if (r>=99.9) print 1; else print 0 }')
pass_consecutive=$([ "$max_fail_seconds" -le 120 ] && echo 1 || echo 0)

if [ "$pass_rate" -eq 1 ] && [ "$pass_consecutive" -eq 1 ]; then
  echo "PASS"
  exit 0
fi

echo "FAIL"
exit 1
