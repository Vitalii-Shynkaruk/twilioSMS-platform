# Production Bugs — Input to M1 Cleanup Scope

**For**: "Developer" (M1 cleanup before M2 AI integration)
**From**: SCL classification sandbox + June 2025 audit report
**Date**: 2026-04-25

This document bundles **two distinct sources** of pre-M2 issues that should be cleared before the AI classifier ships to production:

- **Section A** — Behavioral bugs the AI classifier surfaced during sandbox testing on real production conversations. These are new findings from this engagement.
- **Section B** — Pre-existing critical findings from the June 2025 `FULL_AUDIT_REPORT.md`. These were known before the M2 scope was defined.

**All items in both sections must clear before M1 sign-off.** Section A reveals operational/messaging quality issues that erode lead trust today. Section B reveals security/code-quality issues that will become much harder to fix once AI features are layered on top.

---

# SECTION A — AI-Surfaced Behavioral Bugs (NEW from sandbox testing)

The classifier observed 41 of 100 sampled conversations with sub-`good` rep behavior. The patterns below are systemic — not isolated to individual reps — meaning they're driven by the platform code, the templates, or the workflow, not by individual coaching.

---

## A-1: Unrendered template variables shipping to leads

- **Severity**: Critical
- **File/area**: Campaign template engine — likely `server/src/services/sendingEngine.ts` or wherever the message body is interpolated before Twilio send.
- **Evidence**: Romona Keveza received 12+ outbound SMS over a month containing the literal string `{{company}}`, e.g. _"businesses like {{company}}"_, never replaced with her business name. Other leads received `N/A` substitutions where the template field was missing from the lead record. The AI classifier flagged this directly.
- **Suggested fix**: Audit the template-render pipeline. Reject any outbound message at queue-insert time if it contains `{{` or `}}` in the rendered body. Log + alert. Treat this as a hard pre-send guard, not a soft validation. Backfill missing `company` values from CSV imports where reasonable.

## A-2: "Test" messages reaching real leads

- **Severity**: Critical (TCPA / 10DLC compliance risk)
- **File/area**: Likely an admin/dev tool in the campaign UI, or a manual send from the inbox composer.
- **Evidence**: At least 3 leads (Frank, Tin Von, Anthony Bednar) received a real outbound SMS containing only the word "Test" sent from a registered SCL number. These appear to be QA messages that escaped to production traffic. Sometimes paired with typos in surrounding messages ("meessage").
- **Suggested fix**: Block any outbound where the body is `^test\W*$` (case-insensitive). Add a "send to self" or "send to staging number" mode in the inbox composer that routes test traffic to internal numbers only. Audit the last 90 days of `messages` for similar accidental sends.

## A-3: Long response gaps to engaged leads (no SLA enforcement)

- **Severity**: High
- **File/area**: Inbox notifications / SLA logic — currently not implemented.
- **Evidence**:
  - Rachel Bloom asked "Sure, send the application link" on 2026-03-28; the link was sent 27 days later on 2026-04-24.
  - Mike Russell asked "Maybe, what are your rates?" on 2026-03-28; the rep replied 5 days later, then went silent for 3 weeks before sending a typo'd "helo".
  - Jesus Ramos provided his email on 2026-04-08; the next rep follow-up was 16 days later.
  - Verdell Wigington described $5M LOC ask + collateral on 2026-04-18; the rep replied with a bare website URL 6 days later.
