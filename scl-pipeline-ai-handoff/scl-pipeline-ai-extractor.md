# SCL Pipeline AI Extractor — Handoff Draft

**Status:** draft v0.1 — for review with Developer. Not deployed. Not tested against the corpus.
**Local-only artifact.** Lives in `~/Desktop/scl-handoff-pipeline/`. Not committed to any repo.

## 1. Purpose

Extract structured deal-enrichment signals from rep notes and inbound client SMS, to populate the deal card sidebar in the SCL pipeline UI.

This is **separate from and additive to** the existing Inbox AI (`server/src/services/aiService.ts:classifyInbound` on the production snapshot, last shipped 2026-04-29). The Inbox AI classifies inbound SMS for the messaging interface — HOT/WARM/NURTURE/DEAD intent, follow-up time, suggested reply. The Pipeline AI focuses on **deal-card enrichment**: stacking detection, use-of-funds, suggested stage routing, negotiation state, rep action items.

It runs **incrementally**: each new note or message updates a running `ai_signals` blob stored on the deal card. The model receives the current blob plus the new input, and returns the full updated blob.

## 2. Non-goals (deliberately out of scope)

- **Compliance / DNC / hostile-intent flagging.** Handled upstream by `complianceService.ts` and Inbox AI. By the time a deal is in the pipeline, it's intentional. No `escalate` flag.
- **Replying to clients.** That's the Inbox AI's `suggestedReply`.
- **Auto-applying stage changes.** Advisory only — see §6.
- **Facts about reps.** This AI is `_extraction_scope: "lead_only"`. Rep references are ignored.
- **Rep ownership changes.** This AI never writes, infers, transfers, or cleans up `Deal.assignedRepId` or `Deal.assistingRepIds`.
- **Re-classifying every inbound SMS.** Trigger only when (a) a rep adds a note, (b) the deal stage changes, or (c) a substantive client reply arrives on a deal already in the pipeline. Don't re-run on cold inbound — that's the Inbox AI's lane.

## 2.1 Preservation requirement — Rep Ownership

The following existing platform behaviors are locked and must remain functionally identical after Pipeline AI v1 ships:

- `Deal.assignedRepId` (primary rep) read/write paths remain unchanged.
- `Deal.assistingRepIds` (JSON array of secondary reps) read/write paths remain unchanged.
- Deal sharing flow remains unchanged: primary rep can add assisting reps without admin involvement, including deals in `NURTURE`.
- The Inbox action row keeps the existing `Assign Rep` button.
- The Inbox right-panel `CONTACT` tab keeps the structured `Assigned Rep` field.
- Rep avatar/chip rendering remains visible on cards where assignment data exists in both Admin and My Convs views.
- Inbox Admin view / My Convs scoping remains unchanged: admins/managers can toggle; non-admin reps are locked to My Convs.
- Pipeline view scoping remains unchanged: admins can view all; reps see primary + assisting deals only.
- Pipeline AI badges are deal-level facts, not viewer-scoped facts.
- AI extraction may read notes from primary and assisting reps, but it must never infer or modify rep ownership.
- Auto-reassignment between reps is explicitly out of scope.

## 3. Inputs

The harness assembles a single text payload with three sections, in order:

```
[EXISTING SIGNALS]
{ ...JSON of current deal.ai_signals, or "(none)" if first extraction... }

[NEW INPUT]
type: rep_note | client_sms
stage_at_time: NEW_LEAD | ENGAGED_INTERESTED | QUALIFIED | SUBMITTED_IN_REVIEW | APPROVED_OFFERS | COMMITTED_FUNDING | FUNDED | NURTURE | CLOSED | (none)
product_at_time: MCA | LOC | HELOC | SBA | EQUIPMENT | CRE | BRIDGE | (none)
text: |
  ...PII-redacted free text of the new note or SMS...
```

Notes:

- **Existing signals are optional context, not assumed input.** Deals that arrived via inbound SMS may have signals from the Inbox AI. Manually-entered deals have none. The Pipeline AI must handle both.
- **PII is already redacted upstream.** Tokens like `[NAME]`, `[BANK]`, `[LENDER]`, `[EMAIL]`, `[PHONE]`, `[LOCATION]`, `[EMPLOYER]`, `[BIZ]`, `[URL]`, `[NUM]` may appear in `text`. Treat them as opaque placeholders — extract their _presence_ but never invent the underlying value.

## 4. System Prompt

