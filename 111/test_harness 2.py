#!/usr/bin/env python3
"""SCL Pipeline AI — local test harness, Sonnet 4.5 (production parity).

Reads:  ~/Desktop/scl-handoff-clean/scl-handoff-notes.csv (30 rows)
        ~/Desktop/scl-handoff-clean/scl-handoff-inbound.csv (50 rows)
Writes: ~/Desktop/scl-handoff-clean/pipeline-extraction-review.csv (80 rows)

Constraints: local only. No production. No commits.
Requires ANTHROPIC_API_KEY env var.
"""
import csv
import json
import os
import sys
import time
from pathlib import Path

import anthropic

CLEAN_DIR = Path.home() / "Desktop" / "scl-handoff-clean"
NOTES_FILE = CLEAN_DIR / "scl-handoff-notes.csv"
INBOUND_FILE = CLEAN_DIR / "scl-handoff-inbound.csv"
OUT_FILE = CLEAN_DIR / "pipeline-extraction-review.csv"

MODEL = "claude-sonnet-4-5"

# Sonnet 4.5 pricing (per 1M tokens). Production parity: SCL Inbox AI
# (server/src/services/aiService.ts) also runs claude-sonnet-4-5.
#
# Caching threshold: Sonnet 4.5's minimum cacheable prefix is 1024 tokens
# (older-Sonnet tier, NOT the 2048-token Sonnet 4.6 tier). Our system
# prompt is ~1,500 tokens — above threshold — so cache_control on the
# system block WILL fire. Expect non-zero cache_creation_input_tokens
# on call 1 and non-zero cache_read_input_tokens on calls 2-80 (within
# the 5-minute ephemeral TTL).
PRICE_INPUT_PER_MTOK = 3.00
PRICE_OUTPUT_PER_MTOK = 15.00
PRICE_CACHE_WRITE_PER_MTOK = 3.75   # 5min ephemeral = 1.25x base input
PRICE_CACHE_READ_PER_MTOK = 0.30    # cache read = 0.1x base input

# ─── System prompt (verbatim from scl-pipeline-ai-extractor.md §4) ──────────
SYSTEM_PROMPT = """You extract structured signals from rep notes and inbound client SMS in a small-business lending CRM, to enrich a deal card. You receive (a) any existing signals previously extracted on this deal, and (b) one new note or message. You return a single updated signals object representing the full picture.

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
product_interest is an array. Multi-product extraction is correct when multiple products are signaled in a single input. Pattern: an SBA application that mentions specific equipment ("roll off truck", "3 vehicles") -> ["SBA", "EQUIPMENT"]. The product_at_time context counts as one signal; specific item mentions add additional products. Don't collapse to a single value just because product_at_time is set.
Map common synonyms:
- "data merch" -> MCA
- "line of credit" -> LOC
- "HELOC", "home equity" -> HELOC
- "SBA" -> SBA
- "Semi Truck", "daycab", "roll off truck", "vehicles" -> EQUIPMENT (and surface specifics in use_of_funds.detail)
- "appraisal" + refi/mortgage language -> HELOC
- "weekly" / "daily" payment language without other context -> MCA (frequency is canonical MCA signal)

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
Return a single JSON object matching the provided schema. Strict JSON. No prose, no markdown fences, no commentary."""


# ─── Output JSON schema (mirrors scl-pipeline-ai-extractor.md §5) ──────────
OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "_extraction_scope", "skip_reason",
        "industry", "monthly_revenue", "use_of_funds",
        "requested_amount", "product_interest", "pending_actions",
        "has_stacked_history", "current_active_positions",
        "recent_stacking_activity",
    ],
    "properties": {
        "_extraction_scope": {"const": "lead_only"},
        "skip_reason": {
            "anyOf": [
                {"type": "null"},
                {"type": "string",
                 "enum": ["contact_info_only", "too_short", "unrelated",
                          "unintelligible", "no_signal"]},
            ],
        },
        "industry": {"type": "string"},
        "monthly_revenue": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object", "additionalProperties": False,
                    "required": ["value_usd", "raw"],
                    "properties": {
                        "value_usd": {"type": "integer"},
                        "raw": {"type": "string"},
                    },
                },
            ],
        },
        "use_of_funds": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object", "additionalProperties": False,
                    "required": ["category", "detail"],
                    "properties": {
                        "category": {
                            "enum": ["equipment", "working_capital",
                                     "debt_consolidation", "real_estate",
                                     "expansion", "unspecified"],
                        },
                        "detail": {"type": ["string", "null"]},
                    },
                },
            ],
        },
        "requested_amount": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object", "additionalProperties": False,
                    "required": ["value_usd", "raw"],
                    "properties": {
                        "value_usd": {"type": "integer"},
                        "raw": {"type": "string"},
                    },
                },
            ],
        },
        "product_interest": {
            "type": "array",
            "items": {"enum": ["MCA", "LOC", "HELOC", "SBA",
                               "EQUIPMENT", "CRE", "BRIDGE"]},
        },
        "pending_actions": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["actor", "action", "timing"],
                "properties": {
                    "actor": {"enum": ["rep", "lead"]},
                    "action": {"type": "string"},
                    "timing": {
                        "anyOf": [
                            {"type": "null"},
                            {"type": "string",
                             "enum": ["today", "this_week", "next_week", "later"]},
                        ],
                    },
                },
            },
        },
        "has_stacked_history": {"type": "boolean"},
        "current_active_positions": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object", "additionalProperties": False,
                    "required": ["count", "total_debt_usd"],
                    "properties": {
                        "count": {"type": ["integer", "null"]},
                        "total_debt_usd": {"type": ["integer", "null"]},
                    },
                },
            ],
        },
        "recent_stacking_activity": {
            "type": "object", "additionalProperties": False,
            "required": ["active", "window"],
            "properties": {
                "active": {"type": "boolean"},
                "window": {
                    "anyOf": [
                        {"type": "null"},
                        {"type": "string",
                         "enum": ["last_30d", "last_60d", "last_90d"]},
                    ],
                },
            },
        },
    },
}


