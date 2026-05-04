import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { DealStage, ProductType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildPipelineAiPayload, type PipelineAiSignals } from '../src/services/pipelineAiService';

type Grade = 'PASS' | 'PARTIAL' | 'FAIL';
type RowGrade = 'PERFECT' | 'PARTIAL' | 'FAIL';
type PipelineInputType = 'rep_note' | 'client_sms';

interface GoldenFixture {
  readonly id: string;
  readonly input_type: PipelineInputType;
  readonly stage_at_time: string;
  readonly product_at_time: string | null;
  readonly text: string;
  readonly expected: Record<string, unknown>;
}

interface BaselineRow {
  readonly id: string;
  readonly row_grade: RowGrade;
  readonly expected_json: string;
  readonly output_json: string;
  readonly field_grades_json: string;
}

interface CorpusRow {
  readonly row_id: string;
  readonly input_type: PipelineInputType;
  readonly output_json: string;
  readonly skip_reason: string;
}

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const GRADES: readonly Grade[] = ['PASS', 'PARTIAL', 'FAIL'];

function resolvePath(relativePath: string): string {
  return path.join(ROOT_DIR, relativePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(resolvePath(relativePath), 'utf8')) as unknown;
}

function readGoldenFixtures(relativePath: string): GoldenFixture[] {
  const parsed = readJson(relativePath);
  if (!Array.isArray(parsed)) throw new Error(`${relativePath} must be an array`);

  return parsed.map((item) => {
    if (!isRecord(item)) throw new Error(`${relativePath} contains non-object fixture`);
    const expected = item.expected;
    if (
      typeof item.id !== 'string' ||
      (item.input_type !== 'rep_note' && item.input_type !== 'client_sms') ||
      typeof item.stage_at_time !== 'string' ||
      !(typeof item.product_at_time === 'string' || item.product_at_time === null) ||
      typeof item.text !== 'string' ||
      !isRecord(expected)
    ) {
      throw new Error(`${relativePath} contains invalid fixture shape`);
    }

    return {
      id: item.id,
      input_type: item.input_type,
      stage_at_time: item.stage_at_time,
      product_at_time: item.product_at_time,
      text: item.text,
      expected,
    };
  });
}