```
You extract structured signals from rep notes and inbound client SMS in a small-business lending CRM, to enrich a deal card. You receive (a) any existing signals previously extracted on this deal, and (b) one new note or message. You return a single updated signals object representing the full picture.

ROLE BOUNDARY (lead_only scope):
Extract only facts about the LEAD (the borrower / applicant). Ignore any statements about reps' actions or other reps. Examples of statements to IGNORE because they describe rep activity, not the lead:
- "[NAME] was last to submit 1/3/2025"     (rep submission tracking)
- "[NAME] help"                              (rep handoff)
- "[NAME] brought in last year"              (rep referral)
- "Sent [NAME] a HELOC approval"             (rep action)
- "[NAME] requested the contracts"           (rep action)
- "STAY IN HIS EARR"                         (rep self-instruction)

If the only content of an input is rep-action references, return skip_reason="unrelated" with all extracted fields at empty/default.

INHERITANCE (existing signals as optional input):
- Deals routed from SMS may already carry signals extracted upstream by the SMS Inbox AI. When [EXISTING SIGNALS] is present, treat those signals as starting state — preserve them in your output unless the new input contradicts them.
- Manually-entered deals will have [EXISTING SIGNALS] (none). Extract everything from scratch from the new input.
- Same prompt handles both. Do not assume existing signals are present.

MERGE RULES (combining existing signals with new input):
1. If existing signals are present and the new input does not contradict them, preserve them.
2. If existing signals are present and the new input contradicts them, the new input WINS — but only when:
   - The new input is a rep_note, OR
   - The new input is a client_sms whose contradiction is explicit and unambiguous.
3. When existing signals are absent, extract everything from scratch from the new input.
4. Rep notes outrank prior client SMS on facts about the lead. Client SMS outranks prior signals only when the client states something explicit.
5. Never delete a previously-extracted field unless the new input explicitly invalidates it. Silence is not contradiction.

SKIP CONDITIONS (set skip_reason; return all extracted fields at empty/default):
- "contact_info_only": input is just an email, phone, or other PII placeholder with no other signal (e.g., "[EMAIL]")
- "too_short": fewer than ~5 meaningful words; insufficient signal (e.g., "Have not received yet")
- "unrelated": input is about reps, not the lead, OR off-topic chitchat
- "unintelligible": gibberish, severe typos with no recoverable meaning, or pure profanity
- "no_signal": input is substantive (long enough, on-topic, intelligible) but yields no extractable fields against this schema

When skip_reason is non-null, all extracted fields must be at their empty-default values:
- industry=""
- monthly_revenue=null, use_of_funds=null, requested_amount=null
- product_interest=[], pending_actions=[]
- has_stacked_history=false
- current_active_positions=null
- recent_stacking_activity={"active": false, "window": null}

REDACTION TOKENS:
Bracketed tokens are opaque PII placeholders applied upstream. Treat them as:
- [NAME]      → presence of a person name, value unknown
- [LENDER]    → presence of a lender name, value unknown (counts as a stacking signal when paired with an amount/frequency)
- [BANK]      → presence of a bank name, value unknown
- [BIZ]       → presence of a business name, value unknown
- [EMAIL], [PHONE], [URL], [LOCATION], [EMPLOYER], [NUM] → presence only
Never copy a bracket token into a string field as if it were the underlying value.

NON-NULLABLE FIELDS:
- industry → empty string "" when unknown (freeform string, NOT enum — e.g. "Logistics", "Commercial real estate")
- has_stacked_history → false when no stacking signal is present
- recent_stacking_activity → always present as an object {active, window}; set active=false and window=null when no recent stacking signal

PRODUCT TYPE MAPPING:
Canonical enum: MCA, LOC, HELOC, SBA, EQUIPMENT, CRE, BRIDGE.
product_interest is an array. Multi-product extraction is correct when multiple products are signaled in a single input. Pattern: an SBA application that mentions specific equipment ("roll off truck", "3 vehicles") → ["SBA", "EQUIPMENT"]. The product_at_time context counts as one signal; specific item mentions add additional products. Don't collapse to a single value just because product_at_time is set.
Map common synonyms:
- "data merch" → MCA
- "line of credit" → LOC
- "HELOC", "home equity" → HELOC
- "SBA" → SBA
- "Semi Truck", "daycab", "roll off truck", "vehicles" → EQUIPMENT (and surface specifics in use_of_funds.detail)
- "appraisal" + refi/mortgage language → HELOC
- "weekly" / "daily" payment language without other context → MCA (frequency is canonical MCA signal)

NUMBER CANONICALIZATION:
Money is given in many shapes: "210k", "11K", "1M+", "6m", "50M", "20-30k", "$110k+", "$500,000", "1990", "330.000k", "5k". For any money field, return both:
- value_usd: integer in dollars (e.g., 210000)
- raw: original string
For ranges ("20-30k"), use the midpoint as value_usd and keep the raw string.
For open-ended ("$110k+"), use the floor as value_usd.
For ambiguous ("330.000k" — could be 330k or 330000k), prefer the smaller plausible interpretation.

USE_OF_FUNDS vs PENDING_ACTIONS:
- use_of_funds.detail: WHAT the funds will be used for — the lead's stated purpose, including future ambitions ("3 more vehicles", "expand to a 2nd location"). Write it as a noun phrase.
- pending_actions: discrete next steps that must happen for the deal to advance, with a named actor and optional timing. Format: { actor: "rep" | "lead", action: "...", timing: "today" | "this_week" | "next_week" | "later" | null }. Examples: { actor: "lead", action: "send last 3 bank statements", timing: null }, { actor: "rep", action: "follow up Monday", timing: "next_week" }. Only set timing when the input names a specific window.
- Future ambition without a discrete next action ("wants 3 more vehicles") goes in use_of_funds.detail, NOT pending_actions.

STACKING DETECTION (three independent fields):
Stacking = the lead carries, currently carries, or has recently taken multiple concurrent funded loan positions (typically MCAs).

1. has_stacked_history (boolean):
   The borrower has stacked at SOME POINT — past or present. Set true on any prior multi-position activity, even if currently paid down. Examples: "had 3 MCAs last year, paid off", "previously stacked", "old [LENDER] balances paid".
   Set false when no stacking signal at all is present. Default: false.

2. current_active_positions (object | null):
   The borrower is CURRENTLY paying multiple positions. Return null if not stacked right now or unknown.
   When set, return:
   - count (integer | null): the explicit number of active positions if stated; null if implied but not numbered
   - total_debt_usd (integer | null): integer dollars of outstanding stacked debt if stated; null otherwise
   Trigger phrases: "X positions", "X-stacked", "X active MCAs", "in Nth position", "has 2 mca", "currently paying [LENDER1] and [LENDER2]", "stacked", lists of [LENDER] - $X frequency entries.
   has_stacked_history MUST be true whenever current_active_positions is non-null.

3. recent_stacking_activity (object, always present):
   The borrower is ACTIVELY stacking — taking new loans on top of existing ones, recently.
   Fields:
   - active (boolean): true if input describes a new loan taken on top of prior positions within roughly 30-90 days; false otherwise
   - window ("last_30d" | "last_60d" | "last_90d" | null): the stated/implied recency window, or null if active but unstated
   Trigger phrases: "took another loan two weeks ago", "got a new MCA last month on top of...", "just signed a 4th position", "recently stacked", "added a position this week".
   When active=true, has_stacked_history MUST be true.

These three fields are independent. Possible combinations:
- All clean: has_stacked_history=false, current_active_positions=null, recent_stacking_activity={active:false, window:null}
- Past stacker, clean now: has_stacked_history=true, current_active_positions=null, recent_stacking_activity={active:false, window:null}
- Currently stacked, no recent change: has_stacked_history=true, current_active_positions={...}, recent_stacking_activity={active:false, window:null}
- Actively stacking: has_stacked_history=true, current_active_positions={...}, recent_stacking_activity={active:true, window:"last_30d"}

OUTPUT:
Return a single JSON object matching the provided schema. Strict JSON. No prose, no markdown fences, no commentary.
```

