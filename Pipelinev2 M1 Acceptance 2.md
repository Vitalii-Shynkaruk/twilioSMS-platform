# Pipeline V2 — Fixes Required for M1 Acceptance

**To:** Developer
**From:** JB
**Re:** Pipeline V2 gaps against handoff spec

---

## Anchor — what was binding

The reference standard for everything below is the handoff package you received:

- `extractor-spec.md` — canonical behavior spec
- `scl_pipeline_v11.html` — binding visual target

From `extractor-spec.md` line 388-401, "Visual design target — match the v11 prototype":

> "The v11 prototype (`scl_pipeline_v11.html` in this handoff package) is the **BINDING visual target for all UI work in this spec — not just a reference**. Match its color tokens, badge styling (`.hot-pill`, `.stacking-badge`, `.ai-chip`, `.ai-inline-bar`), banner styling (`.nurture-banner`, `.nu-urg`), quick-log button styling (`.quick-log-row`, `.ql-btn`), card layout density and typography (Geist + Geist Mono fonts), and the dark-elevation scheme (`--bg-elev-1` through `--bg-elev-4`)."
>
> "Where the spec gives a specific color or pattern reference, that reference is canonical — implement to match. Where the spec is silent, defer to the prototype's visual choices rather than inventing new ones. **Production deal cards must look like v11 when this work ships**, with AI badges layered on top of the existing card hierarchy."

This was the standard the handoff established. The fixes below are gaps against this standard.

---

## Fix #1 — AI extractor is not running on note add

Test case: GymTek Academy. Added a rep note containing `"$20k monthly gross"`. The deal modal shows:

- `INDUSTRY ?` — empty placeholder
- `REVENUE ?` — empty placeholder
- `USE ?` — empty placeholder

Re-run AI button: clicked, no badges populate, no observable response.

`"$20k monthly gross"` is the cleanest possible revenue extraction signal. Revenue is the easiest field in the schema. The 15-case golden test set hit 9/15 PERFECT including this exact pattern. If the AI were running, this note would populate badges. It doesn't. The AI is not running.

### What the spec required

`extractor-spec.md` Section B.4 (lines 458-481) provided the exact code to wire the trigger. The spec gave the file location, the function name, and the literal code block:

```ts
if (eventType === 'note_added' || eventType === 'note_updated') {
  extractPipelineSignals({
    dealId,
    inputType: 'rep_note',
    text: newNoteText,
    stageAtTime: deal.stage,
    productAtTime: deal.productType,
  }).catch((err) => logger.error('pipelineAi extract failed', { dealId, err }));
}
```

Same wiring required on `Message.create` for inbound SMS (spec lines 477-485).

### Confirm before fixing

Walk me through the actual state:

1. Is `pipelineAiService.ts` deployed in production?
2. Did the Prisma migration adding `Deal.pipelineAiSignals` and `Deal.pipelineAiUpdatedAt` run on prod?
3. Is the `note_added` / `note_updated` trigger wired in `DealController.updateDeal` per spec B.4?
4. Is the `Message.create` trigger wired for inbound SMS on deals past intake?
5. The Re-run AI button does not populate badges when clicked. Is the endpoint mounted? Is the front-end calling it?
6. Are there any `AI: extractPipelineSignals complete` log lines in production? Spec line 426 required them.

Pipeline V2 is fundamentally an AI-extraction feature. Without the extractor running, the badge UI across the entire pipeline is non-functional and several visible issues below resolve once it does. This is the priority.

---

## Fix #2 — Quick-log buttons (No answer / Texted / Voicemail) don't clear OVERDUE state

Puntilla Distribution. Next action `"Get banks"` shows red `Overdue` pill. Rep clicks **Texted**:

1. Counter increments to `WAITING 1/10` ✓
2. Auto-note "Sent text follow-up" appended ✓
3. **`Overdue` pill remains red** ❌

The auto-nurture mechanic was scoped to fix the mass-overdues problem. Logging a contact attempt that doesn't clear the OVERDUE state defeats the purpose — reps still have to manually edit the action's due date or the pill sits red forever.

### Required behavior

When any contact-attempt button fires (No answer / Texted / Voicemail), `nextActionDue` should auto-bump forward by +1 business day so OVERDUE clears until the new due date.

Pick the implementation:

**Option A:** Auto-bump `nextActionDue` by +1 business day on contact-attempt clicks.

**Option B:** Add a `lastAttemptAt` field on Deal. Render OVERDUE only when `nextActionDue < now() AND lastAttemptAt < nextActionDue`.

