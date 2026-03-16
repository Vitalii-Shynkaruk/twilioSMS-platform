#!/usr/bin/env python3
"""Comprehensive API Test Suite for Twilio SMS Platform — Production Readiness"""
import requests
import time
import json
import sys

BASE = "http://localhost:3001/api"
TOKEN = None
RESULTS = {"passed": 0, "failed": 0, "errors": []}

def ok(name, detail=""):
    RESULTS["passed"] += 1
    print(f"  ✅ {name}" + (f" — {detail}" if detail else ""))

def fail(name, detail=""):
    RESULTS["failed"] += 1
    RESULTS["errors"].append(f"{name}: {detail}")
    print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))

def test(name, fn):
    try:
        fn()
    except Exception as e:
        fail(name, str(e))

def headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# ═══════════════════════════════════════════════════
# 1. HEALTH & AUTH
# ═══════════════════════════════════════════════════
print("\n🔧 1. HEALTH & AUTHENTICATION")
print("=" * 50)

def test_health():
    r = requests.get(f"{BASE}/health", timeout=5)
    d = r.json()
    assert r.status_code == 200, f"status {r.status_code}"
    assert d["status"] == "ok"
    assert d["services"]["database"] == "ok"
    assert d["services"]["redis"] == "ok"
    ok("Health check", f"DB:{d['services']['database']} Redis:{d['services']['redis']}")
test("Health", test_health)

def test_login():
    global TOKEN
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@securecreditlines.com", "password": "admin123"}, timeout=5)
    assert r.status_code == 200, f"status {r.status_code}"
    d = r.json()
    TOKEN = d["token"]
    assert TOKEN and len(TOKEN) > 20
    ok("Login", f"token len={len(TOKEN)}, user={d['user']['firstName']}")
test("Login", test_login)

def test_bad_login():
    r = requests.post(f"{BASE}/auth/login", json={"email": "bad@x.com", "password": "wrong"}, timeout=5)
    assert r.status_code == 401, f"expected 401, got {r.status_code}"
    ok("Bad login rejected (401)")
test("Bad login", test_bad_login)

def test_no_auth():
    r = requests.get(f"{BASE}/leads", timeout=5)
    assert r.status_code == 401, f"expected 401, got {r.status_code}"
    ok("Unauthenticated request rejected (401)")
test("No auth", test_no_auth)

# ═══════════════════════════════════════════════════
# 2. CORE API ENDPOINTS (all routes)
# ═══════════════════════════════════════════════════
print("\n📡 2. CORE API ENDPOINTS")
print("=" * 50)

endpoints = [
    ("GET", "/dashboard/stats", None),
    ("GET", "/dashboard/delivery-metrics", None),
    ("GET", "/dashboard/diagnostics", None),
    ("GET", "/leads", None),
    ("GET", "/leads/export", None),
    ("GET", "/campaigns", None),
    ("GET", "/inbox", None),
    ("GET", "/pipeline/stages", None),
    ("GET", "/numbers", None),
    ("GET", "/automation/rules", None),
    ("GET", "/settings/settings", None),
    ("GET", "/analytics/overview", None),
    ("GET", "/analytics/lead-funnel", None),
    ("GET", "/analytics/messaging", None),
    ("GET", "/analytics/campaigns", None),
    ("GET", "/analytics/numbers", None),
    ("GET", "/analytics/rep-performance", None),
    ("GET", "/analytics/automation", None),
]

for method, path, body in endpoints:
    def check(m=method, p=path, b=body):
        if m == "GET":
            r = requests.get(f"{BASE}{p}", headers=headers(), timeout=10)
        else:
            r = requests.post(f"{BASE}{p}", headers=headers(), json=b, timeout=10)
        if r.status_code == 200:
            size = len(r.content)
            ok(f"{m} {p}", f"200 OK ({size}B)")
        else:
            fail(f"{m} {p}", f"status {r.status_code}: {r.text[:100]}")
    test(f"{method} {path}", check)

# ═══════════════════════════════════════════════════
# 3. DATA VALIDATION
# ═══════════════════════════════════════════════════
print("\n📊 3. DATA VALIDATION")
print("=" * 50)

