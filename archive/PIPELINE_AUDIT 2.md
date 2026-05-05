# Pipeline UI Audit — Prototype vs React Implementation

**Files compared:**

- Prototype: `/tmp/pipeline_proto.html` (3420 lines — HTML / CSS / JS)
- React: `client/src/pages/PipelinePageV2.tsx` (1460 lines)
- React: `client/src/components/pipeline/DealCard.tsx` (500 lines)
- CSS: `client/src/styles/pipeline.css` (1100 lines)

---

## CRITICAL (Functional gaps that break core features)

### C1 — Stage names mismatch

| Stage key            | Prototype label          | React label            |
| -------------------- | ------------------------ | ---------------------- |
| `ENGAGED_INTERESTED` | **Engaged / Interested** | Contacted              |
| `QUALIFIED`          | **Qualified**            | Qualified / Interested |
| `APPROVED_OFFERS`    | **Approved / Offers**    | New Business           |

**Fix:** Update `STAGES` array labels + `short` values in `PipelinePageV2.tsx:26–53`.

---

### C2 — Stage bar/badge colors are wrong

| Stage                 | Prototype color         | React color                        |
| --------------------- | ----------------------- | ---------------------------------- |
| `ENGAGED_INTERESTED`  | `#9B72E8` (purple)      | `var(--info)` = `#4A9EE8` (blue)   |
| `QUALIFIED`           | `#C9952A` (gold)        | `var(--attn)` = `#D06828` (orange) |
| `SUBMITTED_IN_REVIEW` | `#4A9EE8` (blue)        | `var(--watch)` = `#D4A940` (amber) |
| `APPROVED_OFFERS`     | `#FF8C00` (dark orange) | `var(--good)` = `#3AB97A` (green)  |
| `NURTURE`             | `#4A9EE8` (blue)        | `var(--text3)` = `#536070` (gray)  |

**Fix:** Update `STAGES[].color` in `PipelinePageV2.tsx:26–53` AND `STAGE_COLORS` in `DealCard.tsx:7–17`.

---

### C3 — Column bar opacity missing

Prototype applies per-stage opacity to `.col-bar`:

```
NEW_LEAD: 0.32, ENGAGED: 0.40, QUALIFIED: 0.55, SUBMITTED: 0.70,
APPROVED: 1.0, COMMITTED: 0.85, FUNDED: 0.70, NURTURE: 0.30, CLOSED: 0.28
```

React renders `<div className="col-bar" style={{ background: config.color }} />` with **no opacity**.

**Fix:** Add `opacity` to `StageConfig` type and apply it to col-bar `style` in `PipelinePageV2.tsx:835`.

---

### C4 — Follow-Up Schedule modal missing

Prototype has a full **Follow-Up Schedule** modal with:

- Follow-up type grid (Call / SMS / Email / Check-In / Review / Custom)
- Smart suggestions based on stage, overdue status, funded timing
- Quick date buttons (Tomorrow, +3d, +1w, +2w, +1mo)
- Custom date/time inputs, notes textarea

React has **no equivalent modal**. Follow-up is only editable from DealPanel fields.

**Fix:** Create `FollowUpScheduleModal.tsx` component matching prototype's `#fuModal` behavior.

---

### C5 — NQ / Close Deal modal missing

Prototype has a **NQ/Close Deal** modal with:

- Two tabs: Lost | Not Qualified
- Reason dropdowns (Lost Reason / NQ Reason)
- Notes fields
- Re-engage date picker
- "Lost → Nurture" auto-move toggle

React handles close/NQ via `DealPanel` inline editing only — no dedicated modal.

**Fix:** Create `CloseModal.tsx` matching prototype's `#nqModal`.

---

### C6 — Funded modal missing

Prototype has a **Funded** modal:

- Amount Funded input
- Funded Date picker
- Lender select
- Cycle time auto-calculation display

React has **no funded confirmation modal**.

**Fix:** Create `FundedModal.tsx` matching prototype's `#fundedModal`.

---

### C7 — Edit Funding Event modal missing

Prototype has an **Edit Funding Event** modal for modifying existing fund events.

React has **no equivalent**.

**Fix:** Create `EditFundEventModal.tsx` matching prototype's `#editFundModal`.

---

### C8 — Co-rep / shared deal UI completely missing

Prototype supports `coReps` concept:

- Deals can have multiple reps (primary + assist)
- Cards show assist badge: `↗ Assisting {RepName}`
- Execution cards show `rep-ownership` block with primary + co-reps
- Manager bar has a **"Shared"** column counting assist deals

React has **no assist/co-rep concept** at all — only `assignedRep`.

**Fix:** Add `coReps` field to Deal type, render assist badges in DealCard, add Shared column to mgr-bar.

---

### C9 — Review pill missing from Submitted stage cards

Prototype renders a `reviewPill` for `SUBMITTED_IN_REVIEW` cards with product-specific review timelines:

- `"In underwriting · {product note}"` (early)
- `"Day N in review · {product note}"` (mid)
- `"⚠ Day N — check lender status"` (late/overdue)

