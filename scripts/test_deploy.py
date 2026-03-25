#!/usr/bin/env python3
import urllib.request, json

BASE = "http://localhost:3001/api"

# Login
login_data = json.dumps({"email": "admin@securecreditlines.com", "password": "SclAdmin2026!Secure"}).encode()
req = urllib.request.Request(f"{BASE}/auth/login", data=login_data, headers={"Content-Type": "application/json"})
resp = json.loads(urllib.request.urlopen(req).read())
token = resp["token"]
print("Login OK")

def api(path):
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())

# Board
board = api("/deals/board")
print(f"\n--- BOARD ({len(board['stages'])} stages) ---")
total = 0
for s in board["stages"]:
    total += s["count"]
    print(f"  {s['stage']}: {s['count']} deals, ${s.get('value', 0)}")
print(f"  TOTAL: {total} deals")

# Stats
stats = api("/deals/stats")
print(f"\n--- STATS ---")
for k, v in stats.items():
    print(f"  {k}: {v}")

# Intelligence
intel = api("/command-center/intelligence")
print(f"\n--- INTELLIGENCE ---")
print(f"  conversionFunnel:")
for f in intel.get("conversionFunnel", []):
    print(f"    {f['stage']}: {f['count']} ({f['rate']}%)")
print(f"  repActivity ({len(intel.get('repActivity', []))}):")
for r in intel.get("repActivity", []):
    print(f"    {r.get('name','?')}: initials={r.get('initials')}, activeDeals={r.get('activeDeals')}, status={r.get('status')}")
print(f"  bottlenecks: {intel.get('bottlenecks', [])[:3]}")

# Execution Scores
scores = api("/command-center/execution-scores")
print(f"\n--- EXECUTION SCORES ---")
for s in scores:
    print(f"  {s.get('initials', '??')} ({s.get('firstName','')}): score={s['score']}%, assigned={s['assigned']}, overdue={s['overdue']}")

# Metrics
metrics = api("/command-center/metrics")
print(f"\n--- METRICS ---")
for k, v in metrics.items():
    print(f"  {k}: {v}")
