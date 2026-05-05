# SCL Capital — Phase 3: AI Suggested Campaigns

## Why This Phase Is Both Complex and Critical

**Prepared for: JobStarLab**
**Date: April 27, 2026**
**Author: Vitalii / BuyReadySite.com**

---

## Executive Summary

Phase 3 is not a UI feature. It is a full data intelligence pipeline that connects your historical campaign outcomes, your lead database, your funded deals, and a real-time AI reasoning engine — all into a single automated recommendation system that runs 24/7 in the background. This is the kind of infrastructure that takes most teams 4–6 weeks to build correctly. Here is why, and why I can deliver it faster.

---

## Why Phase 3 Is Critical for the Business

This phase directly answers the question every rep asks every morning: **"Which leads should I work today?"**

Right now, reps are guessing. They pick leads manually from a list, or re-run the same campaign to the same people. The result: stale outreach, wasted sends, and carrier throttling risk from hitting the same numbers repeatedly.

Phase 3 replaces guesswork with three categories of precision targeting:

**Multi-campaign retargets** — leads who received messages across multiple past campaigns but never replied. These are warm but not yet converted. The system finds them automatically across all campaigns, not just the last one. This is cross-campaign intelligence that no manual process can replicate at scale.

**New cohorts from unsent leads** — leads sitting in the database that match the profile of your already-funded deals. The system looks at what industries, states, and revenue bands you've actually closed, then surfaces leads with those same attributes who have never been contacted. This is your highest-conversion demographic, found automatically.

**Renewal candidates** — prior funded clients hitting the 8–12 month window post-funding. These are the highest predicted reply-rate leads in the entire database because they already trust you. Missing this window is leaving guaranteed revenue on the table.

Without Phase 3, these leads either get found by chance or not at all.

---

## Why Phase 3 Is Technically Complex

### 1. It Is Not One Feature — It Is Six Interconnected Systems

Building Phase 3 requires building and integrating all of the following simultaneously:

**A new database model (`lead_cohorts`)** — stores pre-computed recommendations with expiration timestamps, source attribution, AI reasoning, and capacity metadata. This isn't a simple table. It caches complex query results and must stay consistent with live campaign activity.

**Three separate SQL query engines** — each cohort type (multi-retarget, new cohort, renewals) requires a different analytical query joining 4–5 tables with exclusion logic, cooldown windows, and profile matching. These queries must be fast, correct, and carrier-compliant.

**A cooldown enforcement system** — carriers detect spam patterns within days. The 7-day and 30-day cooldown rules are not optional. Getting them wrong means number burns, campaign blocks, and potential A2P 10DLC violations. Implementing them correctly means tracking every contact event per lead across all campaigns with precise timestamps.

**A two-layer send cap system** — there are two independent caps: per-campaign (500 rep / 3,000 admin) and rolling 24-hour daily totals (800 rep / 4,500 admin). Both must be enforced server-side so they cannot be bypassed. The daily total uses a rolling window, not a calendar reset — this requires a query against the last 24 hours of CampaignLead records on every send attempt.

**An Anthropic AI integration with caching** — for each cohort, a call to Claude Sonnet 4.5 generates 1–2 sentences of business-specific reasoning using real funded history data. This must be done with proper prompt engineering (not generic boilerplate), response validation, and 24-hour caching to avoid re-generating on every 15-minute cron cycle.

**A scheduled cron job that runs per-user** — the recommendation engine runs for every user (admin + each rep) on a 15-minute cycle. For 7 reps + 1 admin = 8 users × 3 cohorts = 24 recommendation computations every 15 minutes. Each computation involves multiple DB queries and potentially an AI API call. This must be non-blocking, idempotent, and failure-tolerant.

### 2. The Frontend Is Not a Simple Display

The UI must show live capacity data, cohort-specific messaging for edge cases (daily cap nearly full, cohort trimmed, cooldown countdown), a dynamic lead count display that reflects the current daily remaining capacity at render time, and a hand-off flow that passes the resolved lead list directly into the existing campaign creation modal without breaking the existing send path.

### 3. Every Piece Has Carrier Compliance Implications

This is not a typical feature where bugs are just UX problems. If the cooldown system has a bug, leads get re-contacted too soon, carriers detect the pattern, and phone numbers get burned. If the daily cap has an off-by-one error, a rep sends 801 messages in a day and the number throttles. Every acceptance criterion in Phase 3 is also a compliance criterion.

---

## Why I Can Deliver This Faster Than Another Developer

**I already know this codebase.** The campaign send path, CampaignLead model, cooldown suppression logic, Anthropic integration pattern, and the existing retarget infrastructure are all code I either wrote or deeply reviewed. Another developer starts from zero — reading schemas, understanding the rep-scope system, learning the Twilio sending engine, reverse-engineering the existing retarget logic. That alone is 2–3 days of ramp-up before writing a single line.

**The Phase 1 bug fixes unlock Phase 3 immediately.** The `assignedRepId` fix on leads is a prerequisite for the new cohort generator (it needs to know which leads belong to which rep). The campaign scoping fix is a prerequisite for per-rep cohort generation. I am implementing both in Phase 1 this week. Another developer would need to either wait or re-implement these fixes themselves.

**The AI integration is already proven.** The inbox classifier (M2) uses the same Anthropic API pattern, the same caching approach, and the same async queue architecture. I can replicate and adapt that infrastructure rather than designing it from scratch.

**I understand the carrier compliance constraints.** The 7-day and 30-day cooldown rules, the rolling 24h window, the number pool capacity calculations — these come from the A2P 10DLC guidelines I've already worked through for this account. Another developer would need to learn these rules, validate their implementation against them, and likely go through at least one cycle of revisions after a compliance review.

**Estimated delivery:**

- Phase 1 (bug fixes): 1–2 days
- Phase 2 (filter dropdowns): 1 day, runs in parallel with Phase 3 backend
- Phase 3 — implementation: 2–4 days from Phase 1 sign-off
- Phase 3 — QA + compliance validation: 3–5 days (carrier cooldown verification, cap edge cases, per-rep isolation tests)
- **Total Phase 3 calendar time: 5–9 days**

This timeline is only achievable because of deep existing context. A developer starting from scratch on this codebase would need 3–5 weeks for Phase 3 alone — and would likely still miss the carrier compliance edge cases on the first pass.

---

## Summary

Phase 3 is the revenue feature of this entire platform. It is complex because it combines real-time data analytics, AI reasoning, carrier compliance enforcement, and multi-user scoped recommendations into a single automated system. It is critical because without it, reps are guessing which leads to contact, missing renewal windows, and leaving cross-campaign retarget opportunities on the table every day.

I can deliver it correctly and faster than any developer starting fresh, because I am already in the codebase, the compliance layer, and the AI infrastructure that Phase 3 depends on.

---

_© BuyReadySite.com — SCL Capital Engineering_