## 5. Output JSON Schema

Schema is strict (`additionalProperties: false` everywhere, all properties required, no unsupported constraints). Compatible with Anthropic structured outputs (`output_config.format: { type: "json_schema", schema: ... }`).

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "_extraction_scope",
    "skip_reason",
    "industry",
    "monthly_revenue",
    "use_of_funds",
    "requested_amount",
    "product_interest",
    "pending_actions",
    "has_stacked_history",
    "current_active_positions",
    "recent_stacking_activity"
  ],
  "properties": {
    "_extraction_scope": { "const": "lead_only" },

    "skip_reason": {
      "anyOf": [
        { "type": "null" },
        { "type": "string", "enum": ["contact_info_only", "too_short", "unrelated", "unintelligible", "no_signal"] }
      ]
    },

    "industry": { "type": "string" },

    "monthly_revenue": {
      "anyOf": [
        { "type": "null" },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["value_usd", "raw"],
          "properties": {
            "value_usd": { "type": "integer" },
            "raw": { "type": "string" }
          }
        }
      ]
    },

    "use_of_funds": {
      "anyOf": [
        { "type": "null" },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["category", "detail"],
          "properties": {
            "category": {
              "enum": ["equipment", "working_capital", "debt_consolidation", "real_estate", "expansion", "unspecified"]
            },
            "detail": { "type": ["string", "null"] }
          }
        }
      ]
    },

    "requested_amount": {
      "anyOf": [
        { "type": "null" },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["value_usd", "raw"],
          "properties": {
            "value_usd": { "type": "integer" },
            "raw": { "type": "string" }
          }
        }
      ]
    },

    "product_interest": {
      "type": "array",
      "items": { "enum": ["MCA", "LOC", "HELOC", "SBA", "EQUIPMENT", "CRE", "BRIDGE"] }
    },

    "pending_actions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["actor", "action", "timing"],
        "properties": {
          "actor": { "enum": ["rep", "lead"] },
          "action": { "type": "string" },
          "timing": {
            "anyOf": [{ "type": "null" }, { "type": "string", "enum": ["today", "this_week", "next_week", "later"] }]
          }
        }
      }
    },

    "has_stacked_history": { "type": "boolean" },

    "current_active_positions": {
      "anyOf": [
        { "type": "null" },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["count", "total_debt_usd"],
          "properties": {
            "count": { "type": ["integer", "null"] },
            "total_debt_usd": { "type": ["integer", "null"] }
          }
        }
      ]
    },

    "recent_stacking_activity": {
      "type": "object",
      "additionalProperties": false,
      "required": ["active", "window"],
      "properties": {
        "active": { "type": "boolean" },
        "window": {
          "anyOf": [{ "type": "null" }, { "type": "string", "enum": ["last_30d", "last_60d", "last_90d"] }]
        }
      }
    }
  }
}
```

## 6. Worked Examples (drawn from the cleaned 80-row corpus)

### Example A — rep note with two stacked positions (currently active)

**Input:**

```
[EXISTING SIGNALS] (none)
[NEW INPUT]
type: rep_note
stage_at_time: APPROVED_OFFERS
product_at_time: MCA
text: |
  [LENDER] - $500 weekly // [LENDER] - $725 weekly
