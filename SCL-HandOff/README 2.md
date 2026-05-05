# SCL classifyInbound — Handoff Package

**For**: "Developer" (M2 production wiring)
**From**: SCL classification sandbox, locked v4
**Date**: 2026-04-25

This package contains everything needed to wire AI classification into the existing inbox without further design decisions. Start with this README; the other 5 files are referenced from here.

---

## What this is

An AI classifier that analyzes inbound SMS conversations and outputs a structured classification (HOT/WARM/NURTURE/DEAD/WRONG_NUMBER), lead score, revenue extraction, follow-up timing, staleness assessment, suggested replies, and rep behavior coaching notes.

Built and tested in `/Users/jb/Documents/scl-code/.sandbox/` against a read-only snapshot of the production database. Validated against all 642 historical conversations with at least one inbound reply.

The locked prompt is `classifier_prompt_v4_LOCKED.md`. **Do not modify the prompt without re-running validation against the 642 backfill.** A small wording change can flip a meaningful number of leads between buckets.

---

## How to call it from Node

Install:

```
npm install @anthropic-ai/sdk@^0.91 zod@^3.25.76
```

Minimal usage:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { readFileSync } from 'node:fs';

// Load the locked prompt at startup, not per-request.
const SYSTEM_PROMPT = readFileSync('./prompts/classifier_prompt_v4_LOCKED.md', 'utf8');

// Define the Zod schema (full version in classification_schema.json).
const Classification = z.object({
  /* see schema file */
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function classifyConversation(threadText: string) {
  const response = await client.messages.parse({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // 90% cost savings on repeat calls
      },
    ],
    messages: [
      {
        role: 'user',
        content:
          `Classify this conversation.\n\n` +
          `Current time (use this for staleness + follow-up timing): ${new Date().toISOString()}\n\n` +
          threadText,
      },
    ],
    output_config: { format: zodOutputFormat(Classification) },
  });
  return response.parsed_output;
}
```

The `threadText` format expected by the prompt:

```
--- LEAD INFO ---
Name: Mike Smith
Phone: +13105551234
Business: Smith's Diner
First contact: 2026-04-19

