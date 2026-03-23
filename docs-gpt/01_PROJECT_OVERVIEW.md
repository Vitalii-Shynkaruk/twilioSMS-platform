# SCL Capital — SMS Platform Briefing

**For client meeting prep · March 2026**

---

## What Is This Project?

A **bulk SMS marketing platform** built for Secure Credit Lines (SCL Capital). It lets their sales reps send targeted SMS campaigns to leads, manage responses in a unified inbox, and track leads through a sales pipeline — all while staying compliant with US carrier regulations (A2P 10DLC).

**Think of it as:** Salesforce + Twilio + Pipeline CRM — in one custom app.

---

## Tech Stack

| Layer        | Technology                                           |
| ------------ | ---------------------------------------------------- |
| Frontend     | React 18, TypeScript, Vite, TailwindCSS              |
| Backend      | Node.js, Express, TypeScript                         |
| Database     | MySQL 8.0 (Prisma ORM)                               |
| Queue        | Redis + BullMQ (job processing)                      |
| Real-time    | Socket.IO (live inbox updates)                       |
| SMS Provider | Twilio (Messaging Service + A2P 10DLC)               |
| Hosting      | DigitalOcean (Ubuntu), Nginx, PM2, Let's Encrypt SSL |

---

## Core Modules (7)

### 1. Campaigns

- Create SMS campaigns targeting filtered lead segments
- Template messages with variables: `{firstName}`, `{lastName}`, `{company}`
- Scheduling: send immediately or at a future date/time
- Speed control: 1–100 messages/minute (configurable per campaign)
- Real-time stats: sent, delivered, failed, replied, opt-outs

### 2. Leads Management

- Import leads via CSV upload (bulk)
- Manual lead creation
- Fields: name, phone, email, company, tags, status, source
- Statuses: NEW → CONTACTED → REPLIED → INTERESTED → DNC
- Deduplication by phone number
- Tag system for segmentation

### 3. Inbox (Conversations)

- Two-way SMS conversations with leads
- Real-time updates via WebSocket
- Unread message counters
- Conversation assignment to reps
- Reply directly from inbox

### 4. Pipeline (Kanban CRM)

- Drag-and-drop kanban board
- Custom stages (New, Contacted, Replied, Interested, Docs Requested)
- Lead cards with urgency indicators (fresh/aging/stale)
- Per-column live metrics (avg age, stale count, conversion %)

### 5. Phone Numbers

- Manage Twilio phone numbers
- Number warm-up system (gradual sending increase for new numbers)
- Number health tracking: Active, Warming, Cooling, Disabled
- Auto-rotation across numbers to distribute sending load

### 6. Automation

- Rule-based automation: "If lead replies → pause sending"
- Auto-tagging based on reply content
- Scheduled follow-up sequences
- Pause/resume automation per lead

### 7. Compliance (A2P 10DLC)

- Opt-out handling: STOP, CANCEL, END, QUIT, UNSUBSCRIBE
- Opt-in handling: START, UNSTOP, SUBSCRIBE
- HELP keyword auto-reply
- Suppression list (DNC management)
- Quiet hours enforcement
- Per-number daily sending limits

---

## Architecture Overview

```
Browser (React SPA)
    ↓ HTTPS
Nginx (reverse proxy + static files)
    ↓
Express API (Node.js, port 3001)
    ├── REST API (13 route groups)
    ├── WebSocket (Socket.IO — real-time inbox)
    ├── Twilio Webhooks (inbound SMS + delivery status)
    └── BullMQ Workers (async job processing)
         ├── SMS sending queue
         └── Automation processing
    ↓
MySQL 8.0 (18 database tables)
Redis (queue + caching + compliance cache)
Twilio API (outbound SMS delivery)
```

---

## Database — Key Models (18 total)

- **User** — admin/manager/rep roles, JWT auth
- **Lead** — contact info, status, opt-out flag, tags
- **Campaign** — name, template, schedule, speed, stats
- **CampaignLead** — join table: campaign ↔ lead (status per lead)
- **Conversation** — inbox thread per lead
- **Message** — individual SMS (inbound + outbound), Twilio SID
- **PhoneNumber** — Twilio numbers, warm-up status, daily limits
- **PipelineStage / PipelineCard** — kanban board data
- **AutomationRule / AutomationRun** — automation config + execution
- **SuppressionEntry** — DNC/opt-out suppression list

---

## How SMS Sending Works

1. Rep creates Campaign → selects leads + writes message template
2. Campaign goes to BullMQ queue
3. **SendingEngine** processes queue:
   - Checks compliance (suppression list, opt-out, quiet hours)
   - Picks phone number (rotation + warm-up logic)
   - Calls Twilio API to send SMS
   - Respects speed limit (messages per minute)
4. Twilio sends SMS → carrier delivers to recipient
5. Twilio sends **status callback** to our webhook → updates message status (delivered/failed)
6. If recipient replies → Twilio sends **inbound webhook** → saved to inbox + real-time notification

---

## Possible Q&A

**Q: How do you handle opt-outs?**
A: When someone texts STOP, the system automatically: marks lead as opted-out, adds to suppression list, pauses all automations, sends confirmation reply. All future campaigns skip this lead. Compliant with TCPA and CTIA guidelines.

**Q: What is A2P 10DLC?**
A: Application-to-Person messaging over standard 10-digit phone numbers. Required by US carriers (AT&T, T-Mobile, Verizon) since 2023. We register a Brand + Campaign with Twilio, carriers approve it, then we can send at higher throughput with better deliverability.

**Q: How does number warm-up work?**
A: New phone numbers start with low daily limits (e.g. 10–20 messages/day). The system gradually increases the limit over days/weeks. This builds sender reputation and avoids carrier filtering.

**Q: Can multiple reps use it simultaneously?**
A: Yes. Role-based access control — Admin, Manager, Rep. Reps see only their assigned leads and conversations. Managers see team data. Admins have full access.

**Q: How are leads imported?**
A: CSV upload with column mapping. System deduplicates by phone number, validates phone format, and auto-assigns to pipeline.

**Q: What happens if Twilio is down?**
A: Messages stay in the BullMQ queue and retry automatically. The dashboard shows system health (database, Redis, Twilio status).

**Q: How do you ensure messages aren't sent during off-hours?**
A: Quiet hours setting — admin configures start/end times. The compliance engine blocks sending outside those hours. Messages queue up until the window opens.

**Q: What analytics do you provide?**
A: Dashboard KPIs (sent, delivered, reply rate), 7-day delivery health, send volume charts, error rate tracking, per-campaign stats, per-number health metrics.

**Q: Is there an API for external integrations?**
A: The platform has a webhook system — it can POST to external URLs on events: new reply, opt-out, delivery status. This lets it integrate with CRMs or Zapier.

**Q: How is the app deployed?**
A: DigitalOcean droplet, Ubuntu 24.04, Nginx reverse proxy, PM2 process manager, Let's Encrypt SSL. Deployed via git pull + build + PM2 restart.

---

## Key Numbers

- **18** database models
- **13** API route groups
- **7** backend services
- **13** frontend pages
- **2** background workers (sending + automation)
- Real-time WebSocket for instant inbox updates
- Redis caching for compliance checks (5-min TTL)