```

**Expected output:**

```json
{
  "_extraction_scope": "lead_only",
  "skip_reason": null,
  "industry": "",
  "monthly_revenue": null,
  "use_of_funds": null,
  "requested_amount": null,
  "product_interest": ["MCA"],
  "pending_actions": [],
  "has_stacked_history": true,
  "current_active_positions": { "count": 2, "total_debt_usd": null },
  "recent_stacking_activity": { "active": false, "window": null }
}
```

(Two unambiguous lender-amount-frequency triples → currently stacked at count=2. Total debt not stated. No recency signal in the input → recent_stacking_activity.active=false. has_stacked_history is true because the lead is currently stacked.)

### Example B — rep note with debt + ask + multi-product use-of-funds

**Input:**

```
[NEW INPUT]
type: rep_note
stage_at_time: NURTURE
product_at_time: SBA
text: |
  210k in debt wants 375k - wants equipment 3 more clients and a roll off truck -
```

**Expected output:**

```json
{
  "_extraction_scope": "lead_only",
  "skip_reason": null,
  "industry": "",
  "monthly_revenue": null,
  "use_of_funds": {
    "category": "equipment",
    "detail": "3 vehicles + roll off truck"
  },
  "requested_amount": { "value_usd": 375000, "raw": "375k" },
  "product_interest": ["SBA", "EQUIPMENT"],
  "pending_actions": [],
  "has_stacked_history": true,
  "current_active_positions": { "count": null, "total_debt_usd": 210000 },
  "recent_stacking_activity": { "active": false, "window": null }
}
```

(Multi-product: SBA from product_at_time context + EQUIPMENT from "roll off truck". "210k in debt" implies currently-carried debt → current_active_positions.total_debt_usd=210000 with count=null since the number of positions isn't itemized. has_stacked_history=true follows from current_active_positions being non-null. "wants 3 more vehicles" is a future ambition — captured in use_of_funds.detail, not pending_actions.)

### Example C — inbound SMS that is just a redacted email (skip)

**Input:**

```
[NEW INPUT]
type: client_sms
stage_at_time: (none)
product_at_time: (none)
text: |
  [EMAIL]
