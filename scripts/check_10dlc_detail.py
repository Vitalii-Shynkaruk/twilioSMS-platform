#!/usr/bin/env python3
"""Detailed Twilio 10DLC check — brand, campaign, number associations"""
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
        return {"error": e.code, "body": e.read().decode()[:1000]}

# 1. Get all brand registrations (full data)
print("=" * 60)
print("1. BRAND REGISTRATIONS (detailed)")
print("=" * 60)
data = get(f"https://messaging.twilio.com/v1/a2p/BrandRegistrations")
brands = data.get("brand_registrations", data.get("data", []))
for b in brands:
    print(json.dumps(b, indent=2))
    print()
if not brands:
    print("Checking data key...")
    print(json.dumps(data, indent=2)[:1000])

# 2. Get A2P campaigns directly
print()
print("=" * 60)
print("2. A2P CAMPAIGNS (all services)")
print("=" * 60)
for ms_sid in ["MG48c7bd2baa8c738b9a19c910fea22903", "MG9884053997bcd3b9c9ac054def6e9680"]:
    print(f"\n--- Service: {ms_sid} ---")
    # Try different API paths for campaigns
    for path in [
        f"Services/{ms_sid}/UsAppToPerson",
        f"Services/{ms_sid}/Compliance/UsAppToPerson",
    ]:
        result = get(f"https://messaging.twilio.com/v1/{path}")
        if "error" not in result:
            print(f"  Path: {path}")
            print(json.dumps(result, indent=2)[:2000])
            break
    else:
        # Check if there are channel senders
        senders = get(f"https://messaging.twilio.com/v1/Services/{ms_sid}/PhoneNumbers")
        print(f"  Phone numbers in service:")
        for s in senders.get("phone_numbers", []):
            print(f"    {s.get('phone_number', '-')} ({s.get('sid', '-')})")
        if not senders.get("phone_numbers"):
            print(f"    (none)")

# 3. Check number's messaging service association + compliance
print()
print("=" * 60)
print("3. PHONE NUMBER DETAILS (+17866487512)")
print("=" * 60)
num = get(f"https://api.twilio.com/2010-04-01/Accounts/{SID}/IncomingPhoneNumbers/PNe389d5e2552fe96178a544325db72ce2.json")
print(f"  Phone:    {num.get('phone_number', '-')}")
print(f"  Status:   {num.get('status', '-')}")
print(f"  SMS URL:  {num.get('sms_url', '-')}")
print(f"  Voice:    {num.get('voice_url', '-')}")
print(f"  Bundle:   {num.get('bundle_sid', '-')}")
print(f"  Identity: {num.get('identity_sid', '-')}")
print(f"  Emergency: {num.get('emergency_address_sid', '-')}")

# 4. Check Customer Profile bundles
print()
print("=" * 60)
print("4. CUSTOMER PROFILES")
print("=" * 60)
profiles = get(f"https://trusthub.twilio.com/v1/CustomerProfiles")
for p in profiles.get("results", []):
    print(f"  SID:    {p['sid']}")
    print(f"  Name:   {p.get('friendly_name', '-')}")
    print(f"  Status: {p['status']}")
    print()

# 5. Brand registration details (single)
print()
print("=" * 60)
print("5. BRAND REGISTRATION DETAILS")
print("=" * 60)
# Get from data we already have
for b in brands:
    brand_sid = b.get("sid", "")
    if brand_sid:
        detail = get(f"https://messaging.twilio.com/v1/a2p/BrandRegistrations/{brand_sid}")
        print(json.dumps(detail, indent=2)[:2000])
