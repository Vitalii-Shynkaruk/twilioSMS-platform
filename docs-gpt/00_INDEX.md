# SCL Capital SMS Platform — Documentation Index

**For GPT Training · March 2026**

Upload ALL files from this folder into ChatGPT as context for answering questions about the SCL Capital SMS Platform.

---

## Files in This Folder

| #   | File                     | Contents                                                                                                     | Pages |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------ | ----- |
| 1   | `01_PROJECT_OVERVIEW.md` | What the project is, tech stack, 7 core modules, architecture diagram, SMS flow, key numbers                 | ~4    |
| 2   | `02_TECHNICAL_QA.md`     | 30+ detailed Q&A covering: warm-up, cooling, campaigns, sending speed, errors, automation, settings, scaling | ~15   |
| 3   | `03_USER_GUIDE.md`       | Complete user guide — every page, every button, every feature explained step-by-step                         | ~40   |
| 4   | `04_DEPLOYMENT.md`       | Server setup (DigitalOcean), deploy commands, Nginx config, troubleshooting                                  | ~4    |
| 5   | `05_A2P_REGISTRATION.md` | Twilio A2P 10DLC campaign registration guide with exact text for resubmission (EN + RU)                      | ~5    |
| 6   | `06_WORK_PLAN.md`        | Project milestones (all completed), future enhancement roadmap                                               | ~2    |

---

## How to Use with GPT

1. Create a new ChatGPT conversation (GPT-4 or GPT-4o recommended)
2. Upload ALL 6 `.md` files as attachments
3. Start with this system prompt:

```
You are a technical support specialist for the SCL Capital SMS Platform.
You have access to the complete documentation of the platform.
Answer questions about:
- How features work (warm-up, campaigns, inbox, pipeline, automation)
- Technical details (sending speed, daily limits, error codes, number statuses)
- Troubleshooting (cooling numbers, high error rates, blocked messages)
- Best practices (scaling numbers, list hygiene, deliverability)
- Configuration (settings, Twilio setup, A2P registration)

Always give specific, actionable answers with exact numbers from the documentation.
If something is not covered in the docs, say so clearly.
Speak in the same language the user uses (English or Russian).
```

---

## Key Facts (Quick Reference)

**Platform URL:** https://app.sclcapital.io  
**Client:** BBC Consulting LLC (Secure Credit Lines / SCL Capital)  
**Tech Stack:** React + Node.js + MySQL + Redis + Twilio  
**Server:** DigitalOcean (198.199.91.174)

**Warm-up:** 7-day ramp (50 → 100 → 150 → 200 → 250 → 300 → 350 msgs/day)  
**Cooling:** Auto-triggered at 5 consecutive errors, lasts 24h  
**Circuit Breaker:** Auto-pauses campaign at 30% error rate  
**Quiet Hours:** 8 PM – 9 AM Eastern (default)  
**Daily Limit:** 350 msgs/number (configurable up to 5,000)  
**Global Cap:** 300 msgs/minute, 20,000 msgs/day

**Opt-Out Keywords:** STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT  
**Opt-In Keywords:** START, UNSTOP, SUBSCRIBE

**Number Statuses:** Active, Warming, Cooling, Suspended, Retired  
**Campaign Statuses:** Draft, Scheduled, Sending, Paused, Completed, Cancelled  
**Lead Statuses:** New, Contacted, Replied, Interested, Docs Requested, Submitted, Funded, Not Interested, DNC