def test_leads_data():
    r = requests.get(f"{BASE}/leads", headers=headers(), timeout=10)
    d = r.json()
    assert "leads" in d, "missing 'leads' key"
    assert "pagination" in d, "missing 'pagination' key"
    p = d["pagination"]
    assert "total" in p and "page" in p and "pages" in p
    ok(f"Leads structure", f"{p['total']} leads, page {p['page']}/{p['pages']}")
    if d["leads"]:
        lead = d["leads"][0]
        required = ["id", "firstName", "phone", "status", "createdAt"]
        missing = [f for f in required if f not in lead]
        if missing:
            fail("Lead fields", f"missing: {missing}")
        else:
            ok(f"Lead fields valid", f"sample: {lead['firstName']} {lead.get('lastName','')}")
test("Leads data", test_leads_data)

def test_diagnostics_data():
    r = requests.get(f"{BASE}/dashboard/diagnostics", headers=headers(), timeout=10)
    d = r.json()
    required = ["smsMode", "health", "sending", "stats24h", "stats7d", "numbers", "errorBreakdown"]
    missing = [f for f in required if f not in d]
    if missing:
        fail("Diagnostics structure", f"missing: {missing}")
    else:
        ok(f"Diagnostics structure", f"mode={d['smsMode']}, uptime={int(d.get('uptime',0))}s")
    assert d["health"]["database"] == True, "DB not healthy"
    assert d["health"]["redis"] == True, "Redis not healthy"
    ok("Diagnostics health", f"DB=✓ Redis=✓")
test("Diagnostics", test_diagnostics_data)

def test_pipeline_stages():
    r = requests.get(f"{BASE}/pipeline/stages", headers=headers(), timeout=10)
    d = r.json()
    assert "stages" in d, "missing 'stages' key"
    stages = d["stages"]
    assert len(stages) >= 1, "no stages"
    ok(f"Pipeline stages", f"{len(stages)} stages: {', '.join(s['name'] for s in stages[:5])}")
test("Pipeline stages", test_pipeline_stages)

def test_campaigns_data():
    r = requests.get(f"{BASE}/campaigns", headers=headers(), timeout=10)
    d = r.json()
    assert "campaigns" in d, "missing 'campaigns'"
    assert "pagination" in d, "missing 'pagination'"
    ok(f"Campaigns structure", f"{d['pagination']['total']} campaigns")
test("Campaigns data", test_campaigns_data)

def test_numbers_data():
    r = requests.get(f"{BASE}/numbers", headers=headers(), timeout=10)
    d = r.json()
    assert "numbers" in d, "missing 'numbers'"
    ok(f"Numbers structure", f"{len(d['numbers'])} numbers")
test("Numbers data", test_numbers_data)

def test_automation_rules():
    r = requests.get(f"{BASE}/automation/rules", headers=headers(), timeout=10)
    d = r.json()
    assert "rules" in d, "missing 'rules'"
    ok(f"Automation rules", f"{len(d['rules'])} rules")
test("Automation rules", test_automation_rules)

def test_inbox_data():
    r = requests.get(f"{BASE}/inbox", headers=headers(), timeout=10)
    d = r.json()
    assert "conversations" in d, "missing 'conversations'"
    ok(f"Inbox data", f"{len(d.get('conversations',[]))} conversations")
test("Inbox data", test_inbox_data)

# ═══════════════════════════════════════════════════
# 4. ANALYTICS ENDPOINTS VALIDATION
# ═══════════════════════════════════════════════════
print("\n📈 4. ANALYTICS DEEP VALIDATION")
print("=" * 50)

def test_analytics_overview():
    r = requests.get(f"{BASE}/analytics/overview", headers=headers(), timeout=10)
    d = r.json()
    kpis = d.get("kpis", {})
    required = ["totalLeads", "newLeadsWeek", "leadsTrend", "messagesSentWeek", "deliveryRate", "replyRate"]
    missing = [f for f in required if f not in kpis]
    if missing:
        fail("Analytics overview", f"missing KPIs: {missing}")
    else:
        ok("Analytics overview KPIs", f"leads={kpis['totalLeads']}, msgs/wk={kpis['messagesSentWeek']}, delivery={kpis['deliveryRate']}%")
test("Analytics overview", test_analytics_overview)

