# Twilio SMS Platform — Technical Capability Deck

> **Document Purpose:** Interview preparation for high-volume SMS infrastructure project.  
> **Based on:** Production platform built and operated for a financial services client.  
> **Confidential — All client names and identifying details have been redacted.**

---

## Table of Contents

1. [A2P 10DLC Registration & Approval](#1-a2p-10dlc-registration--approval) ⭐ Priority
2. [High-Volume Messaging Engine (20,000+ msg/day)](#2-high-volume-messaging-engine) ⭐ Priority
3. [Carrier Filtering Mitigation & Deliverability](#3-carrier-filtering-mitigation--deliverability) ⭐ Priority
4. [Number Provisioning & Sender Pool Management](#4-number-provisioning--sender-pool-management)
5. [Messaging Services & Traffic Distribution](#5-messaging-services--traffic-distribution)
6. [Compliance Architecture (Restricted Industry)](#6-compliance-architecture-restricted-industry)
7. [Real-Time Monitoring & Troubleshooting](#7-real-time-monitoring--troubleshooting)
8. [Campaign Management & Blast Execution](#8-campaign-management--blast-execution)
9. [Automation & Multi-Step Sequences](#9-automation--multi-step-sequences)
10. [Architecture & Production Infrastructure](#10-architecture--production-infrastructure)

---

## 1. A2P 10DLC Registration & Approval

### What We Built

We completed the full A2P 10DLC registration flow for a financial services company operating in a **restricted industry** (commercial lending / business financing). This included Trust Hub customer profile creation, brand registration, campaign use-case approval, and messaging service linking.

### Registration Flow We Executed

| Step                             | Status                    | Details                                                                                    |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| **Customer Profile** (Trust Hub) | ✅ Approved               | Business identity verification with EIN, address, and authorized representative            |
| **Brand Registration**           | ✅ Approved               | LLC entity registered with TCR (The Campaign Registry)                                     |
| **Campaign Use Case**            | ✅ Approved (2nd attempt) | Initial "Low Volume Mixed" was **rejected** — we resubmitted as "Customer Care" and passed |
| **Messaging Service**            | ✅ Linked                 | All 35+ numbers attached to A2P-approved Messaging Service SID                             |

### Key Lessons from Approval

- **Use Case selection matters critically.** "Low Volume Mixed" has the highest rejection rate. We switched to "Customer Care" which accurately describes follow-ups, status updates, and document requests.
- **Campaign description must avoid trigger words.** We removed "promotional" language and emphasized that all recipients opted in via website forms or direct requests.
- **Message samples must include:** brand name prefix, personalization tokens (`{first_name}`), opt-out language (`Reply STOP`), and clear business purpose.
- **No URL shorteners** (bit.ly, etc.) — only owned domains allowed.

### Automation Script

We built a Python registration automation script that handles:

- Phone number webhook configuration (all numbers pointed to our inbound/status endpoints)
- Messaging Service migration (bulk-moving numbers into A2P service)
- Webhook URL validation across all numbers

> 📸 **Screenshot placeholders:**  
> `[Screenshot 1: Twilio Console — Trust Hub Customer Profile: Approved]`  
> `[Screenshot 2: Twilio Console — Brand Registration: Approved]`  
> `[Screenshot 3: Twilio Console — Campaign Use Case: Customer Care — Approved]`  
> `[Screenshot 4: Twilio Console — Messaging Service with 35+ numbers attached]`

---

## 2. High-Volume Messaging Engine

### What We Built

A production messaging engine capable of processing **20,000+ messages per day** across a pool of 35+ numbers, with intelligent queuing, automatic throttling, and carrier-safe delivery patterns.

### Architecture

```
Campaign/API Request
      ↓
  Compliance Check (suppression, opt-out, quiet hours)
      ↓
  BullMQ Queue (Redis-backed, persistent)
      ↓
  Worker Pool (15 concurrent workers)
      ↓
  Twilio API (via A2P Messaging Service)
      ↓
  Carrier Delivery → Status Webhook → Analytics
```

### Throughput Configuration

| Parameter                  | Value                                            | Purpose                     |
| -------------------------- | ------------------------------------------------ | --------------------------- |
| **Per-Number Daily Limit** | 350 messages                                     | Stay under carrier radar    |
| **Global Rate Limit**      | 300 msg/min (5 msg/sec)                          | Twilio API rate compliance  |
| **Worker Concurrency**     | 15 parallel workers                              | Optimal for 35+ number pool |
| **Retry Strategy**         | 3 attempts, exponential backoff (5s → 10s → 20s) | Handles transient failures  |
| **Job Retention**          | 24h (success), 7d (failure)                      | Audit trail                 |

### Bulk Send Optimization

The critical challenge with 10K–20K daily sends is database overhead. Naive implementation creates 20K+ individual DB queries. Our solution:

1. **Batch pre-fetch** all suppressed numbers (single query, not per-lead)
2. **Batch pre-fetch** all opted-out leads
3. **Batch pre-fetch** existing conversations
4. **Filter in-memory** against pre-fetched sets
5. **Bulk-create** missing conversations (single transaction)
6. **Bulk-add** all jobs to Redis queue (single operation)

**Result:** 10,000 leads processed with ~10 DB queries + 1 Redis operation instead of 20,000+ individual queries.

### Sending Speed Control

```
Base delay = 60,000ms / sendingSpeed
Jitter = ±40% random variation (prevents pattern detection)
Time distribution = spread evenly across business hours window
```

> 📸 **Screenshot placeholders:**  
> `[Screenshot 5: Campaign execution — 10K+ messages sent, delivery stats]`  
> `[Screenshot 6: BullMQ dashboard — queue processing in real-time]`  
> `[Screenshot 7: Analytics dashboard — daily volume chart showing 20K+ sends]`

---

## 3. Carrier Filtering Mitigation & Deliverability

### What We Built

A multi-layered system designed to maximize deliverability in a **restricted industry** (financial services / lending) while remaining fully compliant.

### Strategy 1: Number Warm-Up (Ramp Schedule)

New numbers don't go to full volume immediately. We implemented an automatic 7-day ramp:

| Day | Daily Limit | Purpose                     |
| --- | ----------- | --------------------------- |
| 1   | 50          | Establish number reputation |
| 2   | 100         | Gradual increase            |
| 3   | 150         | Building trust              |
| 4   | 200         | Approaching capacity        |
| 5   | 250         | Near-full                   |
| 6   | 300         | Almost there                |
| 7+  | 350         | Full capacity               |

Numbers track their `rampDay` and `rampStartDate` — the system automatically enforces limits.

### Strategy 2: Delivery Rate Monitoring & Auto-Throttling

Every number has real-time health metrics:

- `deliveryRate` (%) — recalculated per message
- `errorStreak` — consecutive failure counter
- `totalSent`, `totalDelivered`, `totalFailed`, `totalBlocked`

**Automatic responses:**

- **Delivery rate < 80%** → capacity reduced to 50% (proactive throttling)
- **Error streak ≥ 5** → number auto-cooled for 24 hours
- **Carrier block errors (30007/30034)** → immediate cooling + alert

### Strategy 3: Jitter & Anti-Pattern Timing

Carriers detect bot-like sending patterns (exact intervals, burst sends). Our engine introduces:

- **±40% jitter** on every message delay (configurable)
- **Time distribution** — messages spread across the full business hours window
- **No burst sending** — even "send now" campaigns are queued with natural spacing

### Strategy 4: Circuit Breaker

When a campaign's error rate exceeds **30%** (configurable), the system **automatically pauses** the campaign. This prevents:

- Burning through the entire number pool
- Cascading carrier blocks across all numbers
- Wasted message credits

### Strategy 5: Sender Rotation with Reputation Weighting

The number selection algorithm considers:

1. A2P-approved numbers (priority)
2. Daily limit remaining
3. Current delivery rate (health)
4. Round-robin distribution (even load)

### Results

In our production deployment:

- Maintained **90%+ delivery rates** in financial services (a known restricted category)
- Zero full number pool burnouts after implementing auto-cooling
- Successfully ran campaigns of 10,000+ messages without carrier blocks

> 📸 **Screenshot placeholders:**  
> `[Screenshot 8: Number management page — delivery rates, daily counts, health status per number]`  
> `[Screenshot 9: Number detail — showing warm-up progress, delivery rate chart]`  
> `[Screenshot 10: Analytics — delivery rate trend over 30 days]`

---

## 4. Number Provisioning & Sender Pool Management

### What We Built

A full number lifecycle manager with pooling, health tracking, assignment, and automatic warm-up.

### Number Lifecycle

```
PURCHASE → WARMING (7-day ramp) → ACTIVE (full capacity)
                                      ↓ (if problems)
                                   COOLING (24h pause)
                                      ↓ (after cooldown)
                                   ACTIVE (restored)
                                      ↓ (if persistent issues)
                                   SUSPENDED / RETIRED
```

### Number Status Model

| Status        | Meaning                                     |
| ------------- | ------------------------------------------- |
| **ACTIVE**    | Full capacity, healthy                      |
| **WARMING**   | Ramp-up phase, limited capacity             |
| **COOLING**   | Temporarily paused, auto-recovers after 24h |
| **SUSPENDED** | Manually disabled by admin                  |
| **RETIRED**   | Permanently removed from rotation           |

### Number Pools

Numbers can be grouped into **named pools** with separate daily limits:

- **Primary Pool** — main sending pool, 350/day per number
- **Warm-Up Pool** — new numbers in ramp phase
- **Re-engagement Pool** — dedicated numbers for follow-up campaigns

Each pool has its own `dailyLimit` and membership is tracked via a join table.

### Rep Assignment

Numbers are assigned to sales reps on a daily basis:

- `assignedDate` — supports daily rotation
- **Sticky sender** — conversations maintain the same number for consistency
- Rep-specific numbers improve trust and personalization

### Daily Counter Reset

Every midnight, all `dailySentCount` values reset — but we don't just zero them. We **recalculate from actual message records** to prevent counter drift.

> 📸 **Screenshot placeholders:**  
> `[Screenshot 11: Numbers management page — full number inventory with health indicators]`  
> `[Screenshot 12: Number pool configuration]`  
> `[Screenshot 13: Number assignment to reps]`

---

## 5. Messaging Services & Traffic Distribution

### What We Built

Integration with Twilio Messaging Services for A2P compliance and intelligent traffic distribution across the number pool.

### Messaging Service Configuration

- All numbers linked to a single A2P-approved **Messaging Service SID**
- The messaging service handles carrier-level routing and compliance
- Fallback: if no Messaging Service, direct `from` number sending is used

### Traffic Distribution Logic

```typescript
// Priority-based number selection:
1. Numbers with Messaging Service SID (A2P-approved) → always first
2. Numbers under daily limit AND delivery rate ≥ 80% → standard pool
3. Numbers under daily limit BUT delivery rate < 80% → reduced capacity (50%)
4. Round-robin across eligible numbers → even distribution
```

### Sticky Number Assignment

For ongoing conversations, the platform maintains number consistency:

- `conversation.stickyNumberId` — remembers which number was used
- Prevents confusing recipients with different sender numbers
- If the sticky number is unavailable (cooling/retired), selects next best

> 📸 **Screenshot placeholders:**  
> `[Screenshot 14: Twilio Console — Messaging Service overview with number count]`  
> `[Screenshot 15: Platform — number selection algorithm stats]`

---

## 6. Compliance Architecture (Restricted Industry)

### What We Built

A comprehensive compliance engine specifically designed for **financial services SMS** — an industry category with elevated carrier scrutiny and strict regulatory requirements.

### Compliance Checks (Per-Message)

| Check                 | Implementation                                     | Cache TTL |
| --------------------- | -------------------------------------------------- | --------- |
| **Suppression List**  | DB lookup + Redis cache                            | 5 min     |
| **Lead Opt-Out Flag** | `lead.optedOut` check                              | Real-time |
| **Quiet Hours**       | Timezone-aware blocking (default: 8 PM – 9 AM EST) | Real-time |
| **Daily Limit**       | Per-number, per-pool, per-campaign                 | Real-time |
| **Delivery Rate**     | Auto-throttle below 80%                            | Real-time |

### Keyword Auto-Response

| Keyword                                                | Action                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT** | Immediate opt-out: lead marked DNC, all automations paused, suppression entry created |
| **START / UNSTOP / SUBSCRIBE**                         | Re-enable messaging: opt-out flag cleared, suppression removed                        |
| **HELP / INFO**                                        | Auto-reply with support information and contact details                               |

### Opt-Out Processing Flow

```
Inbound "STOP" received
  → lead.optedOut = true
  → lead.status = 'DNC'
  → Insert SuppressionEntry (phone, reason: 'opt_out')
  → Find all active AutomationRuns → pause (reason: 'opted_out')
  → Invalidate Redis cache
  → Fire webhook notification
```

### Quiet Hours

- **Configurable per system** (default: 8 PM – 9 AM EST)
- **Timezone-aware** — respects recipient timezone when known
- Messages queued during quiet hours are held until window opens
- Admin can override for urgent operational messages

> 📸 **Screenshot placeholders:**  
> `[Screenshot 16: Settings page — compliance configuration panel]`  
> `[Screenshot 17: Suppression list management]`

---

## 7. Real-Time Monitoring & Troubleshooting

### What We Built

Live monitoring infrastructure with real-time status tracking, alerting, and diagnostics — designed for **live support during SMS blasts**.

### Webhook Architecture

**Inbound SMS Processing:**

```
Twilio → POST /api/webhooks/twilio/inbound
  → Validate Twilio signature
  → Process keywords (STOP/HELP/START)
  → Save message (direction: INBOUND)
  → Update conversation (lastMessageAt, unreadCount++)
  → Trigger automation checks
  → Emit Socket.IO event (real-time inbox update)
  → Return TwiML response (< 100ms)
```

**Delivery Status Tracking:**

```
Twilio → POST /api/webhooks/twilio/status
  → Return 200 immediately (don't block Twilio)
  → Queue for async processing (BullMQ, 10 concurrent workers)
  → Update message status (with priority enforcement — never regress)
  → Update campaign stats
  → Update number health (delivery rate, error streak)
  → If blocked (30007/30034): trigger number cooling
```

### Status Priority Enforcement

Delivery statuses never regress:

```
QUEUED → SENDING → SENT → DELIVERED ✅ (normal flow)
DELIVERED → SENT ❌ (blocked — cannot go backward)
SENT → FAILED ✅ (failure detected)
```

### Error Code Handling

| Twilio Error | Meaning                      | Platform Response                        |
| ------------ | ---------------------------- | ---------------------------------------- |
| **30007**    | Carrier block (filtered)     | Cool number 24h, increment errorStreak   |
| **30034**    | Content filter (SMS blocked) | Cool number 24h, flag content for review |
| **21610**    | Unsubscribed recipient       | Mark lead as opted out                   |
| **Timeout**  | Delivery timeout             | Retry with exponential backoff           |

### System Health Dashboard

`GET /api/dashboard/diagnostics` provides live status of:

- Database connection
- Redis connectivity
- Twilio API status
- Queue health (pending/active/failed jobs)
- Current SMS mode (live/test/simulation)
- Memory usage and uptime

### Real-Time Updates (Socket.IO)

- Inbox updates push to connected reps instantly
- Campaign progress visible in real-time
- No polling required — true push notifications via WebSocket

> 📸 **Screenshot placeholders:**  
> `[Screenshot 18: Platform inbox — real-time conversation with delivery statuses]`  
> `[Screenshot 19: Analytics page — delivery rate charts, error distribution]`  
> `[Screenshot 20: System diagnostics page]`

---

## 8. Campaign Management & Blast Execution

### What We Built

End-to-end campaign management for high-volume blasts: from template creation and audience segmentation to throttled execution and live monitoring.

### Campaign Lifecycle

```
DRAFT → SCHEDULED → SENDING → COMPLETED
                        ↓ (error threshold)
                     PAUSED (circuit breaker)
                        ↓ (manual resume)
                     SENDING
```

### Key Features

| Feature                   | Details                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| **Template System**       | Dynamic variables: `{{firstName}}`, `{{company}}`, `{{lastName}}` |
| **Spintax Support**       | `{option1\|option2\|option3}` randomization for message variation |
| **Audience Segmentation** | Filter by tags, status, source, state, or explicit lead IDs       |
| **Safety Gate**           | At least one filter required — prevents accidental "send to all"  |
| **Scheduling**            | Future-dated campaigns with automatic start                       |
| **Sending Speed**         | Configurable 1–600 msg/min with jitter                            |
| **Daily Limits**          | Per-campaign limits in addition to per-number limits              |
| **Circuit Breaker**       | Auto-pause at 30% error rate                                      |
| **Auto-Complete**         | System detects when all messages processed → marks COMPLETED      |

### Campaign Analytics (Per-Campaign)

```
Total Leads: 10,000
├── Sent: 9,850
│   ├── Delivered: 9,100 (92.4%)
│   ├── Failed: 450 (4.6%)
│   ├── Blocked: 200 (2.0%)
│   └── Undelivered: 100 (1.0%)
├── Replied: 820 (8.3% reply rate)
├── Opted Out: 45 (0.5%)
└── Skipped: 150 (suppressed/compliance)
```

### Live Blast Support

During active sends, the platform provides:

- **Real-time progress** — messages sent/delivered/failed counters update live
- **Error rate monitoring** — immediate visibility into carrier blocks
- **Pause/Resume** — instant campaign control
- **Number health** — per-number delivery rates visible during the blast

> 📸 **Screenshot placeholders:**  
> `[Screenshot 21: Campaign creation — template editor with variables]`  
> `[Screenshot 22: Campaign in progress — live stats dashboard]`  
> `[Screenshot 23: Campaign results — delivery breakdown chart]`

---

## 9. Automation & Multi-Step Sequences

### What We Built

An automation engine for drip campaigns and follow-up sequences, with intelligent pause triggers and compliance-first design.

### Automation Types

| Type                 | Trigger                  | Example                   |
| -------------------- | ------------------------ | ------------------------- |
| **LEAD_CREATED**     | New lead enters system   | Welcome message           |
| **STATUS_CHANGED**   | Lead status changes      | Status-specific follow-up |
| **KEYWORD_RECEIVED** | Specific reply keyword   | "INFO" → send details     |
| **NO_REPLY**         | No response after N days | Auto follow-up sequence   |
| **MANUAL**           | Admin/rep triggered      | One-off sequence start    |

### Multi-Step Sequence Example

```
"7-Day Nurture Campaign"

Step 1 (Day 0): "Hi {firstName}, following up on your financing inquiry..."
Step 2 (Day 3): "Just checking in — would you like to review your options?"
Step 3 (Day 7): "Last follow-up — reply YES if interested, or STOP to opt out."
```

### Smart Pause Triggers

| Event               | Action                                         |
| ------------------- | ---------------------------------------------- |
| **Lead replies**    | Pause sequence (human conversation takes over) |
| **Lead opts out**   | Pause sequence + mark DNC                      |
| **Manual pause**    | Admin/rep stops individual sequence            |
| **Campaign paused** | Circuit breaker stops associated sequences     |

### Execution Engine

- Runs every **60 seconds** checking for due automation steps
- **Distributed lock** via Redis SETNX (prevents duplicate execution in multi-instance)
- Respects quiet hours (no sends before 9 AM or after 8 PM)
- Weekend sending is configurable per rule

> 📸 **Screenshot placeholders:**  
> `[Screenshot 24: Automation page — active rules and sequences]`  
> `[Screenshot 25: Automation rule detail — multi-step sequence configuration]`

---

## 10. Architecture & Production Infrastructure

### Tech Stack

| Layer               | Technology                                |
| ------------------- | ----------------------------------------- |
| **API Server**      | Node.js + Express + TypeScript            |
| **Frontend**        | React 18 + Vite + TailwindCSS             |
| **Database**        | MySQL 8.0 (Prisma ORM)                    |
| **Queue System**    | Redis 7 + BullMQ                          |
| **Real-Time**       | Socket.IO                                 |
| **SMS Provider**    | Twilio (REST API + Webhooks)              |
| **Auth**            | JWT (access + refresh tokens)             |
| **Validation**      | Zod (runtime type safety)                 |
| **Web Server**      | Nginx (SSL, rate limiting, reverse proxy) |
| **Process Manager** | PM2 (zero-downtime restarts)              |
| **SSL**             | Let's Encrypt (auto-renewal)              |

### Production Topology

```
Internet (HTTPS/443)
      ↓
   Nginx
   ├── SSL termination (Let's Encrypt)
   ├── Rate limiting (30 req/s API, 5 req/m login)
   ├── Static files (/dist → React SPA)
   └── Reverse proxy → Express :3001
          ├── REST API (13 route groups)
          ├── Socket.IO (real-time)
          ├── Twilio Webhooks
          ├── BullMQ Workers (3 queues)
          ├── MySQL 8.0 (localhost, 18+ tables)
          └── Redis 7 (localhost, queues + cache)
```

### Security

- **Rate limiting** per endpoint (Nginx + Express middleware)
- **JWT authentication** with refresh token rotation
- **Role-based access** (Admin / Manager / Rep)
- **Input validation** on all endpoints (Zod schemas)
- **Twilio signature validation** on all webhooks
- **No URL shorteners** — only owned domains in message content

### Database Scale

- **18+ tables** covering users, leads, messages, campaigns, automations, compliance, phone numbers, and pipeline deals
- **Production data:** 80+ leads, 35+ phone numbers, thousands of messages
- **Audit trail:** Activity logs, deal events, automation runs

### Deployment

- **Server:** DigitalOcean Droplet (Ubuntu 24.04)
- **CI/CD:** Git-based deployment pipeline
- **Zero-downtime:** PM2 rolling restarts
- **Monitoring:** PM2 process monitoring, system health endpoint

> 📸 **Screenshot placeholders:**  
> `[Screenshot 26: System architecture diagram]`  
> `[Screenshot 27: Server health dashboard — PM2 status]`  
> `[Screenshot 28: Database schema visualization]`

---

## Quick Reference: Addressing Client Requirements

| Client Requirement                                       | Our Capability                                                       | Section |
| -------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| Twilio-based SMS infrastructure for high-volume outbound | ✅ 20K+/day production engine with BullMQ + 35 numbers               | §2      |
| Compliant strategies for restricted industries           | ✅ Financial services compliance: opt-out, quiet hours, suppression  | §6      |
| A2P 10DLC registration, brand/campaign approvals         | ✅ Full flow completed: rejected → resubmitted → approved            | §1      |
| Scaling strategies                                       | ✅ Number warm-up, pool rotation, delivery-rate throttling           | §3, §4  |
| Improve deliverability, reduce carrier filtering         | ✅ Jitter, circuit breaker, auto-cooling, ramp schedule              | §3      |
| Troubleshoot blocking, filtering, throughput             | ✅ Error code handling, real-time webhooks, health dashboards        | §7      |
| Number provisioning, messaging services, sender pools    | ✅ Number lifecycle, pools, sticky sender, rep assignment            | §4, §5  |
| Live support during SMS blasts                           | ✅ Real-time campaign monitoring, pause/resume, Socket.IO            | §8      |
| Repeatable, scalable system                              | ✅ Configurable engine with parameterized limits, reusable templates | §2, §9  |

---

_Document prepared for interview reference. All examples are from a production deployment in the financial services industry. No client names or confidential data included._
