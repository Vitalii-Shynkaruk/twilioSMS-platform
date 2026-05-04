import type { Deal, PipelineAiSignals } from '../../types';

export interface PipelineAiBadgeConfig {
  key: 'industry' | 'revenue' | 'use';
  label: string;
  value: string;
  title: string;
}

export function formatUseOfFundsCategory(category: string): string {
  return category
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function formatPipelineAiAge(value?: string | null): string {
  if (!value) return 'source: AI';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'source: AI';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'source: AI · just now';
  if (mins < 60) return `source: AI · ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `source: AI · ${hours}h ago`;
  return `source: AI · ${Math.floor(hours / 24)}d ago`;
}

export function getPipelineAiBadges(signals?: PipelineAiSignals | null): PipelineAiBadgeConfig[] {
  if (!signals || signals.skip_reason) return [];

  const badges: PipelineAiBadgeConfig[] = [];
  const industry = signals.industry.trim();
  if (industry) {
    badges.push({ key: 'industry', label: 'Industry', value: industry, title: `Industry: ${industry}` });
  }

  if (signals.monthly_revenue?.raw) {
    badges.push({
      key: 'revenue',
      label: 'Revenue',
      value: signals.monthly_revenue.raw,
      title: `Monthly revenue: ${signals.monthly_revenue.raw}`,
    });
  }

  if (signals.use_of_funds) {
    const value = formatUseOfFundsCategory(signals.use_of_funds.category);
    badges.push({
      key: 'use',
      label: 'Use',
      value,
      title: signals.use_of_funds.detail ? `Use of funds: ${signals.use_of_funds.detail}` : `Use of funds: ${value}`,
    });
  }

  return badges;
}

export function getLatestPipelineNoteText(deal?: Deal | null): string {
  if (!deal) return '';
  const noteEvent = [...(deal.dealEvents || [])]
    .filter((event) => (event.eventType || '').toLowerCase().includes('note') && (event.note || '').trim())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (noteEvent?.note || deal.notes || '').trim();
}