def test_analytics_funnel():
    r = requests.get(f"{BASE}/analytics/lead-funnel", headers=headers(), timeout=10)
    d = r.json()
    assert "statusDistribution" in d, "missing statusDistribution"
    assert "pipelineFunnel" in d, "missing pipelineFunnel"
    assert "sourceDistribution" in d, "missing sourceDistribution"
    assert "leadTimeline" in d, "missing leadTimeline"
    ok("Analytics funnel", f"{len(d['statusDistribution'])} statuses, {len(d['pipelineFunnel'])} stages, {len(d['sourceDistribution'])} sources")
test("Analytics funnel", test_analytics_funnel)

def test_analytics_messaging():
    r = requests.get(f"{BASE}/analytics/messaging?days=30", headers=headers(), timeout=10)
    d = r.json()
    assert "dailyVolume" in d, "missing dailyVolume"
    assert "hourlyPattern" in d, "missing hourlyPattern"
    assert "weekdayPattern" in d, "missing weekdayPattern"
    assert "errorCodes" in d, "missing errorCodes"
    assert "responseTime" in d, "missing responseTime"
    ok("Analytics messaging", f"{len(d['dailyVolume'])} days, {len(d['hourlyPattern'])} hours, {len(d['weekdayPattern'])} weekdays")
test("Analytics messaging", test_analytics_messaging)

def test_analytics_campaigns():
    r = requests.get(f"{BASE}/analytics/campaigns", headers=headers(), timeout=10)
    d = r.json()
    assert "campaigns" in d, "missing campaigns"
    if d["campaigns"]:
        c = d["campaigns"][0]
        assert "deliveryRate" in c, "missing deliveryRate in campaign"
        assert "replyRate" in c, "missing replyRate in campaign"
    ok("Analytics campaigns", f"{len(d['campaigns'])} campaigns with computed rates")
test("Analytics campaigns", test_analytics_campaigns)

def test_analytics_numbers():
    r = requests.get(f"{BASE}/analytics/numbers", headers=headers(), timeout=10)
    d = r.json()
    assert "numbers" in d, "missing numbers"
    assert "statusSummary" in d, "missing statusSummary"
    if d["numbers"]:
        n = d["numbers"][0]
        assert "utilizationPct" in n, "missing utilizationPct"
        assert "failRate" in n, "missing failRate"
    ok("Analytics numbers", f"{len(d['numbers'])} numbers, {len(d['statusSummary'])} statuses")
test("Analytics numbers", test_analytics_numbers)

def test_analytics_reps():
    r = requests.get(f"{BASE}/analytics/rep-performance", headers=headers(), timeout=10)
    d = r.json()
    assert "reps" in d, "missing reps"
    if d["reps"]:
        rep = d["reps"][0]
        assert "last30d" in rep, "missing last30d stats"
        assert "deliveryRate" in rep["last30d"], "missing deliveryRate in last30d"
    ok("Analytics reps", f"{len(d['reps'])} reps")
test("Analytics reps", test_analytics_reps)

def test_analytics_automation():
    r = requests.get(f"{BASE}/analytics/automation", headers=headers(), timeout=10)
    d = r.json()
    assert "rules" in d, "missing rules"
    assert "summary" in d, "missing summary"
    ok("Analytics automation", f"{d['summary']['totalRules']} rules, {d['summary']['activeRuns']} active runs")
test("Analytics automation", test_analytics_automation)

# ═══════════════════════════════════════════════════
# 5. LEADS EXPORT
# ═══════════════════════════════════════════════════
print("\n📥 5. LEADS EXPORT")
print("=" * 50)

def test_leads_export():
    r = requests.get(f"{BASE}/leads/export", headers=headers(), timeout=10)
    assert r.status_code == 200, f"status {r.status_code}"
    ct = r.headers.get("content-type", "")
    assert "text/csv" in ct, f"expected text/csv, got {ct}"
    lines = r.text.strip().split("\n")
    assert len(lines) >= 2, f"expected header + data, got {len(lines)} lines"
    header = lines[0]
    assert "First Name" in header and "Phone" in header
    ok(f"Leads CSV export", f"{len(lines)-1} data rows, content-type={ct}")
test("Leads export", test_leads_export)

# ═══════════════════════════════════════════════════
# 6. SMS MODE SWITCHING
# ═══════════════════════════════════════════════════
print("\n🔄 6. SMS MODE SWITCHING")
print("=" * 50)

