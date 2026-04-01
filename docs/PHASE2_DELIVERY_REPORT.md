# SCL Pipeline — Phase 2 Delivery Report

**Date:** March 31, 2026  
**Branch:** `deploy/mysql-hosting`  
**Commit:** `d4adace`  
**Status:** Deployed to production (app.sclcapital.io)

---

## Summary

All 4 bugs and 7 feature items (Items 6–12) from the Phase 2 specification have been implemented, tested, and deployed. Both server and client compile and build cleanly. The production server has been updated and is running.

---

## Bug Fixes

### Bug 1 — Stage Automation Regression
**Problem:** When a deal already at APPROVED_OFFERS had `appSubmitted` set, AUTOMATION RULE 1 would regress it back to SUBMITTED_IN_REVIEW.

**Fix:** Added an `advancedStages` guard array in `dealController.ts`. The automation rule now checks `!advancedStages.includes(existing.stage) && !advancedStages.includes(updateData.stage)` before applying the stage change, preventing any regression from later stages back to SUBMITTED_IN_REVIEW.

**Files:** `server/src/controllers/dealController.ts`

---

### Bug 2 — Deal Amount Default Value
**Problem:** The deal amount field had a hardcoded placeholder of "50000", which could be confused with an actual value. The label was generic regardless of product type.

**Fix:** Removed the placeholder. Added product-type-aware labels:
- SBA / CRE / EQUIPMENT → "Submitted Amount *" (required)
- MCA / LOC / HELOC / BRIDGE → "Requested Amount" (optional)
- Field is disabled until a product type is selected. Long-cycle products show a blue info note.

**Files:** `client/src/components/pipeline/CreateDealModal.tsx`

---

### Bug 3 — Next Action Not Stage-Aware
**Problem:** When a deal was moved to a new stage, the next action field retained its old value, not matching the new stage's expected workflow.

**Fix:** Added a `stageDefaultActions` map in the `moveDeal` method. When a deal is moved to a new stage and no custom next action is provided, the system assigns a stage-appropriate default (e.g., SUBMITTED_IN_REVIEW → "Follow up on submission", APPROVED_OFFERS → "Review offer terms with client", etc.).

**Files:** `server/src/controllers/dealController.ts`

---

### Bug 4 — Closed Column Missing in Simple Mode
**Problem:** Simple (condensed) pipeline view filtered out the CLOSED stage column, making it impossible to see or drag deals to closed.

**Fix:** Removed the `STAGES.filter(s => s !== 'CLOSED')` logic for Simple mode. The CLOSED column now appears in both Simple and Full views.

**Files:** `client/src/pages/PipelinePageV2.tsx`

---

## Feature Items

### Item 6 — Deal Sharing Between Reps
**Description:** Reps can now share deals with other reps as "assists". The primary rep retains ownership, and assisting reps see shared deals in their pipeline (sorted below their primary deals).

**Implementation:**
- `assistingRepIds` JSON array field used on deals  
- `SharePopover` component for managing assists (add/remove reps)
- Right-click context menu includes "Share with…" option for admins and primary reps
- `repFilter()` query updated to include deals where `assistingRepIds` contains the current user
- Shared deals display with an "Assisting" badge and sort below primary deals

**Files:** `server/src/controllers/dealController.ts`, `client/src/pages/PipelinePageV2.tsx`, `client/src/components/pipeline/DealPanel.tsx`

---

### Item 7 — No Hardcoded Rep References
**Description:** Removed hardcoded "JB" fallback references throughout the codebase.

**Implementation:**
- CSV import controller now looks up the default rep by `role === 'ADMIN'` instead of `initials === 'JB'`
- Command Center displays "Team" instead of "JB" in any team-level aggregations

**Files:** `server/src/controllers/csvImportController.ts`, `client/src/pages/CommandCenterPage.tsx`

---

### Item 8 — Change Password
**Description:** Users can now change their own password from within the app.

**Implementation:**
- Backend: New `PUT /api/auth/change-password` endpoint with JWT authentication. Validates current password via bcrypt, enforces minimum 8-character length, hashes with 12 rounds.
- Frontend: Clickable user avatar in the header opens a dropdown with "Change Password" and "Log Out" options. `ChangePasswordModal` component with current/new/confirm fields and validation.

**Files:** `server/src/controllers/authController.ts`, `server/src/routes/auth.ts`, `client/src/components/layout/AppLayout.tsx`

---

