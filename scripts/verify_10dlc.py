import requests
import os
import sys

ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")

if not ACCOUNT_SID or not AUTH_TOKEN:
    sys.exit("Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN before running this script.")

auth = (ACCOUNT_SID, AUTH_TOKEN)

MS_SID = "MG48c7bd2baa8c738b9a19c910fea22903"
PHONE_SID = "PNe389d5e2552fe96178a544325db72ce2"
CAMPAIGN_SID = "CM0ad0caf882e4697eb09c14d97187e4f1"

print("=" * 70)
print("1. A2P CAMPAIGN STATUS")
print("=" * 70)

r = requests.get(
    f"https://messaging.twilio.com/v1/Services/{MS_SID}/Compliance/Usa2p",
    auth=auth
)
print(f"  Campaigns on {MS_SID}: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    for c in data.get("results", []):
        print(f"  Campaign SID: {c.get('sid')}")
        print(f"  Status: {c.get('campaign_status')}")
        print(f"  Use case: {c.get('us_app_to_person_usecase')}")
        print(f"  Brand SID: {c.get('brand_registration_sid')}")
else:
    print(f"  Response: {r.text[:300]}")

print()
print("=" * 70)
print("2. MESSAGING SERVICE CONFIG")
print("=" * 70)

r = requests.get(
    f"https://messaging.twilio.com/v1/Services/{MS_SID}",
    auth=auth
)
if r.status_code == 200:
    ms = r.json()
    print(f"  Name: {ms.get('friendly_name')}")
    print(f"  SID: {ms.get('sid')}")
    print(f"  Inbound URL: {ms.get('inbound_request_url')}")
    print(f"  Status callback: {ms.get('status_callback')}")
    print(f"  Fallback URL: {ms.get('fallback_url')}")
    print(f"  Sticky sender: {ms.get('sticky_sender')}")
    print(f"  Use inbound webhook: {ms.get('use_inbound_webhook_on_number')}")

print()
print("=" * 70)
print("3. PHONE NUMBER CONFIG")
print("=" * 70)

r = requests.get(
    f"https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/IncomingPhoneNumbers/{PHONE_SID}.json",
    auth=auth
)
if r.status_code == 200:
    pn = r.json()
    print(f"  Number: {pn.get('phone_number')}")
    print(f"  SMS URL: {pn.get('sms_url')}")
    print(f"  SMS Method: {pn.get('sms_method')}")
    print(f"  Status callback: {pn.get('status_callback')}")
    print(f"  Voice URL: {pn.get('voice_url')}")

print()
print("=" * 70)
print("4. PHONE NUMBERS IN MESSAGING SERVICE (Low Volume Mixed)")
print("=" * 70)

r = requests.get(
    f"https://messaging.twilio.com/v1/Services/{MS_SID}/PhoneNumbers",
    auth=auth
)
if r.status_code == 200:
    data = r.json()
    phones = data.get("phone_numbers", [])
    if phones:
        for p in phones:
            print(f"  {p.get('phone_number')} (SID: {p.get('sid')})")
    else:
        print("  NO phone numbers associated!")

MS2_SID = "MG9884053997bcd3b9c9ac054def6e9680"
r = requests.get(
    f"https://messaging.twilio.com/v1/Services/{MS2_SID}/PhoneNumbers",
    auth=auth
)
print(f"\n  Phone numbers in SCL Outbound Engine ({MS2_SID}):")
if r.status_code == 200:
    data = r.json()
    phones = data.get("phone_numbers", [])
    if phones:
        for p in phones:
            print(f"  {p.get('phone_number')} (SID: {p.get('sid')})")
    else:
        print("  NO phone numbers")

print()
print("=" * 70)
print("DONE")
print("=" * 70)