React **does not render any review pill** for Submitted cards.

**Fix:** Add review pill logic to ExecutionCard in `DealCard.tsx` after the HOT row, gated on `deal.stage === 'SUBMITTED_IN_REVIEW'`.

---

### C10 — Nurture tags missing

Prototype renders `.n-tag` elements on Nurture stage cards showing deal categorization tags (e.g., warm lead, past funded, seasonal).

React **does not render nurture tags**.

**Fix:** Add nurture tag rendering in ExecutionCard in `DealCard.tsx`, gated on `deal.stage === 'NURTURE'`.

---

### C11 — Nurture urgency pill missing

Prototype shows `.nu-urg` pill: `"Touch due in Nd"` for nurture deals that need attention soon.

React **does not have this pill**.

**Fix:** Add `nu-urg` div in ExecutionCard after nurture previous offer block, computing days until next touch due.

---

## MAJOR (Visual / structural parity issues)

### M1 — Legend/Banner order reversed

| Element | Prototype order     | React order         |
| ------- | ------------------- | ------------------- |
| Banner  | 2nd (after legend)  | 1st (before legend) |
| Legend  | 1st (before banner) | 2nd (after banner)  |

**Fix:** Swap the `<div className="banner">` and `<div className="legend">` blocks in `PipelinePageV2.tsx` (~lines 385–440).

---

### M2 — Simple view shows all 9 columns (should hide Closed)

Prototype's `renderSimpleBoard()` filters out CLOSED stage:

```js
STAGES.filter(s => s.key !== 'CLOSED').forEach(...)
```

React renders **all 9 STAGES** in simple mode.

**Fix:** In board rendering (`PipelinePageV2.tsx:462`), filter stages when `viewMode === 'simple'`:

```tsx
{STAGES.filter(s => viewMode !== 'simple' || s.value !== 'CLOSED').map(...)}
```

---

### M3 — Execution column header subtext missing

Prototype column header `.col-ct` shows contextual subtext per stage:
| Stage type | Prototype subtext |
|---|---|
| `pipe: true` | `"{N} leads · submitted + offer received"` |
| `funded` | `"{N} leads · not in pipeline"` |
| `closed` | `"{N} leads · locked"` |
| `nurture` | `"{N} leads · prev offer totals"` |
| default | `"{N} leads · no $"` |

React shows only: `"{N} deal(s)"` (no subtext).

**Fix:** Add subtext logic to `StageColumn` execution-mode header in `PipelinePageV2.tsx:828–831`.

---

### M4 — `nb-col` class missing from Committed column

Prototype applies `nb-col` class (and `pipe: true` flag) to **both** APPROVED_OFFERS and COMMITTED_FUNDING (since both are "active pipeline" columns).

React only applies `colClass: 'nb-col'` to `APPROVED_OFFERS`.

**Fix:** Add `colClass: 'nb-col'` to the `COMMITTED_FUNDING` stage entry in `PipelinePageV2.tsx:49`:

```tsx
{ value: 'COMMITTED_FUNDING', ..., colClass: 'nb-col', stageClass: 'pipe' },
```

---

### M5 — Committed stage missing `pipe` stageClass

Prototype gives Committed the `pipe` stageClass (same as Approved). React **omits it**.

**Fix:** Add `stageClass: 'pipe'` to `COMMITTED_FUNDING` in `PipelinePageV2.tsx:49`.

---

### M6 — `nb-total` text wrong

|          | Prototype                                    | React                             |
| -------- | -------------------------------------------- | --------------------------------- |
| nb-total | `"{N} lender offer(s) in play"` (with count) | `"Active Pipeline"` (static text) |

**Fix:** Compute combined NB deal count and update text in `StageColumn` (`PipelinePageV2.tsx:833`).

---

### M7 — Manager bar missing "Shared" column

Prototype mgr-bar columns: Rep · Active · Overdue · Hot · Pipeline $ · Funded MTD · **Shared** · MTD Goal %

React mgr-bar columns: Rep · Active · Overdue · Hot · Pipeline $ · Funded MTD · MTD Goal %

**"Shared" column is absent.**

**Fix:** Add Shared deals column to mgr-bar in `PipelinePageV2.tsx` (after Funded MTD, before MTD Goal %).

---

### M8 — Card footer structure differs

**Prototype execution card footer:**

```
[{REP_INITIALS} · Touched Nd ago]          [Age: {N}d]
```

Left side has rep initials + stale text together. Right side has "Age:" prefix.

**React execution card footer:**

```
[stale text]          [{N}d]   [avatar]
```

- No rep initials in stale text
- No "Age:" prefix
- Avatar is separate (not integrated with stale text)

**Fix:** Update `c-foot` in `DealCard.tsx:474–484` to match prototype format.

---

### M9 — Product badge vs product tags

Prototype execution cards use `.prod-badge` class showing a single inline badge with product type + icon.

React uses a `tags` div with Tailwind classes (`PRODUCT_COLORS` map) — different visual structure.

CSS has `.prod-badge` class defined (`pipeline.css:292`) but React doesn't use it.

