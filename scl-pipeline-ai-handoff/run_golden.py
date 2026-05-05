#!/usr/bin/env python3
"""SCL Pipeline AI — golden-set validator.

Loads ~/Desktop/scl-handoff-pipeline/golden_test_set.json (15 hand-curated
cases) and grades each against the live AI extraction. Reuses MODEL,
SYSTEM_PROMPT, OUTPUT_SCHEMA, build_payload, extract from test_harness.py
so we test the exact production-parity prompt.

Grading per field:
  PASS    = exact match (or canonical equivalent — case-insensitive for strings,
            value_usd match for money, set equality for arrays)
  PARTIAL = close but not exact (substring/token overlap on strings,
            ±10% on money, subset overlap on arrays, partial action match)
  FAIL    = different / missing / wrong sign

Row-level: PERFECT if all expected fields PASS. PARTIAL if mix of PASS/PARTIAL,
no FAIL. FAIL if any field FAILs.

Writes ~/Desktop/scl-handoff-clean/pipeline-golden-results.csv for review.

Local only. Requires ANTHROPIC_API_KEY.
"""
import csv
import json
import os
import sys
from pathlib import Path

# Reuse harness constants — same model, same prompt, same schema.
sys.path.insert(0, str(Path(__file__).parent))
from test_harness import (  # noqa: E402
    MODEL, build_payload, extract, usage_field,
    PRICE_INPUT_PER_MTOK, PRICE_OUTPUT_PER_MTOK,
    PRICE_CACHE_WRITE_PER_MTOK, PRICE_CACHE_READ_PER_MTOK,
)

import anthropic  # noqa: E402

GOLDEN_FILE = Path.home() / "Desktop" / "scl-handoff-pipeline" / "golden_test_set.json"
OUT_CSV = Path.home() / "Desktop" / "scl-handoff-clean" / "pipeline-golden-results.csv"

PASS, PARTIAL, FAIL = "PASS", "PARTIAL", "FAIL"


# ─── Per-field graders ──────────────────────────────────────────────────────

def grade_string(expected, actual):
    """Strings: exact (case-insensitive) → PASS, substring/token overlap → PARTIAL."""
    if expected == actual:
        return PASS
    if not actual:
        return FAIL
    e = expected.lower().strip()
    a = actual.lower().strip()
    if e == a:
        return PASS
    if e in a or a in e:
        return PARTIAL
    if set(e.split()) & set(a.split()):
        return PARTIAL
    return FAIL


def grade_money(expected, actual):
    """{value_usd, raw} object: value match → PASS, ±10% → PARTIAL."""
    if expected is None or actual is None:
        return PASS if expected == actual else FAIL
    e_val = expected.get("value_usd")
    a_val = actual.get("value_usd")
    if e_val is None or a_val is None:
        return FAIL
    if e_val == a_val:
        return PASS
    if abs(e_val - a_val) / max(abs(e_val), 1) <= 0.10:
        return PARTIAL
    return FAIL


def grade_use_of_funds(expected, actual):
    """category match drives PASS; detail-only match → PARTIAL."""
    if expected is None or actual is None:
        return PASS if expected == actual else FAIL
    cat_match = expected.get("category") == actual.get("category")
    e_detail = expected.get("detail")
    a_detail = actual.get("detail")
    detail_grade = grade_string(e_detail, a_detail or "") if e_detail else None
    if cat_match and (detail_grade is None or detail_grade == PASS):
        return PASS
    if cat_match:
        return PARTIAL
    if detail_grade in (PASS, PARTIAL):
        return PARTIAL
    return FAIL


def grade_array_set(expected, actual):
    """Set equality → PASS; non-empty intersection → PARTIAL."""
    e_set = set(expected or [])
    a_set = set(actual or [])
    if e_set == a_set:
        return PASS
    if e_set & a_set:
        return PARTIAL
    return FAIL


def grade_pending_actions(expected, actual):
    """First expected action vs best matching actual (by actor)."""
    if not expected:
        return PASS if not actual else PARTIAL
    if not actual:
        return FAIL
    e0 = expected[0]
    best = next((a for a in actual if a.get("actor") == e0.get("actor")), actual[0])
    actor_match = best.get("actor") == e0.get("actor")
    timing_match = best.get("timing") == e0.get("timing")
    action_grade = grade_string(e0.get("action") or "", best.get("action") or "")
    if actor_match and timing_match and action_grade == PASS:
        return PASS
    if actor_match and (timing_match or action_grade in (PASS, PARTIAL)):
        return PARTIAL
    return FAIL


def grade_bool(expected, actual):
    return PASS if expected == actual else FAIL


def grade_current_positions(expected, actual):
    if expected is None and actual is None:
        return PASS
    if expected is None or actual is None:
        return FAIL
    e_count = expected.get("count")
    a_count = actual.get("count")
    e_debt = expected.get("total_debt_usd")
    a_debt = actual.get("total_debt_usd")
    count_match = (e_count == a_count)
    debt_match = (e_debt == a_debt)
    if count_match and debt_match:
        return PASS
    if count_match or debt_match:
        return PARTIAL
    return FAIL


def grade_recent_stacking(expected, actual):
    if not actual:
        return FAIL
    e_active = expected.get("active")
    a_active = actual.get("active")
    e_window = expected.get("window")
    a_window = actual.get("window")
    if e_active == a_active and e_window == a_window:
        return PASS
    if e_active == a_active:
        return PARTIAL
    return FAIL


