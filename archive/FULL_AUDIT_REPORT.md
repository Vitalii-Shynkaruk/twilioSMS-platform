# SCL Capital SMS Platform — Full Audit Report

**Date:** June 4, 2025
**Platform:** https://app.sclcapital.io
**Status:** Read-only audit — no fixes applied

---

## Executive Summary

| Category            | 🔴 Critical | 🟡 Medium | 🟢 Low | Total  |
| ------------------- | :---------: | :-------: | :----: | :----: |
| Backend (Code)      |      5      |    10     |   7    |   22   |
| Frontend (Code)     |      4      |     7     |   13   |   24   |
| Data Flow / Logic   |      4      |     8     |   2    |   14   |
| Live API / Security |      3      |     3     |   0    |   6    |
| **TOTAL**           |   **16**    |  **28**   | **22** | **66** |

---

## SECTION A: LIVE API / SECURITY TESTS

Tests run against production server `https://app.sclcapital.io`.

### 🔴 A-1: NODE_ENV defaults to 'development' on production server

- **Evidence:** PM2 `node env: N/A`, no `.env` file exists (only `.env.production.example`)
- **File:** [server/src/config/env.ts](server/src/config/env.ts#L8) — `NODE_ENV` defaults to `'development'`
- **Impact:** Stack traces leaked, CORS misconfigured, security headers weakened
- **Root cause:** `.env` file was never created on the server. All env vars default to dev values unless overridden by environment.

### 🔴 A-2: Stack trace leaked in error responses

- **Evidence:** `curl -X POST /api/auth/login` → response contains:
  ```json
  {
    "error": "Invalid credentials",
    "stack": "Error: Invalid credentials\n    at login (/opt/sms-platform/server/src/controllers/authController.ts:30:13)"
  }
  ```
- **File:** [server/src/middleware/errorHandler.ts](server/src/middleware/errorHandler.ts#L35-L38) — correctly checks `config.env === 'development'`, but NODE_ENV is development (see A-1)
- **Impact:** Full server file paths exposed to any attacker → path disclosure vulnerability

### 🔴 A-3: CORS origin set to `http://localhost:5173` instead of production domain

- **Evidence:** `Access-Control-Allow-Origin: http://localhost:5173` returned for all origins including `https://evil.com`
- **File:** [server/src/config/env.ts](server/src/config/env.ts#L10) — `CLIENT_URL` defaults to `http://localhost:5173`
- **Impact:** CORS policy misconfigured. Frontend works because Nginx serves same-origin, but CORS header should match production domain.

### 🟡 A-4: Missing Strict-Transport-Security (HSTS) header

- **Evidence:** Response headers checked — no `Strict-Transport-Security` present
- **Impact:** Browsers don't enforce HTTPS, allowing potential downgrade attacks

### 🟡 A-5: Missing Content-Security-Policy (CSP) header

- **Evidence:** No `Content-Security-Policy` header in responses
- **Impact:** No XSS mitigation at browser level

### 🟡 A-6: Error response reveals internal route structure

- **Evidence:** `GET /api/nonexistent` → `{"error":"Route GET /api/nonexistent not found"}`
- **File:** [server/src/middleware/errorHandler.ts](server/src/middleware/errorHandler.ts#L42-L45)
- **Impact:** Minor information disclosure — attacker can enumerate routes

### ✅ Passing Tests

| Test                                | Result                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| Health check                        | HTTP 200 (0.4s)                                                               |
| Auth middleware (no token)          | HTTP 401 ✅                                                                   |
| Auth middleware (bad token)         | HTTP 401 ✅                                                                   |
| SQL injection                       | Blocked by Zod validation ✅                                                  |
| Rate limiting (auth)                | Kicks in after 7 attempts → HTTP 429 ✅                                       |
| API rate limiting                   | 200 req/min ✅                                                                |
| Twilio webhook signature validation | HTTP 403 on fake requests ✅                                                  |
| Frontend loads                      | HTTP 200, 1.1KB index.html ✅                                                 |
| Path traversal                      | Caught by Nginx (returns SPA) ✅                                              |
| Security headers (basic)            | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy ✅ |

---

## SECTION B: BACKEND CODE AUDIT (22 issues)

### 🔴 Critical

#### B-1: Missing auth on PUT /leads/:id — any user can update any lead

- **File:** [server/src/controllers/leadController.ts](server/src/controllers/leadController.ts) — `update()`
- **Impact:** Any authenticated user can update any lead, reassign reps, change status

#### B-2: Lead delete scope — MANAGER can delete any team's leads

- **File:** [server/src/controllers/leadController.ts](server/src/controllers/leadController.ts) — `deleteLead()`
- **Impact:** Cross-team data manipulation

#### B-3: PUT /inbox/:id/assign — NO route-level requireRole()

- **File:** [server/src/controllers/inboxController.ts](server/src/controllers/inboxController.ts) — `assignRep()`
- **Impact:** Any authenticated user can reassign conversations

#### B-4: Silent .catch(() => {}) on Prisma queries in dealController

- **File:** [server/src/controllers/dealController.ts](server/src/controllers/dealController.ts) — multiple `.catch(() => {})`
- **Impact:** Database errors swallowed silently, data may not persist

#### B-5: Deal update authorization check happens AFTER update object populated

- **File:** [server/src/controllers/dealController.ts](server/src/controllers/dealController.ts) — `updateDeal()`
- **Impact:** Race condition risk — authorization check may use stale data

### 🟡 Medium

| #    | Issue                                                            | File                             |
| ---- | ---------------------------------------------------------------- | -------------------------------- |
| B-6  | Missing tagId validation on addTag/removeTag                     | leadController.ts                |
| B-7  | Bulk action missing data field validation (repId, tagId, status) | leadController.ts                |
| B-8  | Conversation status enum mismatch — 'Interested' vs 'INTERESTED' | leadController / inboxController |
| B-9  | nextActionDue not validated as valid date                        | dealController.ts                |
| B-10 | Campaign lead filtering N+1 query performance                    | campaignController.ts            |
| B-11 | Socket.IO emit not awaited                                       | dealController.ts                |
| B-12 | Phone normalization missing on deal create (duplicates)          | dealController.ts                |
| B-13 | Renewal task completion missing authorization                    | dealController.ts                |
| B-14 | CSV import no row limit (DoS risk)                               | importController.ts              |
| B-15 | Lead-deal status race condition on concurrent updates            | leadController / dealController  |

### 🟢 Low

| #    | Issue                                                 | File               |
| ---- | ----------------------------------------------------- | ------------------ |
| B-16 | Duplicate sendReply method in inboxController         | inboxController.ts |
| B-17 | Unsafe type casting on assistingRepIds                | dealController.ts  |
| B-18 | Magic numbers without constants                       | multiple           |
| B-19 | Socket.IO type safety (cast to `any`)                 | multiple           |
| B-20 | Pagination limit already validated ✓ (false positive) | —                  |
| B-21 | AI routes use inline handlers instead of controller   | aiRoutes.ts        |
| B-22 | No soft delete on renewal tasks                       | dealController.ts  |

---

## SECTION C: FRONTEND CODE AUDIT (24 issues)

### 🔴 Critical

#### C-1: CommandCenterPage — orphaned setTimeout (memory leak)

- **File:** [client/src/pages/CommandCenterPage.tsx](client/src/pages/CommandCenterPage.tsx#L1364)
- **Lines:** 1364, 1425, 1448, 1475 — `setTimeout(() => setInternalToast(null), 2500)` without cleanup ref
- **Impact:** Multiple timers accumulate in memory with rapid user clicks

#### C-2: InboxPageV2 — socket leave not called on conversation switch

- **File:** [client/src/pages/InboxPageV2.tsx](client/src/pages/InboxPageV2.tsx#L94)
- **Impact:** Old socket rooms not cleaned up; server retains stale listeners

#### C-3: AuthStore — 5xx error marks initialized=true forever

- **File:** [client/src/stores/authStore.ts](client/src/stores/authStore.ts#L40)
- **Impact:** After server 500, auth check never retries; user stuck in limbo state

#### C-4: PipelinePageV2 — race condition: drag-drop during filter

- **File:** [client/src/pages/PipelinePageV2.tsx](client/src/pages/PipelinePageV2.tsx#L380)
- **Impact:** Deals can be moved to wrong stage when filtering is active during drag

### 🟡 Medium

| #    | Issue                                                        | File                  |
| ---- | ------------------------------------------------------------ | --------------------- |
| C-5  | LeadsPage — multiple context menus compete for focus         | LeadsPage.tsx         |
| C-6  | CampaignsPage — event listener not cleaned on unmount        | CampaignsPage.tsx     |
| C-7  | DashboardPage — diagData query independent of failed stats   | DashboardPage.tsx     |
| C-8  | PipelinePageV2 — hover tooltips not fully cleaned on unmount | PipelinePageV2.tsx    |
| C-9  | InboxPageV2 — client filter returns empty when field not set | InboxPageV2.tsx       |
| C-10 | CreateDealModal — email format not validated                 | CreateDealModal.tsx   |
| C-11 | CommandCenterPage — carousel timeout uses stale state        | CommandCenterPage.tsx |

### 🟢 Low

| #    | Issue                                                     | File                                 |
| ---- | --------------------------------------------------------- | ------------------------------------ |
| C-12 | DealPanel — large inline style objects                    | DealPanel.tsx                        |
| C-13 | NumbersPage — sorting state not memoized                  | NumbersPage.tsx                      |
| C-14 | SettingsPage — tab URL sync can cause double render       | SettingsPage.tsx                     |
| C-15 | SmsCounter — should be React.memo'd                       | SmsCounter.tsx                       |
| C-16 | ErrorBoundary — doesn't catch async/event errors          | ErrorBoundary.tsx                    |
| C-17 | LeadDetailDrawer — no refetchInterval (stale data)        | LeadDetailDrawer.tsx                 |
| C-18 | CampaignsPage — some mutations missing onError handler    | CampaignsPage.tsx                    |
| C-19 | LeadsPage — bulk action doesn't validate empty selection  | LeadsPage.tsx                        |
| C-20 | InboxPageV2 — socket join can fail silently               | InboxPageV2.tsx                      |
| C-21 | PipelinePageV2 — URL params cleared with empty deps array | PipelinePageV2.tsx                   |
| C-22 | CommandCenterPage — CSV import batch states can desync    | CommandCenterPage.tsx                |
| C-23 | DealPanel — deleteOfferMutation.variables may not match   | DealPanel.tsx                        |
| C-24 | Multiple files — excessive `as any` type casts            | DealPanel, CreateDealModal, DealCard |

---

## SECTION D: DATA FLOW / LOGIC AUDIT (14 issues)

### 🔴 Critical

#### D-1: Lead ↔ Deal status mapping conflict (asymmetric sync)

- **Files:** [leadController.ts](server/src/controllers/leadController.ts#L9-L17), [dealController.ts](server/src/controllers/dealController.ts#L9-L29)
- **Problem:** `INTERESTED` → `ENGAGED_INTERESTED` in leadController, but `INTERESTED` → `QUALIFIED` in dealController
- **Impact:** Bidirectional sync creates data divergence. Updating lead→deal→lead can regress stages.

#### D-2: Lead status NOT updated when deal moves stages (partial cascade)

- **Files:** [dealController.moveDeal()](server/src/controllers/dealController.ts#L1010-L1131), [dealController.updateDeal()](server/src/controllers/dealController.ts#L532-L1013)
- **Problem:** When `appSubmitted: true` auto-moves deal to `SUBMITTED_IN_REVIEW`, lead status stays unchanged
- **Impact:** Rep sees deal in "Submitted" but lead still shows "Interested" — UI inconsistency

#### D-3: Orphan leads created from unknown inbound SMS

- **File:** [twilioWebhooks.ts](server/src/webhooks/twilioWebhooks.ts#L206-L220)
- **Problem:** Auto-created lead has no rep, no campaign context, no business name — just `firstName: 'Unknown'`
- **Impact:** Orphan leads with no attribution; reps can't determine lead source

#### D-4: Socket.IO `deal:updated` broadcasts to ALL users globally

- **File:** [dealController.ts](server/src/controllers/dealController.ts) — 8+ locations with `io.emit()`
- **Problem:** Uses `io.emit()` instead of targeted room/user emit
- **Impact:** Any connected user receives all deal updates — data leakage across reps

### 🟡 Medium

| #    | Issue                                                 | Files                           |
| ---- | ----------------------------------------------------- | ------------------------------- |
| D-5  | No socket.on('deal:updated') validation on server     | index.ts                        |
| D-6  | Inconsistent socket event naming (kebab vs colon)     | webhooks, controllers           |
| D-7  | Conversations can exist without deal linkage          | schema.prisma, dealController   |
| D-8  | Rep assignment drifts between lead ↔ conversation     | inboxController, leadController |
| D-9  | Unknown inbound SMS lacks campaign attribution        | twilioWebhooks.ts               |
| D-10 | No soft-delete for conversations                      | schema.prisma                   |
| D-11 | Socket join:conversation has no client acknowledgment | index.ts                        |
| D-12 | Token refresh race condition partially handled        | api.ts, authStore.ts            |

### 🟢 Low

| #    | Issue                                                     | Files             |
| ---- | --------------------------------------------------------- | ----------------- |
| D-13 | Inconsistent deal:updated payload format (optional repId) | dealController.ts |
| D-14 | DOCS_REQUESTED maps to same stage as INTERESTED           | leadController.ts |

---

## SECTION E: TOP PRIORITY FIX LIST

Sorted by severity and blast radius:

| Priority | ID  | Issue                                 | Category    | Est. Effort |
| :------: | :-: | ------------------------------------- | ----------- | :---------: |
|    1     | A-1 | NODE_ENV = development on production  | Config      |    5 min    |
|    2     | A-2 | Stack trace leak in API errors        | Security    | Fixed by #1 |
|    3     | A-3 | CORS origin = localhost on production | Config      | Fixed by #1 |
|    4     | B-1 | Missing auth on PUT /leads/:id        | Security    |   30 min    |
|    5     | B-3 | Missing auth on inbox assign          | Security    |   15 min    |
|    6     | D-4 | Socket.IO broadcasts to all users     | Data Leak   |   1-2 hr    |
|    7     | D-1 | Lead ↔ Deal mapping conflict          | Data        |    1 hr     |
|    8     | B-2 | Manager can delete cross-team leads   | Security    |   30 min    |
|    9     | D-2 | Lead status not synced on deal move   | Logic       |    1 hr     |
|    10    | D-3 | Orphan leads from unknown SMS         | Logic       |    1 hr     |
|    11    | B-4 | Silent .catch({}) swallows DB errors  | Reliability |   30 min    |
|    12    | C-1 | CommandCenter setTimeout leak         | Memory      |   30 min    |
|    13    | C-2 | Inbox socket room leak                | Memory      |   15 min    |
|    14    | C-3 | AuthStore 5xx blocks re-auth forever  | Auth        |   15 min    |
|    15    | C-4 | Pipeline drag-drop race condition     | UX          |   30 min    |
|    16    | A-4 | Missing HSTS header                   | Security    |    5 min    |

---

## SECTION F: WHAT WORKS WELL ✅

| Area                                | Status                                                            |
| ----------------------------------- | ----------------------------------------------------------------- |
| Authentication middleware           | Solid — 401 on all protected routes                               |
| Input validation (Zod)              | SQL injection blocked at validation level                         |
| Rate limiting                       | Auth: 10/15min, API: 200/min — working correctly                  |
| Twilio webhook signature validation | Returns 403 on unsigned requests                                  |
| Error boundary                      | Present for React crash recovery                                  |
| Frontend routing                    | All pages load correctly                                          |
| Basic security headers              | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection present |
| Cookie-based refresh tokens         | httpOnly, secure, sameSite flags properly set                     |
| Database schema constraints         | Unique indexes, foreign keys properly defined                     |
| Prisma ORM                          | Prevents raw SQL injection by design                              |

---

_© BuyReadySite.com — Audit conducted as read-only analysis. No fixes applied._