- **Suggested fix**: Build a rep-response-time SLA. Surface stale conversations in the inbox sidebar (red badge for >24h since lead's last inbound, no rep reply since). Tie into the `staleState` field once the AI classifier ships. Manager dashboard: "leads waiting >24h for a reply, by rep."

## A-4: Wrong lead name in opening template

- **Severity**: High
- **File/area**: Campaign template variable resolution / CSV import field mapping.
- **Evidence**: Multiple outbound messages opened with the name "Cornell Dukes" addressed to other leads (Jason Finkelstein, Jorge Rendon). This suggests a header-row leakage or a misindexed merge during one CSV import campaign.
- **Suggested fix**: Audit how `{{firstName}}` / `{{lastName}}` resolve when source CSV columns are mismatched. Block sends where `firstName` matches a known fixed string ("Cornell Dukes"), an `N/A`, or a placeholder pattern. Re-import affected leads with corrected mapping.

## A-5: Rep's own phone number classified as a lead

- **Severity**: Medium (data hygiene; AI will keep flagging it)
- **File/area**: Lead creation pipeline — likely the inbound webhook or CSV import doesn't filter rep numbers.
- **Evidence**: Phone `+16462482055` (rep's own line — repeatedly used as "calling from" in outbound messages) was created as a lead and classified by the AI as HOT 74 in v3 / HOT in v4. The rep was effectively texting themselves and the system created a lead record.
- **Suggested fix**: Maintain a `RepPhoneNumber` table or environment-variable allowlist of rep/test numbers. Filter these out at:
  1. Lead creation (webhook + CSV import)
  2. Classification dispatch (don't waste API calls)
  3. Any UI list (don't display as a lead)
- Migration: scrub existing `Lead` records with phones in this allowlist.

## A-6: Stuart/Alex/Marcos/Hammad/Anthony name switching within a single thread

- **Severity**: Medium (lead trust)
- **File/area**: Campaign templates / sender attribution logic.
- **Evidence**: Multiple threads have the rep introducing themselves as "Stuart" in one message and "Alex" in the next. Romona Keveza's thread switches across Stuart, Alex, Hammad, and back. From the lead's perspective this looks like a spam farm. Not an isolated case — it's the default behavior of the existing campaign templates which use first-person rep names hardcoded into different campaigns.
- **Suggested fix**: Either (a) consolidate to one rep persona per phone number (so all messages from `+16462482055` are signed "Stuart"), or (b) explicitly switch attribution at handoff points in the conversation, e.g. _"Hi, this is Alex following up on Stuart's earlier message…"_. Today's behavior is option (c) — silent name switch — which is the worst of both worlds.

## A-7: Wrong-number leads have no auto-exit affordance in the inbox UI

- **Severity**: Medium (compliance + trust)
- **File/area**: Inbox UI — missing one-click action when a lead identifies as wrong-number.
- **Evidence**: When a lead replies "Not Justin" / "wrong number" / similar, there is no one-click "Wrong Number — Auto-Exit" action in the inbox. The rep has to type a polite-exit reply manually, then navigate to the lead detail page and mark DNC. Reps default to skipping the exit and pivoting the conversation, which creates TCPA risk. Justin Lee thread is one example: lead replied "Not Justin", rep pivoted to a HELOC pitch.
- **Suggested fix**: Once the AI classifier ships, surface a "Wrong Number — Auto-Exit" CTA in the inbox when `classification = 'WRONG_NUMBER'`. The rep clicks once, the system sends the polite-exit reply and marks the lead DNC. Train reps that the correct response is always exit, never recover.

## A-8: Bare "?" follow-up pings reading as pushy

- **Severity**: Low
- **File/area**: Rep behavior / template library.
- **Evidence**: Multiple threads contain a bare "?" sent to the lead 7-30 minutes after a rep message went unanswered (Edwin Towne, Sampson Samuel). The AI flagged this as "concerning — reads as pushy."
- **Suggested fix**: Add a "follow-up" template library to the inbox composer that requires a value-add (a tip, a clarification, or a re-statement of the offer). Discourage bare-character follow-ups. Optionally: the AI's `suggestedReply` field already produces good follow-ups — surface that in the composer.

## A-9: Typos in outbound messages

- **Severity**: Low
- **File/area**: Rep behavior / template library / spell-check.
- **Evidence**: "helo" (Mike Russell), "I can doo that" (Unchaket), "Please sen an email of what you ca do" (Lesorgen David), "l;oans" (Cherri Eurich).
- **Suggested fix**: Add browser-native spell-check to the inbox composer textarea (set `spellcheck="true"` on the textarea). For high-frequency templates, run them through a one-time editorial pass to remove embedded typos.

## A-10: Outbound campaign retemplates fire on already-engaged leads

- **Severity**: Medium (lead trust + cost)
- **File/area**: Campaign scheduling logic — needs an "engaged-lead suppression" filter.
- **Evidence**: Unchaket Chiangsorn replied "Yes" with email, then hours later received the same templated `$50K-$500K` blast he'd already responded to. The AI flagged "duplicate auto-template that fired hours after the lead already replied YES." Indicates that campaigns aren't checking for active inbound activity before re-sending.
- **Suggested fix**: Before queuing any campaign send to a lead, check: has this lead replied to any campaign in the last 7 days? If yes, suppress and route to manual rep follow-up instead. The schema already has `Conversation.lastDirection` and `lastMessageAt` — use them.

---

### Section A summary

| ID   | Issue                                              | Severity | Effort                      |
| ---- | -------------------------------------------------- | -------- | --------------------------- |
| A-1  | Template vars `{{company}}` shipping unrendered    | Critical | 1-2 hr                      |
| A-2  | "Test" messages reaching real leads                | Critical | 1-2 hr                      |
| A-3  | No rep-response SLA / stale-conversation surfacing | High     | 4-8 hr                      |
| A-4  | "Cornell Dukes" name leakage from CSV import       | High     | 2-4 hr                      |
| A-5  | Rep's own phone classified as lead                 | Medium   | 1 hr                        |
| A-6  | Multi-rep name switching in a single thread        | Medium   | 2-4 hr                      |
| A-7  | Wrong-number signal ignored by reps                | Medium   | 1-2 hr (UI nudge)           |
| A-8  | Bare "?" pings reading as pushy                    | Low      | 1-2 hr                      |
| A-9  | Typos in outbound messages                         | Low      | <1 hr (browser spell-check) |
| A-10 | Re-templating already-engaged leads                | Medium   | 2-4 hr                      |

**Total Section A effort estimate**: ~16-30 hours.

---

# SECTION B — Pre-Existing Audit Findings (June 2025 FULL_AUDIT_REPORT.md)

These 16 issues were identified in the June 2025 read-only audit and have not been verified as fixed. **They must be re-verified before M2 ships.** Source: `FULL_AUDIT_REPORT.md` Section E (Top Priority Fix List).

If any of these have already been fixed in production since the audit, mark them DONE in M1 review and move on. The point is to clear the priority list before adding the AI feature on top — many of these (especially B-1 through B-3, B-6, B-9, B-10) interact directly with how AI classification will flow through the system.

---

## B-1: NODE_ENV defaults to 'development' on production server

- **Severity**: Critical
- **File/area**: `server/src/config/env.ts:8` — `NODE_ENV` defaults to `'development'`. Server's `.env` file is missing on prod (only `.env.production.example` was checked in).
- **Suggested fix**: Create `/opt/sms-platform/server/.env` on prod with `NODE_ENV=production` (and other live values). Verify via `pm2 env <id>` or by hitting the API and confirming no stack traces.
- **Audit ID**: A-1

## B-2: Stack trace leak in API error responses

- **Severity**: Critical
- **File/area**: `server/src/middleware/errorHandler.ts:35-38` — correctly checks `config.env === 'development'`, so this auto-resolves once B-1 is fixed.
- **Suggested fix**: Fixed by B-1. Re-verify with `curl -X POST /api/auth/login` after deploy.
- **Audit ID**: A-2

## B-3: CORS origin set to `http://localhost:5173` on production

- **Severity**: Critical
- **File/area**: `server/src/config/env.ts:10` — `CLIENT_URL` defaults to localhost.
- **Suggested fix**: Set `CLIENT_URL=https://app.sclcapital.io` in the prod `.env` (will be set as part of B-1 fix).
- **Audit ID**: A-3

## B-4: Missing auth on PUT /leads/:id

- **Severity**: Critical
- **File/area**: `server/src/controllers/leadController.ts` — `update()` route has no `requireRole` check. Any authenticated user can update any lead.
- **Suggested fix**: Add `requireRole(['admin', 'manager', 'rep'])` and a scope check (rep can only update their own assigned leads).
- **Audit ID**: B-1

## B-5: Missing auth on PUT /inbox/:id/assign

- **Severity**: Critical
- **File/area**: `server/src/controllers/inboxController.ts` — `assignRep()` has no role gate. Any authenticated user can reassign conversations.
- **Suggested fix**: Add `requireRole(['admin', 'manager'])`.
- **Audit ID**: B-3

## B-6: Socket.IO `deal:updated` broadcasts to ALL connected users

- **Severity**: Critical (data leak across reps)
- **File/area**: `server/src/controllers/dealController.ts` — 8+ locations call `io.emit()` instead of targeting a specific room/user.
- **Suggested fix**: Replace `io.emit()` with `io.to('user:' + repId).emit()` or `io.to('manager-room').emit()` based on the deal's assigned rep + observer policy. This becomes critical once AI classifications start flowing — you don't want every rep seeing every other rep's HOT lead alerts.
- **Audit ID**: D-4

## B-7: Manager role can delete cross-team leads

- **Severity**: High
- **File/area**: `server/src/controllers/leadController.ts` — `deleteLead()` lacks team scope.
- **Suggested fix**: Restrict to the team the manager owns, OR limit lead deletion to admin only.
- **Audit ID**: B-2

## B-8: Lead ↔ Deal status mapping conflict (asymmetric sync)

- **Severity**: Critical (data integrity)
- **File/area**: `server/src/controllers/leadController.ts:9-17` and `server/src/controllers/dealController.ts:9-29`. `INTERESTED` maps to `ENGAGED_INTERESTED` in one and `QUALIFIED` in the other.
- **Suggested fix**: Centralize the mapping in `server/src/utils/leadDealStatusMap.ts` (single source of truth). Verify bidirectional sync doesn't regress stages.
- **Audit ID**: D-1

## B-9: Lead status NOT updated when deal moves stages

- **Severity**: High
- **File/area**: `server/src/controllers/dealController.ts:1010-1131` (`moveDeal`) and `:532-1013` (`updateDeal`). When `appSubmitted: true` auto-moves deal to SUBMITTED_IN_REVIEW, lead status stays unchanged.
- **Suggested fix**: After any `dealController` stage transition, call a shared `syncLeadStatusFromDeal()` utility. Add unit test covering each transition.
- **Audit ID**: D-2

## B-10: Orphan leads created from unknown inbound SMS

- **Severity**: High
- **File/area**: `server/src/webhooks/twilioWebhooks.ts:206-220`. Auto-created lead has `firstName: 'Unknown'`, no rep, no campaign attribution.
- **Suggested fix**: When an inbound arrives from a number not in the `Lead` table, instead of auto-creating with "Unknown", queue it to a "review queue" UI where an admin assigns rep + campaign. Or improve the matching by also checking `Client.phone` (already partially done — extend it).
- **Audit ID**: D-3

## B-11: Silent `.catch(() => {})` swallows Prisma errors

- **Severity**: High
- **File/area**: `server/src/controllers/dealController.ts` — multiple sites.
- **Suggested fix**: Replace empty catch blocks with logged catches: `.catch(err => logger.error('dealController: <op> failed', err))`. At minimum log; better: surface a 500 on the originating request so the user/UI knows something failed.
- **Audit ID**: B-4

## B-12: CommandCenterPage setTimeout memory leak

- **Severity**: High
- **File/area**: `client/src/pages/CommandCenterPage.tsx:1364, 1425, 1448, 1475`. `setTimeout` without cleanup ref or `useEffect` return.
- **Suggested fix**: Wrap each setTimeout in a `useEffect` with cleanup: `return () => clearTimeout(handle)`. Or use a ref to track and clear on unmount.
- **Audit ID**: C-1

## B-13: Inbox socket room not cleaned on conversation switch

- **Severity**: High
- **File/area**: `client/src/pages/InboxPageV2.tsx:94`. Old socket rooms leak when user navigates between conversations.
- **Suggested fix**: In the `useEffect` for socket join, return a cleanup function that calls `socket.emit('leave', roomId)` on unmount or roomId change.
- **Audit ID**: C-2

## B-14: AuthStore 5xx errors block re-auth permanently

- **Severity**: High
- **File/area**: `client/src/stores/authStore.ts:40`. After a single 500, `initialized=true` is set forever and the user is stuck.
- **Suggested fix**: Don't set `initialized=true` on transient 5xx. Either retry with backoff, or surface a "session expired, please refresh" UI prompt.
- **Audit ID**: C-3

## B-15: Pipeline drag-drop race condition during filter

- **Severity**: Medium
- **File/area**: `client/src/pages/PipelinePageV2.tsx:380`. Deals can be moved to wrong stage when filter is applied during drag.
- **Suggested fix**: Disable drag-and-drop while filter is being applied (or until filter operation completes). Simpler: ignore stage moves where the source/target column doesn't match the lead's currently-displayed pipeline view.
- **Audit ID**: C-4

## B-16: Missing Strict-Transport-Security (HSTS) header

- **Severity**: Medium
- **File/area**: `nginx.conf` — no `add_header Strict-Transport-Security` directive.
- **Suggested fix**: Add `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` to the SSL server block. Reload nginx.
- **Audit ID**: A-4

---

### Section B summary

| ID   | Issue                                | Severity | Effort |
| ---- | ------------------------------------ | -------- | ------ |
| B-1  | NODE_ENV=development on prod         | Critical | 5 min  |
| B-2  | Stack trace leak (auto-fixed by B-1) | Critical | 0      |
| B-3  | CORS origin localhost on prod        | Critical | 5 min  |
| B-4  | Missing auth on PUT /leads/:id       | Critical | 30 min |
| B-5  | Missing auth on inbox assign         | Critical | 15 min |
| B-6  | Socket.IO broadcasts to all users    | Critical | 1-2 hr |
| B-7  | Manager cross-team delete            | High     | 30 min |
| B-8  | Lead↔Deal status mapping conflict    | Critical | 1 hr   |
| B-9  | Lead status not synced on deal move  | High     | 1 hr   |
| B-10 | Orphan leads from unknown SMS        | High     | 1 hr   |
| B-11 | Silent .catch({}) swallows errors    | High     | 30 min |
| B-12 | CommandCenter setTimeout leak        | High     | 30 min |
| B-13 | Inbox socket room leak               | High     | 15 min |
| B-14 | AuthStore 5xx blocks re-auth         | High     | 15 min |
| B-15 | Pipeline drag-drop race              | Medium   | 30 min |
| B-16 | Missing HSTS header                  | Medium   | 5 min  |

**Total Section B effort estimate**: ~7-10 hours (most are fast individual fixes; the long pole is B-6 Socket.IO scoping).

---

# Combined M1 Sign-Off Checklist

For M1 to be considered cleared and M2 (AI integration) to begin:

- [ ] All 10 Section A items resolved or explicitly deferred with documented rationale
- [ ] All 16 Section B items resolved or verified as already-fixed since June 2025
- [ ] B-6 (Socket.IO scoping) specifically completed — this is a hard prerequisite for AI classification events not leaking across reps
- [ ] B-1 through B-3 (NODE_ENV, CORS, stack traces) completed — required for safe prod observability of AI classifier behavior
- [ ] A-1, A-2, A-4 (template vars, "Test" messages, name leakage) completed — these would make the AI classifier look bad even when it's working correctly, since it'll keep flagging them as `repBehavior: concerning` until they're fixed
