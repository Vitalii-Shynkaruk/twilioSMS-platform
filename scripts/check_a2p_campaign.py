#!/usr/bin/env python3
"""Check A2P campaign details and SMS URL webhook config"""
import urllib.request
import json
import base64
import os
import sys

SID = os.environ.get("TWILIO_ACCOUNT_SID")
TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")

if not SID or not TOKEN:
    sys.exit("Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN before running this script.")

auth = base64.b64encode(f"{SID}:{TOKEN}".encode()).decode()
headers = {"Authorization": f"Basic {auth}"}

def get(url):
    req = urllib.request.Request(url, headers=headers)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:1500]}

MS_SID = "MG9884053997bcd3b9c9ac054def6e9680"

# 1. Check US A2P campaigns
print("=" * 60)
print("1. US A2P CAMPAIGNS")
print("=" * 60)
paths = [
    f"Services/{MS_SID}/UsAppToPerson",
    f"Services/{MS_SID}/Compliance/Usa2p",
]
for p in paths:
    print(f"\n  Trying: {p}")
    r = get(f"https://messaging.twilio.com/v1/{p}")
    print(json.dumps(r, indent=2)[:2000])
    if "error" not in r:
        break

# 2. Check messaging service compliance
print()
print("=" * 60)
print("2. MESSAGING SERVICE DETAILS")
print("=" * 60)
r = get(f"https://messaging.twilio.com/v1/Services/{MS_SID}")
if "error" not in r:
    print(f"  Name:              {r.get('friendly_name', '-')}")
    print(f"  Status Callback:   {r.get('status_callback', '-')}")
    print(f"  Inbound Request:   {r.get('inbound_request_url', '-')}")
    print(f"  Inbound Method:    {r.get('inbound_method', '-')}")
    print(f"  Fallback URL:      {r.get('fallback_url', '-')}")
    print(f"  Use Case:          {r.get('usecase_config', '-')}")
    print(f"  US A2P Compliance: {r.get('us_app_to_person_registered', '-')}")
    print()
    print("  Full config:")
    for key in sorted(r.keys()):
        if key not in ('links', 'url', 'account_sid'):
            print(f"    {key}: {r[key]}")
else:
    print(json.dumps(r, indent=2))

# 3. Check brand vettings
print()
print("=" * 60)
print("3. BRAND VETTINGS")
print("=" * 60)
BRAND_SID = "BNd480e3d679a69959865fe529c372e185"
r = get(f"https://messaging.twilio.com/v1/a2p/BrandRegistrations/{BRAND_SID}/Vettings")
print(json.dumps(r, indent=2)[:2000])

# 4. Check number compliance
print()
print("=" * 60)
print("4. NUMBER <-> MESSAGING SERVICE ASSOCIATION")
print("=" * 60)
r = get(f"https://messaging.twilio.com/v1/Services/{MS_SID}/PhoneNumbers")
for p in r.get("phone_numbers", []):
    print(json.dumps(p, indent=2)[:500])
