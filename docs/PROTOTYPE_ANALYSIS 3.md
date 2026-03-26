# Prototype Analysis — Complete Extraction Report

> **Purpose:** Replicate both prototype pages 100% in React / TailwindCSS  
> **Source files:** `/tmp/pipeline_proto.html` (~3400 lines) · `/tmp/command_proto.html` (~2400 lines)

---

## Table of Contents

1. [CSS Variables & Color System](#1-css-variables--color-system)
2. [Typography](#2-typography)
3. [Layout System](#3-layout-system)
4. [Component Breakdown — Pipeline Page](#4-component-breakdown--pipeline-page)
5. [Component Breakdown — Command Center Page](#5-component-breakdown--command-center-page)
6. [Card Design System](#6-card-design-system)
7. [Modals & Dialogs](#7-modals--dialogs)
8. [Data Model](#8-data-model)
9. [JavaScript Logic & State](#9-javascript-logic--state)
10. [Responsive Design](#10-responsive-design)
11. [Full CSS Classes Reference](#11-full-css-classes-reference)
12. [Product Color System](#12-product-color-system)

---

## 1. CSS Variables & Color System

### Pipeline Page (`:root`)

```css
/* ── Backgrounds ── */
--bg: #0b0f16; /* body / deepest layer */
--bg2: #111720; /* card / panel backgrounds */
--bg3: #161d28; /* column backgrounds, sections */
--bg4: #1c2535; /* elevated elements, inputs */
--bg5: #212d3f; /* highest elevation (hover states) */

/* ── Borders ── */
--border: rgba(255, 255, 255, 0.07); /* subtle dividers */
--border2: rgba(255, 255, 255, 0.13); /* stronger borders */

/* ── Text ── */
--text: #e2e8f0; /* primary text */
--text2: #8b95a5; /* secondary text */
--text3: #536070; /* muted / label text */
--text4: #3a4a5c; /* faintest text */

/* ── Semantic Colors (each has base, bg, border variants) ── */
--urgent: #e24b4a;
--urgent-bg: rgba(226, 75, 74, 0.1);
--urgent-b: rgba(226, 75, 74, 0.28);

--attn: #d06828;
--attn-bg: rgba(208, 104, 40, 0.1);
--attn-b: rgba(208, 104, 40, 0.28);

--watch: #d4a940;
--watch-bg: rgba(212, 169, 64, 0.1);
--watch-b: rgba(212, 169, 64, 0.26);

--good: #3ab97a;
--good-bg: rgba(58, 185, 122, 0.1);
--good-b: rgba(58, 185, 122, 0.25);

--info: #4a9ee8;
--info-bg: rgba(74, 158, 232, 0.1);
--info-b: rgba(74, 158, 232, 0.24);

--hot: #ff5722;
--hot-bg: rgba(255, 87, 34, 0.12);
--hot-b: rgba(255, 87, 34, 0.35);
--hot-glow: 0 0 8px rgba(255, 87, 34, 0.4), 0 0 2px rgba(255, 87, 34, 0.6);

--gold: #c9952a;
--gold-bg: rgba(201, 149, 42, 0.12);
--gold-b: rgba(201, 149, 42, 0.28);

--purple: #9b72e8;
--purple-bg: rgba(155, 114, 232, 0.1);

/* ── Radius ── */
--r: 8px;
```

### Pipeline — Product Color Variables

```css
--pm-mca: #c9a227; /* MCA = Gold */
--pm-sba: #4a9eff; /* SBA = Blue */
--pm-equip: #3fb950; /* Equipment = Green */
--pm-heloc: #a371f7; /* HELOC = Purple */
--pm-re: #e07b54; /* Real Estate = Coral */
--pm-bridge: #64b5d4; /* Bridge = Teal */
```

### Command Center Page (`:root`)

```css
--bg: #07090d;
--bg2: #0d1117;
--bg3: #111820;
--bg4: #0a0e14;
--border: #161d28;
--border2: #1e2a38;
--text: #c9d1d9;
--muted: #48566a;
--faint: #141e2a;

/* Named colors */
--gold: #c9a227;
--gold2: #7a5f10;
--green: #238636;
--green2: #3fb950;
--red: #da3633;
--red2: #400000;
--orange: #c45000;
--orange2: #3d1500;
--amber: #9e6a03;
--amber2: #2a1c00;
--blue: #4a9eff;
--blue2: #0d2040;

/* Font families */
--mono: 'IBM Plex Mono', monospace;
--sans: 'IBM Plex Sans', sans-serif;

/* Product mix colors (same system) */
--pm-mca: #c9a227;
--pm-sba: #4a9eff;
--pm-equip: #3fb950;
--pm-heloc: #a371f7;
--pm-re: #e07b54;
--pm-bridge: #64b5d4;
```

---

## 2. Typography

### Pipeline Page

```
Font Family: DM Sans (400, 500, 600) + DM Mono (400, 500)
Import: @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&display=swap')
Base font-size: 13px
font-variant-numeric: tabular-nums  (used on all dollar amounts)
user-select: none (global)
```

**Size Scale:**

- 9px — labels, uppercase tags, timestamps, meta text
- 10px — secondary info, badge text
- 11px — default small text, section headers (uppercase)
- 12px — normal body text, inputs
- 13px — base (body)
- 14px — card dollar amounts, stat values
- 16px — section titles (team view)
- 20px — stat card hero values
- 22px — panel header name

**Weight Usage:**

- 400 — body text
- 500 — medium emphasis
- 600 — headers, labels, card names
- 700 — dollar amounts, stat numbers
- 800 — hero stat values

### Command Center Page

```
Font Families: IBM Plex Mono (400, 500, 600, 700) + IBM Plex Sans (300, 400, 500, 600)
Import: @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap')
Base font-size: 12px
line-height: 1.5
```

**Size Scale:**

- 8px — ultra-fine detail
- 9px — labels, tags, metadata
- 10px — secondary text, pill labels
- 11px — nav buttons, section labels
- 12px — base body
- 13px — card values, emphasized
- 14px — scorecard labels
- 16px — operator queue deal names
- 18px — greeting text, scorecard values
- 20px — priority card deal names
- 22px — hero sub-values
- 28px — hero funded amount

**Font Assignments:**

- `var(--mono)` — topbar logo text, numbers/stats, amounts, table data, pip labels
- `var(--sans)` — body text, descriptions, cards, modals

---

## 3. Layout System

### Pipeline Page Layout

```
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

Structure:
  .topbar         → fixed top bar (height: 42px, z: 99)
  .legend         → color legend bar (horizontal, scrollable)
  .banner         → role/filter context banner
  .board-wrap     → flex: 1; overflow-x: auto; display: flex
    .col          → width: 260px per stage column
      .col-head   → sticky column header
      .col-cards  → vertical card stack (gap: 6px)
  #teamWrap       → team pipeline view (alternate layout)
  #queueWrap      → renewal/revive queue view (alternate layout)
  .mgr-bar        → manager bottom bar (fixed position)
  .sum-bar        → summary stats bar

Panel (slide-in):
  .panel { width: 700px; right: -720px  → right: 0 when .open }
  .overlay { opacity: 0 → 1, pointer-events: none → auto }
```

**Column Layout (Board):**

- Each `.col` = `width: 260px; flex-shrink: 0`
- `.col-head` = sticky header with count + stage name
- 9 stages mapped to 9 columns
- Board scrolls horizontally via `.board-wrap { overflow-x: auto }`

### Command Center Layout

```
body { background: var(--bg); }

.page {
  max-width: 1640px;
  margin: 0 auto;
  padding: 12px 18px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 44px;
  background: #070a0e;
  border-bottom: 1px solid var(--border);
}
```

**Grid System (reusable utility classes):**

```css
.g2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.g3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}
.g4 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 10px;
}
.g5 {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.g-2-1 {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 10px;
}
.g-3-2 {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 10px;
}
.g-pipe {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr;
  gap: 10px;
}
```

**Zone Dividers (section separators):**

```css
.zone-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 18px 0 10px;
  font: 600 9px/1 var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.zone-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border);
}
```

---

## 4. Component Breakdown — Pipeline Page

### 4.1 Topbar (`.topbar`)

- Height: 42px; background: var(--bg2); border-bottom: 1px solid var(--border); z-index: 99
- Logo: `.logo` — 20px square gold background, 9px font, border-radius 4px
- Role switch: `.rs` buttons (Admin / Rep JB / Rep HA)
- Filter pills: `.fp` buttons in `#fpRow` — All, Mine, Overdue, Hot, Neglected, This Week
- View switch: `.vs` buttons — My Pipeline, Team Pipeline, All Deals
- View mode switch: `.vms` buttons — Simple, ⚡ Execution
- Queue nav button: `#queueBtn` with badge `#queueBadge`
- Goals button: `#goalBtn`
- Add button: `#addBtn`

### 4.2 Legend (`.legend`)

- Horizontal scroll of priority color indicators
- Items: Overdue, Missing Next Action, Hot/Offer, Today, Good, Renewal, No Status, New/Moved, Stale 5d+

### 4.3 Banner (`.banner`)

- Context indicator showing current role + active filter
- Role badges: Admin (gold), Rep JB/HA (blue)
- Badges use semantic color bg/border/text triplet

### 4.4 Board (Kanban: `.board-wrap`)

- 9 columns, each 260px wide
- Horizontal scroll overflow
- Columns: New Lead → Engaged/Interested → Qualified → Submitted → Approved/Offers → Committed → Funded → Nurture → Closed
- Column header: `.col-head` with stage count (`.col-count`)
- Cards area: `.col-cards` with 6px gap
- Supports drag & drop between columns

### 4.5 Simple Cards (`.s-card`)

- Compact scan-mode cards
- Border-left: 3px solid (priority color)
- Padding: 10px 11px 8px
- Shows: amount (hero), business name, next action, time indicator
- State classes: `sc-normal`, `sc-hot`, `sc-overdue`, `sc-today`, `sc-good`
- Amount states: `sca-green`, `sca-amber`, `sca-prev`, `sca-gray`
- Hot badge: `sc-hot-badge` (position absolute, top right)
- No-action warning: `sc-no-action`
- Action row: `sc-action-row` with `sc-action` + `sc-time`
- Time states: `st-od`, `st-td`, `st-good`, `st-nm`

### 4.6 Execution Cards (`.card`)

- Full-detail cards with border-left: 3px solid (priority color)
- Priority border classes: `p-od` (urgent), `p-mna` (attn), `p-hot` (hot), `p-td` (watch), `p-good` (good), `p-renew` (good), `p-ns` (text3), `p-nm` (info)
- Header: `.ch` with client name `.cn` + badges
- Status pill: `.sp` with dot + text
- Hot row: `.hot-row` with flame icon + reason text
- Offer block: `.offer-block` with lender/amount/term
- Committed block: `.commit-block` with sub-status
- Funded block: `.funded-block` with amount/funder
- Nurture block: `.nb-block` with nurture tags
- Next action row: `.na-row` with action text + time pill
- Staleness bar: `.stale-bar` (gradient opacity 0.3-1.0)
- Card footer: `.cf` with rep avatar + meta
- Rep avatar: `.av` (18px circle)
- Product badge: `.prod-badge`

### 4.7 Panel (`.panel`)

- Width: 700px, right-slide animation
- Tab bar: Conversation, Deal + Client, Funding History
- **Conversation tab:** SMS thread (`.sms-thread`) with bubbles (`.bubble`), send bar (`.send-bar`)
- **Deal tab:** Full deal editing form, offers section, stage select, ownership editor, next action, notes
- **History tab:** Funding events timeline, renewal tasks, client summary

### 4.8 Manager Bar (`.mgr-bar`)

- Admin-only bottom bar
- Grid showing per-rep: Active, Overdue, Hot, Pipeline $, Funded MTD, Shared, Goal %
- Rep avatars with colored backgrounds

### 4.9 Summary Bar (`.sum-bar`)

- Bottom stats: Active Pipeline, Funded MTD (with goal bar), Lifetime Funded, At Risk, Hot, No Next Action, Renewals Due, Queue Today
- Goal progress bar: `.goal-bar-track` + `.goal-bar-fill` (color varies by progress)

### 4.10 Team View (`#teamWrap`)

- Stat cards grid (6 top stats)
- Goal bar with team progress
- Rep scoreboard (3 reps side by side with funded/active/nurture/goal%)
- Active Offers section (deal tiles)
- Funded This Month section
- Nurture Pool section

### 4.11 Queue View (`#queueWrap`)

- Header: title + "Schedule Follow-Up" button
- Stats row: Overdue / Due Today / This Week / Renewal Opps / Total Scheduled
- Admin rep breakdown section
- Queue sections: Overdue, Due Today, This Week, Upcoming
- Queue cards: `.q-card` with variants `qc-overdue`, `qc-today`, `qc-renewal`, `qc-upcoming`
- Each card: business name, reason pill, funding history, script suggestion, rep, due label
- Due label classes: `qd-od`, `qd-td`, `qd-ok`

### 4.12 Renewal/Revive Queue (RRQ)

- Shared between Pipeline and Command Center
- Card-based carousel navigation with prev/next
- Progress pills: `rrq-pill` (done/current/pending)
- Card: `rrq-card` with reason tag, deal info, detail grid, reason box, action buttons
- Reason types: `rr-renewal`, `rr-revive`, `rr-nurture`, `rr-stmts`, `rr-expired`
- Action buttons: `rrq-btn-primary`, `rrq-btn-call`, `rrq-btn-reopen`, `rrq-btn-complete`, `rrq-btn-skip`
- Complete state: `rrq-done-overlay`

### 4.13 Product Mix Module

- Shared rendering across Pipeline and Command Center
- Segmented bar: `pm-seg-bar` with `pm-seg` segments
- Legend: `pm-legend` with colored dots
- Product rows: `pm-prod-r` with mini bar + percentage + amount
- Delta indicators: `pm-delta` (up/dn/flat classes)
- Rep insight box: `pm-insight-box`
- Admin: toggleable lifetime/30d with rep breakdown table
- Rep view: lifetime stat + period toggle + product bars + insight

---

## 5. Component Breakdown — Command Center Page

### 5.1 Topbar (`.topbar`)

- Height: 44px; background: #070a0e; sticky top; z-index: 100
- Logo: `.logo` 24px square, gold bg, border-radius 5px, font: 10px/24px var(--mono)
- Role switch: `.rsw` container with animated slider `#rsw-sl`
  - Slider animation CSS: `transition: left .3s cubic-bezier(.4,0,.2,1), width .3s`
  - Buttons: `.rb` (role button) with `.on` and `.on-admin` states
- Role label: `.role-label` with variants `.rl-admin` (gold) and `.rl-rep` (blue)
- Live pip: `.live-pip` (6px green circle with blink animation)
- Clock: `#clk` (IBM Plex Mono, updates every second)
- Add button: `.tb-add-btn` (border: 1px dashed var(--gold), color: var(--gold))

### 5.2 Admin View (`#v-admin`)

**Money Zone (Hero Section):**

- `.hero` — gold top border (3px), 3-column grid
- Left: Greeting + funded MTD ($2.48M) with counter animation, goal context
- Center: Goal progress bar with percentage
- Right: HBox stats row (deals funded, weighted pipeline, avg deal, days to close)

**Scorecards (`.sc`):**

- 5-column grid
- Each card: `.sc` with colored 3px top border
- Border color variants: `.tg` (gold), `.tb` (blue), `.tp` (green), `.tgr` (green2), `.tor` (orange), `.tr` (red)
- Label: 14px var(--mono), value: 22px/28px bold, sub: 9px muted

**Risk Banner (`.risk-banner`):**

- Full-width amber gradient background
- Shows at-risk pipeline value and stale deals count

**Execution Zone:**

- **Operator Queue:** Gold left-border card, 5 deal items with action pills
  - Action pill colors: `ap-call` (green), `ap-text` (blue), `ap-submit` (amber), `ap-review` (orange), `ap-close` (red)
- **Priority Cards:** `.pcard` with variants `.hot`, `.stale`, `.over`
  - Hot: border-top gold, glow effect
  - Stale: border-top orange
  - Over: border-top red
  - Internal: deal name (20px bold), details grid, action buttons

**Intelligence Zone:**

- Bottleneck analysis list: clickable items with colored indicators
- Rep monitor: rep table (sortable columns) + pipeline snapshot

**Rep Performance Table:**

- Sortable by column
- Columns: Rep, Active, Funded, Conv%, Pipeline, Weighted, 30d Funded
- Cell formatting: gold for top, green for funded amounts, red for zero

**Pipeline Snapshot:**

- Horizontal mini-bars showing lead/qualified/submitted/approved/committed/funded
- Each bar colored consistently

**Product Mix Quick View:**

- Segmented bar + legend in admin sidebar

**Conversion Funnel:**

- Vertical funnel: Leads → Submitted → Approved → Committed → Funded
- Each stage shows count + percentage + colored bar

**Activity Feed:**

- Scrollable list of events
- Categories: System (amber), Rep (green), Alert (red)
- Dot + text + timestamp format

### 5.3 Rep Views (`#v-jb`, `#v-ha`)

**Rep Hero Stats:**

- 4-column grid of large stats (funded MTD, active pipeline, conversion, active deals)
- Counter animation on view switch

**Pace Banner:**

- Shows funding pace calculation (daily needed to hit goal)

**Operator Queue (Rep):**

- Same component as admin but filtered to rep's deals

**Priority Cards (Rep):**

- Hot, Stale, Overdue — same design, filtered data

**Renewal/Revive Queue (RRQ):**

- Full carousel component per rep
- Navigation: prev/next + progress pills
- Card with reason tag, deal details, funding history, script, CTAs

**Intelligence Section:**

- Pipeline snapshot, conversion funnel, product mix, activity feed
- All scoped to individual rep data

### 5.4 Execution Score Bar

- Fixed-position bar showing team execution score
- Per-rep scores with clickable popup breakdown
- Rep scores: `.esb-rep` with color-coded backgrounds (ok/warn/bad)
- Popup: `.esb-popup` with completed/overdue/touched stats

### 5.5 SMS Bar (`.sms-bar`)

- Fixed bottom bar on every view
- Input field + send button
- Teal/blue gradient button

### 5.6 Toast (`.toast-el`)

- Fixed bottom right notification
- Title + message
- Auto-dismiss after 3.2 seconds
- Slide-in animation

---

## 6. Card Design System

### Simple Card (Pipeline — `.s-card`)

```css
.s-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  border-left: 3px solid var(--text3);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.s-card:hover {
  background: var(--bg4);
  border-color: var(--border2);
}

/* State variants (border-left color) */
.sc-hot {
  border-left-color: var(--hot);
}
.sc-overdue {
  border-left-color: var(--urgent);
}
.sc-today {
  border-left-color: var(--watch);
}
.sc-good {
  border-left-color: var(--good);
}
```

### Execution Card (Pipeline — `.card`)

```css
.card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  border-left: 3px solid var(--text3);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

/* Priority variants */
.p-od {
  border-left-color: var(--urgent);
}
.p-mna {
  border-left-color: var(--attn);
}
.p-hot {
  border-left-color: var(--hot);
  box-shadow: var(--hot-glow);
}
.p-td {
  border-left-color: var(--watch);
}
.p-good {
  border-left-color: var(--good);
}
.p-renew {
  border-left-color: var(--good);
}
.p-ns {
  border-left-color: var(--text3);
}
.p-nm {
  border-left-color: var(--info);
}
```

### Command Center Cards

**Scorecard (`.sc`):**

```css
.sc {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  border-top: 3px solid transparent;
}
/* Top border color variants */
.sc.tg {
  border-top-color: var(--gold);
}
.sc.tb {
  border-top-color: var(--blue);
}
.sc.tp {
  border-top-color: var(--green2);
}
.sc.tgr {
  border-top-color: var(--green2);
}
.sc.tor {
  border-top-color: var(--orange);
}
.sc.tr {
  border-top-color: var(--red);
}
```

**Priority Card (`.pcard`):**

```css
.pcard {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.pcard .pc-head {
  padding: 10px 14px;
  font: 600 10px/1 var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pcard.hot .pc-head {
  background: linear-gradient(90deg, #2a1800 0%, var(--bg2) 100%);
  color: var(--gold);
  border-top: 2px solid var(--gold);
}
.pcard.stale .pc-head {
  background: linear-gradient(90deg, var(--orange2) 0%, var(--bg2) 100%);
  color: var(--orange);
  border-top: 2px solid var(--orange);
}
.pcard.over .pc-head {
  background: linear-gradient(90deg, var(--red2) 0%, var(--bg2) 100%);
  color: var(--red);
  border-top: 2px solid var(--red);
}
```

---

## 7. Modals & Dialogs

### Pipeline Page Modals

| Modal ID      | Purpose             | Key Fields                                                                                                                                                                           |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addMod`      | Add new lead        | First name, Business name, Phone, Email, product selector (chips), source selector, revenue range grid, rep dropdown, notes                                                          |
| `offerMod`    | Record lender offer | Lender name, Amount ($K), Term (months), Rate, Product dropdown, Notes                                                                                                               |
| `fundMod`     | Mark deal funded    | Funded date, Lender, Amount, Term, Rate, Product, Notes. Shows offer selection if multiple offers. Shows auto-generated renewal milestones                                           |
| `nqMod`       | Close/NQ deal       | Close type toggle (Lost → Nurture / Disqualified → Closed), Reason, Follow-up date (30d default)                                                                                     |
| `editFundMod` | Edit funding event  | Same fields as fundMod, pre-filled                                                                                                                                                   |
| `goalsMod`    | Edit goals (admin)  | Team monthly/yearly, per-rep monthly/yearly                                                                                                                                          |
| `fuMod`       | Schedule follow-up  | Follow-up type selector (renewal/nurture/stmts/expired), date picker with quick buttons (30d/60d/90d), external funded date (for renewals), smart date suggestions, notes (required) |

**Modal styling:**

```css
.mod {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  display: none; /* .open → display: flex */
  align-items: center;
  justify-content: center;
}
.mod-box {
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: 12px;
  padding: 24px;
  width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}
```

### Command Center Modals

| Modal ID     | Purpose                  | Key Fields                                                                                                                                                                                                                  |
| ------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csv-modal`  | CSV import               | File preview table, import button. Shows simulated 8-row preview                                                                                                                                                            |
| `deal-modal` | Deal detail view         | Business name, rep, stage badge, urgency indicator, key metrics grid, action buttons (Call/Text via Twilio), recent activity, complete action CTA. Close via backdrop or ×                                                  |
| `ca-modal`   | Complete Action (2-step) | **Step 1:** Action type grid (Called client, Sent documents, Submitted app, etc.), auto follow-up preview. **Step 2:** Next action text input, due date selector (Today/Tomorrow/This week/Next week/Custom), submit button |

**Command Center modal styling:**

```css
.dm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 500;
  display: none; /* .open → display: flex */
}
.dm-box {
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 10px;
  width: 520px;
  max-height: 85vh;
  overflow-y: auto;
}
```

**Complete Action Modal (2-step flow):**

- Step 1: `.ca-step` with grid of `.ca-action-btn` buttons
- Auto-follow-up note: `.ca-auto-note` (amber highlight)
- Step 2: Next action input + due date grid (`.ca-due-btn` buttons)
- Transitions: `.ca-step.active { display: block }` / default `display: none`

---

## 8. Data Model

### Pipeline — Primary Data Structures

**Client:**

```typescript
interface Client {
  id: string; // 'c1', 'c2', etc.
  name: string; // Contact full name
  biz: string; // Business name
  phone: string;
  email: string;
  source: string; // 'SMS' | 'Referral' | 'Web' | 'Cold Call' | 'LinkedIn' | 'Partner'
  totalFunded: number; // Lifetime funded amount
  fundingCount: number; // Number of funding events
  lastFundedDate: string | null;
  rev: string; // Revenue range: '$10K–25K' | '$25K–50K' | '$50K–100K' | '$100K–250K' | '$250K–500K' | '$500K+'
  rep: string; // 'JB' | 'HA' | 'NU'
  note: string;
}
```

**Deal:**

```typescript
interface Deal {
  id: string;
  clientId: string;
  name: string;
  biz: string;
  stage: DealStage;
  types: DealType[];
  rep: string; // Primary rep: 'JB' | 'HA' | 'NU'
  coReps?: string[]; // Assist reps
  na: string; // Next action text
  dueLabel: string; // 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | date string
  duePri: string; // 'od' | 'td' | 'missing' | 'nm' | 'renew'
  exactDate?: string;
  stale: number; // Days since last activity
  age: number; // Days since creation
  badges: string[]; // 'HOT' | 'SMS' | 'RENEW' | 'LOST' | 'NEW'
  lastReplyHours: number | null;
  appSubmitted: boolean;
  offers: Offer[];
  selectedOfferId: string | null;
  lenderEngaged: boolean;
  offer?: number; // Funded amount
  prevOffer?: number; // Previous offer (for nurture)
  note: string;
  msgs: Message[];
  lostReason?: string;
  disqReason?: string;
  nurtureType?: string;
  fundingEventId?: string;
  commitSubStatus?: string; // 'docs_in' | 'stipulations' | 'clear_to_fund' | 'wire_sent' | 'funded_pending'
  daysInSubStatus?: number;
  followUpDate?: string;
  followUpType?: string; // 'renewal' | 'nurture' | 'stmts' | 'expired'
  fuNote?: string;
  externalFundedDate?: string;
}
```

**Deal Stages (ordered):**

```typescript
type DealStage =
  | 'New Lead'
  | 'Engaged / Interested'
  | 'Qualified / Interested'
  | 'Submitted (In Review)'
  | 'Approved / Offers'
  | 'Committed (Funding)'
  | 'Funded'
  | 'Nurture'
  | 'Closed';
```

**Offer:**

```typescript
interface Offer {
  id: string;
  lender: string;
  amount: number;
  term: string; // e.g., '12'
  rate: string; // e.g., '1.35'
  product: string; // 'MCA' | 'SBA' | 'Equipment' | 'HELOC' | 'Real Estate' | 'Bridge'
  notes?: string;
}
```

**Funding Event:**

```typescript
interface FundingEvent {
  id: string;
  clientId: string;
  dealId: string;
  amount: number;
  funder: string;
  term: number;
  rate: string;
  product: string;
  fundedDate: string;
  fundedDateRaw: string;
  midpointDate: string;
  payoffDate: string;
  payoffRaw: string;
  notes: string;
  renewalTasks: RenewalTask[];
}

interface RenewalTask {
  label: string; // '4-6 week check-in' | 'Midpoint renewal outreach' | '30-day payoff warning'
  date: string;
  dateRaw: string;
  status: 'upcoming' | 'overdue' | 'done';
}
```

**Message:**

```typescript
interface Message {
  d: 'in' | 'out'; // Direction
  t: string; // Text content
  ts: string; // Timestamp string
}
```

**Products Config:**

```typescript
const PRODUCTS = {
  MCA: {
    icon: '💰',
    label: 'MCA',
    color: '#c9a227',
    bg: 'rgba(201,149,42,0.12)',
    note: '3-8mo',
    reviewDays: 2,
    commitDays: 5,
  },
  SBA: {
    icon: '🏛',
    label: 'SBA',
    color: '#4a9eff',
    bg: 'rgba(74,158,232,0.12)',
    note: '10-25yr',
    reviewDays: 14,
    commitDays: 14,
  },
  Equipment: {
    icon: '⚙️',
    label: 'Equipment',
    color: '#3fb950',
    bg: 'rgba(63,185,80,0.12)',
    note: '5-7yr',
    reviewDays: 5,
    commitDays: 7,
  },
  HELOC: {
    icon: '🏠',
    label: 'HELOC',
    color: '#a371f7',
    bg: 'rgba(163,113,247,0.12)',
    note: '10-20yr',
    reviewDays: 10,
    commitDays: 10,
  },
  'Real Estate': {
    icon: '🏢',
    label: 'Real Estate',
    color: '#e07b54',
    bg: 'rgba(224,123,84,0.12)',
    note: '10-30yr',
    reviewDays: 14,
    commitDays: 14,
  },
  Bridge: {
    icon: '🌉',
    label: 'Bridge',
    color: '#64b5d4',
    bg: 'rgba(100,181,212,0.12)',
    note: '6-24mo',
    reviewDays: 3,
    commitDays: 5,
  },
};
```

**Reps Config:**

```typescript
const REPS = {
  JB: { name: 'Jonathan Baker', bg: 'var(--gold-bg)', color: 'var(--gold)' },
  HA: { name: 'Hassan Anadu', bg: 'var(--info-bg)', color: 'var(--info)' },
  NU: { name: 'Nkem Udeh', bg: 'rgba(155,114,232,0.1)', color: 'var(--purple)' },
};
```

### Command Center — Data Structures

**Deal (CC simplified):**

```typescript
interface CCDeal {
  n: string; // Business name
  r: string; // Rep initials
  s: string; // Stage
  v: string; // Value (display string)
  p: string; // Product type
  d: number; // Days in stage
  na: string; // Next action
  u: string; // Urgency level
  // Additional detail fields for deal modal
}
```

**Execution Score Breakdown:**

```typescript
interface ESBData {
  score: string; // e.g., '82%'
  label: string; // Rep full name
  completed: number;
  total: number;
  overdue: number;
  touched: number;
  cls: 'ok' | 'warn' | 'bad';
}
```

**Auto Follow-Up Config:**

```typescript
const AUTO_FOLLOWUP = {
  [actionName: string]: {
    next: string;       // Auto-suggested next action text
    due_mca: string;    // Due date for MCA products
    due_sba: string;    // Due date for SBA products
    due_equip: string;  // Due date for Equipment products
  }
};
```

**RRQ Data (Renewal/Revive Queue):**

```typescript
interface RRQItem {
  id: string;
  name: string;
  product: string;
  prior_amount: string;
  funded_date: string | null;
  last_activity: string;
  reason_type: 'renewal' | 'revive' | 'nurture' | 'stmts' | 'expired';
  reason_label: string;
  reason_text: string;
  rec: string;
  renewal_potential: string;
  data_source: string;
  cta_primary: string;
  cta_secondary: string[];
  status: 'pending' | 'completed';
}
```

---

## 9. JavaScript Logic & State

### Pipeline — State Variables

```javascript
let currentRole = 'admin'; // 'admin' | 'rep' | 'rep2'
let currentView = 'pipeline'; // 'pipeline' | 'team' | 'all' | 'queue'
let currentViewMode = 'simple'; // 'simple' | 'power'
let currentDealId = null; // Active panel deal
let activeTab = 'convo'; // 'convo' | 'deal' | 'history'
let activeFilter = 'all'; // 'all' | 'overdue' | 'hot' | 'neglected' | 'thisweek' | 'mine'
let dragId = null; // Drag-and-drop state
```

### Pipeline — Key Business Logic Functions

| Function                         | Purpose                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `dealStatus(deal)`               | Returns system-driven status label (Overdue, No Next Action, Stale 5d+, etc.)               |
| `isHot(deal)`                    | Returns true if deal has offer, recent SMS reply (<6h), or lender engaged                   |
| `hotReason(deal)`                | Returns human-readable reason string for hot flag                                           |
| `checkAutoPromote(deal)`         | Auto-promotes deal stage based on events (offer received → Approved, etc.)                  |
| `setCommitSubStatus(id, status)` | Sets committed sub-status (docs_in, stipulations, clear_to_fund, wire_sent, funded_pending) |
| `markCommitted(id)`              | Moves deal from Approved → Committed                                                        |
| `sortPri(deals)`                 | Sorts deals: overdue first, then missing action, then hot, then today, then rest            |
| `visibleDeals()`                 | Filters deals by current role                                                               |
| `visibleDealsFiltered()`         | Applies active filter (overdue/hot/neglected/thisweek/mine) on top of role filter           |
| `goalProgress(funded, goal)`     | Returns `{pct, cls, barColor}` for goal progress bar                                        |
| `isInQueue(deal)`                | Returns true if deal's followUpDate is due                                                  |
| `queueReason(deal)`              | Returns `{label, cls, icon}` for queue card reason                                          |
| `queueScript(deal)`              | Returns suggested conversation opener script                                                |

### Pipeline — Permission System

```javascript
function canEdit(deal) {
  if (currentRole === 'admin') return true;
  return deal.rep === (currentRole === 'rep2' ? 'HA' : 'JB');
}
function canViewContact(deal) {
  return canEdit(deal) || currentRole === 'admin';
}
function canEditGoals() {
  return currentRole === 'admin';
}
function canEditOwnership() {
  return currentRole === 'admin';
}
```

### Pipeline — Ownership System

- Primary rep (`.rep-primary`): single owner
- Assist reps (`.rep-assist`): co-owners who can view/act
- Admin can reassign ownership via ownership editor
- `isAssist(deal)` checks if current user is assist (not primary)

### Pipeline — Stage Entry Rules (enforced on drag & drop)

- `Submitted (In Review)` — requires `appSubmitted === true`
- `Approved / Offers` — requires `offers.length > 0`
- `Committed (Funding)` — must come from `Approved / Offers`
- `Funded` — opens funded modal instead of direct move
- `Closed` — opens NQ modal instead of direct move
- Any move — requires `deal.na` (next action) to be set

### Command Center — View Switching

```javascript
let curView = 'admin'; // 'admin' | 'jb' | 'ha'
function setView(v, btn) {
  // Hides all .view elements, shows #v-{v}
  // Animates role switch slider position
  // Triggers counter animations for rep views
}
```

### Command Center — Counter Animation

```javascript
function aC(el, target, pre, suf, dur) {
  // Animates number from 0 → target over dur ms
  // Formats as $2.48M for millions, $165K for thousands
  // Uses 16ms step interval
}
```

### Command Center — Complete Action Flow

1. User clicks action pill on operator queue item
2. Step 1 modal: select action type (Called, Sent docs, Submitted, etc.)
3. Auto-follow-up suggestion shown based on product type
4. Step 2 modal: confirm/edit next action + select due date
5. Submit → toast confirmation → pipeline updated

---

## 10. Responsive Design

### Pipeline Page

- Board scrolls horizontally (no responsive breakpoints in prototype)
- Columns fixed at 260px width
- Panel fixed at 700px width
- Manager bar wraps with `flex-wrap: wrap`
- Filter pills scroll horizontally
- Team view cards: `.team-cards` uses CSS grid with `min-width` constraints

### Command Center Page

- Grid system adapts via named classes
- No explicit media queries in prototype
- All grids set with fixed column ratios
- Page max-width: 1640px
- Cards use percentage-based widths within grids

**Note:** Both prototypes are desktop-only. Mobile responsive design will need to be added during React implementation.

---

## 11. Full CSS Classes Reference

### Pipeline — Key CSS Classes

```
/* Layout */
.topbar, .board-wrap, .col, .col-head, .col-cards, .col-count
.legend, .banner, .mgr-bar, .sum-bar
#teamWrap, #queueWrap

/* Cards */
.card, .s-card
.p-od, .p-mna, .p-hot, .p-td, .p-good, .p-renew, .p-ns, .p-nm
.sc-normal, .sc-hot, .sc-overdue, .sc-today, .sc-good
.sc-amount, .sca-green, .sca-amber, .sca-prev, .sca-gray
.sc-name, .sc-action-row, .sc-action, .sc-time, .sc-hot-badge, .sc-no-action
.st-od, .st-td, .st-good, .st-nm

/* Card internals */
.ch, .cn, .badge, .sp, .sp-dot, .sp-text
.hot-row, .offer-block, .commit-block, .funded-block, .nb-block
.na-row, .stale-bar, .cf, .av, .prod-badge

/* Panel */
.panel, .overlay, .ph, .ph-badge, .tabs, .tab, .pane
.sms-thread, .msg, .bubble, .msg-meta, .send-bar
.dsb, .dsbt, .dsbt-action, .sf, .sf-l, .si

/* Deal tab */
.rev-grid, .rev-opt, .src-row, .src-chip, .dt-grid, .dt-opt, .dt-chk
.due-row, .due-chip, .dp-wrap, .dp-inp
.offer-item, .selected-offer, .oi-left, .oi-lender, .oi-detail, .oi-amount, .oi-btn
.act-btn, .act-funded, .act-nq
.ssub-btns, .ssub-btn, .ssub-act-*

/* History tab */
.client-summary, .cs-row, .cs-item, .cs-label, .cs-val
.fund-event, .active-event, .fe-header, .fe-title, .fe-date
.fe-grid, .fe-item, .fe-label, .fe-val, .fe-milestones
.ms-item, .ms-label, .ms-date, .renew-task-item
.tl-item, .tl-dot, .tl-text, .tl-time

/* Filters & switches */
.fp, .fp.act, .fp.urg, .fp.fire, .fp.week-act
.vs, .vs.act, .team-act
.vms, .vms.act
.rs, .rs.act
.vb, .btext

/* Modals */
.mod, .mod.open, .mod-box, .mod-title, .mod-sub
.mod-field, .mod-label, .mod-inp, .mod-select
.mod-row, .mod-actions, .btn-s, .btn-p

/* Queue */
.q-card, .qc-overdue, .qc-today, .qc-renewal, .qc-upcoming
.q-biz, .q-reason-pill, .q-revive-btn, .q-funding-row
.q-script, .q-meta, .q-rep, .q-due, .qd-od, .qd-td, .qd-ok
.queue-header, .queue-title, .queue-sub, .queue-stats, .q-stat
.q-section, .q-section-head

/* Follow-up modal */
.fu-type-btn, .fu-type-btn.sel, .fu-quick-row
.fu-smart, .fu-smart.show

/* Team view */
.team-cards, .deal-tile, .funded-tile, .nb-tile, .top-tile
.dt-biz, .dt-offer, .dt-meta, .dt-fd

/* RRQ */
.rrq-*, (see section 4.12)

/* Product Mix */
.pm-*, (see section 4.13)

/* Goals */
.goal-bar-track, .goal-bar-fill, .goal-bar-wrap, .goal-pct
.on-track, .at-risk, .behind

/* Toast */
.toast, .toast.show
```

### Command Center — Key CSS Classes

```
/* Layout */
.topbar, .page, .view, .view.on
.g2, .g3, .g4, .g5, .g-2-1, .g-3-2, .g-pipe
.zone-divider, .zd-label

/* Topbar */
.logo, .rsw, .rb, .rb.on, .rb.on-admin
.role-label, .rl-admin, .rl-rep
.live-pip, .tb-add-btn

/* Cards */
.card (CC version), .sc (scorecard)
.tg, .tb, .tp, .tgr, .tor, .tr (scorecard border colors)
.hero, .hbox
.risk-banner

/* Priority cards */
.pcard, .pcard.hot, .pcard.stale, .pcard.over
.pc-head, .pc-body

/* Operator queue */
.oq (operator queue), .oq-item, .oq-pills
.ap (action pill), .ap-call, .ap-text, .ap-submit, .ap-review, .ap-close

/* Bottleneck */
.bn-item, .bn-dot, .bn-bar

/* Rep table */
.rep-tbl, .rep-tbl th, .rep-tbl td

/* Pipeline snapshot */
.pipe-snap, .ps-bar, .ps-label

/* Conversion funnel */
.funnel, .fn-stage, .fn-bar

/* Activity feed */
.af-list, .af-item, .af-dot, .af-time

/* Product mix */
.pm-seg-bar, .pm-seg, .pm-legend, .pm-legend-item, .pm-legend-dot
.pm-prod-r, .pm-prod-name, .pm-prod-bar-w, .pm-prod-bar, .pm-prod-pct, .pm-prod-amt
.pm-delta, .pm-delta.up, .pm-delta.dn, .pm-delta.flat
.pm-insight-box

/* RRQ */
.rrq-wrap, .rrq-head, .rrq-nav, .rrq-pill
.rrq-card, .rrq-reason-tag, .rrq-deal-row
.rrq-deal-name, .rrq-deal-meta, .rrq-meta-pill
.rrq-detail-grid, .rrq-detail-cell, .rrq-detail-lbl, .rrq-detail-val
.rrq-reason-box, .rrq-reason-lbl, .rrq-reason-text, .rrq-rec
.rrq-actions, .rrq-btn, .rrq-btn-primary, .rrq-btn-call, .rrq-btn-reopen
.rrq-btn-complete, .rrq-btn-skip
.rrq-done-overlay, .rrq-done-icon, .rrq-done-txt

/* Deal modal */
.dm-overlay, .dm-box, .dm-head, .dm-close
.dm-metrics (grid), .dm-urgency
.dm-comms (call/text buttons)

/* Complete action modal */
.ca-overlay, .ca-box, .ca-head
.ca-step, .ca-step.active
.ca-action-grid, .ca-action-btn, .ca-action-btn.selected
.ca-due-grid, .ca-due-btn, .ca-due-btn.selected
.ca-auto-note, .ca-auto-note.show

/* Execution score bar */
.esb-bar, .esb-rep, .esb-wrap
.esb-popup, .esb-popup.open
.esb-popup-rep, .esb-popup-row, .esb-popup-key, .esb-popup-val

/* SMS bar */
.sms-bar, .sms-input, .sms-send

/* CSV modal */
.csv-overlay, .csv-box, .csv-table

/* Toast */
.toast-el, .toast-el.show
```

---

## 12. Product Color System

Consistent across both prototypes:

| Product     | Color     | CSS Var       | Background               |
| ----------- | --------- | ------------- | ------------------------ |
| MCA         | `#c9a227` | `--pm-mca`    | `rgba(201,149,42,0.12)`  |
| SBA         | `#4a9eff` | `--pm-sba`    | `rgba(74,158,232,0.12)`  |
| Equipment   | `#3fb950` | `--pm-equip`  | `rgba(63,185,80,0.12)`   |
| HELOC       | `#a371f7` | `--pm-heloc`  | `rgba(163,113,247,0.12)` |
| Real Estate | `#e07b54` | `--pm-re`     | `rgba(224,123,84,0.12)`  |
| Bridge      | `#64b5d4` | `--pm-bridge` | `rgba(100,181,212,0.12)` |

**Product badges:** Small inline elements — `font-size: 9px; padding: 1px 6px; border-radius: 3px; background: {bg}; color: {color};`

---

## Appendix A: Key Dimensions

| Element          | Pipeline          | Command Center  |
| ---------------- | ----------------- | --------------- |
| Topbar height    | 42px              | 44px            |
| Card border-left | 3px               | 2-3px top       |
| Border radius    | 8px (var(--r))    | 8px             |
| Column width     | 260px             | N/A (grid)      |
| Panel width      | 700px             | 520px (modal)   |
| Logo size        | 20px              | 24px            |
| Avatar size      | 18px (default)    | 18-22px         |
| Page max-width   | n/a               | 1640px          |
| Page padding     | 0 (full viewport) | 12px 18px       |
| Card gap         | 6px               | 10px (grid gap) |
| Font base        | 13px              | 12px            |

## Appendix B: Animations

**Pipeline:**

- Panel slide: `transition: right .3s ease`
- Overlay fade: `transition: opacity .3s ease`
- Card hover: `transition: border-color .15s, background .15s`
- Toast: `transition: bottom .3s ease, opacity .3s ease`

**Command Center:**

- Role switch slider: `transition: left .3s cubic-bezier(.4,0,.2,1), width .3s`
- Live pip blink: `@keyframes blink { 50% { opacity: .3 } }` — `animation: blink 2s infinite`
- Counter: JS-driven 16ms intervals from 0 → target over specified duration
- Goal bar fill: `transition: width .8s ease`
- View toggle: CSS class swap (`.view.on { display: block }`)
- Toast: `transition: transform .3s, opacity .3s`

## Appendix C: SVG Icons Used

**Pipeline:**

- Check mark (for deal type toggles): inline SVG path
- No other custom SVGs — all icons are emoji

**Command Center:**

- Refresh/requeue icon in RRQ reason tags: `<svg width="8" height="8" viewBox="0 0 16 16">`
- No other custom SVGs — all icons are emoji

## Appendix D: Scrollbar Styling

**Pipeline:**

```css
::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border2);
  border-radius: 4px;
}
```

**Command Center:**

```css
::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}
```
