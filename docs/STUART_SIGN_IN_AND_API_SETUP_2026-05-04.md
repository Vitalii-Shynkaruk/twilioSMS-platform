© BuyReadySite.com

# Stuart Sign-In + API Setup — 2026-05-04

## Current Finding

- Stuart account is active in production.
- Login email: `sb@securecreditlines.com`.
- Mobile phone on file ends in `2055` and is stored as E.164.
- OTP lock is not active and failed attempts are `0`.
- Recent OTP table has no Stuart sign-in code requests, so the user likely did not submit the exact account email or did not reach a successful code request.
- Twilio can deliver platform SMS to Stuart's phone; recent HOT alert messages to the same number show `delivered`.
- Email sign-in fallback requires SMTP delivery. SMS keeps using the existing Twilio API/Messaging Service already used by the platform.

## What Was Added

- Settings now supports SMTP email sign-in configuration:
  - `smtpFromEmail`
  - `smtpHost`
  - `smtpPort`
  - `smtpUser`
  - `smtpPassword`
  - `smtpSecure`
- Backend email OTP sends through SMTP. By default it uses the server SMTP relay at `127.0.0.1:25`; admins can switch to an external SMTP provider in Settings.
- Login now offers `Use email code instead` from the first screen, so a rep does not need to wait for the SMS step to access email fallback.

## Internal Setup Steps

1. Open `https://app.sclcapital.io/` and sign in as an admin.
2. Go to `Settings` → `Integrations` → `Email Sign-in`.
3. For server SMTP, keep:
   - `SMTP Host`: `127.0.0.1`;
   - `SMTP Port`: `25`;
   - `Secure TLS`: `false`.
4. Set `From Email` to a sender controlled by SCL, for example `login@sclcapital.io`.
5. If using an external SMTP provider, enter its host, port, username, password, and TLS mode.
6. Save changed fields.
7. Test login with `sb@securecreditlines.com`:
   - click `Use email code instead`;
   - confirm the code arrives in Stuart's inbox;
   - enter the 6-digit code;
   - confirm redirect to `/pipeline`.

## SMTP Setup Instructions For Client

### Option A — Server SMTP

1. Confirm the production server has an SMTP relay installed and allowed to send mail for the SCL sender domain.
2. Confirm DNS/authentication for the sender domain:
   - SPF includes the server or relay;
   - DKIM is configured if available;
   - DMARC exists for monitoring/deliverability.
3. In SCL Settings → Integrations → Email Sign-in, use:
   - `From Email`: `login@sclcapital.io` or another controlled sender;
   - `SMTP Host`: `127.0.0.1`;
   - `SMTP Port`: `25`;
   - `Secure TLS`: `false`.
4. Send a test email OTP and check inbox/spam.

### Option B — External SMTP

Ask the client/provider for these values:

- SMTP host, for example `smtp.mailgun.org`, `smtp.sendgrid.net`, or provider-specific host.
- SMTP port: usually `587` with STARTTLS or `465` with secure TLS.
- SMTP username.
- SMTP password or app password.
- Sender email, for example `login@sclcapital.io`.
- Whether secure TLS must be `true` or `false`.

Save those values in `Settings` → `Integrations` → `Email Sign-in`. Treat the SMTP password like an API secret and share it only through a secure channel.

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

Important: login SMS uses the same Twilio API/Messaging Service path as the rest of the platform SMS sending. No separate SMS provider is required for Stuart.

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
- SMS blocked by carrier/device: use email code after SMTP is configured.
- Email not visible: check spam/junk, SMTP logs, SPF/DKIM/DMARC, and whether the sender is allowed by the provider.
- Too many requests: wait for the displayed countdown; OTP sends are limited to 3 per hour per destination.
- OTP lock: 5 wrong codes in 15 minutes locks the account for 30 minutes unless an admin unlocks it.
