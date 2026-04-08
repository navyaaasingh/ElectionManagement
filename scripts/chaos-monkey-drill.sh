#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

echo "== Chaos Monkey Drill =="
echo "Target: ${BASE_URL}"

if [[ -z "${AUTH_TOKEN}" ]]; then
  echo "AUTH_TOKEN is empty; protected endpoints will likely return 401."
fi

echo "1) Baseline health"
curl -sS "${BASE_URL}/health" | head -c 500 && echo

echo "2) Readiness check"
curl -sS "${BASE_URL}/ready" | head -c 500 && echo

echo "3) Force Fabric breaker open by repeated vote status checks (simulated dependency pressure)"
for i in $(seq 1 10); do
  curl -sS "${BASE_URL}/api/v1/votes/status/fake-voter/fake-election" >/dev/null || true
done
echo "Breaker pressure phase complete."

echo "4) Observe operations dashboard + queue depth"
curl -sS -H "Authorization: Bearer ${AUTH_TOKEN}" "${BASE_URL}/api/v1/operations/dashboard" | head -c 1500 && echo

echo "5) Rollout policy + rollback criteria"
curl -sS -H "Authorization: Bearer ${AUTH_TOKEN}" "${BASE_URL}/api/v1/operations/rollout-policy" | head -c 800 && echo

echo "Drill complete. Verify:"
echo "- outbox_pending and dead_letter_pending metrics"
echo "- fabric_circuit_open transitions"
echo "- vote_cast_latency_ms p95 and fabric_call_latency_ms p95"