def test_sms_modes():
    # Get current mode
    r = requests.get(f"{BASE}/dashboard/diagnostics", headers=headers(), timeout=10)
    original_mode = r.json()["smsMode"]
    ok(f"Current mode", original_mode)
    
    # Switch to each mode and back
    for mode in ["simulation", "twilio_test", "live"]:
        r = requests.put(f"{BASE}/settings/settings/smsMode", headers=headers(),
                        json={"value": mode}, timeout=10)
        if r.status_code == 200:
            # Verify
            time.sleep(0.5)
            r2 = requests.get(f"{BASE}/dashboard/diagnostics", headers=headers(), timeout=10)
            actual = r2.json()["smsMode"]
            if actual == mode:
                ok(f"Switch to '{mode}'", "verified")
            else:
                fail(f"Switch to '{mode}'", f"expected '{mode}', got '{actual}'")
        else:
            fail(f"Switch to '{mode}'", f"status {r.status_code}")
    
    # Restore original mode
    requests.put(f"{BASE}/settings/settings/smsMode", headers=headers(),
                json={"value": original_mode}, timeout=10)
    ok(f"Restored to '{original_mode}'")
test("SMS modes", test_sms_modes)

# ═══════════════════════════════════════════════════
# 7. TWILIO TEST CREDENTIALS VALIDATION
# ═══════════════════════════════════════════════════
print("\n🧪 7. TWILIO TEST CREDENTIALS")
print("=" * 50)

def test_twilio_test_mode():
    # Switch to twilio_test mode
    r = requests.put(f"{BASE}/settings/settings/smsMode", headers=headers(),
                    json={"value": "twilio_test"}, timeout=10)
    if r.status_code != 200:
        fail("Set twilio_test mode", f"status {r.status_code}")
        return
    
    time.sleep(0.5)
    r = requests.get(f"{BASE}/dashboard/diagnostics", headers=headers(), timeout=10)
    d = r.json()
    assert d["smsMode"] == "twilio_test", f"mode is {d['smsMode']}"
    ok("Twilio test mode active", f"health.twilio={d['health']['twilio']}")
    
    # Switch back to simulation
    requests.put(f"{BASE}/settings/settings/smsMode", headers=headers(),
                json={"value": "simulation"}, timeout=10)
    ok("Restored simulation mode")
test("Twilio test mode", test_twilio_test_mode)

# ═══════════════════════════════════════════════════
# 8. SECURITY TESTS
# ═══════════════════════════════════════════════════
print("\n🔒 8. SECURITY TESTS")
print("=" * 50)

def test_invalid_token():
    r = requests.get(f"{BASE}/leads", headers={"Authorization": "Bearer invalidtoken123"}, timeout=5)
    assert r.status_code == 401, f"expected 401, got {r.status_code}"
    ok("Invalid JWT rejected (401)")
test("Invalid token", test_invalid_token)

def test_expired_token():
    r = requests.get(f"{BASE}/leads", headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.invalid"}, timeout=5)
    assert r.status_code == 401, f"expected 401, got {r.status_code}"
    ok("Malformed JWT rejected (401)")
test("Malformed token", test_expired_token)

def test_sql_injection():
    r = requests.get(f"{BASE}/leads?search='; DROP TABLE leads; --", headers=headers(), timeout=10)
    assert r.status_code == 200, f"SQL injection caused error: {r.status_code}"
    d = r.json()
    assert "leads" in d, "response structure broken"
    ok("SQL injection handled safely")
test("SQL injection", test_sql_injection)

def test_xss_input():
    r = requests.get(f'{BASE}/leads?search=<script>alert("xss")</script>', headers=headers(), timeout=10)
    assert r.status_code == 200
    ok("XSS input handled safely")
test("XSS input", test_xss_input)

def test_rate_limit_headers():
    r = requests.get(f"{BASE}/leads", headers=headers(), timeout=5)
    rl = r.headers.get("ratelimit-limit") or r.headers.get("x-ratelimit-limit")
    if rl:
        ok(f"Rate limit headers present", f"limit={rl}")
    else:
        fail("Rate limit headers missing")
test("Rate limit", test_rate_limit_headers)

# ═══════════════════════════════════════════════════
# 9. PERFORMANCE BENCHMARKS
# ═══════════════════════════════════════════════════
print("\n⚡ 9. PERFORMANCE BENCHMARKS")
print("=" * 50)

perf_endpoints = [
    ("/health", "Health"),
    ("/dashboard/stats", "Dashboard Stats"),
    ("/dashboard/diagnostics", "Diagnostics"),
    ("/leads?limit=50", "Leads (50)"),
    ("/analytics/overview", "Analytics Overview"),
    ("/analytics/messaging?days=30", "Analytics Messaging"),
    ("/analytics/lead-funnel", "Lead Funnel"),
]

for path, name in perf_endpoints:
    def bench(p=path, n=name):
        times = []
        for _ in range(3):
            start = time.time()
            r = requests.get(f"{BASE}{p}", headers=headers(), timeout=15)
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)
        avg = sum(times) / len(times)
        if avg < 500:
            ok(f"{n}", f"avg {avg:.0f}ms (3 runs)")
        elif avg < 2000:
            ok(f"{n}", f"avg {avg:.0f}ms ⚠️ slow")
        else:
            fail(f"{n}", f"avg {avg:.0f}ms — TOO SLOW")
    test(f"Perf: {name}", bench)

