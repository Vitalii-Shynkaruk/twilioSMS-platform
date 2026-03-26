import { clsx } from 'clsx';
import { Flame, Clock, User, AlertTriangle } from 'lucide-react';
import type { Deal } from '../../types';

const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: '#6366f1',
  ENGAGED_INTERESTED: '#3b82f6',
  QUALIFIED: '#8b5cf6',
  SUBMITTED_IN_REVIEW: '#f59e0b',
  APPROVED_OFFERS: '#10b981',
  COMMITTED_FUNDING: '#06b6d4',
  FUNDED: '#22c55e',
  NURTURE: '#f97316',
  CLOSED: '#ef4444',
};

// Product color system per spec: MCA=gold, SBA=blue, Equipment=green, HELOC=purple, CRE=coral, Bridge=teal
const PRODUCT_COLORS: Record<string, string> = {
  MCA: 'bg-amber-500/20 text-amber-400',
  LOC: 'bg-blue-500/20 text-blue-400',
  EQUIPMENT: 'bg-green-500/20 text-green-400',
  HELOC: 'bg-purple-500/20 text-purple-400',
  SBA: 'bg-blue-600/20 text-blue-300',
  CRE: 'bg-rose-500/20 text-rose-400',
  BRIDGE: 'bg-teal-500/20 text-teal-400',
};

function formatCurrency(amount?: number | null): string {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

interface DealCardProps {
  deal: Deal;
  onClick?: () => void;
  compact?: boolean;
}

export default function DealCard({ deal, onClick, compact }: DealCardProps) {
  const stageColor = STAGE_COLORS[deal.stage] || '#6366f1';
  const isOverdue = deal.nextActionDue && new Date(deal.nextActionDue) < new Date();
  const isStale = (deal.staleDays || 0) > 0;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-lg border cursor-pointer transition-all hover:shadow-md group',
        'bg-[var(--bg-secondary)] border-[var(--border-primary)]',
        deal.isHot && 'ring-1 ring-orange-500/50',
        isOverdue && 'ring-1 ring-red-500/60 animate-pulse',
        compact ? 'p-2' : 'p-3',
      )}
    >
      {/* Header: Business name + hot indicator */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">
          {deal.client?.businessName || 'Unknown'}
        </h4>
        <div className="flex items-center gap-1 flex-shrink-0">
          {deal.isHot && <Flame className="w-3.5 h-3.5 text-orange-500" />}
          {isOverdue && <AlertTriangle className="w-3 h-3 text-red-400" />}
        </div>
      </div>

      {/* Amount + Product */}
      <div className="flex items-center gap-2 mt-1.5">
        {deal.dealAmount ? (
          <span className="text-xs font-semibold text-[var(--text-primary)]">{formatCurrency(deal.dealAmount)}</span>
        ) : (
          <span className="text-xs text-[var(--text-muted)] italic">Needs $</span>
        )}
        {deal.productType && (
          <span
            className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              PRODUCT_COLORS[deal.productType] || 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
            )}
          >
            {deal.productType}
          </span>
        )}
      </div>

      {/* Stale indicator bar */}
      {!compact && isStale && (
        <div className="mt-1.5 h-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full',
              deal.staleDays! >= 3 ? 'bg-red-500' : deal.staleDays! >= 2 ? 'bg-amber-500' : 'bg-yellow-500',
            )}
            style={{ width: `${Math.min(100, (deal.staleDays || 0) * 20)}%` }}
          />
        </div>
      )}

      {/* Committed sub-status track (execution mode) */}
      {!compact && deal.stage === 'COMMITTED_FUNDING' && deal.commitSubStatus && (
        <div className="flex gap-1 mt-1.5">
          {(['DOCS_REQUESTED', 'DOCS_SIGNED', 'FUNDING'] as const).map((s, i) => {
            const steps = ['DOCS_REQUESTED', 'DOCS_SIGNED', 'FUNDING'];
            const currentIdx = steps.indexOf(deal.commitSubStatus!);
            return (
              <div
                key={s}
                className={clsx('flex-1 h-1 rounded-full', i <= currentIdx ? 'bg-cyan-500' : 'bg-[var(--bg-tertiary)]')}
              />
            );
          })}
        </div>
      )}

      {/* Footer: Rep + Days */}
      {!compact && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-primary)]">
          {/* Rep pill */}
          {deal.assignedRep ? (
            <div className="flex items-center gap-1">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: deal.assignedRep.avatarColor || stageColor }}
              >
                {deal.assignedRep.initials || deal.assignedRep.firstName[0]}
              </div>
            </div>
          ) : (
            <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          )}

          {/* Days in stage */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-[var(--text-muted)]" />
            <span
              className={clsx(
                'text-[10px] font-medium',
                deal.daysInStage >= 5
                  ? 'text-red-400'
                  : deal.daysInStage >= 3
                    ? 'text-amber-400'
                    : 'text-[var(--text-muted)]',
              )}
            >
              {deal.daysInStage}d
            </span>
          </div>

          {/* Next action */}
          {deal.nextAction && (
            <span
              className={clsx(
                'text-[10px] truncate max-w-[80px]',
                isOverdue ? 'text-red-400 font-medium' : 'text-[var(--text-muted)]',
              )}
            >
              {deal.nextAction}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { STAGE_COLORS, PRODUCT_COLORS, formatCurrency };
