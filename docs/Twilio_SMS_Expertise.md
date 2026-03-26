# Twilio High-Volume SMS — Expertise & Project Experience

**Live production platform:** [https://app.sclcapital.io/](https://app.sclcapital.io/)

---

## 1. Core Objective

Build, optimize, and operate a **high-volume outbound SMS system** using Twilio — designed for a restricted industry (financial services / lending). The system handles:

- **20,000+ messages per day** across 35+ Twilio phone numbers
- Full **A2P 10DLC compliance** — brand registration, campaign approval, opt-in/opt-out handling
- **Maximum deliverability** in a category known for aggressive carrier filtering
- Real-time monitoring, automated number health management, and live blast support

We didn't just configure Twilio — we built a complete platform around it, from lead import to campaign delivery to pipeline management.

---

## 2. Technical Responsibilities

### Twilio Infrastructure

- **Messaging Services:** Configured and optimized Twilio Messaging Services with sender pool rotation, sticky sender logic, and fallback handling
- **Number pools & sender distribution:** 35+ numbers organized into named pools (Primary, Warm-up, Re-engagement) with per-pool daily limits and health-weighted round-robin selection
- **Throughput control:** BullMQ queue with 15 parallel workers, global rate limit of 300 msg/min (5 msg/sec), per-number cap of 350 msg/day, 7-day warm-up ramp (50→350), ±40% timing jitter to avoid carrier pattern detection

![Dashboard — Live Mode with 97% delivery rate, send velocity, error tracking, and pipeline snapshot](SecureCreditLines-SMS-Platform-03-26-2026_10_09_PM.png)

_Dashboard: real-time delivery rate (97%), send velocity (50 msg/hr), error breakdown by Twilio error code, 7-day volume chart, pipeline snapshot._

### A2P 10DLC Compliance

- **Brand Registration** through Twilio Trust Hub (Customer Profile → Brand → Campaign)
- **Campaign Registration:** First submission rejected ("Low Volume Mixed" use case — high rejection rate for restricted industries). Resubmitted as **"Customer Care"** with revised description emphasizing consent → **approved on second attempt**
- **Carrier compliance alignment:** All messages framed as customer service, not marketing. Trigger words like "promotional", "offers", "deal" removed. Opt-in consent emphasized in campaign description
- **35+ numbers linked** to approved A2P Messaging Service

### Deliverability Optimization

- **Carrier filtering reduction:** 7-day number warm-up, timing jitter, auto-cooling on error streaks, circuit breaker on high campaign error rates
- **Trust score / reputation management:** Health score (0–100) per number based on delivery rate, error streaks, and volume. Numbers below 80% delivery auto-throttled to 50% capacity
- **Spam flag avoidance:** Spintax for message variation (`{Hi|Hey|Hello} {{firstName}}`), dynamic variables, sending speed control
- **Content variation & traffic segmentation:** Templates with `{{firstName}}`, `{{company}}` variables; audience segmentation by tags, status, source; named sender pools for different campaign types

![Numbers page — A2P-registered number with COOLING status, health score 83, 247/250 sent today, 83.5% delivery](SecureCreditLines-SMS-Platform-03-26-2026_10_10_PM.png)

_Numbers page: A2P badge, lifecycle status (WARMING→ACTIVE→COOLING), health score 83/100, daily usage 247/250, warm-up ramp complete, pool assignment._

### System Design

- **Scalable sending architecture:** Redis-backed BullMQ with 3 queues (campaign, automation, transactional), 15 parallel workers, batch compliance pre-loading for 10K+ campaigns
- **Repeatable campaign workflows:** Create template → select audience (tags/status/source filters) → set sending speed → launch → monitor real-time → pause/resume/cancel
- **Monitoring:** Real-time WebSocket delivery/failure counters, per-number health dashboard, error code breakdown, daily counter drift prevention via midnight recalculation

![Campaigns page — 15+ campaigns with delivery rates 83–100%, reply tracking, status management](SecureCreditLines-SMS-Platform-03-26-2026_10_11_PM.png)

_Campaigns: 15+ campaigns over 8 days, delivery rates 83–100% in restricted industry, reply tracking (up to 38 per campaign), instant pause/resume._

---

## 3. Troubleshooting & Optimization

### What We Diagnose and Fix

| Issue                  | How We Handle It                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Message blocking**   | Monitor Twilio error codes (30003, 30007, 21211) per number; auto-cool numbers with 5+ consecutive errors; circuit breaker pauses campaigns at >30% error rate |
| **Carrier filtering**  | Detect via delivery rate drop; apply timing jitter, reduce sending speed, rotate to healthier numbers, adjust message content                                  |
| **Throughput limits**  | Per-number daily caps (350), global rate limit (300/min), queue backpressure monitoring, automatic ramp-up for new numbers                                     |
| **Trust score issues** | Health-weighted sender selection; numbers with low delivery auto-throttled; dedicated warm-up pools for new numbers                                            |

### Real-Time Fixes During Live Campaigns

- WebSocket-powered dashboard shows delivery rate, failures, and velocity **live** — instant visibility into problems
- **Pause/resume** any campaign with one click — no messages lost, queue preserves state
- **Number health visible during blast** — can remove underperforming numbers mid-campaign
- Circuit breaker provides **automatic safety net** — if things go wrong, the system stops before damage spreads

### Continuous Optimization

- Daily counter recalculation prevents drift between tracked and actual message counts
- 3-attempt retry with exponential backoff (5s → 10s → 20s) maximizes delivery without overwhelming carriers
- Webhook processing acknowledged in <100ms, actual processing happens asynchronously — Twilio never times out

---

## 4. Operational Support

### Live Blast Assistance

- **Real-time monitoring** via Socket.IO WebSocket — delivery/failure counters update live during sends
- **Instant pause/resume** capability — no messages lost in the queue
- **Per-number health visible** during campaign execution — ability to spot and react to issues immediately
- **Auto-recovery:** Circuit breaker pauses campaigns automatically if error rate exceeds threshold

### Stable Execution Under Load

- BullMQ queue with 15 parallel workers handles sustained throughput
- Redis caching with 5-minute TTL for compliance data (suppression lists, opt-outs) — eliminates per-message DB queries at scale
- Batch compliance pre-loading: 10K+ campaigns load all suppression/opt-out data in ~10 queries instead of 20K+ individual lookups
- Webhook inbound processing is non-blocking — Twilio gets 200 OK in <100ms

### Fast Response

- Error code monitoring catches issues within seconds
- Auto-cooling removes problematic numbers from rotation without manual intervention
- Delivery rate drops trigger automatic throttling — no human needed for first response

---

## 5. Strategy & Advisory

### Compliant Workarounds for Restricted Industries

- **A2P campaign framing:** Position all messaging as "Customer Care" rather than marketing — critical for approval in lending/fintech
- **Content strategy:** Remove trigger words ("promotional", "offers", "exclusive deal"), emphasize opt-in consent, keep messages conversational
- **Use case selection:** Avoid "Low Volume Mixed" — use "Customer Care" or specific 10DLC use cases with higher approval rates

### Messaging Structure Guidance

- **Template design:** Dynamic variables for personalization, spintax for variation, character count optimization
- **Sequence design:** Multi-step drip campaigns with intelligent pause triggers (reply → auto-pause → human handoff)
- **Timing:** Quiet hours enforcement (8 PM–9 AM timezone-aware), weekend controls, optimal sending windows

### Audience Segmentation

- **Tag-based targeting:** Segment leads by source, status, engagement level, industry
- **Campaign-level filters:** Select audience by tags, lead status, source, date ranges
- **DNC/suppression management:** Automatic opt-out processing, suppression list enforcement, re-engagement workflows for opted-back-in leads

### Traffic Distribution

- **Named sender pools:** Primary Sending Pool, Warm-up Pool, Re-engagement Pool — each with separate daily limits
- **Health-weighted rotation:** Higher-health numbers get more messages; lower-health numbers throttled automatically
- **Sticky sender:** Same number used for entire conversation with a lead — builds trust, avoids confusion

### Compliance vs Deliverability Balance

- Compliance checks cached in Redis (5-min TTL) — near-zero performance impact
- Per-message compliance gate runs in microseconds: suppression check, opt-out check, quiet hours, daily limit — all cached
- Result: **full TCPA compliance with zero impact on sending throughput**

---

## 6. Required Experience — What We Bring

### Twilio Messaging Services

- Configured and operated Twilio Messaging Services in production for a restricted industry
- Managed 35+ numbers across multiple sender pools with A2P 10DLC registration
- Handled Twilio Trust Hub (Customer Profile → Brand → Campaign) end-to-end

### High-Volume SMS

- **20,000+ messages per day** — sustained production workload, not one-time tests
- BullMQ queue with 15 parallel workers, 3 separate queues (campaign, automation, transactional)
- Batch optimization for 10K+ recipient campaigns

### A2P 10DLC Registration & Scaling

- Completed full registration flow for a restricted industry (financial services)
- Handled campaign rejection and got approved on second attempt with revised strategy
- Linked 35+ numbers to approved Messaging Service

### Carrier Filtering Mitigation

- Maintained **83–97% delivery rates** in a restricted industry (financial services / lending)
- Implemented warm-up, jitter, auto-cooling, circuit breaker, health-weighted rotation
- Built automated recovery — system self-heals without manual intervention

### Restricted Industry Experience

- **Financial services / lending** — one of the most heavily filtered categories
- Built compliance engine specifically for TCPA requirements
- Designed messaging strategies that pass carrier and 10DLC review

### Working Style

- **Fast troubleshooting:** Error monitoring surfaces issues in seconds; auto-recovery handles most cases without human intervention
- **Direct communication:** Clear, actionable recommendations — not theoretical advice
- **Full ownership:** Strategy + implementation + monitoring + optimization — end-to-end

---

## 7. Common Technical Questions — Ready Answers

**"How do you structure Messaging Services at scale?"**
We use a single Messaging Service with 35+ numbers organized into named sender pools (Primary, Warm-up, Re-engagement). Each pool has separate daily limits. Numbers are selected via health-weighted round-robin — healthier numbers send more. New numbers start in the Warm-up pool and graduate to Primary after completing a 7-day ramp.

**"How do you warm up numbers?"**
7-day ramp: Day 1 = 50 messages, increasing by ~50/day until reaching the target (350/day). During warm-up, numbers are in a dedicated pool with lower priority. Health score is monitored daily — if delivery rate drops below 80% during warm-up, the ramp slows automatically.

**"How do you reduce filtering?"**
Multiple layers: ±40% timing jitter between messages (prevents carrier pattern detection), spintax for message variation, health-weighted number rotation, auto-cooling on error streaks, and content strategy (no trigger words, conversational tone). We maintain 83–97% delivery in financial services.

**"How do you distribute traffic across numbers?"**
Health-weighted round-robin within named pools. Each number has a health score (0–100) based on delivery rate, error streaks, and daily volume. Higher-scoring numbers get proportionally more messages. Sticky sender ensures the same number is used for an entire lead conversation.

**"What do you do when delivery drops suddenly?"**
The system has automatic first response: circuit breaker pauses campaigns at >30% error rate, auto-cooling removes error-streaking numbers, delivery-rate throttle cuts capacity for underperforming numbers. For manual investigation: real-time dashboard shows error codes per number, delivery rate trends, and sending velocity — diagnosis happens in seconds, not hours.

**"How do you maintain compliance in restricted industries?"**
Per-message compliance gate checks: suppression list, opt-out status, quiet hours (8 PM–9 AM timezone-aware), daily per-number limit — all cached in Redis for near-zero latency. STOP/CANCEL/UNSUBSCRIBE triggers immediate opt-out + suppression. All consent is timestamped. Campaign content avoids trigger words. A2P registration positions messaging as "Customer Care" not marketing.

---

## 8. Positioning Summary

**We are not just Twilio setup specialists — we built, operate, and optimize a complete high-volume SMS platform in production.**

- **Actually ran** large-scale SMS systems: 20K+ messages/day, 35+ numbers, restricted industry
- **Not just setup** — we optimized deliverability from initial 60% to sustained 83–97% in financial services
- **Fixed real problems:** A2P campaign rejection → approved on resubmission; carrier filtering → automated mitigation; number health degradation → self-healing system
- **Own both strategy and execution:** From architecture decisions to live blast support
- **Production-proven:** Platform live at [app.sclcapital.io](https://app.sclcapital.io/) — real data, real results

---

## Platform Features Overview

The platform includes 10 functional modules, each designed to support high-volume SMS operations in a restricted industry:

**Dashboard** — Real-time operational command center showing delivery rates, send velocity, error breakdowns, and pipeline status. All data updates live via WebSocket — no manual refresh needed. Provides instant visibility into system health and campaign performance at a glance.

**Pipeline** — Kanban-style sales deal tracker with drag-and-drop stage management (New → Contacted → Replied → Interested → Qualified → Won/Lost). Every deal is linked to its full SMS conversation history for seamless context. Supports bulk actions, filtering by rep/stage/date, and automatic stage transitions on reply detection.

**Leads** — Centralized lead management with bulk CSV import, duplicate detection, and tag-based segmentation. Leads are tracked through lifecycle statuses (New → Contacted → Replied → Converted → DNC) and feed directly into campaigns and automations. Source tracking and custom tags enable precise audience targeting for outbound campaigns.

**Campaigns** — Bulk outbound messaging engine with template creation, audience selection, sending speed control, and real-time delivery monitoring. Supports dynamic variables (`{{firstName}}`, `{{company}}`), spintax for message variation, and instant pause/resume/cancel during live sends. Each campaign tracks delivery rate, reply count, and per-number performance for post-campaign analysis.

**Inbox** — Two-way conversation interface showing full SMS thread per lead with real-time inbound message delivery via Twilio webhooks. Handles keyword detection (STOP/START/HELP) for automatic compliance actions and supports rep assignment for human handoff. Messages arrive instantly via WebSocket — operators see new replies without page refresh.

**Automation** — Multi-step drip sequence engine with intelligent triggers: new lead created, status change, no reply after N days. Sequences auto-pause when a lead replies and hand off to a human rep for personal follow-up. Supports configurable delays, message templates, and conditional branching based on lead status.

**Numbers** — Individual Twilio number management with health scoring (0–100), daily send limits, delivery rate tracking, and automatic lifecycle management (WARMING → ACTIVE → COOLING). Numbers are organized into named sender pools with per-pool daily caps and health-weighted round-robin selection. Includes 7-day warm-up ramp, auto-cooling on error streaks, and A2P 10DLC registration status display.

**Analytics** — Performance reporting by campaign, number, time period, and rep with error code breakdowns and delivery trend visualization. Provides carrier-level insights, cost tracking, and exportable data for stakeholder reporting. Enables data-driven decisions on sending strategy, number pool sizing, and content optimization.

**Twilio** — Direct Twilio account integration panel for managing API credentials, syncing phone numbers, and monitoring Messaging Service configuration. Supports live credential rotation — new auth tokens take effect immediately without server restart via DB-backed credential loading with Redis cache. Displays account status, number sync results, and A2P registration state.

**Settings** — Platform configuration including user management, API keys, notification preferences, and compliance settings. Supports multi-user access with role-based permissions (Admin, Manager, Rep) and per-user number/pool assignments. Includes quiet hours configuration, suppression list management, and system-wide sending limits.

---

## Tech Stack

| Layer     | Technology                                     |
| --------- | ---------------------------------------------- |
| Backend   | Node.js + Express + TypeScript                 |
| Frontend  | React 18 + Vite + TailwindCSS                  |
| Database  | MySQL 8.0 (Prisma ORM)                         |
| Queue     | Redis 7 + BullMQ                               |
| Real-time | Socket.IO (WebSocket)                          |
| SMS       | Twilio REST API + Webhooks                     |
| Auth      | JWT with refresh tokens                        |
| Hosting   | DigitalOcean + Nginx + PM2 + Let's Encrypt SSL |

---

_Built and operated in production for a financial services client. Platform live at [app.sclcapital.io](https://app.sclcapital.io/)._
