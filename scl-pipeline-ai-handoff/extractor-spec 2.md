# Pipeline AI Extractor — Integration Spec

**Status:** ready for implementation
**Audience:** Developer — extends the SMS Inbox AI you already shipped
**Reference doc:** `scl-pipeline-ai-extractor.md` (canonical prompt + schema)

---

This package mirrors the SMS Inbox AI scope Developer shipped previously. The AI extractor service is a parallel of `aiService.ts` with a different prompt target. The genuinely new work is the badge UI components and the auto-nurture attempt-counter mechanic. The handoff includes the canonical prompt, schema, 15 golden test fixtures, and a reference grader script — Developer's integration is verified by reproducing the same field-level outputs.

---

## 1. Overview

A second AI extractor parallel to `server/src/services/aiService.ts:classifyInbound`. Same model (Sonnet 4.5), same Anthropic API surface, same prompt-caching pattern. Different scope.

|               | **Inbox AI** (existing)                                    | **Pipeline AI** (this spec)                                                 |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Trigger       | Inbound SMS arrives                                        | Note added/updated on a deal, OR client SMS lands on a deal in active stage |
| Scope         | Conversation-level routing & reply suggestion              | Deal-card enrichment (badges, stacking detection)                           |
| Output target | `Conversation.aiSignals` / `Conversation.aiClassification` | new `Deal.pipelineAiSignals` JSONB                                          |
| UI consumer   | `InboxPageV2`, `components/inbox/AIBanner`                 | new badges + chips on `DealCard` and `DealPanel`                            |

**Critical scope rule the prompt enforces:** `_extraction_scope: "lead_only"`. The model ignores rep-action language ("[NAME] requested contracts", "STAY IN HIS EARR"). It extracts only facts about the borrower. Verified against a 15-case golden test set; do not relax it.