def build_payload(input_type, stage_at_time, product_at_time, text):
    """Assemble the [EXISTING SIGNALS] + [NEW INPUT] user message body."""
    parts = ["[EXISTING SIGNALS] (none)", "", "[NEW INPUT]",
             f"type: {input_type}",
             f"stage_at_time: {stage_at_time or '(none)'}",
             f"product_at_time: {product_at_time or '(none)'}",
             "text: |"]
    for line in text.splitlines() or [""]:
        parts.append(f"  {line}")
    return "\n".join(parts)


def extract(client, payload):
    """One API call. Returns (parsed_dict, usage_obj). Raises on API/parse error."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": payload}],
        output_config={
            "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
        },
    )
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text), response.usage


def load_rows():
    """Load notes + inbound CSVs into a unified row list."""
    rows = []
    with NOTES_FILE.open(newline="", encoding="utf-8") as f:
        for i, r in enumerate(csv.DictReader(f), 1):
            rows.append({
                "row_id": f"notes_{i:03d}",
                "input_type": "rep_note",
                "stage_at_time": (r.get("deal_stage", "") or "").strip() or None,
                "product_at_time": (r.get("deal_product", "") or "").strip() or None,
                "text": r["body"],
            })
    with INBOUND_FILE.open(newline="", encoding="utf-8") as f:
        for i, r in enumerate(csv.DictReader(f), 1):
            rows.append({
                "row_id": f"inbound_{i:03d}",
                "input_type": "client_sms",
                "stage_at_time": (r.get("deal_stage", "") or "").strip() or None,
                "product_at_time": (r.get("deal_product", "") or "").strip() or None,
                "text": r["body"],
            })
    return rows


def usage_field(usage, name):
    return getattr(usage, name, 0) or 0


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set in environment.", file=sys.stderr)
        return 1
    if not NOTES_FILE.exists() or not INBOUND_FILE.exists():
        print(f"ERROR: missing input CSV(s) in {CLEAN_DIR}", file=sys.stderr)
        return 1

    rows = load_rows()
    n_notes = sum(1 for r in rows if r["input_type"] == "rep_note")
    n_inbound = sum(1 for r in rows if r["input_type"] == "client_sms")
    print(f"Loaded {len(rows)} rows ({n_notes} rep_note, {n_inbound} client_sms)")
    print(f"Model: {MODEL}")

    client = anthropic.Anthropic()

    out_rows = []
    sum_input = sum_output = sum_cwrite = sum_cread = 0
    skipped = full_extracted = errors = 0
    has_industry = has_revenue = has_use = has_amount = has_product = 0
    has_pending = has_history = has_current = has_recent = 0

    t0 = time.time()
    for n, row in enumerate(rows, 1):
        payload = build_payload(
            row["input_type"], row["stage_at_time"],
            row["product_at_time"], row["text"],
        )
        try:
            output, usage = extract(client, payload)
            err = None
        except Exception as e:
            output, usage, err = None, None, f"{type(e).__name__}: {e}"
            errors += 1
            print(f"  [{row['row_id']}] FAILED: {err}", file=sys.stderr)

        if usage:
            sum_input += usage_field(usage, "input_tokens")
            sum_output += usage_field(usage, "output_tokens")
            sum_cwrite += usage_field(usage, "cache_creation_input_tokens")
            sum_cread += usage_field(usage, "cache_read_input_tokens")

        out_industry = out_revenue = out_use = out_amount = ""
        out_products = out_pending = ""
        out_stack_hist = out_current = out_recent = ""

        if output:
            sk = output.get("skip_reason")
            if sk:
                skipped += 1
            else:
                full_extracted += 1

            if output.get("industry"):
                has_industry += 1
            if output.get("monthly_revenue"):
                has_revenue += 1
            if output.get("use_of_funds"):
                has_use += 1
            if output.get("requested_amount"):
                has_amount += 1
            if output.get("product_interest"):
                has_product += 1
            if output.get("pending_actions"):
                has_pending += 1
            if output.get("has_stacked_history"):
                has_history += 1
            if output.get("current_active_positions"):
                has_current += 1
            rsa = output.get("recent_stacking_activity") or {}
            if rsa.get("active"):
                has_recent += 1

            output_json_str = json.dumps(output, separators=(",", ":"),
                                         ensure_ascii=False)
            out_sk = sk or ""
            out_industry = output.get("industry", "") or ""
            mr = output.get("monthly_revenue") or {}
            out_revenue = mr.get("raw", "") if mr else ""
            uf = output.get("use_of_funds") or {}
            out_use = (uf.get("category", "") + (": " + uf.get("detail", "") if uf.get("detail") else "")) if uf else ""
            ra = output.get("requested_amount") or {}
            out_amount = ra.get("raw", "") if ra else ""
            out_products = ",".join(output.get("product_interest") or [])
            out_pending = str(len(output.get("pending_actions") or []))
            out_stack_hist = "true" if output.get("has_stacked_history") else "false"
            cap = output.get("current_active_positions")
            out_current = str(cap.get("count", "")) if cap else ""
            out_recent = "true" if rsa.get("active") else "false"
        else:
            output_json_str = f"[ERROR: {err}]"
            out_sk = ""

        out_rows.append({
            "row_id": row["row_id"],
            "input_type": row["input_type"],
            "input_text": row["text"],
            "output_json": output_json_str,
            "skip_reason": out_sk,
            "industry": out_industry,
            "monthly_revenue_raw": out_revenue,
            "use_of_funds": out_use,
            "requested_amount_raw": out_amount,
            "product_interest": out_products,
            "pending_actions_count": out_pending,
            "has_stacked_history": out_stack_hist,
            "current_active_positions_count": out_current,
            "recent_stacking_active": out_recent,
            "review_flag": "",
        })

        if n % 10 == 0:
            print(f"  ...{n}/{len(rows)} (elapsed {time.time()-t0:.1f}s)")

    elapsed = time.time() - t0

    cols = ["row_id", "input_type", "input_text", "output_json", "skip_reason",
            "industry", "monthly_revenue_raw", "use_of_funds",
            "requested_amount_raw", "product_interest", "pending_actions_count",
            "has_stacked_history", "current_active_positions_count",
            "recent_stacking_active", "review_flag"]
    with OUT_FILE.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out_rows)

    print()
    print(f"Wrote {OUT_FILE}: {len(out_rows)} rows in {elapsed:.1f}s")

    print()
    print(f"=== Token usage ({MODEL}) ===")
    print(f"  Input tokens (uncached) : {sum_input:>10,}")
    print(f"  Output tokens           : {sum_output:>10,}")
    print(f"  Cache write tokens      : {sum_cwrite:>10,}")
    print(f"  Cache read tokens       : {sum_cread:>10,}")

    cost = (sum_input / 1e6 * PRICE_INPUT_PER_MTOK
            + sum_output / 1e6 * PRICE_OUTPUT_PER_MTOK
            + sum_cwrite / 1e6 * PRICE_CACHE_WRITE_PER_MTOK
            + sum_cread / 1e6 * PRICE_CACHE_READ_PER_MTOK)
    print(f"  Estimated cost          : ${cost:.4f}")

    print()
    print("=== Output stats ===")
    succeeded = len(rows) - errors
    print(f"  Errors                          : {errors}/{len(rows)}")
    print(f"  Returned skip_reason            : {skipped}/{succeeded}")
    print(f"  Full extraction (no skip)       : {full_extracted}/{succeeded}")
    print()
    print("=== Field detection rates ===")
    print(f"  industry                        : {has_industry}/{succeeded}")
    print(f"  monthly_revenue                 : {has_revenue}/{succeeded}")
    print(f"  use_of_funds                    : {has_use}/{succeeded}")
    print(f"  requested_amount                : {has_amount}/{succeeded}")
    print(f"  product_interest (non-empty)    : {has_product}/{succeeded}")
    print(f"  pending_actions (non-empty)     : {has_pending}/{succeeded}")
    print(f"  has_stacked_history=true        : {has_history}/{succeeded}")
    print(f"  current_active_positions set    : {has_current}/{succeeded}")
    print(f"  recent_stacking_activity.active : {has_recent}/{succeeded}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