Either works. Connected click should clear `nextActionDue` entirely. Not interested moves to NURTURE (already handled).

---

## Fix #3 — Linked Deals UI missing on multi-card clients

Nelson Enterprise Tech Service LLC has both an SBA underwriting card and an MCA offer card on the live pipeline. Opening the deal modal shows no awareness of the sibling. To navigate between them, rep has to close the modal, find the sibling on the board, and click in.

### What v11 required

The Linked Deals UI is fully built into the prototype, which is the binding visual target:

| Element                                                | v11 line         |
| ------------------------------------------------------ | ---------------- |
| `≠ N CARDS` chip on AI badge row                       | line 1182        |
| `LINKED DEALS · N cards for {client}` section in modal | lines 1370-1371  |
| `.linked-deals-grid` CSS with blue left-border accent  | line 337         |
| Sibling row clickable → opens that sibling's modal     | lines 1208, 1237 |
| `+ Add product` button                                 | line 1370        |

The Tatiana Flowers LLC modal in v11 shows the full pattern — three cards listed, active one highlighted, click to navigate.

The data layer exists (`Conversation.leadId` links cards via `Client`). This is a UI/wiring gap.

Per the binding-visual-target language in the spec preamble, this needs to ship on M1.

---

## Fix #4 — Column headers missing previous-offer subtotals

QUALIFIED column header on live shows: `"QUALIFIED 5 [3]"` — just deal counts.

v11 prototype QUALIFIED column header shows: `"2 deals · no $"` PLUS amber `"$40K prev offers"` subtotal beneath.

### What v11 required

Lines 1119-1132 of the prototype hardcode column header rendering with two totals:

```js
let activeTotal = 0,
  ghostTotal = 0;
list.forEach((d) => {
  if (d.machineState === 'NURTURE' && d.prevOffer) ghostTotal += parseAmt(d.prevOffer.amount);
  else if (d.amount) activeTotal += parseAmt(d.amount);
  else if (d.submittedAmt) activeTotal += parseInt(d.submittedAmt);
});
if (activeTotal > 0) head += `<div class="col-amount">${fmtAmt(activeTotal)} ...</div>`;
if (ghostTotal > 0) head += `<div class="col-amount ghost">${fmtAmt(ghostTotal)} prev offers</div>`;
```

CSS class `.prev-offer-pill` at lines 109-110 handles the per-card amber rendering.

### What needs to ship

1. Active total per column: `"$X · N deals"` or `"N deals · no $"` if amounts are null
2. Ghost prev-offer subtotal per column: amber `"$Y prev offers"` — sum of `prevOffer.amount` across NURTURE-state deals in that column
3. Empty column rendering: `"— · 0 deals"`
4. Per-card `.prev-offer-pill` rendering on NURTURE deals with prior offer (v11 line 1186 conditional)

---

## Fix #5 — Prev-offer visibility on NURTURE deals

Current shipped pipeline has 46 deals in the NURTURE column. They're doing two different jobs:

1. Cold leads needing follow-up — no prior engagement, no offer
2. Live deals where an offer was made and the client went silent — real pipeline value

Both render identically. A $500K SBA with a live offer disappears next to a 90-day-cold lead. This kills the visibility on revivable opportunity.

### What needs to ship

Keep NURTURE as a stage. Add visibility on the prev-offer subset:

1. Render `.prev-offer-pill` on NURTURE cards that have a prior offer in DealEvent history (data already exists from `offer_added` events). v11 line 109-110 has the CSS, line 1186 has the render condition.
2. Ghost subtotal in column headers — covered by Fix #4, ship together.
3. Optional: "Ghosted with Offer" filter pill at the board top so all ghost-offer deals across stages show in one click.

---

## Fix #6 — Add Lead form is missing AI natural-language extraction

The current "Add Lead" / "New Deal" modals use traditional form fields. Reps manually fill Business Name, Contact, Phone, Email, Product Type, Amount, Next Action, Due Date, Quick Note. The textarea field exists but has no AI behavior tied to it.

### What v11 required

The v11 prototype Add Lead modal (lines 530-595) has the full natural-language flow:

- Same form fields, plus a "About this lead · use of funds · context" textarea
- Placeholder: `"Type naturally — e.g. 'Cold called client seems interested, $100k monthly gross, Contractor, said parents are in town call back in two weeks'"`
- Live AI preview block fires on `oninput="updateAIPreview()"` showing:
  - **✨ Extracted attributes** — industry, revenue, use_of_funds, urgency, ask
  - **📅 Action + timing** — extracted next action and timing label