--- CONVERSATION (7 messages) ---
[2026-04-19 14:32] SCL-REP → Hey Mike, Stuart with SCL...
[2026-04-19 14:45] LEAD → yeah whats the rate
[2026-04-19 14:47] SCL-REP → Factor rate 1.29...
[2026-04-19 15:02] LEAD → about 80k/month, restaurant
```

Reference implementation: `.sandbox/classify.mjs` lines 132–185.

---

## When to classify

**DO classify**:

- Every new inbound from a lead (after the message lands in the DB, ideally async via BullMQ so the Twilio webhook can return 200 fast)
- After a rep takes a terminal action (mark Funded, mark Lost, mark DNC) — to update the AI's view of the deal trajectory
- On manual demand from the inbox UI (a "re-classify" button for QA)

**DO NOT classify**:

- Outbound-only messages (no signal to extract)
- Leads who already opted out (compliance engine handles, no need for AI)
- Auto-bounce inbounds ("this phone cannot receive SMS") — the AI handles correctly but it's a waste of money
- Conversations with zero inbound messages (nothing to classify)

**Recommended trigger**: post-save hook on Message creation when `direction = 'INBOUND'` AND lead is not opted-out, dispatched to a BullMQ classification worker. Don't block the Twilio webhook on the API call.

---

## Schema field meanings

Full schema in `classification_schema.json`. Field-by-field:

### Drives the inbox UI directly

| Field                          | Use                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `classification`               | Stage/bucket badge on the conversation card                                    |
| `leadScore`                    | Numeric 0-100, drives "AI Priority" sort in the inbox                          |
| `staleState`                   | Color/freshness indicator (fresh=green, stale=amber, ghosted=red, null=hidden) |
| `suggestedReply`               | "AI suggest" button in the rep's reply composer                                |
| `suggestedReengageMessage`     | "Re-engage" CTA shown when the field is non-null                               |
| `repBehavior` + `coachingNote` | Manager-only review/coaching surface                                           |

### Drives automation / dashboards

| Field                              | Use                                                     |
| ---------------------------------- | ------------------------------------------------------- |
| `classification`                   | Pipeline stage automation (HOT → "Engaged" stage, etc.) |
| `staleState = 'ghosted'`           | Auto-flip pipeline card to NURTURE                      |
| `suggestedFollowupTime`            | Schedule reminder/calendar entry                        |
| `hadMeaningfulEngagement`          | Trigger logic for re-engage messaging                   |
| `revenueMonthly` / `revenueAnnual` | Lead enrichment / qualification dashboards              |
| `amountRequested` / `useOfFunds`   | Pipeline value calculations                             |
| `product`                          | Product-mix dashboard segmentation                      |

### Diagnostic only — not user-facing

| Field        | Use                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `reasoning`  | Internal debugging when the AI miscategorizes; useful for prompt iteration. Never surface to reps or customers. |
| `objections` | Optional manager view; not a primary UI surface                                                                 |

### Required vs nullable (see classification_schema.json for canonical)

- **Always required**: `classification`, `leadScore`, `revenueConfidence`, `product`, `urgency`, `objections`, `suggestedReply`, `hadMeaningfulEngagement`, `repBehavior`, `coachingNote`, `reasoning`
- **Nullable** (null when not applicable): `revenueMonthly`, `revenueAnnual`, `amountRequested`, `useOfFunds`, `suggestedFollowupTime`, `suggestedFollowupReason`, `staleState`, `suggestedReengageMessage`
- **Required for HOT only**: `suggestedFollowupTime`, `suggestedFollowupReason` (must be non-null when `classification = 'HOT'`)
- **Required when `staleState ∈ {stale, ghosted}` OR (`hadMeaningfulEngagement = true` AND lead's last inbound ≥ 7 days ago)**: `suggestedReengageMessage`

---

## Cost expectations

- **~$0.015 per conversation** with prompt caching (Opus 4.7)
- **~$10 for full historical backfill** (642 conversations) — see `validation_642.csv`
- Going forward: ~$0.015 per inbound classification in production
- **Always use prompt caching** (`cache_control: ephemeral` on the system block) — it's worth ~90% in cost savings
- Set an Anthropic Console budget cap of ~$100/month while ramping; current production traffic projects to ~$30-50/month

---

## Important rule: FULL THREAD PEAK

The classifier evaluates the **entire conversation**, not just the latest message. A lead's classification and score reflect the **highest-signal moment in the thread**, not the current state of the conversation.

Concrete example: Wayne Anderson said "$350K, email is X, debt consolidation" on Day 1. He replied "Ok, will do" on Day 3. The classifier returns HOT, score 86 — because the thread's peak intent was strong, even though the latest message is just an acknowledgment.

**Implications for integration**:

- Pass the full message history to the classifier, not just the latest message
- Order messages chronologically (oldest first)
- Include `direction` (`LEAD` or `SCL-REP`) and timestamps on each message
- Don't truncate the thread; the classifier reads peak from the full history

---

## Important rule: SCORE = LEAD INTENT, NOT DEAL MOMENTUM

A separate but related rule: the score reflects the lead's demonstrated buying intent, not the current state of the deal. If the rep was slow to follow up and the lead has gone stale, the **lead score is unchanged** — staleness is captured separately in `staleState`, and rep slowness is captured in `repBehavior` + `coachingNote`.

The score only decreases if the **lead** later expresses disqualifying signals ("we'll pass", financial issues, hard objections).

---

## Staleness counting

`staleState` measures days since the LEAD's last inbound, NOT since the rep's last outbound. Rep follow-up pings do NOT reset staleness — only a real lead reply does. This was a calibration bug in v2 and is explicit in v4. See worked example in the prompt.

---

## Validation reference

See `validation_642.csv` for the v4 classifier's output across all 642 historical conversations with at least one inbound. The founder reviewed 50 HOTs in detail and approved the v4 calibration. Edge cases documented in `production_bugs_found.md`.

When iterating on the prompt:

1. Modify a copy as `classifier_prompt_v5.md` (don't edit v4)
2. Re-run against the same 642 conversations
3. Compare distribution + named-lead spot-checks vs `validation_642.csv`
4. Founder reviews before lock

---

## Files in this package

| File                             | Purpose                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `README.md`                      | This file                                                           |
| `classifier_prompt_v4_LOCKED.md` | The system prompt — do not modify                                   |
| `classification_schema.json`     | Full output schema (field types, allowed values, required/nullable) |
| `examples.json`                  | 9 input/output pairs spanning the buckets                           |
| `validation_642.csv`             | Full backfill output for cross-reference                            |
| `production_bugs_found.md`       | Bugs surfaced during testing — input to M1 cleanup scope            |

---

## Open questions for the integration phase

1. **Where in the webhook flow does the classifier hook in?** Recommendation: post-save BullMQ job dispatched from `twilioWebhooks.ts` after Message create, async, retried 3x.
2. **Do we want sync or async classification?** Async strongly recommended — never block the Twilio webhook 200 response.
3. **How do we surface AI fields in the inbox UI?** Badges per `classification`, color-coded `leadScore`, "AI suggest" / "Re-engage" CTAs from the suggested-reply fields. Existing `aiClassification`/`aiLeadScore` columns in the schema were planned for exactly this.
4. **How do we handle prompt iteration in production?** Recommend storing prompt version in a SystemSetting row (`classifier_prompt_version: 'v4'`), reading the prompt file at startup, and tagging every classification record with the prompt version it was generated under. Lets us A/B test future versions cleanly.
5. **Where does CA compliance detection happen?** Detect CA by area code in the webhook layer (deterministic), then pass `isCaliforniaNumber: true` as context if needed. The AI classifier does not parse geography.
6. **What about leads with no inbound yet?** They do not need classification (zero signal to extract). Skip them.