GRADERS = {
    "industry": grade_string,
    "monthly_revenue": grade_money,
    "use_of_funds": grade_use_of_funds,
    "requested_amount": grade_money,
    "product_interest": grade_array_set,
    "pending_actions": grade_pending_actions,
    "has_stacked_history": grade_bool,
    "current_active_positions": grade_current_positions,
    "recent_stacking_activity": grade_recent_stacking,
}

SYM = {PASS: "✓", PARTIAL: "~", FAIL: "✗"}


def fmt_val(v, width=70):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    return (s[:width] + "…") if len(s) > width else s


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 1
    if not GOLDEN_FILE.exists():
        print(f"ERROR: missing {GOLDEN_FILE}", file=sys.stderr)
        return 1

    cases = json.loads(GOLDEN_FILE.read_text())
    print(f"Loaded {len(cases)} golden cases. Model: {MODEL}\n")

    client = anthropic.Anthropic()

    sum_input = sum_output = sum_cwrite = sum_cread = 0
    field_stats = {f: {PASS: 0, PARTIAL: 0, FAIL: 0} for f in GRADERS}
    row_results = []

    for case in cases:
        cid = case["id"]
        payload = build_payload(
            case["input_type"], case.get("stage_at_time"),
            case.get("product_at_time"), case["text"],
        )
        try:
            output, usage = extract(client, payload)
            err = None
        except Exception as e:
            output, usage, err = None, None, f"{type(e).__name__}: {e}"

        if usage:
            sum_input += usage_field(usage, "input_tokens")
            sum_output += usage_field(usage, "output_tokens")
            sum_cwrite += usage_field(usage, "cache_creation_input_tokens")
            sum_cread += usage_field(usage, "cache_read_input_tokens")

        if err:
            print(f"[{cid}] ERROR: {err}\n")
            row_results.append((cid, "ERROR", {}, output, case, err))
            continue

        expected = case["expected"]
        grades = {}
        for field, expected_val in expected.items():
            grader = GRADERS.get(field)
            if not grader:
                grades[field] = FAIL
                continue
            actual_val = output.get(field)
            grades[field] = grader(expected_val, actual_val)
            field_stats[field][grades[field]] += 1

        if all(g == PASS for g in grades.values()):
            row_grade = "PERFECT"
        elif any(g == FAIL for g in grades.values()):
            row_grade = "FAIL"
        else:
            row_grade = "PARTIAL"

        row_results.append((cid, row_grade, grades, output, case, None))

        print(f"[{cid}] {row_grade}  ({case['text'][:80]!r})")
        for field, grade in grades.items():
            ev = expected[field]
            av = output.get(field)
            print(f"    {SYM[grade]} {field:28s}  expected: {fmt_val(ev, 60)}")
            print(f"      {' '*28}  actual:   {fmt_val(av, 60)}")
        print()

    # ─── Summary ──────────────────────────────────────────────────────────
    perfect = sum(1 for r in row_results if r[1] == "PERFECT")
    partial = sum(1 for r in row_results if r[1] == "PARTIAL")
    failed = sum(1 for r in row_results if r[1] == "FAIL")
    errored = sum(1 for r in row_results if r[1] == "ERROR")
    total = len(cases)

    print("=" * 72)
    print(f"OVERALL: {perfect}/{total} PERFECT | {partial}/{total} PARTIAL | "
          f"{failed}/{total} FAIL | {errored}/{total} ERROR")
    print()
    print("Per-field accuracy (only fields that appeared in expected blocks):")
    print(f"  {'field':<32}  {'PASS':>4}  {'PART':>4}  {'FAIL':>4}  {'tot':>4}  {'%PASS':>6}  {'%P+P':>6}")
    for f, st in field_stats.items():
        tot = st[PASS] + st[PARTIAL] + st[FAIL]
        if not tot:
            continue
        pct_pass = 100 * st[PASS] / tot
        pct_any = 100 * (st[PASS] + st[PARTIAL]) / tot
        print(f"  {f:<32}  {st[PASS]:>4}  {st[PARTIAL]:>4}  {st[FAIL]:>4}  "
              f"{tot:>4}  {pct_pass:>5.1f}%  {pct_any:>5.1f}%")

    print()
    print(f"Token usage — input: {sum_input:,}  output: {sum_output:,}  "
          f"cache_w: {sum_cwrite:,}  cache_r: {sum_cread:,}")
    cost = (sum_input / 1e6 * PRICE_INPUT_PER_MTOK
            + sum_output / 1e6 * PRICE_OUTPUT_PER_MTOK
            + sum_cwrite / 1e6 * PRICE_CACHE_WRITE_PER_MTOK
            + sum_cread / 1e6 * PRICE_CACHE_READ_PER_MTOK)
    print(f"Estimated cost: ${cost:.4f}")

    # ─── CSV ─────────────────────────────────────────────────────────────
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "row_grade", "input_type", "stage_at_time",
                    "product_at_time", "input_text", "expected_json",
                    "output_json", "field_grades_json", "error"])
        for cid, rg, grades, output, case, err in row_results:
            w.writerow([
                cid, rg,
                case.get("input_type", ""), case.get("stage_at_time") or "",
                case.get("product_at_time") or "", case.get("text", ""),
                json.dumps(case.get("expected", {}), ensure_ascii=False),
                json.dumps(output, ensure_ascii=False) if output else "",
                json.dumps(grades, ensure_ascii=False),
                err or "",
            ])
    print(f"\nWrote {OUT_CSV}")
    return 0 if (failed == 0 and errored == 0) else 1


if __name__ == "__main__":
    sys.exit(main())