**Fix:** Replace product tag rendering in ExecutionCard (`DealCard.tsx`) with `.prod-badge` class matching prototype.

---

### M10 — Product badge + days-in-stage layout differs

Prototype places `prod-badge` + `dis-pill` (days-in-stage) in a flex row immediately after `c-top`.

React places `dis-pill` much lower in the card body (after rep-ownership), and product tags are in a separate section.

**Fix:** Move product badge and days-in-stage pill to a flex row below `c-top` in ExecutionCard.

---

### M11 — Card sorting logic missing

Prototype sorts deals within columns using complex rules:

1. Primary-rep deals first, then assist deals
2. Stage-specific sub-sorting:
   - NB (Approved/Committed): hot → freshest first → $ amount desc
   - Others: overdue → freshest → $ amount
3. HOT computed from `lastReplyHours`, stage, offers, lenderEngaged

React renders deals in **API-returned order** with no client-side sorting.

**Fix:** Add client-side sorting in `StageColumn` or request sorted data from API.

---

### M12 — Toast notification visual mismatch

Prototype uses custom `.toast` CSS class (dark bottom-center bar with slide-up animation, defined in `pipeline.css:776`).

React uses `react-hot-toast` library (top-right default positioning, different visual).

**Fix:** Configure `react-hot-toast` Toaster position/style to match prototype, or replace with custom `.toast` element.

---

## MINOR (Small visual / text differences)

### m1 — Legend last item styling

Prototype last legend item has `style="color:var(--text3);font-style:italic;"` and reads:

> ⚡MCA/LOC: 2d · 🔧Equipment: 5d · 🏠HELOC: 30d · 🏛SBA/🏢CRE: 60d review clocks — **flag 2d**

React has the same text but **without** the italic/color override and says just "2d" at the end.

**Fix:** Add inline style to last `.li` in legend and add "flag" text prefix in `PipelinePageV2.tsx:434`.

---

### m2 — Simple card assist badge missing

Prototype simple cards show `"↗ Assisting {RepName}"` for shared deals.

React simple cards have **no assist indicator**.

**Fix:** Depends on C8 (co-rep data). Once available, add assist badge to SimpleCard in `DealCard.tsx`.

---

### m3 — Banner contextual text format differences

Prototype appends mode label + filter to banner:

```
"All reps · all clients · full edit access · ⚡ Execution Mode · Overdue only"
```

React appends similarly but with slightly different format for some filters.

**Impact:** Very minor — essentially matching already.

---

### m4 — "All Deals" view switch visibility

Prototype shows "All Deals" button only for admin role. React shows it unconditionally.

**Fix:** Wrap the "All Deals" button in `{isAdmin && ...}` in `PipelinePageV2.tsx` view-sw section (~line 310).

---

### m5 — `fundedMeta` block rendering order

Prototype renders `fundedMeta` below the funded block as a helper with formatted date + cycle-time inline.

React renders `funded-meta` similarly but the date format and structure vary slightly.

**Impact:** Minor — both show funded date + cycle.

---

## SUMMARY

| Severity     | Count  | Status                 |
| ------------ | ------ | ---------------------- |
| **CRITICAL** | 11     | All missing from React |
| **MAJOR**    | 12     | All need fixes         |
| **MINOR**    | 5      | Low-priority tweaks    |
| **TOTAL**    | **28** |                        |

### Priority fix order

1. **C1 + C2** — Stage names + colors (5 min, high-impact visual fix)
2. **C3** — Column bar opacity (5 min)
3. **M1** — Legend/banner order swap (2 min)
4. **M2** — Hide Closed in simple mode (2 min)
5. **M3 + M4 + M5 + M6** — Column header subtext + nb-col fixes (15 min)
6. **C9** — Review pill for Submitted (30 min)
7. **C10 + C11** — Nurture tags + urgency pill (30 min)
8. **M8 + M9 + M10** — Card footer + product badge layout (30 min)
9. **M7** — Manager bar Shared column (15 min)
10. **C4 + C5 + C6 + C7** — Missing modals (2–4 hours)
11. **C8** — Co-rep / shared deal system (1+ hour, requires API changes)
12. **M11** — Client-side sorting (30 min)
13. **M12 + minor items** — Toast, legend, banner polish (15 min)

### Items already matching ✅

- CSS variables: identical
- CSS component classes: all present in `pipeline.css`
- Responsive media queries: present (1024px, 768px, 480px breakpoints)
- Scrollbar styles: present
- DnD: implemented with @dnd-kit
- GoalsModal: present and functional
- TeamView structure: present (stat cards, rep scoreboard, active offers, funded, nurture)
- QueueView structure: present (overdue/this-week/upcoming sections)
- Simple card state classes: `sc-hot`, `sc-overdue`, `sc-today`, `sc-good`, `sc-normal` — all correct
- Execution card priority classes: correct
- Staleness bar: correct
- Offer block (single + multi): correct
- Committed sub-status track: correct
- Returning client pill: correct
- MNA warning: correct
- Next action row: correct
- Renewal pill: correct
