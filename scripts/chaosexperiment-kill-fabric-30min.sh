#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
FABRIC_DOWN_MINUTES="${FABRIC_DOWN_MINUTES:-30}"

echo "Starting chaos experiment: kill Fabric for ${FABRIC_DOWN_MINUTES} minutes"

echo "Step 1: Stop fabric containers"
docker compose stop peer0.org1.example.com orderer.example.com || true

echo "Step 2: While Fabric is down, votes should queue via outbox"
for i in $(seq 1 6); do
  echo "  probe ${i}/6"
  curl -sS "${BASE_URL}/health" >/dev/null || true
  sleep 10
done

echo "Sleeping for outage window..."
sleep "$((FABRIC_DOWN_MINUTES * 60))"

echo "Step 3: Restart fabric containers"
docker compose start orderer.example.com peer0.org1.example.com || true

echo "Step 4: Wait for reconciliation"
sleep 60

echo "Step 5: Check saga and queue metrics"
curl -sS "${BASE_URL}/metrics" | grep -E "outbox_pending|dead_letter_pending|vote_saga_state_count|fabric_circuit_open" || true

echo "Chaos experiment complete."
