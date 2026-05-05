# SCL Capital — AI-Powered Inbox: Comprehensive Build Plan

**Prepared for:** SCL Capital  
**Date:** April 20, 2026  
**Version:** 1.1 — Updated per client confirmation (April 20, 2026)  
**Project:** AI Intelligence Layer for SMS Platform (app.sclcapital.io)

---

## Executive Summary

This document provides a detailed, step-by-step build plan for integrating an AI-powered intelligence layer into the existing SCL Capital SMS platform. The plan is based on a thorough audit of the current production codebase at `app.sclcapital.io` and maps every spec requirement to concrete implementation tasks with file-level specificity.

**Scope:** 4 major work streams, 8 new frontend components, 1 complete AI engine rewrite (two-model Anthropic pipeline), 1 real-time escalation system, and 12 acceptance tests — aligned with the approved prototype and consistent with the existing platform UI theme.

---

## 1. Current State Audit — What Already Exists

Before building anything new, I've audited every relevant file in the production codebase to understand exactly what's in place and what needs to change.

### 1.1 AI Infrastructure (Partially Built — Never Activated)

| Component       | File                               | Status         | Details                                                                                                                                                                                         |
| --------------- | ---------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Service      | `server/src/services/aiService.ts` | ✅ Exists      | 3 functions: `generateDraftReply()`, `classifyMessage()`, `scoreLead()`. Uses OpenAI gpt-4.1-mini. API key stored in DB `SystemSetting` table — **currently empty, never fired in production**. |
| AI API Routes   | `server/src/routes/ai.ts`          | ✅ 3 endpoints | `POST /api/ai/draft-reply`, `/api/ai/classify`, `/api/ai/score-lead` — all auth-protected, manual-trigger only.                                                                                 |
| AI Draft Button | `client/src/pages/InboxPage.tsx`   | ✅ Working     | Sparkles icon in compose box → calls `/api/ai/draft-reply` → pre-fills reply textarea. Will continue working after migration.                                                                   |

**Key Finding:** AI infrastructure exists (service + routes + draft button) but has **never been activated** in production. The entire AI classification, signals, HOT automation, escalation, and inbox UI layer is **greenfield** — must be built from scratch.

### 1.2 Messaging & Real-Time Infrastructure (Production-Ready)

| Component              | File                                       | Status        | Details                                                                                      |
| ---------------------- | ------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------- |
| Twilio Inbound Webhook | `server/src/webhooks/twilioWebhooks.ts`    | ✅ Production | Receives SMS → compliance check → create/find lead → save message → Socket.io emit.          |
| Socket.io Events       | Multiple files                             | ✅ 2 events   | `new-message` (to inbox room) + `message` (to conversation room). No HOT/revenue events yet. |
| BullMQ + Redis         | `server/src/queues/`                       | ✅ Production | Used for status callbacks and sending engine. Queue infrastructure ready for HOT escalation. |
| Compliance Service     | `server/src/services/complianceService.ts` | ✅ Full       | STOP/HELP/OPT-OUT + suppression list. No California area code detection yet.                 |

### 1.3 Database Schema (Needs Extension)

| Model        | Current State                              | What's Missing                                                                                                            |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Conversation | Has `hotLead Boolean` (manual toggle only) | 6 AI fields: `aiClassification`, `aiConversationState`, `aiSignals`, `aiSuggestions`, `isCaliforniaNumber`, `aiLeadScore` |
| User         | Has email, name, role                      | `mobilePhone` (for SMS alerts), `hotAlertsEnabled` toggle                                                                 |

### 1.4 Frontend Navigation & Inbox

| Component          | Current State                                                                | What Changes                                                                            |
| ------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Navigation sidebar | Dashboard = separate page, Pipeline = Kanban icon, Automation = Bot icon     | Dashboard merges into Command Center, Pipeline → grid icon, Automation → lightning bolt |
| Inbox filters      | 7 filters (all, unread, replied, interested, not_interested, dnc, opted_out) | Add "🔥 Hot" filter, add "AI Priority" sort                                             |
| Inbox cards        | Standard: name, message preview, timestamp, status badge                     | Add: HOT badge, signal chips, score bar                                                 |
| AI components      | None                                                                         | 8 new components (detailed in Step 3)                                                   |

---

## 2. Gap Analysis — Spec Requirements vs Current Codebase

