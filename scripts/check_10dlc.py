#!/usr/bin/env python3
"""Check Twilio 10DLC registration status"""
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
        return {"error": e.code, "body": e.read().decode()[:500]}

# 1. Brand Registrations
print("=" * 60)
print("1. BRAND REGISTRATIONS (A2P 10DLC)")
print("=" * 60)
data = get(f"https://messaging.twilio.com/v1/a2p/BrandRegistrations")
for b in data.get("brand_registrations", []):
    print(f"  SID:         {b['sid']}")
    print(f"  Status:      {b['status']}")
    print(f"  Brand Type:  {b.get('brand_type', '-')}")
    print(f"  TCR ID:      {b.get('tcr_id', '-')}")
    print(f"  Created:     {b.get('date_created', '-')}")
    print(f"  Updated:     {b.get('date_updated', '-')}")
    print()
if not data.get("brand_registrations"):
    print("  (none found)")
    print(json.dumps(data, indent=2)[:500])

# 2. Messaging Services
print()
print("=" * 60)
print("2. MESSAGING SERVICES")
print("=" * 60)
data = get(f"https://messaging.twilio.com/v1/Services")
for s in data.get("services", []):
    print(f"  SID:   {s['sid']}")
    print(f"  Name:  {s['friendly_name']}")
    print(f"  A2P:   {s.get('use_inbound_webhook_on_number', '-')}")
    print()
if not data.get("services"):
    print("  (none found)")

# 3. A2P Campaigns (US App-to-Person)
print()
print("=" * 60)
print("3. A2P CAMPAIGNS (US App-to-Person)")
print("=" * 60)
# Try via Messaging Service
for s in data.get("services", []):
    sid = s["sid"]
    camps = get(f"https://messaging.twilio.com/v1/Services/{sid}/UsAppToPerson")
    for c in camps.get("us_app_to_person", []):
        print(f"  Campaign SID: {c['sid']}")
        print(f"  Status:       {c.get('campaign_status', '-')}")
        print(f"  Use Case:     {c.get('us_app_to_person_usecase', '-')}")
        print(f"  Description:  {c.get('description', '-')[:100]}")
        print(f"  Brand SID:    {c.get('brand_registration_sid', '-')}")
        print(f"  Created:      {c.get('date_created', '-')}")
        print()
    if not camps.get("us_app_to_person"):
        print(f"  No campaigns for service {sid}")
        if "error" in camps:
            print(f"  Error: {camps}")

# 4. Phone Numbers
print()
print("=" * 60)
print("4. PHONE NUMBERS")
print("=" * 60)
phones = get(f"https://api.twilio.com/2010-04-01/Accounts/{SID}/IncomingPhoneNumbers.json")
for p in phones.get("incoming_phone_numbers", []):
    print(f"  Number:  {p['phone_number']}")
    print(f"  SID:     {p['sid']}")
    print(f"  Name:    {p.get('friendly_name', '-')}")
    print(f"  SMS URL: {p.get('sms_url', '-')}")
    print(f"  Voice:   {p.get('voice_url', '-')}")
    print()

# 5. Regulatory/Trust bundles
print()
print("=" * 60)
print("5. TRUST PRODUCTS (A2P Profile / SHAKEN/STIR)")
print("=" * 60)
trust = get(f"https://trusthub.twilio.com/v1/TrustProducts")
for t in trust.get("results", []):
    print(f"  SID:    {t['sid']}")
    print(f"  Name:   {t.get('friendly_name', '-')}")
    print(f"  Status: {t['status']}")
    print(f"  Type:   {t.get('policy_sid', '-')}")
    print()
if not trust.get("results"):
    print("  (none found)")
    print(json.dumps(trust, indent=2)[:300])