function readCsvRows<T extends Record<string, string>>(relativePath: string): T[] {
  const parsed = parse(fs.readFileSync(resolvePath(relativePath), 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${relativePath} must parse to an array`);

  return parsed.map((row) => {
    if (!isRecord(row)) throw new Error(`${relativePath} contains non-object row`);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')])) as T;
  });
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed)) throw new Error('Expected JSON object');
  return parsed;
}

function parseBaselineRows(): BaselineRow[] {
  return readCsvRows<Record<string, string>>('111/pipeline-golden-results.csv').map((row) => {
    if (!GRADES.includes(row.row_grade as Grade) && row.row_grade !== 'PERFECT') {
      throw new Error(`Unexpected row grade: ${row.row_grade}`);
    }
    return {
      id: row.id,
      row_grade: row.row_grade as RowGrade,
      expected_json: row.expected_json,
      output_json: row.output_json,
      field_grades_json: row.field_grades_json,
    };
  });
}

function parseCorpusRows(): CorpusRow[] {
  return readCsvRows<Record<string, string>>('111/pipeline-extraction-review.csv').map((row) => {
    if (row.input_type !== 'rep_note' && row.input_type !== 'client_sms') {
      throw new Error(`Unexpected corpus input type: ${row.input_type}`);
    }
    return {
      row_id: row.row_id,
      input_type: row.input_type,
      output_json: row.output_json,
      skip_reason: row.skip_reason,
    };
  });
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

function gradeString(expected: unknown, actual: unknown): Grade {
  if (expected === actual) return 'PASS';
  const expectedText = normalizeString(expected);
  const actualText = normalizeString(actual);
  if (!actualText) return 'FAIL';
  if (expectedText === actualText) return 'PASS';
  if (expectedText.includes(actualText) || actualText.includes(expectedText)) return 'PARTIAL';
  const expectedTokens = new Set(expectedText.split(/\s+/u).filter(Boolean));
  const actualTokens = actualText.split(/\s+/u).filter(Boolean);
  return actualTokens.some((token) => expectedTokens.has(token)) ? 'PARTIAL' : 'FAIL';
}

function getNumberField(value: unknown, field: string): number | null {
  if (!isRecord(value)) return null;
  const candidate = value[field];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function gradeMoney(expected: unknown, actual: unknown): Grade {
  if (expected === null || actual === null) return expected === actual ? 'PASS' : 'FAIL';
  const expectedValue = getNumberField(expected, 'value_usd');
  const actualValue = getNumberField(actual, 'value_usd');
  if (expectedValue === null || actualValue === null) return 'FAIL';
  if (expectedValue === actualValue) return 'PASS';
  return Math.abs(expectedValue - actualValue) / Math.max(Math.abs(expectedValue), 1) <= 0.1 ? 'PARTIAL' : 'FAIL';
}

function gradeUseOfFunds(expected: unknown, actual: unknown): Grade {
  if (expected === null || actual === null) return expected === actual ? 'PASS' : 'FAIL';
  if (!isRecord(expected) || !isRecord(actual)) return 'FAIL';
  const categoryMatches = expected.category === actual.category;
  const expectedDetail = expected.detail;
  const actualDetail = actual.detail;
  const detailGrade = expectedDetail ? gradeString(expectedDetail, actualDetail || '') : null;
  if (categoryMatches && (!detailGrade || detailGrade === 'PASS')) return 'PASS';
  if (categoryMatches) return 'PARTIAL';
  return detailGrade === 'PASS' || detailGrade === 'PARTIAL' ? 'PARTIAL' : 'FAIL';
}

function toStringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(value.filter((item): item is string => typeof item === 'string'));
}

function gradeArraySet(expected: unknown, actual: unknown): Grade {
  const expectedSet = toStringSet(expected);
  const actualSet = toStringSet(actual);
  const sameSize = expectedSet.size === actualSet.size;
  const exact = sameSize && [...expectedSet].every((item) => actualSet.has(item));
  if (exact) return 'PASS';
  return [...expectedSet].some((item) => actualSet.has(item)) ? 'PARTIAL' : 'FAIL';
}

function gradePendingActions(expected: unknown, actual: unknown): Grade {
  const expectedActions = Array.isArray(expected) ? expected.filter(isRecord) : [];
  const actualActions = Array.isArray(actual) ? actual.filter(isRecord) : [];
  if (expectedActions.length === 0) return actualActions.length === 0 ? 'PASS' : 'PARTIAL';
  if (actualActions.length === 0) return 'FAIL';

  const expectedAction = expectedActions[0];
  const bestActual = actualActions.find((item) => item.actor === expectedAction.actor) || actualActions[0];
  const actorMatches = bestActual.actor === expectedAction.actor;
  const timingMatches = bestActual.timing === expectedAction.timing;
  const actionGrade = gradeString(expectedAction.action || '', bestActual.action || '');
  if (actorMatches && timingMatches && actionGrade === 'PASS') return 'PASS';
  if (actorMatches && (timingMatches || actionGrade === 'PASS' || actionGrade === 'PARTIAL')) return 'PARTIAL';
  return 'FAIL';
}

function gradeBool(expected: unknown, actual: unknown): Grade {
  return expected === actual ? 'PASS' : 'FAIL';
}

function gradeCurrentPositions(expected: unknown, actual: unknown): Grade {
  if (expected === null && actual === null) return 'PASS';
  if (expected === null || actual === null || !isRecord(expected) || !isRecord(actual)) return 'FAIL';
  const countMatches = expected.count === actual.count;
  const debtMatches = expected.total_debt_usd === actual.total_debt_usd;
  if (countMatches && debtMatches) return 'PASS';
  return countMatches || debtMatches ? 'PARTIAL' : 'FAIL';
}

function gradeRecentStacking(expected: unknown, actual: unknown): Grade {
  if (!isRecord(expected) || !isRecord(actual)) return 'FAIL';
  const activeMatches = expected.active === actual.active;
  const windowMatches = expected.window === actual.window;
  if (activeMatches && windowMatches) return 'PASS';
  return activeMatches ? 'PARTIAL' : 'FAIL';
}

const FIELD_GRADERS: Record<string, (expected: unknown, actual: unknown) => Grade> = {
  industry: gradeString,
  monthly_revenue: gradeMoney,
  use_of_funds: gradeUseOfFunds,
  requested_amount: gradeMoney,
  product_interest: gradeArraySet,
  pending_actions: gradePendingActions,
  has_stacked_history: gradeBool,
  current_active_positions: gradeCurrentPositions,
  recent_stacking_activity: gradeRecentStacking,
};

function gradeExpectedFields(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): Record<string, Grade> {
  return Object.fromEntries(
    Object.entries(expected).map(([field, expectedValue]) => {
      const grader = FIELD_GRADERS[field];
      return [field, grader ? grader(expectedValue, actual[field]) : 'FAIL'];
    }),
  );
}

function resolveRowGrade(fieldGrades: Record<string, Grade>): RowGrade {
  const grades = Object.values(fieldGrades);
  if (grades.every((grade) => grade === 'PASS')) return 'PERFECT';
  if (grades.some((grade) => grade === 'FAIL')) return 'FAIL';
  return 'PARTIAL';
}

function isPipelineSignalsShape(value: unknown): value is PipelineAiSignals {
  return (
    isRecord(value) &&
    value._extraction_scope === 'lead_only' &&
    (value.skip_reason === null || typeof value.skip_reason === 'string') &&
    typeof value.industry === 'string' &&
    (value.monthly_revenue === null || isRecord(value.monthly_revenue)) &&
    (value.use_of_funds === null || isRecord(value.use_of_funds)) &&
    (value.requested_amount === null || isRecord(value.requested_amount)) &&
    Array.isArray(value.product_interest) &&
    Array.isArray(value.pending_actions) &&
    typeof value.has_stacked_history === 'boolean' &&
    (value.current_active_positions === null || isRecord(value.current_active_positions)) &&
    isRecord(value.recent_stacking_activity) &&
    typeof value.recent_stacking_activity.active === 'boolean'
  );
}

describe('Pipeline AI golden grader', () => {
  it('должен держать canonical fixtures и standalone golden set синхронизированными', () => {
    const fixtures = readGoldenFixtures('scl-pipeline-ai-handoff/pipeline-ai.fixtures.json');
    const standaloneGolden = readGoldenFixtures('scl-pipeline-ai-handoff/golden_test_set.json');

    expect(fixtures).toHaveLength(15);
    expect(standaloneGolden).toEqual(fixtures);
    expect(fixtures.map((item) => item.id)).toEqual(
      Array.from({ length: 15 }, (_, index) => `golden_${String(index + 1).padStart(2, '0')}`),
    );
  });

  it('должен поддерживать PASS/PARTIAL/FAIL для денег, массивов и pending actions', () => {
    expect(gradeMoney({ value_usd: 100000, raw: '100k' }, { value_usd: 100000, raw: '$100k' })).toBe('PASS');
    expect(gradeMoney({ value_usd: 100000, raw: '100k' }, { value_usd: 109000, raw: '109k' })).toBe('PARTIAL');
    expect(gradeMoney({ value_usd: 100000, raw: '100k' }, { value_usd: 125000, raw: '125k' })).toBe('FAIL');
    expect(gradeArraySet(['MCA', 'EQUIPMENT'], ['EQUIPMENT', 'MCA'])).toBe('PASS');
    expect(gradeArraySet(['MCA', 'EQUIPMENT'], ['MCA', 'LOC'])).toBe('PARTIAL');
    expect(gradeArraySet(['SBA'], ['LOC'])).toBe('FAIL');
    expect(
      gradePendingActions(
        [{ actor: 'rep', action: 'follow up after lead talks to wife', timing: 'next_week' }],
        [{ actor: 'rep', action: 'follow up Monday', timing: 'next_week' }],
      ),
    ).toBe('PARTIAL');
  });

  it('должен воспроизводить 15-case golden baseline и distribution из CSV', () => {
    const baselineRows = parseBaselineRows();
    const actualDistribution: Record<RowGrade, number> = { PERFECT: 0, PARTIAL: 0, FAIL: 0 };

    for (const row of baselineRows) {
      const expected = parseJsonRecord(row.expected_json);
      const actual = parseJsonRecord(row.output_json);
      const expectedGrades = parseJsonRecord(row.field_grades_json);
      const actualGrades = gradeExpectedFields(expected, actual);
      const rowGrade = resolveRowGrade(actualGrades);

      expect(actualGrades).toEqual(expectedGrades);
      expect(rowGrade).toBe(row.row_grade);
      actualDistribution[rowGrade] += 1;
    }

    expect(baselineRows).toHaveLength(15);
    expect(actualDistribution).toEqual({ PERFECT: 9, PARTIAL: 5, FAIL: 1 });
  });

  it('должен валидировать 80-row extraction review corpus как schema-compatible baseline', () => {
    const corpusRows = parseCorpusRows();
    const skipReasons = new Set<string>();

    for (const row of corpusRows) {
      const output = parseJsonRecord(row.output_json);
      expect(isPipelineSignalsShape(output)).toBe(true);
      if (row.skip_reason) {
        expect(output.skip_reason).toBe(row.skip_reason);
        skipReasons.add(row.skip_reason);
      }
    }

    expect(corpusRows).toHaveLength(80);
    expect(corpusRows[0]?.row_id).toBe('notes_001');
    expect(corpusRows[79]?.row_id).toBe('inbound_050');
    expect([...skipReasons].sort()).toEqual([
      'contact_info_only',
      'no_signal',
      'too_short',
      'unintelligible',
      'unrelated',
    ]);
  });

  it('должен включать existing signals в payload для inheritance/merge сценариев', () => {
    const existingSignals: PipelineAiSignals = {
      _extraction_scope: 'lead_only',
      skip_reason: null,
      industry: 'trucking',
      monthly_revenue: { value_usd: 80000, raw: '$80k/mo' },
      use_of_funds: null,
      requested_amount: null,
      product_interest: ['MCA'],
      pending_actions: [],
      has_stacked_history: false,
      current_active_positions: null,
      recent_stacking_activity: { active: false, window: null },
    };

    const payload = buildPipelineAiPayload({
      existingSignals,
      inputType: 'rep_note',
      text: 'Rep says revenue is now 120k monthly and wants 50k for equipment.',
      stageAtTime: DealStage.QUALIFIED,
      productAtTime: ProductType.MCA,
    });

    expect(payload).toContain('[EXISTING SIGNALS]');
    expect(payload).toContain(JSON.stringify(existingSignals));
    expect(payload).toContain('[NEW INPUT]');
    expect(payload).toContain('type: rep_note');
    expect(payload).toContain('stage_at_time: QUALIFIED');
    expect(payload).toContain('product_at_time: MCA');
  });
});