### What Needs to Be Built From Scratch

| #   | Requirement                                              | Current State                 | Work Required                                        |
| --- | -------------------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| 1   | Two-model Anthropic pipeline (Haiku 4.5 + Sonnet 4.5)    | OpenAI (unused)               | Complete AI service rewrite                          |
| 2   | `classifyInbound()` with complex JSON schema (Haiku 4.5) | Simple string classification  | New core function with Gap Selling prompt            |
| 3   | Revenue extraction & normalization                       | None                          | NLP parsing in system prompt                         |
| 4   | Deterministic lead scoring (0–100)                       | Basic OpenAI scoring (unused) | 5-signal scoring model                               |
| 5   | California compliance detection                          | None                          | Area code lookup + banner + suggestion variant       |
| 6   | HOT escalation queue (3-stop ladder)                     | None                          | BullMQ delayed jobs: 2min → 10min (no auto-reassign) |
| 7   | Mobile SMS alerts to reps                                | None                          | Twilio SMS service + user phone config               |
| 8   | AI Intelligence Banner                                   | None                          | New React component                                  |
| 9   | AI-enhanced inbox cards                                  | Basic cards                   | New React component overlay                          |
| 10  | BEST + ALT suggestion cards                              | None                          | New React component                                  |
| 11  | HOT toast + Web Audio sound                              | None                          | New React component                                  |
| 12  | Escalation progress bar                                  | None                          | New React component                                  |
| 13  | CA compliance banner                                     | None                          | New React component                                  |
| 14  | Right panel AI State + Alerts tabs                       | Contact tab only              | 2 new tab panels                                     |
| 15  | AI Priority inbox sort                                   | Manual sort only              | New sort algorithm                                   |
| 16  | Dashboard → Command Center merge                         | Separate pages                | Page merge + route delete                            |
| 17  | Nav icon updates                                         | Lucide icons                  | Custom SVG icons                                     |
| 18  | csv_import source bug                                    | Hardcoded "csv_import"        | 2-line fix                                           |

---

## 3. Detailed Implementation Plan

### STEP 1 — Backend Foundation: Schema, AI Engine, Compliance

**Duration:** 2 working days  
**Risk Level:** Medium (Anthropic API integration is the critical path)

#### Task 1.1 — Database Schema Migration

**File:** `server/prisma/schema.prisma`

Add to `Conversation` model:

```prisma
aiClassification    String?    // HOT | WARM | NURTURE | DEAD | WRONG_NUMBER
aiConversationState String?    // HOT_INBOUND | SENSITIVE | null
aiSignals           Json?      // {revenue, revenueMonthly, revenueAnnual, ask, urgency, product, industry}
aiSuggestions       Json?      // [{type: "BEST"|"ALT", text, cta}]
isCaliforniaNumber  Boolean    @default(false)
aiLeadScore         Int        @default(0)
```

Add to `User` model:

```prisma
mobilePhone       String?    // E.164 format, set by admin
hotAlertsEnabled  Boolean    @default(true)
```

**Execution:** `npx prisma migrate dev --name add_ai_inbox_v1`

**Validation:**

- [ ] Migration runs without errors
- [ ] Existing data preserved (all new fields nullable or have defaults)
- [ ] Prisma Client regenerated with new types

#### Task 1.2 — AI Service: OpenAI → Two-Model Anthropic Pipeline

**File:** `server/src/services/aiService.ts` (complete rewrite)

**Model architecture:**

- `classifyInbound()` → **Haiku 4.5** — structured JSON extraction, deterministic output, no creative language needed. Cost: ~$0.001 per call.
- `generateDraftReply()` + BEST/ALT suggestions → **Sonnet 4.5** — natural language quality matters, user-triggered only (not automatic on every inbound).
- Blended cost estimate: **~$0.002–0.003 per inbound message** (Haiku classification + occasional Sonnet suggestion). $50/month budget covers ~50,000 classification events.

**Sub-tasks:**

1. **Config layer:** Replace `getConfig()` to read `anthropicApiKey` from `SystemSetting` DB table. Two model constants: `HAIKU_MODEL = "claude-haiku-4-5"`, `SONNET_MODEL = "claude-sonnet-4-5"`. Maintain backward compatibility — if OpenAI key present, log deprecation warning.