### Item 9 — CSV Import for Engaged Leads
**Description:** Reps and admins can import leads from CSV files directly into the pipeline as engaged/interested deals.

**Implementation:**
- New `POST /api/deals/import-leads` endpoint supporting file upload (multer)
- Auto-detects CSV columns: business name, contact name, phone, email, product type, amount
- Phone-based duplicate detection to prevent re-importing existing leads
- Default stage: ENGAGED_INTERESTED with stage-appropriate next action
- Frontend: "⬆ Import CSV" button in pipeline toolbar, `ImportLeadsModal` with drag-and-drop upload, auto-detected column preview, and result summary

**Files:** `server/src/controllers/dealController.ts`, `server/src/routes/deals.ts`, `client/src/pages/PipelinePageV2.tsx`, `client/src/services/api.ts`

---

### Item 10 — Right-Click Add Offer / New Product
**Description:** Right-clicking a deal card offers "Add Offer / New Product" as a quick action, enabling a product-first workflow.

**Implementation:**
- `AddOfferModal` with 2-step flow:
  - Step 1: Select product type
  - Step 2: Enter offer details (amount, lender, terms, etc.)
- Auto-detects whether the selected product matches the deal's existing product type:
  - Same product → adds an offer to the existing deal
  - Different product → creates a new deal for the client and adds the offer to it
- Context menu available on deal cards for all users

**Files:** `client/src/pages/PipelinePageV2.tsx`, `server/src/controllers/dealController.ts`

---

### Item 11 — Product Type Drives Initial Stage
**Description:** When creating a deal, the product type now determines the starting pipeline stage.

**Implementation:**
- Long-cycle products (SBA, CRE, EQUIPMENT) start at SUBMITTED_IN_REVIEW stage with `appSubmitted` automatically set
- Short-cycle products (MCA, LOC, HELOC, BRIDGE) start at NEW_LEAD stage
- `createDeal` endpoint computes `initialStage` based on `productType` and sets appropriate next action defaults

**Files:** `server/src/controllers/dealController.ts`, `client/src/components/pipeline/CreateDealModal.tsx`

---

### Item 12 — Top 5 Deal Priority Score (DPS)
**Description:** Command Center displays the Top 5 deals to close today with a priority score and reasoning.

**Implementation:**
- **Backend scoring formula** in `getOperatorQueue`:
  - +50 points: has offers
  - +30 points: offer expiring within 3 days
  - +20 points: client replied within last 48 hours
  - −10 points: already touched today
  - −40 points: stale for 5+ days
- Returns `priorityScore`, `scoreReason`, best offer amount and lender
- **Frontend**: "Top 5 to Close Today" section with color-coded scores (green ≥60, amber 30–59, red <30), score reasoning, and best offer display
- Stale deals threshold updated to 5+ days with `suggestNurture` flag

**Files:** `server/src/controllers/commandCenterController.ts`, `client/src/pages/CommandCenterPage.tsx`

---

## Deployment Details

| Step | Status |
|------|--------|
| TypeScript compile (server) | ✅ Pass |
| TypeScript compile (client) | ✅ Pass |
| Server build (`npm run build`) | ✅ Pass |
| Client build (`npm run build`) | ✅ Pass |
| Git commit | ✅ `d4adace` |
| Git push (deploy/mysql-hosting) | ✅ Pushed |
| Production rsync | ✅ Synced |
| Production build (server + client) | ✅ Built |
| PM2 restart | ✅ Online |
| PM2 health check | ✅ No errors |

---

## Files Modified

### Server
- `server/src/controllers/dealController.ts` — Bug 1, Bug 3, Item 6, Item 9, Item 10, Item 11
- `server/src/controllers/commandCenterController.ts` — Item 12
- `server/src/controllers/csvImportController.ts` — Item 7
- `server/src/controllers/authController.ts` — Item 8
- `server/src/routes/auth.ts` — Item 8
- `server/src/routes/deals.ts` — Item 9

### Client
- `client/src/components/pipeline/CreateDealModal.tsx` — Bug 2, Item 11
- `client/src/components/pipeline/DealPanel.tsx` — Item 6
- `client/src/components/layout/AppLayout.tsx` — Item 8
- `client/src/pages/PipelinePageV2.tsx` — Bug 4, Item 6, Item 9, Item 10
- `client/src/pages/CommandCenterPage.tsx` — Item 7, Item 12
- `client/src/services/api.ts` — Item 9

### Config
- `package.json` — lint-staged max-warnings adjustment
