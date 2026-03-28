import { Fragment } from 'react';
import type { Deal, CommitSubStatus } from '../../types';
import { useAuthStore } from '../../stores/authStore';

// ─── Exported constants (used by DealPanel, CommandCenter, etc.) ───

export const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: '#4A9EE8',
  ENGAGED_INTERESTED: '#9B72E8',
  QUALIFIED: '#C9952A',
  SUBMITTED_IN_REVIEW: '#4A9EE8',
  APPROVED_OFFERS: '#FF8C00',
  COMMITTED_FUNDING: '#3AB97A',
  FUNDED: '#3AB97A',
  NURTURE: '#4A9EE8',
  CLOSED: '#536070',
};

export const PRODUCT_COLORS: Record<string, string> = {
  MCA: 'bg-amber-500/20 text-amber-400',
  LOC: 'bg-blue-500/20 text-blue-400',
  EQUIPMENT: 'bg-green-500/20 text-green-400',
  HELOC: 'bg-purple-500/20 text-purple-400',
  SBA: 'bg-blue-600/20 text-blue-300',
  CRE: 'bg-rose-500/20 text-rose-400',
  BRIDGE: 'bg-teal-500/20 text-teal-400',
};

export function formatCurrency(amount?: number | null): string {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}k`;
  return `$${amount.toLocaleString()}`;
}

// ─── Internal helpers ───

const PRODUCT_TAG: Record<string, { cls: string; label: string }> = {
  MCA: { cls: 't-mca', label: 'MCA' },
  LOC: { cls: 't-con', label: 'LOC' },
  EQUIPMENT: { cls: 't-eq', label: 'Equipment' },
  HELOC: { cls: 't-hel', label: 'HELOC' },
  SBA: { cls: 't-sba', label: 'SBA' },
  CRE: { cls: 't-sba', label: 'CRE' },
  BRIDGE: { cls: 't-con', label: 'Bridge' },
};

const PRODUCT_BADGE: Record<string, { icon: string; color: string; bg: string }> = {
  MCA: { icon: '⚡', color: '#C9952A', bg: 'rgba(201,149,42,0.15)' },
  LOC: { icon: '💳', color: '#4A9EE8', bg: 'rgba(74,158,232,0.15)' },
  HELOC: { icon: '🏠', color: '#9B72E8', bg: 'rgba(155,114,232,0.15)' },
  EQUIPMENT: { icon: '🔧', color: '#3AB97A', bg: 'rgba(58,185,122,0.15)' },
  SBA: { icon: '🏛', color: '#3AB97A', bg: 'rgba(58,185,122,0.15)' },
  CRE: { icon: '🏢', color: '#D06828', bg: 'rgba(208,104,40,0.15)' },
  BRIDGE: { icon: '🌉', color: '#D4A940', bg: 'rgba(212,169,64,0.15)' },
};

const REP_COLORS = ['#C9952A', '#3AB97A', '#4A9EE8', '#9B72E8', '#D06828', '#E24B4A'];

function repColor(rep?: { firstName: string; avatarColor?: string } | null): string {
  if (!rep) return REP_COLORS[0];
  return rep.avatarColor || REP_COLORS[rep.firstName.charCodeAt(0) % REP_COLORS.length];
}

function repInitials(rep?: { firstName: string; lastName?: string; initials?: string } | null): string {
  if (!rep) return '?';
  if (rep.initials) return rep.initials;
  return (rep.firstName[0] + (rep.lastName?.[0] || '')).toUpperCase();
}

function dueInfo(dateStr?: string | null) {
  if (!dateStr) return { text: '', cls: 'due-nm', isOverdue: false, isToday: false };
  const d = new Date(dateStr);
  const now = new Date();
  const dNorm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nNorm = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((dNorm.getTime() - nNorm.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, cls: 'due-od', isOverdue: true, isToday: false };
  if (diff === 0) return { text: 'Today', cls: 'due-td', isOverdue: false, isToday: true };
  if (diff === 1) return { text: 'Tomorrow', cls: 'due-gr', isOverdue: false, isToday: false };
  return { text: `in ${diff}d`, cls: 'due-nm', isOverdue: false, isToday: false };
}

function simpleDueInfo(dateStr?: string | null) {
  if (!dateStr) return { text: '', cls: 'st-nm' };
  const d = new Date(dateStr);
  const now = new Date();
  const dNorm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nNorm = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((dNorm.getTime() - nNorm.getTime()) / 86400000);
  if (diff < 0) return { text: 'OVERDUE', cls: 'st-od' };
  if (diff === 0) return { text: 'Today', cls: 'st-td' };
  if (diff === 1) return { text: 'Tomorrow', cls: 'st-good' };
  return { text: `${diff}d`, cls: 'st-nm' };
}

function simpleCardState(deal: Deal): string {
  const due = dueInfo(deal.nextActionDue);
  if (deal.isHot) return 'sc-hot';
  if (due.isOverdue) return 'sc-overdue';
  if (due.isToday) return 'sc-today';
  if (deal.stage === 'FUNDED') return 'sc-good';
  if (deal.staleDays <= 0) return 'sc-good';
  return 'sc-normal';
}

function cardPriority(deal: Deal): string {
  if (deal.stage === 'CLOSED') return 'disq';
  const due = dueInfo(deal.nextActionDue);
  if (due.isOverdue) return 'p-od';
  if (!deal.nextAction && !['FUNDED', 'CLOSED', 'NURTURE'].includes(deal.stage)) return 'p-mna';
  if (deal.isHot) return 'p-hot';
  if (due.isToday) return 'p-td';
  if (deal.renewalTasks?.some((t) => t.status === 'PENDING')) return 'p-renew';
  if (deal.staleDays <= 0) return 'p-good';
  return 'p-nm';
}

function staleBarCls(days: number): string {
  if (days <= 0) return 'sb-fresh';
  if (days <= 1) return 'sb-warm';
  if (days <= 3) return 'sb-stale';
  return 'sb-dead';
}

function staleTxt(days: number): { text: string; cls: string } {
  if (days <= 0) return { text: 'Active', cls: 'fresh' };
  if (days <= 1) return { text: `${days}d ago`, cls: 'warm' };
  if (days <= 3) return { text: `${days}d ago`, cls: 'stale' };
  return { text: `${days}d STALE`, cls: 'dead' };
}

// Stages where dollar amounts should NEVER appear unless a real lender offer exists
const NO_AMOUNT_STAGES: string[] = ['NEW_LEAD', 'ENGAGED_INTERESTED', 'QUALIFIED', 'SUBMITTED_IN_REVIEW'];

function simpleAmount(deal: Deal): { text: string; cls: string } {
  // FUNDED — show from funding events
  if (deal.stage === 'FUNDED' && deal.fundingEvents?.length) {
    return { text: `💰 ${formatCurrency(deal.fundingEvents[0].amountFunded)}`, cls: 'sca-green' };
  }
  // APPROVED / COMMITTED — show best offer
  if ((deal.stage === 'APPROVED_OFFERS' || deal.stage === 'COMMITTED_FUNDING') && deal.offers?.length) {
    const best = deal.offers.reduce((a, b) => (a.amount > b.amount ? a : b));
    const prefix = deal.stage === 'COMMITTED_FUNDING' ? '✅ ' : '💰 ';
    return { text: `${prefix}${formatCurrency(best.amount)}`, cls: best.amount >= 300000 ? 'sca-green' : 'sca-amber' };
  }
  // NURTURE — show previous offer if it existed
  if (deal.stage === 'NURTURE' && deal.prevOffer) {
    return { text: `💰 ${formatCurrency(deal.prevOffer)} prev`, cls: 'sca-prev' };
  }
  // Early stages — NO dollar amounts unless a real lender offer exists
  if (NO_AMOUNT_STAGES.includes(deal.stage)) {
    // Only show if there are actual lender offers recorded
    if (deal.offers?.length) {
      const best = deal.offers.reduce((a, b) => (a.amount > b.amount ? a : b));
      return { text: `💲${formatCurrency(best.amount)}`, cls: best.amount >= 25000 ? 'sca-green' : 'sca-amber' };
    }
    return { text: '', cls: 'sca-hide' };
  }
  // Other stages with offers
  if (deal.offers?.length) {
    const best = deal.offers.reduce((a, b) => (a.amount > b.amount ? a : b));
    return { text: `💲${formatCurrency(best.amount)}`, cls: best.amount >= 25000 ? 'sca-green' : 'sca-amber' };
  }
  return { text: '—', cls: 'sca-gray' };
}

function offerStrength(amount: number): string {
  if (amount >= 100000) return 'ob-strong';
  if (amount >= 50000) return 'ob-mid';
  return 'ob-weak';
}

function csubCls(status?: CommitSubStatus | null): string {
  if (status === 'DOCS_REQUESTED') return 'csub-docs-req';
  if (status === 'DOCS_SIGNED') return 'csub-docs-signed';
  if (status === 'FUNDING') return 'csub-funding';
  return '';
}

function csubLabel(status?: CommitSubStatus | null): string {
  if (status === 'DOCS_REQUESTED') return '📝 Docs Requested';
  if (status === 'DOCS_SIGNED') return '✍ Docs Signed';
  if (status === 'FUNDING') return '💰 Funding in Progress';
  return '';
}

const CSUB_STEPS: CommitSubStatus[] = ['DOCS_REQUESTED', 'DOCS_SIGNED', 'FUNDING'];
const CSUB_LABELS = ['Docs Req', 'Signed', 'Funding'];

// ─── Main component ───

interface DealCardProps {
  deal: Deal;
  onClick?: () => void;
  viewMode?: 'simple' | 'execution';
  compact?: boolean;
}

export default function DealCard({ deal, onClick, viewMode, compact }: DealCardProps) {
  const mode = viewMode || (compact ? 'simple' : 'execution');
  if (mode === 'simple') return <SimpleCard deal={deal} onClick={onClick} />;
  return <ExecutionCard deal={deal} onClick={onClick} />;
}

// ═══════════════════════════════════════
// SIMPLE CARD — scan mode
// name · $amount (if offer) · 1 action · time
// ═══════════════════════════════════════

function SimpleCard({ deal, onClick }: { deal: Deal; onClick?: () => void }) {
  const state = simpleCardState(deal);
  const amt = simpleAmount(deal);
  const due = simpleDueInfo(deal.nextActionDue);
  const hasAmount = amt.text && amt.cls !== 'sca-hide';

  // "In review" badge for SUBMITTED_IN_REVIEW
  const reviewBadge = deal.stage === 'SUBMITTED_IN_REVIEW' ? (
    <div className="sc-review-badge">
      {deal.productType === 'EQUIPMENT' ? '🔧' : deal.productType === 'SBA' || deal.productType === 'CRE' ? '🏛' : '⚡'} In review
    </div>
  ) : null;

  return (
    <div className={`s-card ${state}`} onClick={onClick}>
      <div style={{ padding: '10px 11px 8px' }}>
        {deal.isHot && <div className="sc-hot-badge">🔥 HOT</div>}
        {reviewBadge}
        {hasAmount && <div className={`sc-amount ${amt.cls}`}>{amt.text}</div>}
        <div className="sc-name">{deal.client?.businessName || 'Unknown'}</div>
        {deal.nextAction ? (
          <div className="sc-action-row">
            <span className="sc-action">{deal.nextAction}</span>
            {due.text && <span className={`sc-time ${due.cls}`}>{due.text}</span>}
          </div>
        ) : (
          !['FUNDED', 'CLOSED', 'NURTURE'].includes(deal.stage) && <div className="sc-no-action">⚠ No action set</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// EXECUTION CARD — full analytical mode
// ═══════════════════════════════════════

function ExecutionCard({ deal, onClick }: { deal: Deal; onClick?: () => void }) {
  const priority = cardPriority(deal);
  const sbar = staleBarCls(deal.staleDays);
  const stale = staleTxt(deal.staleDays);
  const due = dueInfo(deal.nextActionDue);
  const { user } = useAuthStore();

  const bestOffer = deal.offers?.length ? deal.offers.reduce((a, b) => (a.amount > b.amount ? a : b)) : null;

  const naRowCls = due.isOverdue ? 'na-od' : due.isToday ? 'na-td' : '';
  const naDotBg = due.isOverdue ? 'var(--urgent)' : due.isToday ? 'var(--watch)' : 'var(--text3)';

  // Nurture urgency — compute outside JSX to avoid impure Date calls in render
  const nurtureDaysUntil =
    deal.stage === 'NURTURE' && deal.nurtureType === '30d' && deal.nextActionDue
      ? Math.ceil((new Date(deal.nextActionDue).getTime() - new Date().getTime()) / 86400000)
      : null;

  // Co-rep badges
  const assistIds: string[] = (deal.assistingRepIds as string[]) || [];
  const hasAssists = assistIds.length > 0;
  const meId = user?.id;
  const imPrimary = meId === deal.assignedRepId;
  const imAssisting = meId && assistIds.includes(meId);

  return (
    <div className={`card ${priority}`} onClick={onClick}>
      {/* Staleness bar */}
      <div className={`sbar ${sbar}`} />

      <div className="cb">
        {/* Top: name + badges */}
        <div className="c-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="c-name">{deal.client?.businessName || 'Unknown'}</div>
            {deal.client?.contactName && <div className="c-biz">{deal.client.contactName}</div>}
          </div>
          <div className="bdgs">
            {deal.isHot && <span className="b b-hot">🔥HOT</span>}
            {deal.stage === 'NURTURE' && <span className="b b-lost">LOST</span>}
            {deal.client && deal.client.fundingCount > 0 && <span className="b b-renew">↻</span>}
          </div>
        </div>

        {/* Product badge + days in stage row */}
        {deal.productType &&
          (() => {
            const pb = PRODUCT_BADGE[deal.productType];
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
                {pb && (
                  <span className="prod-badge" style={{ background: pb.bg, color: pb.color }}>
                    {pb.icon} {PRODUCT_TAG[deal.productType]?.label || deal.productType}
                  </span>
                )}
              </div>
            );
          })()}

        {/* HOT reason row */}
        {deal.isHot && (
          <div className="hot-row">
            <span>
              🔥 {deal.lenderEngaged ? 'Lender engaged' : deal.offers?.length ? 'Offer received' : 'Active reply'}
            </span>
          </div>
        )}

        {/* System status pill (QUALIFIED stage) */}
        {deal.stage === 'QUALIFIED' && (
          <div
            className={`status-pill ${
              !deal.appSubmitted
                ? 'sp-needs-app'
                : !deal.offers?.length
                  ? 'sp-awaiting'
                  : (deal.offers?.length || 0) > 1
                    ? 'sp-multi'
                    : 'sp-offer'
            }`}
          >
            <div className="sp-dot" />
            <span className="sp-text">
              {!deal.appSubmitted
                ? 'Needs app'
                : !deal.offers?.length
                  ? 'Awaiting offers'
                  : (deal.offers?.length || 0) > 1
                    ? `${deal.offers!.length} offers`
                    : 'Offer received'}
            </span>
          </div>
        )}

        {/* Review pill (SUBMITTED_IN_REVIEW stage) */}
        {deal.stage === 'SUBMITTED_IN_REVIEW' &&
          deal.daysInStage > 0 &&
          (() => {
            const productDays: Record<string, number> = { MCA: 2, LOC: 2, EQUIPMENT: 5, HELOC: 30, SBA: 60, CRE: 60 };
            const threshold = productDays[deal.productType || 'MCA'] || 2;
            const pNote =
              deal.productType === 'MCA' || deal.productType === 'LOC'
                ? '2d flag'
                : deal.productType === 'EQUIPMENT'
                  ? '5d flag'
                  : deal.productType === 'HELOC'
                    ? '30d flag'
                    : '60d flag';
            if (deal.daysInStage >= threshold) {
              return (
                <div className="review-pill review-late">
                  ⚠ Day {deal.daysInStage} in review · {pNote} — check lender status
                </div>
              );
            }
            if (deal.daysInStage >= threshold * 0.6) {
              return (
                <div className="review-pill review-mid">
                  Day {deal.daysInStage} in review · {pNote}
                </div>
              );
            }
            return <div className="review-pill review-early">In underwriting · {pNote}</div>;
          })()}

        {/* Returning client */}
        {deal.client && deal.client.fundingCount > 0 && (
          <div className="ret-pill">
            <span>↻ Returning · {deal.client.fundingCount}x funded</span>
          </div>
        )}

        {/* Offer block */}
        {bestOffer && deal.stage !== 'FUNDED' && deal.stage !== 'NURTURE' && (
          <div className={`offer-block ${offerStrength(bestOffer.amount)}`}>
            {deal.offers!.length === 1 ? (
              <>
                <div className="ob-main">
                  <span className="ob-amount">{formatCurrency(bestOffer.amount)}</span>
                </div>
                <div className="ob-tags">
                  <span className="ob-lender">{bestOffer.lenderName}</span>
                  {bestOffer.terms && <span className="ob-best">{bestOffer.terms}</span>}
                </div>
              </>
            ) : (
              deal.offers!.map((o) => (
                <div key={o.id} className="ob-multi-row">
                  <span className="ob-ml">{o.lenderName}</span>
                  <span className={`ob-ma ${o.amount >= 100000 ? 'g' : o.amount >= 50000 ? 'w' : 'u'}`}>
                    {formatCurrency(o.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Funded block */}
        {deal.stage === 'FUNDED' && deal.fundingEvents?.length ? (
          <>
            <div className="funded-block">
              <div className="fb-amount">{formatCurrency(deal.fundingEvents[0].amountFunded)}</div>
              <div className="fb-meta">
                {deal.fundingEvents[0].lender ? `${deal.fundingEvents[0].lender} · ` : ''}
                {deal.cycleTime ? `${deal.cycleTime}d cycle` : ''}
              </div>
            </div>
            <div className="funded-meta">
              {deal.fundedDate && <span>{new Date(deal.fundedDate).toLocaleDateString()}</span>}
              {deal.cycleTime && <span className="funded-cycle">{deal.cycleTime}d</span>}
            </div>
          </>
        ) : null}

        {/* Nurture previous offer + lost reason */}
        {deal.stage === 'NURTURE' && (
          <>
            {deal.prevOffer && (
              <div className="prev-block">
                <div className="pb-amount">Prev: {formatCurrency(deal.prevOffer)}</div>
                <div className="pb-label">Best offer before close</div>
              </div>
            )}
            {deal.lostReason && <div className="lost-r">&ldquo;{deal.lostReason}&rdquo;</div>}
            {/* Decay pill */}
            {deal.daysInStage > 0 && (() => {
              const d = deal.daysInStage;
              const cls = d >= 90 ? 'nd-90' : d >= 60 ? 'nd-60' : d >= 30 ? 'nd-30' : '';
              if (!cls) return null;
              return (
                <span className={`nd-pill ${cls}`}>
                  {d >= 90 ? '🔴' : d >= 60 ? '🟠' : '🟡'} {d}d in nurture
                </span>
              );
            })()}
          </>
        )}

        {/* Nurture urgency pill */}
        {nurtureDaysUntil !== null && nurtureDaysUntil > 0 && nurtureDaysUntil <= 7 && (
          <div className="nu-urg">
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--watch)', flexShrink: 0 }} />
            <span className="nu-t">Touch due in {nurtureDaysUntil}d</span>
          </div>
        )}

        {/* Nurture tags */}
        {deal.stage === 'NURTURE' &&
          deal.followUpType &&
          (() => {
            const NURTURE_TAG_CONFIG: Record<string, { label: string; icon: string; cls: string }> = {
              renewal: { label: 'Renewal', icon: '♻', cls: 'nt-renewal' },
              reengage: { label: 'Re-Engage', icon: '↩', cls: 'nt-re-engage' },
              'waiting-docs': { label: 'Waiting Docs', icon: '📋', cls: 'nt-waiting-docs' },
              timing: { label: 'Timing', icon: '⏰', cls: 'nt-timing' },
              competitor: { label: 'Competitor', icon: '⚔', cls: 'nt-competitor' },
            };
            const cfg = NURTURE_TAG_CONFIG[deal.followUpType];
            if (!cfg) return null;
            return (
              <div style={{ marginBottom: 3 }}>
                <span className={`n-tag ${cfg.cls}`}>
                  {cfg.icon} {cfg.label}
                </span>
              </div>
            );
          })()}

        {/* Committed sub-status track */}
        {deal.stage === 'COMMITTED_FUNDING' && deal.commitSubStatus && (
          <div className={`csub-block ${csubCls(deal.commitSubStatus)}`}>
            <div className="csub-header">
              <span className="csub-badge">{csubLabel(deal.commitSubStatus)}</span>
              {deal.daysInSubStatus > 0 && (
                <span
                  className={`csub-dis ${
                    deal.daysInSubStatus > 5
                      ? 'csub-dis-alert'
                      : deal.daysInSubStatus > 3
                        ? 'csub-dis-warn'
                        : 'csub-dis-ok'
                  }`}
                >
                  {deal.daysInSubStatus}d
                </span>
              )}
            </div>
            <div className="csub-progress">
              {CSUB_STEPS.map((step, i) => {
                const currentIdx = CSUB_STEPS.indexOf(deal.commitSubStatus!);
                const isDone = i < currentIdx;
                const isActive = i === currentIdx;
                return (
                  <Fragment key={step}>
                    {i > 0 && <div className={`csub-connector ${isDone ? 'done' : ''}`} />}
                    <div className="csub-step">
                      <div className={`csub-step-dot ${isDone ? 'done' : isActive ? 'active' : ''}`} />
                      <div className={`csub-step-label ${isDone ? 'done' : isActive ? 'active' : ''}`}>
                        {CSUB_LABELS[i]}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Days in stage pill */}
        {deal.daysInStage > 0 && !['FUNDED', 'CLOSED'].includes(deal.stage) && (
          <span
            className={`dis-pill ${deal.daysInStage > 7 ? 'dis-alert' : deal.daysInStage > 3 ? 'dis-warn' : 'dis-ok'}`}
            style={{ marginBottom: '3px' }}
          >
            {deal.daysInStage}d in stage
          </span>
        )}

        {/* Rep ownership */}
        {deal.assignedRep && (
          <div className="rep-ownership">
            <div className="rep-primary-block">
              <div className="av" style={{ background: repColor(deal.assignedRep) }}>
                {repInitials(deal.assignedRep)}
              </div>
              <span className="rep-primary-name">{deal.assignedRep.firstName}</span>
              <span className="rep-primary-label">Primary{hasAssists ? ` · ${assistIds.length} assist` : ''}</span>
            </div>
            {/* Role badge */}
            {imAssisting && !imPrimary && <span className="assist-badge">↗ You are assisting</span>}
            {imPrimary && hasAssists && <span className="shared-badge">👥 Shared deal</span>}
          </div>
        )}

        {/* Missing next action warning */}
        {!deal.nextAction && !['FUNDED', 'CLOSED', 'NURTURE'].includes(deal.stage) && (
          <div className="mna">
            <span>⚠ No next action set</span>
          </div>
        )}

        {/* Next action row */}
        {deal.nextAction && (
          <div className={`na-row ${naRowCls}`}>
            <div className="na-d" style={{ background: naDotBg }} />
            <span className="na-t">{deal.nextAction}</span>
            {deal.nextActionDue && <span className={`na-due ${due.cls}`}>{due.text}</span>}
          </div>
        )}

        {/* Renewal pill */}
        {deal.renewalTasks?.some((t) => t.status === 'PENDING') && (
          <div className="renew-pill">
            <span className="rp-t">♻ Renewal due</span>
          </div>
        )}

        {/* Footer */}
        <div className="c-foot">
          <div className="touched-by">
            {deal.assignedRep && (
              <div className="touched-av" style={{ background: repColor(deal.assignedRep) }}>
                {repInitials(deal.assignedRep)}
              </div>
            )}
            <span className={`stale-t ${stale.cls}`}>
              {deal.assignedRep ? `${repInitials(deal.assignedRep)} · ` : ''}
              {stale.text}
            </span>
          </div>
          <span className="age-t">Age: {deal.daysInStage}d</span>
        </div>
      </div>
    </div>
  );
}