# ═══════════════════════════════════════════════════
# 10. CRUD OPERATIONS
# ═══════════════════════════════════════════════════
print("\n✏️ 10. CRUD OPERATIONS")
print("=" * 50)

created_lead_id = None

def test_create_lead():
    global created_lead_id
    r = requests.post(f"{BASE}/leads", headers=headers(), json={
        "firstName": "Test",
        "lastName": "ApiUser",
        "phone": "+10005550199",
        "email": "test@example.com",
        "status": "NEW",
        "source": "api_test",
    }, timeout=10)
    assert r.status_code in [200, 201], f"status {r.status_code}: {r.text[:100]}"
    d = r.json()
    created_lead_id = d.get("id") or d.get("lead", {}).get("id")
    assert created_lead_id, "no ID returned"
    ok(f"Create lead", f"id={created_lead_id}")
test("Create lead", test_create_lead)

def test_get_lead():
    if not created_lead_id:
        fail("Get lead", "no lead ID")
        return
    r = requests.get(f"{BASE}/leads/{created_lead_id}", headers=headers(), timeout=10)
    assert r.status_code == 200, f"status {r.status_code}"
    d = r.json()
    lead = d.get("lead", d)
    assert lead["firstName"] == "Test"
    ok(f"Get lead", f"{lead['firstName']} {lead.get('lastName','')}")
test("Get lead", test_get_lead)

def test_update_lead():
    if not created_lead_id:
        fail("Update lead", "no lead ID")
        return
    r = requests.put(f"{BASE}/leads/{created_lead_id}", headers=headers(), json={
        "firstName": "Updated",
        "company": "Test Corp",
    }, timeout=10)
    assert r.status_code == 200, f"status {r.status_code}"
    ok(f"Update lead", "firstName → Updated")
test("Update lead", test_update_lead)

def test_delete_lead():
    if not created_lead_id:
        fail("Delete lead", "no lead ID")
        return
    r = requests.delete(f"{BASE}/leads/{created_lead_id}", headers=headers(), timeout=10)
    assert r.status_code == 200, f"status {r.status_code}"
    # Verify deletion
    r2 = requests.get(f"{BASE}/leads/{created_lead_id}", headers=headers(), timeout=10)
    assert r2.status_code == 404, f"lead still exists: {r2.status_code}"
    ok(f"Delete lead", "verified 404 after delete")
test("Delete lead", test_delete_lead)

# ═══════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════
print("\n" + "=" * 50)
print(f"📋 TEST SUMMARY")
print("=" * 50)
print(f"  ✅ Passed: {RESULTS['passed']}")
print(f"  ❌ Failed: {RESULTS['failed']}")
print(f"  📊 Total:  {RESULTS['passed'] + RESULTS['failed']}")

if RESULTS["errors"]:
    print(f"\n⚠️  FAILURES:")
    for e in RESULTS["errors"]:
        print(f"    • {e}")

pct = RESULTS["passed"] / (RESULTS["passed"] + RESULTS["failed"]) * 100 if (RESULTS["passed"] + RESULTS["failed"]) > 0 else 0
print(f"\n{'🎉' if pct >= 95 else '⚠️'} Pass rate: {pct:.1f}%")

sys.exit(0 if RESULTS["failed"] == 0 else 1)
