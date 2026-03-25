#!/bin/bash
# Test command center API on production
cd /opt/sms-platform

TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@securecreditlines.com","password":"SclAdmin2026!Secure"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','NO_TOKEN'))")

echo "TOKEN: ${TOKEN:0:30}..."

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
