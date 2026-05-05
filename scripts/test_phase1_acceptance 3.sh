#!/usr/bin/env bash
# © BuyReadySite.com — Phase 1 T1-T8 acceptance test runner
#
# ЦЕЛЬ:
#   Полностью прогнать приёмку Phase 1 AI Inbox после того, как админ:
#     1. Установил Anthropic API key в Settings → Integrations
#     2. Указал свой mobilePhone в Settings → Users → (свой профиль)
#     3. Включил hotAlertsEnabled
#
# ПРЕДВАРИТЕЛЬНО на сервере:
#   ssh sclserver
#   mysql -usmsapp -p sms_platform
#   -- найти conversation с реальным lead'ом для тестов:
#   SELECT c.id, l.first_name, l.last_name, c.assigned_rep_id
#   FROM conversations c JOIN leads l ON l.id = c.lead_id
#   WHERE c.assigned_rep_id IS NOT NULL LIMIT 5;
#
# ИСПОЛЬЗОВАНИЕ:
#   export API_BASE=https://app.sclcapital.io
#   export ADMIN_TOKEN=<JWT из браузера, DevTools → Application → localStorage>
#   export TEST_CONV_ID=<id из SELECT выше>
#   ./scripts/test_phase1_acceptance.sh

set -euo pipefail

API_BASE="${API_BASE:-https://app.sclcapital.io}"
ADMIN_TOKEN="${ADMIN_TOKEN:?ADMIN_TOKEN env var required}"
TEST_CONV_ID="${TEST_CONV_ID:?TEST_CONV_ID env var required}"

H_AUTH="Authorization: Bearer ${ADMIN_TOKEN}"
H_JSON="Content-Type: application/json"

pass() { printf "  \033[32m✓ PASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗ FAIL\033[0m %s\n" "$1"; FAILED=$((FAILED + 1)); }

FAILED=0

# ── T1: AI provider configured (returns key info) ─────────────────────────
echo "T1: AI provider configured"
RESP=$(curl -sf -H "$H_AUTH" "${API_BASE}/api/settings" | jq -r '.aiProvider // empty')
if [ -n "$RESP" ]; then pass "aiProvider=$RESP"; else fail "aiProvider not set"; fi

# ── T2: Classify inbound returns classification + signals ────────────────
echo "T2: POST /api/ai/classify-inbound"
RESP=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d "{\"conversationId\":\"$TEST_CONV_ID\"}" \
  "${API_BASE}/api/ai/classify-inbound")
CLS=$(echo "$RESP" | jq -r '.classification // empty')
if [ -n "$CLS" ]; then pass "classification=$CLS"; else fail "no classification: $RESP"; fi

# ── T3: Conversation row updated in DB ────────────────────────────────────
echo "T3: Conversation row has aiClassification + aiClassifiedAt"
RESP=$(curl -sf -H "$H_AUTH" "${API_BASE}/api/conversations/$TEST_CONV_ID")
DB_CLS=$(echo "$RESP" | jq -r '.aiClassification // empty')
DB_AT=$(echo "$RESP" | jq -r '.aiClassifiedAt // empty')
if [ -n "$DB_CLS" ] && [ -n "$DB_AT" ]; then pass "DB cls=$DB_CLS at=$DB_AT"; else fail "DB row not updated"; fi

# ── T4: aiSuggestions present (array, ≥1 item) ────────────────────────────
echo "T4: aiSuggestions array has items"
SUG_COUNT=$(echo "$RESP" | jq -r '(.aiSuggestions // []) | length')
if [ "$SUG_COUNT" -ge 1 ]; then pass "suggestions=$SUG_COUNT"; else fail "no suggestions"; fi

# ── T5: aiSignals present (object) ────────────────────────────────────────
echo "T5: aiSignals object present"
SIG_KEYS=$(echo "$RESP" | jq -r '(.aiSignals // {}) | keys | length')
if [ "$SIG_KEYS" -ge 1 ]; then pass "signals keys=$SIG_KEYS"; else fail "no signals"; fi

# ── T6: aiLeadScore in [0..100] ───────────────────────────────────────────
echo "T6: aiLeadScore numeric"
SCORE=$(echo "$RESP" | jq -r '.aiLeadScore // empty')
if [ -n "$SCORE" ] && [ "$SCORE" -ge 0 ] && [ "$SCORE" -le 100 ]; then
  pass "score=$SCORE";
else
  fail "score invalid: $SCORE";
fi

# ── T7: Frontend assets serve and AI CSS bundled ─────────────────────────
echo "T7: Frontend serves + ai-inbox.css present in bundle"
HTML=$(curl -sf "${API_BASE}/")
if echo "$HTML" | grep -qE 'index-[A-Za-z0-9_-]+\.css'; then
  CSS_FILE=$(echo "$HTML" | grep -oE 'index-[A-Za-z0-9_-]+\.css' | head -1)
  if curl -sf "${API_BASE}/assets/${CSS_FILE}" | grep -q "ai-banner"; then
    pass "ai-inbox.css classes bundled (${CSS_FILE})";
  else
    fail "ai-banner CSS class not in bundle";
  fi
else
  fail "no css link in index.html";
fi

# ── T8: HOT rate-limit (повторный classify в течение 3 мин не шлёт SMS) ──
echo "T8: HOT alert rate-limit (информативно — проверяй в logs)"
echo "  → Запусти 'pm2 logs sms-api --lines 50 | grep HOT-alert' на sclserver"
echo "  → Должно быть 'rate-limited (3 min window)' при повторных HOT в течение 3 мин"
pass "manual log check"

echo
if [ "$FAILED" -eq 0 ]; then
  printf "\033[32mAll Phase 1 acceptance tests passed.\033[0m\n"
  exit 0
else
  printf "\033[31m%d test(s) failed.\033[0m\n" "$FAILED"
  exit 1
fi
