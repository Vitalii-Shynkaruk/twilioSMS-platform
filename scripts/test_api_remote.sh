#!/bin/bash
# Test command center API on production
set -euo pipefail

: "${SCL_ADMIN_EMAIL:?SCL_ADMIN_EMAIL env var required}"
: "${SCL_ADMIN_PASSWORD:?SCL_ADMIN_PASSWORD env var required}"

cd /opt/sms-platform

TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SCL_ADMIN_EMAIL\",\"password\":\"$SCL_ADMIN_PASSWORD\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','NO_TOKEN'))")

if [[ "$TOKEN" == "NO_TOKEN" || -z "$TOKEN" ]]; then
  echo "Login failed: token not returned"
  exit 1
fi

echo "TOKEN: acquired"

echo "--- /api/command-center/metrics ---"
curl -s "http://localhost:3001/api/command-center/metrics" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>&1 | head -30

echo ""
echo "--- /api/deals/board ---"
curl -s "http://localhost:3001/api/deals/board" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>&1 | head -30

echo ""
echo "--- /api/command-center/hot-leads ---"
curl -s "http://localhost:3001/api/command-center/hot-leads" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>&1 | head -10

echo ""
echo "--- /api/reps ---"
curl -s "http://localhost:3001/api/reps?activeOnly=true" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>&1 | head -10

echo ""
echo "--- Server logs (last 20 lines) ---"
pm2 logs sms-api --lines 20 --nostream 2>&1 | tail -25
