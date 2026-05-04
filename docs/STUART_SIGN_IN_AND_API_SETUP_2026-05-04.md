© BuyReadySite.com

# Stuart Sign-In + API Setup — 2026-05-04

## Current Finding

- Stuart account is active in production.
- Login email: `sb@securecreditlines.com`.
- Mobile phone on file ends in `2055` and is stored as E.164.
- OTP lock is not active and failed attempts are `0`.
- Recent OTP table has no Stuart sign-in code requests, so the user likely did not submit the exact account email or did not reach a successful code request.
- Twilio can deliver platform SMS to Stuart's phone; recent HOT alert messages to the same number show `delivered`.
- Email sign-in fallback was blocked because Resend was not configured in production.

## What Was Added

- Settings now supports Resend email sign-in configuration:
  - `resendApiKey`
  - `resendFromEmail`
- Backend email OTP now reads Resend credentials from Settings, with `.env` fallback.
- Login now offers `Use email code instead` from the first screen, so a rep does not need to wait for the SMS step to access email fallback.

## Internal Setup Steps

1. Open `https://app.sclcapital.io/` and sign in as an admin.
2. Go to `Settings` → `Integrations` → `Email Sign-in`.
3. Paste the Resend API key into `Resend API Key`.
4. Set `From Email (verified Resend sender)` to a verified sender, for example `login@sclcapital.io` or `no-reply@sclcapital.io`.
5. Save both fields.
6. Test login with `sb@securecreditlines.com`:
   - click `Use email code instead`;
   - confirm the code arrives in Stuart's inbox;
   - enter the 6-digit code;
   - confirm redirect to `/pipeline`.

## Resend Key Instructions For Client

1. Log in to Resend: `https://resend.com/`.
2. Open `Domains` and add/verify the sending domain, preferably a subdomain such as `mail.sclcapital.io`.
3. Add the DNS records Resend provides:
   - SPF / TXT;
   - DKIM / TXT;
   - optional DMARC for better deliverability.
4. Wait until the domain status is `verified`.
5. Open `API Keys` → `Create API Key`.
6. Name it `SCL production login OTP`.
7. Choose `Sending access`; if available, restrict it to the verified SCL domain.
8. Copy the API key immediately. Resend shows it only once.
9. Send the API key through a secure channel, not email or chat history where non-admins can access it.
10. Confirm the exact sender email to use, for example `login@sclcapital.io`.

## Twilio API Check Instructions

Twilio is already connected for production SMS. If credentials ever need to be replaced:

1. Open Twilio Console.
2. Find `Account SID` in the Console Dashboard account info panel.
3. Reveal `Auth Token` only when ready to copy it. Treat it like a password.
4. Open Messaging → Services and copy the production Messaging Service SID that starts with `MG`.
5. In SCL admin, go to `Settings` → `Integrations` → `Twilio` and save:
   - `Account SID`;
   - `Auth Token`;
   - `Messaging Service SID`.
6. Send a controlled login SMS test to a known internal user before asking reps to retry.

## Stuart Login Instructions

1. Go to `https://app.sclcapital.io/login`.
2. Enter `sb@securecreditlines.com` exactly.
3. Click `Send SMS code`.
4. The SMS code should go to the phone ending in `2055`.
5. If Stuart cannot access SMS or does not receive it, click `Use email code instead`.
6. Enter the 6-digit code within 5 minutes.
7. If multiple wrong codes were entered, an admin can open `Settings` → `Users`, edit Stuart, verify the mobile phone, and use `Unlock OTP` if needed.

## Edge Cases To Watch

- Wrong email: the app intentionally does not reveal whether an email exists, so no code will arrive if Stuart uses a different address.
- SMS blocked by carrier/device: use email code after Resend is configured.
- Email not visible: check spam/junk and confirm the Resend domain is verified.
- Too many requests: wait for the displayed countdown; OTP sends are limited to 3 per hour per destination.
- OTP lock: 5 wrong codes in 15 minutes locks the account for 30 minutes unless an admin unlocks it.
