© BuyReadySite.com

# Client API Requirements — SCL

## Short Answer

No new third-party API is required specifically for the Leads/Campaigns refinement. That scope uses the existing platform data, Twilio SMS infrastructure, and the existing AI provider setup.

## Required From Client

1. Resend email sending setup for email OTP fallback:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`, for example `no-reply@securecreditlines.com`
   - Verified sending domain in Resend with DNS records completed.

2. Original SCL logo/wordmark asset for exact Login pixel match:
   - SVG preferred, or high-resolution transparent PNG.

3. Twilio production confirmation:
   - Account SID and Auth Token must be active.
   - Messaging Service SID must be connected to the production sender pool.
   - A2P/10DLC Brand and Campaign should be approved.
   - Webhooks should point to:
     - `https://app.sclcapital.io/api/webhooks/twilio/inbound`
     - `https://app.sclcapital.io/api/webhooks/twilio/status`

4. AI provider confirmation:
   - Anthropic is the recommended provider for Pipeline AI and Campaign AI reasoning.
   - Required setting: `anthropicApiKey`.
   - Model: `claude-sonnet-4-5`.
   - OpenAI can remain optional fallback only if client prefers it.

## What Is Not Needed

- No separate API is needed for Source/State/Last Contact filters.
- No separate API is needed for readable source names.
- No separate API is needed for AI Suggested Campaign cards beyond the existing AI provider key.
- No Gmail/email-sending integration is part of the current approved Leads/Campaigns scope.

## Secure Delivery Note

API keys should not be sent in regular chat. Use a secure password manager share, hosting provider secret manager, or another approved secure channel.

## Russian Summary

Для Leads/Campaigns новый внешний API не нужен. Для полного закрытия нужны Resend для email OTP fallback, оригинальный SCL logo asset, подтверждение Twilio/A2P production settings и Anthropic key для AI-функций.