```

**Expected output:**

```json
{
  "_extraction_scope": "lead_only",
  "skip_reason": "contact_info_only",
  "industry": "",
  "monthly_revenue": null,
  "use_of_funds": null,
  "requested_amount": null,
  "product_interest": [],
  "pending_actions": [],
  "has_stacked_history": false,
  "current_active_positions": null,
  "recent_stacking_activity": { "active": false, "window": null }
}
```

(All extracted fields at empty/default per skip-condition rule.)

### Example D — lead-only scope: rep reference must be ignored

**Input:**

```
[NEW INPUT]
type: rep_note
stage_at_time: (none)
product_at_time: (none)
text: |
  Does $110k+ monthly, [NAME] was last to submit 1/3/2025
```

**Expected output:**

```json
{
  "_extraction_scope": "lead_only",
  "skip_reason": null,
  "industry": "",
  "monthly_revenue": { "value_usd": 110000, "raw": "$110k+ monthly" },
  "use_of_funds": null,
  "requested_amount": null,
  "product_interest": [],
  "pending_actions": [],
  "has_stacked_history": false,
  "current_active_positions": null,
  "recent_stacking_activity": { "active": false, "window": null }
}
```

(The `[NAME] was last to submit` clause is a rep-tracking reference — ignored. Only the revenue is extracted.)

### Example E — inheritance: upstream Inbox AI signals preserved + new SMS adds timed action

**Input:**

```
[EXISTING SIGNALS]
{ "industry": "Logistics", "monthly_revenue": { "value_usd": 200000, "raw": "$200k/mo" }, "product_interest": ["MCA"] }

[NEW INPUT]
type: client_sms
stage_at_time: QUALIFIED
product_at_time: MCA
text: |
  Sorry busy this week, hit me back next Monday
```

**Expected output:**

```json
{
  "_extraction_scope": "lead_only",
  "skip_reason": null,
  "industry": "Logistics",
  "monthly_revenue": { "value_usd": 200000, "raw": "$200k/mo" },
  "use_of_funds": null,
  "requested_amount": null,
  "product_interest": ["MCA"],
  "pending_actions": [{ "actor": "rep", "action": "follow up", "timing": "next_week" }],
  "has_stacked_history": false,
  "current_active_positions": null,
  "recent_stacking_activity": { "active": false, "window": null }
}
```

(Inheritance rule: upstream signals (industry, monthly_revenue, product_interest) preserved verbatim — the new SMS doesn't contradict them. The deferral phrase produces a single timed pending_action for the rep. Stacking signals all default since the input mentions none.)

### Example F — actively stacking: rep note with recent window

**Input:**

```
[NEW INPUT]
type: rep_note
stage_at_time: QUALIFIED
product_at_time: MCA
text: |
  Currently on 3 [LENDER] positions paying about $4500/week, took the last one 2 weeks ago. wants 100k consolidation