- "Load demo text" button to test
- "Create Lead" creates the deal with AI-extracted fields pre-populated

CSS classes referenced: `.cm-textarea`, `.ai-preview-block`, `.ai-preview-section`, `.ai-preview-header`.

### What needs to ship

Use the same `extractPipelineSignals` service from Fix #1 with `inputType: 'rep_note'` to extract from the textarea content as the rep types (debounced). Render the preview block. On Create Lead, pre-populate the deal fields from the extracted values.

This is a UI rewrite of the Add Lead modal that calls the existing service. No new AI integration required — just wire the same extractor to a new entry point. Per the binding-visual-target language, this needs to ship on M1.

Note: the spec's exclusion of "stage transition automation" applies — do NOT include the suggested-routing portion of the v11 Add Lead preview. Stage suggestions were explicitly dropped per spec line 679.

---

## Fix #7 — State pill row missing on cards

Live deal cards do not show a state-pill row indicating ACTIVE/WAITING status with attempt counter.

### What v11 required

`scl_pipeline_v11.html` line 1195:

```js
if (!isFunded && !isClosed)
  html += `<div class="state-line-exec">
  <span class="state-dot sd-${d.machineState.toLowerCase()}"></span>
  <span class="state-label" style="color:${stateColor(d.machineState)}">${d.machineState}</span>
  <span class="state-timing">${isNurture ? d.wakeDate : d.attempts + '/10'}</span>
</div>`;
```

CSS at lines 136-137 (`.state-line-exec`, `.state-dot`).

Each card should show a colored state dot + state label (ACTIVE / WAITING / NURTURE) + timing indicator (`X/10` attempts or wake date for NURTURE). State-pill row also renders inside the deal modal (line 1392 — `.state-pill-row` CSS at line 247).

### What needs to ship

1. Card state-pill row per v11 line 1195 markup, using `stateColor()` helper for the dot + label coloring
2. Modal state-pill row per v11 line 1392 markup
3. Counter format: `{N}/10 attempts` for active deals, wake date for NURTURE deals

Data already exists (`contactAttempts`, `contactAttemptThreshold` from B.10.2 migration).

---

## Fix #8 — Quick Actions block missing in deal modal

Live deal modal shows just a free-text input for next action. v11 prototype shows stage-specific Quick Actions buttons that one-click set common actions for the current stage.

### What v11 required

Line 1392 of the prototype renders the Quick Actions block in the modal:

```html
<div class="qa-block">
  <div class="qa-stage-label">Quick actions · <strong>{stage.name}</strong></div>
  <div class="qa-buttons">
    <!-- stage-specific buttons -->
  </div>
  <input class="qa-input" value="{current action}" />
  <div class="qa-date-row">
    <button class="qa-date-pill">Today</button>
    <button class="qa-date-pill">Tomorrow</button>
    <button class="qa-date-pill on">This week</button>
    <button class="qa-date-pill">Future date</button>
    <button class="qa-set">Set Action</button>
  </div>
</div>
```

Stage-specific button definitions are in v11 lines 705-712 (`QUICK_ACTIONS` const):

```js
engaged:   ['Send Follow Up', 'Get docs', 'Schedule call'],
qualified: ['Submit application', 'Get remaining docs', 'Verify revenue'],
submitted: ['Follow Up With Lender', 'Collect Remaining Docs', 'Book Newtek Call'],
approved:  ['Call Client - Present Offer', 'Collect DL/VC', 'Get Decision'],
committed: ['Send PSF', 'Get Docs Signed', 'Schedule funding call'],
funded:    ['Renewal check-in', 'Schedule review']
```

### What needs to ship

1. Quick Actions button row per stage, populating the action input on click
2. Date quick-pills (Today / Tomorrow / This week / Future date) under the action input
3. "Set Action" button that commits the action + due date together
4. Stage label header showing which stage the buttons apply to

This eliminates manual typing of standard next-actions and reduces the "what should I do next" friction.

---

## Fix #9 — Funding History tab is empty

The Funding History tab exists in the live deal modal (visible in screenshots) but contains no content. v11 prototype renders prior funded rounds in this tab when the client has returning history.

### What v11 required

Lines 1325-1326 of the prototype:

```js
if (client.returningCount === 0 && d.machineState !== 'FUNDED')
  return `<div class="section">
    <div class="section-label">Funding History</div>
    <div style="padding:40px 20px;text-align:center;color:var(--txt-tertiary)">
      No funding history yet
    </div>
  </div>`;

return `<div class="section">
  <div class="section-label">Funding History · ${client.returningCount}x prior</div>
  <div class="detail-section">
    {funded amount, date, lender details}
  </div>
</div>`;
```

For FUNDED deals, the section shows amount + date + lender in a detail grid. For non-FUNDED returning customers, it shows a count of prior rounds with summary text.

### What needs to ship

1. Empty state when client has no funding history: "No funding history yet"
2. Returning customer state when `returningCount > 0`: show count + summary list of prior funded rounds
3. Each prior round shows: funded amount, funding date, lender name
4. Data source: query existing FUNDED-stage deals for the same Client

This is critical for repeat-customer workflows. SCL's bigger margin opportunities are returning borrowers — without this tab, reps are blind to the client's actual funding history when prepping a new round.

---

## Fix #10 — Card visual hierarchy: layering rule for v11 + production functions

The deal cards in live production do not match v11's visual standard. This is the foundational gap that affects every card on the board, beyond the specific missing elements in Fixes #3-9.

### Layering rule

The v11 prototype defines the visual hierarchy and styling. Production retains its existing rep-assignment, offer management, and stage-change functions. Where v11 has an AI badge that duplicates a manual data field in production, the manual field is removed — the AI badge replaces it.

### Card hierarchy order (top to bottom)

1. Business name + contact info
2. AI badge row — INDUSTRY, REVENUE, USE OF FUNDS, URGENCY, ASK, position state (1ST POSITION / 1-POSITION / 2-POSITIONS / N-STACKED), HOT pill, RETURNING · Nx FUNDED chip, ≠ N CARDS chip
3. Stage + product chip row (existing)
4. Next action input + date pills + Quick Actions block (Fix #8)
5. Quick-log buttons row + WAITING X/Y attempt counter (existing from auto-nurture)
6. Notes section
7. Client Notes
8. Deal Details
9. Lender Offers / Add Offer section (existing production function — keep)
10. Rep assignment (existing production function — keep)

### Manual fields to REMOVE (replaced by AI badges)

These fields are currently rendering as manual data-entry inputs in the live build. Remove the manual UI — the AI badges from Fix #1 serve as the canonical display for these values:

- Monthly Revenue (replaced by REVENUE badge)
- Industry (replaced by INDUSTRY badge)
- Use of Funds (replaced by USE OF FUNDS badge)
- Urgency / heat scoring beyond HOT pill (replaced by URGENCY badge)
- Position / stacking status (replaced by position chip)

For fields that have AI suggestion + manual override per spec B.7 (`dealAmount`, `productType`, `nextAction`), the manual control stays — the AI suggestion appears as a pre-fill suggestion only, never silently overwrites manual input.

### Production functions to PRESERVE

Existing production functions stay in place. v11 did not model these because v11 was a visual prototype, not a feature spec:

- Primary rep assignment
- Assisting rep assignment
- Add Offer / lender offers management
- Stage change controls
- Any other existing production-only function not addressed by v11 or this doc

### Visual styling specifics

Match v11 across all cards:

- Card padding/density: 10-11px padding, 6px border radius, `--bg-elev-2` background
- Typography: Geist + Geist Mono fonts (v11 line 9 loads from Google Fonts)
- Color tokens: v11 lines 11-31 `:root` block (`--bg-elev-1` through `--bg-elev-4`, `--violet`, `--rose`, `--emerald`, `--amber`)
- Dollar amount styling: Geist Mono weight 600, color-coded by state (cyan active / amber waiting / emerald funded)
- Product icons per v11 line 688 (`PRODUCT_ICONS` const): MCA:⚡, LOC:🔄, EQUIPMENT:🔧, HELOC:🏡, SBA:🏛, CRE:🏢. Used on cards, modal product pills, linked deals grid, and revive queue.
- NEW LEAD column empty state: "Empty by default. Manually-assigned leads from admin land here. Reps move to Engaged on first contact."

Reference v11 lines: 11-31 (root tokens), 87-100 (card base), 109-112 (badges), 1166-1200 (card render logic).

---

## What I need from you

1. Confirmation on the diagnostic questions in Fix #1 (items 1-6) — start there, since most of the visible UI gaps below depend on the AI extractor running.
2. ETA per fix. If any of these need clarification or the read is different from yours, push back now — better to align before build than mid-build.
3. These fixes together constitute M1 acceptance for the Pipeline V2 portion. Login/Auth is a separate review.