**Inheritance:** for deals routed from SMS, the model accepts `[EXISTING SIGNALS]` (the upstream Inbox AI's output) as starting state and merges new note content into it. For manually-entered deals, existing signals are absent and the model extracts from scratch. Same prompt handles both — see A.4.

**Decisions already made:**

- **Existing-signals payload format:** `JSON.stringify` the prior signals blob (either `deal.pipelineAiSignals` or upstream `conversation.aiSignals`) and emit it between `[EXISTING SIGNALS]` and `[NEW INPUT]` markers. If neither exists, emit the literal string `(none)`.
- **Concurrency:** serialize per-deal extractions via an in-memory queue keyed by `dealId`. Two notes back-to-back on the same deal must not run in parallel; the second waits for the first to write `pipelineAiSignals` before reading it as starting state.
- **Re-run AI button:** included in v1. Wires to the `POST /api/ai/extract-pipeline` endpoint with the most recent note as input.
- **Storage:** JSONB column on `Deal`. No separate audit table.
- **Industry / use_of_funds / timing remain freeform / enum as defined in the schema.** Do not add normalization layers, lookup tables, or enum tightening in v1.

---

# PART A — What is already built (in this handoff package)

The contract below has been designed, prompt-engineered, and validated against a 15-case golden test set. **Do not paraphrase, restructure, or "improve" any of it.** Production parity with the validation results depends on byte-for-byte match of the prompt, schema, and payload format.

## A.1 System prompt (verbatim)

Wrap this in a constant in `pipelineAiService.ts`. Pass as the `system` block with `cache_control: { type: 'ephemeral' }` — same caching pattern as `classifyInbound`.

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

## A.2 JSON Schema (verbatim)

Pass as `output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } }` on the `messages.create` call. Schema is strict (`additionalProperties: false`, all fields required) and sits at 10 union sites — well under Anthropic's 16-union strict-mode limit. Do not extend with new nullable wrappers; use sentinel values (`industry=""`, `has_stacked_history=false`).

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

## A.3 TypeScript type

Add to `client/src/types/index.ts` next to the existing `AISignals` type. Keep them distinct — they have overlapping field names (`industry`, `urgency`) but different semantics; do not unify.

```ts
export type PipelineAiSignals = {
  _extraction_scope: 'lead_only';
  skip_reason: 'contact_info_only' | 'too_short' | 'unrelated' | 'unintelligible' | 'no_signal' | null;
  industry: string;
  monthly_revenue: { value_usd: number; raw: string } | null;
  use_of_funds: {
    category: 'equipment' | 'working_capital' | 'debt_consolidation' | 'real_estate' | 'expansion' | 'unspecified';
    detail: string | null;
  } | null;
  requested_amount: { value_usd: number; raw: string } | null;
  product_interest: Array<'MCA' | 'LOC' | 'HELOC' | 'SBA' | 'EQUIPMENT' | 'CRE' | 'BRIDGE'>;
  pending_actions: Array<{
    actor: 'rep' | 'lead';
    action: string;
    timing: 'today' | 'this_week' | 'next_week' | 'later' | null;
  }>;
  has_stacked_history: boolean;
  current_active_positions: { count: number | null; total_debt_usd: number | null } | null;
  recent_stacking_activity: {
    active: boolean;
    window: 'last_30d' | 'last_60d' | 'last_90d' | null;
  };
};
```

## A.4 Payload format (user message)

```
[EXISTING SIGNALS]
{ ...JSON.stringify of prior signals blob, or "(none)" if first extraction... }

[NEW INPUT]
type: rep_note | client_sms
stage_at_time: NEW_LEAD | ENGAGED_INTERESTED | QUALIFIED | SUBMITTED_IN_REVIEW | APPROVED_OFFERS | COMMITTED_FUNDING | FUNDED | NURTURE | CLOSED | (none)
product_at_time: MCA | LOC | HELOC | SBA | EQUIPMENT | CRE | BRIDGE | (none)
text: |
  ...PII-redacted free text of the new note or SMS...
```

`(none)` is the literal string when a field is absent. The prompt is trained on this exact format. PII redaction is upstream — by the time text reaches the AI, names/lenders/banks are already replaced with `[NAME]`, `[LENDER]`, `[BANK]`, etc.

## A.5 Golden test fixtures

`golden_test_set.json` (15 hand-curated cases, included in this handoff package). Each case has the form:

```json
{
  "id": "golden_NN",
  "input_type": "rep_note" | "client_sms",
  "stage_at_time": "...",
  "product_at_time": "...",
  "text": "...",
  "expected": { /* fields the AI must produce */ }
}
```

Copy into `server/tests/pipeline-ai.fixtures.json` as part of the integration.

## A.6 Grader script

`run_golden.py` (included). Reference for the grading logic — port to TypeScript or call the Python directly from your test runner. Key behaviors of the grader:

- Per-field grading: `PASS` (exact match) / `PARTIAL` (close but not exact) / `FAIL` (different/missing).
- Strings: case-insensitive exact = PASS; substring or token overlap = PARTIAL.
- Money objects: exact `value_usd` match = PASS; ±10% = PARTIAL. `raw` strings are not graded.
- `use_of_funds`: category match drives PASS; detail-only match = PARTIAL.
- Arrays: set equality = PASS; non-empty intersection = PARTIAL.
- `pending_actions`: actor + timing + action all match = PASS; actor matches with timing OR action OK = PARTIAL.
- Booleans: strict equality, no PARTIAL.
- Row-level grade: PERFECT (all PASS), PARTIAL (mix, no FAIL), FAIL (any FAIL).

## A.7 Production parity model

Use Sonnet 4.5 with prompt caching enabled. Same configuration pattern as `classifyInbound`:

- `model: 'claude-sonnet-4-5'`
- `max_tokens: 2048`
- `system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]`
- `output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } }`

---

# PART B — What needs to be built

## B.0 Preservation requirement — Rep Ownership and existing controls

The following existing behaviors are locked and must remain functionally identical after Pipeline AI v1 ships. The AI extractor, badge/chip rendering, auto-nurture UI, and prototype visual pass do not modify, override, remove, or reinterpret any of these:

- `Deal.assignedRepId` (primary rep) — read/write paths unchanged.
- `Deal.assistingRepIds` (JSON array of secondary reps) — read/write paths unchanged.
- Deal sharing flow — primary rep can add assisting reps without admin involvement, including deals in `NURTURE`.
- `Assign Rep` button in the Inbox action row — preserved in the existing action row above the message thread.
- Right-panel Inbox `CONTACT` tab — keeps the structured `Assigned Rep` field.
- Rep avatar/chip rendering — always visible on conversation/deal cards where assignment data exists, in both Admin and My Convs views.
- Inbox Admin view / My Convs scoping — admins and managers can toggle; Admin view shows all visible conversations sorted by AI priority and totals for the org; My Convs filters to the current user's owned conversations and totals for that user's book; non-admin reps do not see the toggle and are locked to My Convs.
- Pipeline scope — admins can view all, reps are scoped to primary + assisting deals; AI badges are deal-level facts and render identically regardless of viewer rep scope.
- AI extraction reads notes from any rep on a deal (primary or assisting) for lead facts only. It does not infer, transfer, or modify rep ownership.
- Auto-reassignment between reps is explicitly out of scope.

## Visual design target — match the v11 prototype

The v11 prototype (`scl_pipeline_v11.html` in this handoff package) is the BINDING visual target for all UI work in this spec — not just a reference. Match its:

- Color tokens (CSS variables defined in the prototype's `:root` block, lines 11-31)
- Badge styling (`.hot-pill`, `.stacking-badge`, `.ai-chip`, `.ai-inline-bar` patterns)
- Banner styling (`.nurture-banner`, `.nu-urg` patterns)
- Quick-log button styling (`.quick-log-row`, `.ql-btn`)
- Card layout density and typography (Geist + Geist Mono fonts, padding/gap values from the prototype)
- The dark-elevation scheme (`--bg-elev-1` through `--bg-elev-4`)

Where the spec gives a specific color or pattern reference, that reference is canonical — implement to match. Where the spec is silent, defer to the prototype's visual choices rather than inventing new ones. Production deal cards must look like v11 when this work ships, with AI badges layered on top of the existing card hierarchy (preserve business name, rep avatar, stage timer, existing chips).

The `scl_pipeline_v11.html` file is in the handoff zip — open it in any browser to interact with the design.

## B.1 Backend service: `pipelineAiService.ts`

Create `server/src/services/pipelineAiService.ts`, parallel to `aiService.ts`. Reuse the existing `AnthropicProviderConfig` block at the top of `aiService.ts` for model/key resolution — factor it out if helpful.

Single entry point:

```ts
export async function extractPipelineSignals(args: {
  dealId: string;
  inputType: 'rep_note' | 'client_sms';
  text: string;
  stageAtTime?: DealStage | null;
  productAtTime?: ProductType | null;
}): Promise<PipelineAiSignals | null>;
```

Internal flow (mirror `classifyInbound` from `aiService.ts`):

1. Acquire the per-deal queue slot (see B.4 concurrency).
2. Read `deal.pipelineAiSignals`. For client_sms inputs where `Conversation.aiSignals` exists and `deal.pipelineAiSignals` is null, fall back to the conversation's signals as starting state. Otherwise emit `(none)`.
3. Assemble payload per A.4: `JSON.stringify` the existing-signals blob between the markers; format the new input block with type / stage_at_time / product_at_time / text.
4. Call `client.messages.create` with the params from A.7 (cached system prompt, strict schema).
5. Parse response, persist to `Deal.pipelineAiSignals`, set `Deal.pipelineAiUpdatedAt = now()`.
6. Log token usage and cost the same way `classifyInbound` does (`logger.info('AI: extractPipelineSignals complete', { dealId, model, tokens, ... })`).

On API error: log and return `null`. Never reject the user's note-write because of an AI failure — fire-and-forget at the call site.

## B.2 DB migration — `pipelineAiSignals` JSONB column on Deal

Fresh migration. No backfill (signals build up as notes are added).

```prisma
model Deal {
  // ... existing fields ...
  pipelineAiSignals     Json?
  pipelineAiUpdatedAt   DateTime?
}
```

`pipelineAiUpdatedAt` mirrors `Conversation.aiClassifiedAt` — useful for cache-bust and "extracted N minutes ago" hover text.

## B.3 API endpoint — `POST /api/ai/extract-pipeline`

Mount in `server/src/routes/ai.ts` (or wherever `aiService` is exposed today). For on-demand re-extraction (the Re-run AI button in B.9).

```
POST /api/ai/extract-pipeline
auth: same auth middleware as deals.ts
body: { dealId: string, inputType: 'rep_note' | 'client_sms', text: string }
returns: { signals: PipelineAiSignals } | { skipped: true, reason: string }
```

Implementation: thin wrapper around `extractPipelineSignals()`.

## B.4 Trigger wiring

### Wire into `note_added` / `note_updated` in `DealController`

`DealController.updateDeal` already writes `DealEvent` rows with `eventType: 'note_added'` / `'note_updated'` (see `dealController.ts` ~line 588 and ~line 982). Immediately after that write, fire-and-forget:

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

### Wire into `Message.create` for client SMS on deals

Hook into the same code path that triggers `classifyInbound` for inbound messages. After `classifyInbound` resolves on a `Message` whose `Conversation.deal` is non-null AND `Deal.stage NOT IN ('NEW_LEAD', 'ENGAGED_INTERESTED', 'FUNDED', 'CLOSED')`, fire:

```ts
extractPipelineSignals({
  dealId: conversation.deal.id,
  inputType: 'client_sms',
  text: message.body,
  stageAtTime: conversation.deal.stage,
  productAtTime: conversation.deal.productType,
}).catch((err) => logger.error('pipelineAi extract failed', { dealId, err }));
```

The "stage NOT IN" filter is intentional: NEW_LEAD and ENGAGED_INTERESTED are the Inbox AI's lane (qualification phase). Pipeline AI fires once a deal is past intake and there's something worth enriching.

### Skip conditions (do not fire AT ALL)

- `Deal.stage IN ('FUNDED', 'CLOSED')` — deal is done
- `text.trim().length < 5` — too short to be worth a request

### Concurrency: per-deal serialization

Two notes can land back-to-back on the same deal. The second extraction must read the first's output as starting state, not race with it. Implement an in-memory queue keyed by `dealId`:

```ts
const dealQueues = new Map<string, Promise<unknown>>();

function enqueueForDeal<T>(dealId: string, task: () => Promise<T>): Promise<T> {
  const prev = dealQueues.get(dealId) ?? Promise.resolve();
  const next = prev.then(task, task);
  dealQueues.set(
    dealId,
    next.finally(() => {
      if (dealQueues.get(dealId) === next) dealQueues.delete(dealId);
    }),
  );
  return next;
}
```

Wrap `extractPipelineSignals` with `enqueueForDeal(args.dealId, () => doExtract(args))`. Single-process scope is fine — the existing app is single-instance.

## B.5 Frontend — three priority badges on `DealCard` / `DealPanel`

All read `deal.pipelineAiSignals`. Render in the existing badge row of `DealCard.tsx` alongside `PRODUCT_BADGE`, and in the AI inline bar in `DealPanel.tsx` (see B.8).

### Industry badge (violet)

- Color: `#a78bfa` (matches `--violet` from the existing prototype CSS)
- Render condition: `signals.industry && signals.industry.length > 0`
- Text: `signals.industry` raw (model returns "trucking", "commercial real estate", etc.)

### Monthly revenue badge (emerald) + DealPanel pre-fill

- Color: `#4ade80`
- Render condition: `signals.monthly_revenue !== null`
- Text: `signals.monthly_revenue.raw` (preserve rep phrasing — "210k/mo", "$80k a month")
- **DealPanel pre-fill behavior:** the existing manual `Monthly Revenue` pill selector (`DealPanel.tsx` ~line 1010-1030, sets `client.monthlyRevenue` via `saveClientMeta`) should display the AI-suggested value as a **pre-selected pill** when `client.monthlyRevenue` is unset. Do NOT auto-write to `client.monthlyRevenue` — show as suggestion the rep confirms by clicking. If the rep already set it manually, render the AI suggestion as a secondary pill but do not override.

### Use of funds badge (gold)

- Color: `#d4a85a`
- Render condition: `signals.use_of_funds !== null`
- Text: format `signals.use_of_funds.category` (snake_case → Title Case: "Working Capital", "Debt Consolidation", "Equipment", "Real Estate", "Expansion", "Unspecified")
- Tooltip on hover: `signals.use_of_funds.detail` if non-null

## B.6 Frontend — stacking chip with three states

Single component. Render condition: any stacking signal is true. Priority order: ACTIVE > X-STACKED > STACKED BEFORE (render the highest-priority state when multiple apply).

| State           | Condition                                                                                                        | Color                          | Label                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| ACTIVE STACKING | `recent_stacking_activity.active === true`                                                                       | Red `#f87171` with pulsing dot | `ACTIVE STACKING · {window}` (e.g., "ACTIVE STACKING · 30d")                                                             |
| X-STACKED       | `current_active_positions !== null && recent_stacking_activity.active === false`                                 | Orange `#fb923c`               | `{count}-STACKED` if `count` is set; `STACKED` if `count` is null. Optional: append `· $XXXk` if `total_debt_usd` is set |
| STACKED BEFORE  | `has_stacked_history === true && current_active_positions === null && recent_stacking_activity.active === false` | Gray `#6b7280`                 | `STACKED BEFORE`                                                                                                         |

The prototype's `stacking-badge` CSS in `scl_pipeline_v11.html` is the visual target — match this; match its border-pulse-on-hot pattern for the ACTIVE STACKING state.

## B.7 Frontend — pre-fill rules for existing Deal fields

**Principle: the rep's manual input is canonical. AI fills empty slots. AI never silently overwrites a value the rep typed.**

| AI field                     | Pre-fills            | Rule                                                                                                                                                |
| ---------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requested_amount.value_usd` | `deal.dealAmount`    | Only if `deal.dealAmount === null`; otherwise show as suggestion alongside the input                                                                |
| `product_interest[0]`        | `deal.productType`   | Only if `deal.productType === null`; otherwise no-op                                                                                                |
| `product_interest[1..]`      | (none in v1)         | Surface as additional pills in the product selector for future multi-product UI                                                                     |
| `pending_actions[0].action`  | `deal.nextAction`    | Only if `deal.nextAction === null`; otherwise show as suggestion                                                                                    |
| `pending_actions[0].timing`  | `deal.nextActionDue` | Display the timing label only. **Resolving "next_week" → an actual Date is deferred** (see Not-in-scope). For v1, leave `deal.nextActionDue` alone. |

## B.8 Frontend — AI inline bar in `DealPanel` modal

Reference: prototype `ai-inline-bar` in `scl_pipeline_v11.html` lines 1248-1258. A horizontal strip above the stage/product chip row in the modal showing the three priority badges (industry, revenue, use_of_funds) plus the stacking chip plus a trailing "source: AI · {extracted N min ago}" label.

Empty/missing fields render as dashed-border placeholders ("Industry: ?") so the rep knows the AI is aware of them.

## B.9 Frontend — Re-run AI button

Small link in the deal panel header. Calls `POST /api/ai/extract-pipeline` with the most recent note as input. Response replaces the current `signals` in local state and triggers re-render of all badges + chips.

Useful when the rep edits a note and wants the AI to re-process without waiting for the next note add.

## B.10 Auto-nurture mechanic

**This is a parallel platform feature, NOT part of the AI extractor.** The AI does not touch attempt counters. This section is in the spec because the auto-nurture banner shares deal-card real estate with the AI badges and the two features must coexist visually.

### B.10.1 Concept

Reps log contact attempts on a deal. After N unsuccessful attempts (default 10), the deal auto-moves to NURTURE and surfaces in the existing Revive Queue. A substantive reply or engagement RESETS the counter.

### B.10.2 New columns on `Deal`

```prisma
model Deal {
  // ... existing fields ...
  contactAttempts          Int        @default(0)
  contactAttemptThreshold  Int        @default(10)
  lastEngagementAt         DateTime?
}
```

`contactAttemptThreshold` allows per-deal overrides (admin/manager raises for cold-list deals, lowers for hot ones). Default 10.

### B.10.3 Quick-log buttons in `DealPanel`

Five buttons in the deal panel notes section. Visual target — match this: prototype `quick-log-row` / `ql-btn` pattern in `scl_pipeline_v11.html`.

| Button             | Dot color | Server action                                                                                                                                                               |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No answer**      | yellow    | `contactAttempts++`, append auto-note "Called, no answer", `DealEvent(eventType: 'attempt_logged', metadata: { kind: 'no_answer' })`                                        |
| **Texted**         | yellow    | `contactAttempts++`, append auto-note "Sent text follow-up", `DealEvent(... kind: 'texted')`                                                                                |
| **Voicemail**      | yellow    | `contactAttempts++`, append auto-note "Left voicemail", `DealEvent(... kind: 'voicemail')`                                                                                  |
| **Connected**      | green     | `contactAttempts = 0`, `lastEngagementAt = now()`, append auto-note "Connected with lead", `DealEvent(eventType: 'engagement_reset', metadata: { kind: 'connected' })`      |
| **Not interested** | red       | move `stage → NURTURE`, set `followUpType = 'LOST'`, do NOT touch counter, `DealEvent(eventType: 'stage_change', toStage: 'NURTURE', metadata: { kind: 'not_interested' })` |

Backend: add `POST /api/deals/:id/log-attempt` with body `{ kind: 'no_answer' | 'texted' | 'voicemail' | 'connected' | 'not_interested' }`. Mount in `server/src/routes/deals.ts` next to the existing `complete-action` / `call-log` routes.

### B.10.4 Display banner

Text: `"WAITING X/Y ATTEMPTS · Z BEFORE AUTO-NURTURE"` where `X = contactAttempts`, `Y = contactAttemptThreshold`, `Z = Y - X`.

- Render condition: `X >= 1 && stage NOT IN ('FUNDED', 'CLOSED', 'NURTURE')`
- Color shift driven by `X / Y` ratio:
  - `X <= Y/2` → yellow (`#facc15`)
  - `Y/2 < X < Y - 1` → orange (`#fb923c`)
  - `X >= Y - 1` → red (`#f87171`) with pulse animation
- Position: on the deal card, under the badge row; in `DealPanel`, under the AI inline bar (B.8)
- Visual target — match this: prototype `nurture-banner` / `nu-urg` patterns in `scl_pipeline_v11.html`

### B.10.5 Auto-nurture trigger

Server-side guard, runs after every counter increment:

```ts
if (deal.contactAttempts >= deal.contactAttemptThreshold && !['FUNDED', 'CLOSED', 'NURTURE'].includes(deal.stage)) {
  const previousStage = deal.stage;
  await prisma.deal.update({
    where: { id: deal.id },
    data: { stage: 'NURTURE', followUpType: 'GHOSTED' },
  });
  await prisma.dealEvent.create({
    data: {
      dealId: deal.id,
      eventType: 'auto_nurture_triggered',
      fromStage: previousStage,
      toStage: 'NURTURE',
      metadata: { attemptsAtTrigger: deal.contactAttempts, threshold: deal.contactAttemptThreshold },
    },
  });
}
```

Add `'GHOSTED'` to the `Deal.followUpType` allowed values if not already present. The existing Revive Queue endpoint (`GET /api/deals/revive-queue`) already filters on `stage === 'NURTURE'`, so ghosted deals surface there with no extra wiring.

### B.10.6 Counter reset triggers

The counter resets to `0` (and `lastEngagementAt = now()`) on ANY of:

- Rep clicks **Connected** quick-log button (B.10.3)
- **Inbound SMS received**: in the `Message.create` path that already triggers `classifyInbound`, additionally — if `message.direction === 'inbound'` and `conversation.deal != null` — reset that deal's counter.
- **Inbound email received**: placeholder for future email integration. No work needed today.
- **Rep manually edits the counter** via the deal panel (admin override).
- **Stage moves forward** via `DealController.moveDeal`: if `toStage` is more advanced than `fromStage` (per `DealStage` ordinal), reset. Moves to NURTURE/CLOSED do NOT reset.

Implement as a small `resetEngagement(dealId, reason)` helper called from each path. Log a `DealEvent(eventType: 'engagement_reset', metadata: { reason })` for audit.

### B.10.7 Boundary with the AI extractor

**The AI does not touch `contactAttempts`, `contactAttemptThreshold`, or `lastEngagementAt`.** These fields are pure platform logic, driven by quick-log clicks and inbound message events. The AI extractor (Part A) and the auto-nurture mechanic (B.10) run independently and write to disjoint columns.

Future (v2 — do not build now): the controller could append `attempts_since_engagement: N` to the AI's `[NEW INPUT]` block as context, letting the AI suggest more aggressive `pending_actions` on high-attempt deals. Out of scope for v1.

## B.11 Validation

Reproduce the same field-level outputs as the golden test set. Reference `run_golden.py` for the grader logic (or port to TS in your test runner). The integration is correct if every case in `pipeline-ai.fixtures.json` produces field-level grades matching the reference run.

---

# NOT in scope (deferred)

Do not build these yet:

- **Auto-nurture attempt counter.** Tracking how many times a rep has tried to re-engage a NURTURE deal. Separate feature.
- **Stage transition automation.** The AI does not suggest stage moves. An earlier draft included `suggested_stage`; it was dropped after scope review.
- **Reminder notifications when `pending_actions[*].timing` is due.** Separate feature.
- **Resolving timing enum to concrete dates.** Mapping `"next_week"` → an actual `Date` for `deal.nextActionDue`. v1 displays the timing label only.
- **Confidence scoring on extractions.** Earlier drafts had per-field confidence (0.0–1.0). Dropped for simplicity.
- **Multi-input batching.** One note = one API call. Don't batch.
- **Rep editing AI output directly.** No "edit this AI extraction" UI in v1. The rep edits the note; the AI re-extracts.
- **Industry / use_of_funds enums or normalization.** `industry` is intentionally freeform. Do not introduce a lookup layer in v1.

---

# Reference materials in handoff package

- `scl-pipeline-ai-extractor.md` — canonical prompt + schema design doc
- `extractor-spec.md` — this document
- `scl_pipeline_v11.html` — visual design target (open in browser to interact with the prototype)
- `golden_test_set.json` — 15 hand-curated test cases
- `pipeline-ai.fixtures.json` — same fixtures, pre-named for `server/tests/`
- `run_golden.py` — grader script
- `test_harness.py` — Python harness used during prompt development; reference for payload formatting
- `pipeline-extraction-review.csv` — output from the 80-row corpus run
- `pipeline-golden-results.csv` — output from the 15-row golden run

All artifacts live in `~/Desktop/scl-handoff-pipeline/` on the design machine, sent as a zip.

---