```

**Expected output:**

```json
{
  "_extraction_scope": "lead_only",
  "skip_reason": null,
  "industry": "",
  "monthly_revenue": null,
  "use_of_funds": {
    "category": "debt_consolidation",
    "detail": "consolidate 3 active MCA positions"
  },
  "requested_amount": { "value_usd": 100000, "raw": "100k" },
  "product_interest": ["MCA"],
  "pending_actions": [],
  "has_stacked_history": true,
  "current_active_positions": { "count": 3, "total_debt_usd": null },
  "recent_stacking_activity": { "active": true, "window": "last_30d" }
}
```

(All three stacking fields fire: history (currently stacked), current_active_positions (count=3 stated, total_debt unknown — $4500/week is a payment cadence, not a balance), recent_stacking_activity (took the last one 2 weeks ago → last_30d). Use-of-funds category=debt_consolidation. Requested amount captured.)

## 7. Integration Notes for Developer

### Decisions captured before testing (settled with Jonathan)

- **Scope locked to display-driving fields only.** Schema extracts only what production deal-card UI renders today, plus the three priority badges (industry, monthly_revenue, use_of_funds). Stage routing is OUT entirely — deferred indefinitely.
- **`industry`**: freeform string, non-nullable. Not an enum. Reps express nuance ("trucking and logistics", "commercial real estate w/ marina") that an enum would flatten. Empty string when unknown.
- **`skip_reason`**: includes `no_signal` for substantive-but-empty inputs. Final enum: `contact_info_only | too_short | unrelated | unintelligible | no_signal | null`.
- **Stacking split into three independent fields.** `has_stacked_history` (boolean — past or present), `current_active_positions` (object — paying multiple right now), `recent_stacking_activity` (object — took new loans recently). All three are independent and can fire in any combination.
- **`pending_actions[*].timing`** absorbs what was previously a separate `requested_followup` field. Each pending action carries its own optional timing.
- **No confidence framework in this version.** Confidence existed in earlier drafts on `existing_positions` / `suggested_stage` / `urgency` — all three of those fields are gone. Add confidence back later only if reps need it for trust calibration on stacking detection.

### Where it fits in the live snapshot

**Confirmed scope — fields that map to existing production UI:**

- `requested_amount` → pre-fills `deal.dealAmount`
- `product_interest[0]` → pre-fills `deal.productType` (display today is single-value; multi-product extraction surfaces the additional interest for future UI)
- `pending_actions[0]` → pre-fills `deal.nextAction` + `deal.nextActionDue` (timing maps to a date range)
- `monthly_revenue` → pre-fills `client.monthlyRevenue` (manual pill selector today)

**Priority badges — new UI work:**

- `industry` → industry badge on deal card (new; field exists on Client type but not rendered in pipeline)
- `monthly_revenue` chip → already-rendered field, AI just pre-populates
- `use_of_funds` chip → new badge on deal card

**Stacking signals — new UI work (highest novelty):**

- `has_stacked_history` → "Stacked before" indicator
- `current_active_positions` → stacking-badge (`2-STACKED`, count + optional total debt)
- `recent_stacking_activity.active` → "Active stacking" warning chip with window label

**NOT in scope for the AI prompt (Developer integration work):**

- Wiring `requested_amount.value_usd` → `deal.dealAmount` update
- Wiring `pending_actions[0]` → `deal.nextAction` / `deal.nextActionDue`
- Resolving `pending_actions[*].timing` enum → concrete dates ("next_week" → next Monday)
- Rendering badges, chips, warning pills
- Storage layer (new `pipelineAiSignals Json?` column on Deal, or reuse pattern)
- Trigger conditions (when to invoke this prompt)

### Model recommendation

- **Default: `claude-opus-4-7` or `claude-sonnet-4-6`.** The catalog showed enough subtext (rep slang like "sauced him up", contradiction handling, lead vs rep references, multi-signal merging) that Haiku 4.5 alone may underperform.
- **Test both** against the 80-row corpus before deciding. Haiku's win is cost — at ~80 rows/run/deal the cost difference is meaningful at scale.
- Use `output_config.format` with the schema for guaranteed JSON shape. Same pattern Developer's existing `classifyInbound` uses.
- Use `cache_control: { type: "ephemeral" }` on the system prompt block — it's substantial (~3-4KB) and runs many times. Verify cache hits via `usage.cache_read_input_tokens`.

### Advisory-only constraint (Q3)

- The `suggested_stage` field is advisory. The deal card UI shows a banner when `suggested_stage.confidence >= 0.75`; the rep clicks to apply.
- **Do not auto-write to `Deal.stage` programmatically.** The unguarded `updateDeal` path at `dealController.ts:608-998` accepts arbitrary stage strings without validating them against `STAGE_ORDER`. Plug that gap (mirror the validation from `moveDeal` at `:1001-1180`) **before** any auto-apply mode.
- When the rep approves the suggestion, route through `moveDeal`, not `updateDeal`.

### Trigger discipline

- **Trigger on note creation** (highest signal density)
- **Trigger on stage change** (rebuild summary against the new context)
- **Trigger on substantive client reply** (not all inbounds — the Inbox AI already handles cold inbound and `[EMAIL]`-only replies)
- **Don't trigger on every inbound SMS.** Most inbounds either (a) get classified by the Inbox AI for the messaging UI, or (b) are `contact_info_only` empties that the Pipeline AI would just skip-reason anyway. Wasted compute.

### Schema validation failures

- If the model returns invalid JSON (rare with `output_config.format`, but possible), retry once with the same input. If retry fails, log + skip — do not write a malformed signals blob to the deal card.
- If `_extraction_scope !== "lead_only"`, treat as a validation failure. The const should be unmissable but worth a defensive check.

## 8. What's NOT yet done

- No code (no Python harness, no integration script)
- No tests against the 80-row corpus
- No model selection (Opus vs Sonnet vs Haiku — needs an empirical bake-off)
- No cost projection at scale
- Nothing on production. Nothing committed.

When you approve this draft, the next step is a local test harness that runs each of the 80 rows through the schema and dumps a side-by-side review CSV — still local, still no production.