2. **Core function — `classifyInbound()` — runs on Haiku 4.5:**
   - **Input:** Full conversation history (last 20 messages), lead info (name, company, phone, existing deal data)
   - **Output:** Complete JSON schema:
     ```json
     {
       "classification": "HOT | WARM | NURTURE | DEAD | WRONG_NUMBER",
       "conversationState": "HOT_INBOUND | SENSITIVE | null",
       "isCaliforniaNumber": true/false,
       "leadScore": 0-100,
       "signals": {
         "revenue": "$850k annually",
         "revenueMonthly": 70833,
         "revenueAnnual": 850000,
         "ask": "$200k",
         "product": "MCA",
         "industry": "restaurant",
         "urgency": "high",
         "objections": []
       }
     }
     ```

3. **Suggestion generation — `generateSuggestions()` — runs on Sonnet 4.5:**
   - Called separately after classification, only when rep opens the conversation
   - Output: `[{type: "BEST", text, cta}, {type: "ALT", text, cta}]`
   - CA mode: no APR, rate, or factor rate language when `isCaliforniaNumber === true`

4. **System prompt — `getClassifyPrompt(isCA: boolean)`:**
   - Gap Selling methodology (identify pain, quantify impact, build urgency)
   - Patrick Bet-David tone (direct, conversational, value-focused)
   - Product matching rules: MCA, LOC, SBA, CRE Bridge, Equipment, HELOC, Factoring
   - Revenue normalization: "850k annually" → monthly + annual integers
   - Classification criteria with clear thresholds

5. **Retain `generateDraftReply()`:** Swap to Sonnet 4.5, keep existing AI Draft button working seamlessly.

6. **Deterministic lead scoring (0–100):**
   - Revenue signal: 30 points (>$500K = 30, >$200K = 20, >$100K = 10, else 5)
   - Ask signal: 25 points (explicit $ amount = 25, range = 15, vague = 5)
   - Urgency signal: 20 points (high = 20, medium = 12, low = 5)
   - Recency signal: 15 points (replied <1h = 15, <24h = 10, <7d = 5)
   - Classification signal: 10 points (HOT = 10, WARM = 7, NURTURE = 3)

**Validation:**

- [ ] classifyInbound() (Haiku 4.5) returns valid JSON schema for test conversation
- [ ] Revenue extraction: "we do $850k annually" → `{revenueMonthly: 70833, revenueAnnual: 850000}`
- [ ] Revenue extraction: "$90k/month" → `{revenueMonthly: 90000, revenueAnnual: 1080000}`
- [ ] Lead score calculation matches formula
- [ ] generateSuggestions() (Sonnet 4.5) returns BEST + ALT cards
- [ ] CA variant produces compliant suggestions (no rate language)
- [ ] generateDraftReply() (Sonnet 4.5) works — existing button preserved

#### Task 1.3 — California Compliance Detection

**File:** `server/src/services/complianceService.ts`

Add static method `isCaliforniaNumber(phone: string): boolean`

Complete CA area code set (38 codes):

```
209, 213, 279, 310, 323, 341, 350, 369, 408, 415, 424, 442,
510, 530, 559, 562, 619, 626, 628, 650, 657, 661, 669, 707,
714, 747, 760, 805, 818, 820, 831, 840, 858, 909, 916, 925, 949, 951
```

**Logic:** Extract area code from E.164 phone → check against set → return boolean.

**Validation:**

- [ ] `+14155551234` → `true` (SF)
- [ ] `+13105551234` → `true` (LA)
- [ ] `+12125551234` → `false` (NYC)

#### Task 1.4 — Wire Classification into Inbound Webhook

**File:** `server/src/webhooks/twilioWebhooks.ts`

After existing compliance check, add:

1. **Call `classifyInbound()`** — async, non-blocking (don't delay Twilio 200 response)
2. **Store results** on Conversation: aiClassification, aiSignals, aiSuggestions, aiLeadScore, isCaliforniaNumber, aiConversationState
3. **Emit Socket.io events:**
   - `classification-updated` → triggers banner + card update
   - `revenue_updated` → triggers revenue chip animation
   - `hot-lead-detected` → triggers HOT toast + sound + escalation
4. **If HOT → queue escalation jobs** (Step 2)

**Validation:**

- [ ] Send test SMS → classifyInbound() fires → DB updated within 5 seconds
- [ ] Socket.io events fire and reach connected clients
- [ ] Twilio webhook returns 200 immediately (not blocked by AI call)

#### Task 1.5 — New API Route

**File:** `server/src/routes/ai.ts`

Add `POST /api/ai/classify-inbound` — accepts `conversationId`, runs classifyInbound() manually. For admin testing and re-classification.

**Validation:**

- [ ] Endpoint returns classification JSON
- [ ] DB updated after manual call

---

### STEP 2 — HOT System: Escalation Queue + Mobile Alerts

**Duration:** 1–2 working days  
**Risk Level:** Medium (BullMQ timing + Twilio SMS delivery)

#### Task 2.1 — BullMQ HOT Escalation Queue

**New file:** `server/src/queues/hotQueue.ts`

**3-stop escalation ladder — 2 delayed BullMQ jobs per HOT conversation:**

| Stop    | Time           | Action                                                                                          |
| ------- | -------------- | ----------------------------------------------------------------------------------------------- |
| T+0     | Immediate      | HOT detected → rep SMS alert (mobileAlertService, not a BullMQ job)                             |
| T+2min  | Delayed job #1 | Re-alert SMS to assigned rep: "Reminder: HOT lead [Name] still waiting — 2 mins. Open SCL now." |
| T+10min | Delayed job #2 | Admin (JB) notification SMS: "HOT lead [Name] — [Rep] has not responded in 10 min."             |

No auto-reassign. No backup admin logic. Admin already has full inbox visibility and manual takeover via existing deal-share UI.

**Cancellation logic:** When assigned rep sends ANY outbound reply to the conversation:

- Cancel both delayed jobs via `hotQueue.remove(jobId)`
- Mark escalation as resolved
- Emit Socket.io `escalation-resolved`

**Edge cases handled:**

- Duplicate HOT on same conversation → skip if jobs already exist (check by job ID pattern)
- Conversation deleted or opted-out → verify state before each job fires
- Redis connection failure → retry with exponential backoff (BullMQ built-in)

**Validation:**

- [ ] HOT classification → 2 delayed jobs created with correct delays
- [ ] Rep reply → both jobs cancelled within 1 second
- [ ] T+2min job fires → SMS sent to rep
- [ ] T+10min job fires → SMS sent to admin (JB)

#### Task 2.2 — Mobile Alert Service

**New file:** `server/src/services/mobileAlertService.ts`

**Functions:**

- `sendHotAlert(repId, conversationId, leadName, messagePreview)` → Twilio SMS to `User.mobilePhone`
- `sendAdminAlert(conversationId, leadName, repName)` → Twilio SMS to admin mobile

**Rate limiting:** Redis key `alert:${conversationId}:${repId}` with 3-minute TTL — prevents duplicate alerts for rapid-fire messages in same conversation.

**Alert formats:**

- Rep: `"🔥 HOT lead reply from [Name]: [first 60 chars] — check SCL now."`
- Admin: `"⚡ HOT lead [Name] — [RepName] has not responded in 10 min."`

**Fallback:** If `mobilePhone` is null or `hotAlertsEnabled` is false → skip silently, log warning.

**Validation:**

- [ ] HOT classification → rep receives SMS within 30 seconds
- [ ] Rate limit: 2 HOT messages within 1 minute → only 1 SMS sent
- [ ] Missing phone number → no error, warning logged
- [ ] hotAlertsEnabled=false → no SMS sent

#### Task 2.3 — Settings UI for Mobile Phones

**File:** `client/src/pages/SettingsPage.tsx` (extend existing)

- Add `Mobile Phone` field to user profile section
- Admin can view/edit mobile numbers for all reps
- Toggle for `Hot Alerts Enabled` per user
- Phone validation: E.164 format required

**Validation:**

- [ ] Admin can set rep mobile number
- [ ] Toggle enables/disables alerts
- [ ] Invalid phone format rejected

---

### STEP 3 — Frontend: AI Inbox UI (Platform-Consistent, Prototype-Informed)

**Duration:** 2–3 working days  
**Risk Level:** Low (no backend dependencies — can parallelize with Step 2)

All 8 components follow the approved prototype for behavior, information hierarchy, and key visual cues (HOT red, revenue green, urgency amber). Where the prototype conflicts with existing platform UI conventions (button styles, modal patterns, spacing tokens), platform consistency takes priority — specific conflicts flagged for review.

#### Task 3.1 — AI Intelligence Banner

**New file:** `client/src/components/AIBanner.tsx`

- **Position:** Above message thread, below conversation header
- **Content:** Classification badge (🔥 HOT red / 🌡 WARM amber / 🌱 NURTURE green / ☠ DEAD grey), extracted signal chips (revenue, ask, urgency, product, industry), assigned rep name, live countdown timer for HOT conversations
- **Behavior:** Hidden when `aiClassification` is null. Updates in real-time via Socket.io `classification-updated` — no page refresh needed.
- **Design:** Matches prototype information hierarchy and color cues. Adapts to existing platform theme where prototype diverges from platform conventions.

#### Task 3.2 — AI-Enhanced Inbox Cards

**New file:** `client/src/components/InboxCardAI.tsx`

- **Extends:** Existing inbox conversation card layout
- **Additions:**
  - HOT badge: red background, white text, pulsing animation
  - Revenue chip: green background, formatted amount ($1.06M)
  - Ask chip: blue background, formatted amount ($500K)
  - Urgency chip: amber background (HIGH / MEDIUM / LOW)
  - Product chip: grey background (MCA / SBA / etc.)
- **Score bar:** Thin 3px colored line at bottom of card
  - Red: score ≥ 80
  - Amber: score 50–79
  - Grey: score < 50
  - Score **number is NEVER displayed** to reps — only the color bar
- **Real-time:** Revenue chip animates in when `revenue_updated` Socket.io event fires

#### Task 3.3 — AI Suggestions Panel

**New file:** `client/src/components/AISuggestions.tsx`

- **Layout:** 2 cards side-by-side below compose box
- **BEST card:** Gold/amber badge, suggestion text, CTA button (e.g., "→ SEND FUNDING LINK")
- **ALT card:** Grey badge, alternative suggestion text, CTA button (e.g., "→ SURFACE THE GAP")
- **Click behavior:** Inserts suggestion text into compose textarea. Rep can edit freely before sending. Never blocks or auto-sends.
- **CA mode:** When `isCaliforniaNumber === true`, suggestions auto-adjust — no APR, rate, or factor rate language. Redirect to disclosure docs only.

#### Task 3.4 — HOT Toast + Sound

**New file:** `client/src/components/HOTToast.tsx`

- **Trigger:** Socket.io `hot-lead-detected` event
- **Visual:** Red toast notification in bottom-right corner, lead name + message preview. Shown to ALL inbox users.
- **Sound:** 3-pulse Web Audio API sequence: 600Hz → 800Hz → 1050Hz, each pulse 170ms, 170ms gap. Plays **only for the assigned rep and admin (JB)**. Other reps with inbox open get visual toast only — no audio.
- **Mute toggle:** Available in Mobile Alerts tab. Mute kills audio only — visual toast and Twilio SMS alert remain active regardless.
- **Behavior:** Auto-dismisses after 8 seconds. Click navigates directly to the HOT conversation.

#### Task 3.5 — Escalation Progress Bar

**New file:** `client/src/components/EscalationBar.tsx`

- **Position:** Thin horizontal bar under AI Banner for HOT conversations only
- **3 stages displayed (per confirmed escalation ladder):**
  - 0:00 — HOT DETECTED → rep alerted
  - 2:00 — RE-ALERT sent to rep
  - 10:00 — ADMIN PING sent to JB
- **Live timer:** Counts up from HOT detection time. Current stage highlighted with color.
- **Resolution:** When rep replies, both BullMQ jobs cancel and bar shows "✓ Resolved" state and fades

#### Task 3.6 — California Compliance Banner

**New file:** `client/src/components/CAComplianceBar.tsx`

- **Trigger:** `conversation.isCaliforniaNumber === true`
- **Visual:** Red persistent banner across full width: "⚠ CALIFORNIA — Do NOT quote APR, rates, or factor rates. Redirect to disclosure docs only."
- **Behavior:** Non-dismissible. Always visible on California conversations. Cannot be closed or hidden.

#### Task 3.7 — Right Panel: AI State + Mobile Alerts Tabs

**File:** `client/src/pages/InboxPage.tsx` (extend right panel)

Add 2 new tabs alongside existing Contact/Notes:

**AI State tab:**

- Classification badge with explanation
- All extracted signals (revenue, ask, product, urgency, industry, objections)
- Lead score visualization (color bar with label)
- Routing info (current assignment, escalation status)

**Mobile Alerts tab:**

- Rep's alert status (enabled/disabled)
- Alert history for this conversation (timestamps + types)
- Quick toggle for hot alerts (rep can mute per-conversation)
- Admin view: sees alert status for all reps

#### Task 3.8 — Inbox Sorting & Filtering

**File:** `client/src/pages/InboxPage.tsx`

**New sort option — "AI Priority":**

- Sorts by `aiLeadScore` descending
- HOT conversations always surface to top
- Becomes default sort when AI is active
- Silent implementation — reps see reordered list without knowing score numbers

**New filter — "🔥 Hot":**

- Shows only conversations where `aiClassification === "HOT"`
- Added to existing filter bar alongside: all, unread, replied, interested, not_interested, dnc, opted_out

---

### STEP 4 — Nav Restructure + Bug Fix + Testing + Deploy

**Duration:** 1 working day  
**Risk Level:** Low

#### Task 4.1 — Navigation Restructure

**File:** `client/src/components/layout/AppLayout.tsx`

| Change          | Before                   | After                                                               |
| --------------- | ------------------------ | ------------------------------------------------------------------- |
| Dashboard       | Separate nav item + page | **Removed.** SMS metrics merged into Command Center bottom section. |
| Dashboard route | `/dashboard`             | **Deleted.** Redirect to `/command-center` if bookmarked.           |
| Pipeline icon   | `Kanban` (lucide-react)  | Custom 4-square grid SVG (2×2, rounded corners, 1px gap)            |
| Automation icon | `Bot` (lucide-react)     | Lightning bolt polygon SVG                                          |

**File:** `client/src/pages/CommandCenterPage.tsx`

- Add new section at bottom: "SMS Performance" with migrated Dashboard metrics (sent/delivered/reply rate/failed — 24h and 7d)

#### Task 4.2 — csv_import Source Bug Fix

**File:** `server/src/controllers/leadController.ts`

**Bug:** Lines ~351 and ~570 hardcode `source: "csv_import"` instead of using the actual campaign/list name from the import.

**Fix:** Replace hardcoded string with dynamic campaign name from import metadata.

**Impact:** Fix applies to new imports only. Existing 22,797 records retain "csv_import" — no retroactive migration.

#### Task 4.3 — Acceptance Testing

All 12 tests executed on production (`app.sclcapital.io`) after deploy:

**AI Classification Tests (9):**

| #   | Test Scenario              | Steps                                                                           | Expected Result                                                                                                |
| --- | -------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | HOT classification         | Send inbound SMS with revenue ($1M+), urgency (high), and funding ask → wait 5s | `aiClassification = "HOT"` in DB, Socket.io `hot-lead-detected` fires                                          |
| 2   | Signal chips on inbox card | After Test 1: check inbox card UI                                               | Revenue chip ($1M), ask chip, urgency chip visible — no page refresh                                           |
| 3   | AI Intelligence banner     | Open the HOT conversation                                                       | Banner shows: 🔥 HOT badge, revenue signal, urgency signal, rep name, countdown timer                          |
| 4   | BEST + ALT suggestions     | Scroll to suggestion cards                                                      | Two cards: BEST (gold badge) + ALT (grey badge), both reference actual signals from conversation               |
| 5   | Suggestion → compose       | Click BEST suggestion CTA                                                       | Text pre-fills compose textarea. Editable. Sendable.                                                           |
| 6   | California compliance      | Send SMS from +1 415 number                                                     | Red CA banner appears. Suggestions contain NO APR/rate language.                                               |
| 7   | Revenue live update        | Lead replies "$90k/month"                                                       | Revenue chip on inbox card updates within 5s, no refresh                                                       |
| 8   | HOT mobile SMS             | Rep has mobilePhone configured                                                  | Rep receives SMS within 30s of HOT classification                                                              |
| 9   | Escalation ladder (3-stop) | Do NOT reply to HOT lead                                                        | T+2min: rep re-alert SMS fires. T+10min: admin (JB) notification SMS fires. Verify both BullMQ jobs processed. |

**Data Fix Test (1):**

| #   | Test Scenario           | Steps                | Expected Result                                         |
| --- | ----------------------- | -------------------- | ------------------------------------------------------- |
| 10  | csv_import source fixed | Import test CSV file | New leads have source = campaign name, not "csv_import" |

**Navigation Tests (3):**

| #   | Test Scenario             | Steps                    | Expected Result                                                                     |
| --- | ------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| N1  | Dashboard removed         | Navigate to `/dashboard` | Redirect to Command Center. No sidebar item.                                        |
| N2  | Metrics in Command Center | Open Command Center page | Existing metrics + absorbed Dashboard metrics (sent/delivered/reply/failed) visible |
| N3  | Icons updated             | Check sidebar            | Pipeline = 4-square grid icon. Automation = lightning bolt. All routes functional.  |

#### Task 4.4 — Production Deployment

1. Build client and server bundles
2. Deploy to `app.sclcapital.io` (198.199.91.174)
3. Run Prisma migration on production MySQL database
4. Set Anthropic API key in Settings → Integrations
5. Configure rep mobile phone numbers
6. Execute all 12 acceptance tests live
7. Monitor PM2 error logs for 24 hours post-deploy
8. Verify Redis connectivity and BullMQ job processing

---

## 4. Timeline Summary

| Step       | Work Stream                                            | Duration             | Dependencies                      |
| ---------- | ------------------------------------------------------ | -------------------- | --------------------------------- |
| **Step 1** | Schema + AI Engine + CA Compliance + Webhook           | 2 days               | Anthropic API key required        |
| **Step 2** | HOT Escalation Queue + Mobile Alerts + Settings        | 1–2 days             | Step 1 complete                   |
| **Step 3** | 8 Frontend Components + Sort + Filters (Pixel-Perfect) | 2–3 days             | Can start in parallel with Step 2 |
| **Step 4** | Nav Restructure + Bug Fix + 12 Tests + Deploy          | 1 day                | Steps 1–3 complete                |
|            | **Total**                                              | **6–8 working days** |                                   |

**Note:** Steps 2 and 3 can be parallelized, reducing total to **5–6 working days**.

---

## 5. Confirmed Decisions

All pre-build questions have been resolved. The following decisions are locked and reflected throughout this document:

| #   | Decision                          | Resolution                                                                                                                                                                                                         |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **AI Model**                      | Two-model pipeline: Haiku 4.5 for `classifyInbound()`, Sonnet 4.5 for suggestions + draft reply. Blended cost ~$0.002–0.003/message. $50/month budget covers ~50K classifications.                                 |
| 2   | **Rep Mobile Numbers**            | All 6 active reps + Admin. All US (+1). Delivered via secure channel with Anthropic API key.                                                                                                                       |
| 3   | **Escalation Ladder**             | 3-stop, 2 BullMQ jobs. T+0 immediate alert, T+2min re-alert, T+10min admin ping. No auto-reassign. No JB edge case.                                                                                                |
| 4   | **Existing 22,797 Leads**         | Forward-only fix. Historical records retain "csv_import". No retroactive migration.                                                                                                                                |
| 5   | **HOT Sound Scope**               | Audio plays for assigned rep + admin (JB) only. Mute toggle kills audio only — toast and Twilio SMS unaffected.                                                                                                    |
| 6   | **AI Retroactive Classification** | Forward-only. No backfill on existing conversations.                                                                                                                                                               |
| 7   | **Prototype Fidelity**            | Practical consistency: same behavior, same information hierarchy, same key color cues. Platform UI conventions take priority over prototype where they conflict. Specific conflicts flagged before implementation. |

---

## 6. Deliverable Summary

Upon completion, the platform will have:

- ✅ Anthropic Haiku 4.5 classifying every inbound SMS in real-time (~$0.001/call)
- ✅ Anthropic Sonnet 4.5 generating BEST/ALT suggestions and draft replies
- ✅ 5-signal lead scoring (Revenue, Ask, Urgency, Recency, Classification)
- ✅ HOT lead detection with 3-stop escalation ladder (T+0 → T+2min → T+10min)
- ✅ Mobile SMS alerts to assigned rep + admin for HOT leads
- ✅ 8 new AI-powered inbox components (platform-consistent, prototype-informed)
- ✅ California compliance detection and enforcement
- ✅ AI Priority inbox sorting
- ✅ csv_import source fixed for all new imports
- ✅ Streamlined navigation (Dashboard merged, new icons)
- ✅ csv_import source bug resolved
- ✅ All 12 acceptance tests passing on production

I'll provide progress demos at the end of each step. Nothing will be a surprise at final review.
