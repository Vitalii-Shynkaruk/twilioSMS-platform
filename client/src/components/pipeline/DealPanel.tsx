import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi, dealApi, repApi } from '../../services/api';
import { MessageSquare, Plus, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import type { Deal, DealStage, Rep, Offer, ProductType, DealEvent, PipelineAiSignals, LinkedDeal } from '../../types';
import { formatCurrency, PRODUCT_ICONS, StatePillRow } from './DealCard';
import StackingChip from './StackingChip';
import PipelineAiInlineBar from './PipelineAiInlineBar';
import { getLatestPipelineNoteText } from './pipelineAiSignals';
import CreateDealModal from './CreateDealModal';
import { useAuthStore } from '../../stores/authStore';

const STAGE_LABELS: Record<DealStage, string> = {
  NEW_LEAD: 'New Lead',
  ENGAGED_INTERESTED: 'Engaged / Interested',
  QUALIFIED: 'Qualified',
  SUBMITTED_IN_REVIEW: 'Submitted (In Review)',
  APPROVED_OFFERS: 'Approved / Offers',
  COMMITTED_FUNDING: 'Committed (Funding)',
  FUNDED: 'Funded',
  NURTURE: 'Nurture',
  CLOSED: 'Closed',
};

type DuePreset = 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Future date';

const STAGE_QUICK_ACTIONS: Record<DealStage, string[]> = {
  NEW_LEAD: ['Make first contact', 'Send intro text', 'Qualify business', 'Get monthly revenue'],
  ENGAGED_INTERESTED: ['Send Follow Up', 'Get docs', 'Schedule call'],
  QUALIFIED: ['Submit application', 'Get remaining docs', 'Verify revenue'],
  SUBMITTED_IN_REVIEW: ['Follow Up With Lender', 'Collect Remaining Docs', 'Book Newtek Call'],
  APPROVED_OFFERS: ['Call Client - Present Offer', 'Collect DL/VC', 'Get Decision'],
  COMMITTED_FUNDING: ['Send PSF', 'Get Docs Signed', 'Schedule funding call'],
  FUNDED: ['Renewal check-in', 'Schedule review'],
  NURTURE: ['Check back in 30 days', 'Send market update', 'Re-qualify business'],
  CLOSED: [],
};

type AttemptKind = 'no_answer' | 'texted' | 'voicemail' | 'connected' | 'not_interested';
type ExtractPipelineResponse = { signals: PipelineAiSignals } | { skipped: true; reason: string };

const QUICK_LOG_ACTIONS: Array<{ kind: AttemptKind; label: string }> = [
  { kind: 'no_answer', label: 'No answer' },
  { kind: 'texted', label: 'Texted' },
  { kind: 'voicemail', label: 'Voicemail' },
  { kind: 'connected', label: 'Connected' },
  { kind: 'not_interested', label: 'Not interested' },
];

function extractSmsCampaignSource(clientNotes?: string | null): string {
  if (!clientNotes) return '';
  const match = clientNotes.match(/Source:\s*SMS\s*[—-]\s*([^·\n\r]+)/i);
  return match?.[1]?.trim() || '';
}

function getDuePresetFromDate(nextActionDue?: string | null): DuePreset {
  if (!nextActionDue) return 'Future date';
  const dateOnly = nextActionDue.split('T')[0];
  if (!dateOnly) return 'Future date';
  const due = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 'Future date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return 'This week';
  return 'Future date';
}

function dateFromDuePreset(preset: DuePreset): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (preset === 'Overdue') d.setDate(d.getDate() - 1);
  if (preset === 'Tomorrow') d.setDate(d.getDate() + 1);
  if (preset === 'This week') d.setDate(d.getDate() + 4);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRelativeShort(iso?: string): string {
  if (!iso) return 'No activity yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTimeNoSeconds(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLinkedDealAmount(linkedDeal: Deal | LinkedDeal): string {
  const amount =
    linkedDeal.stage === 'NURTURE' && linkedDeal.prevOffer
      ? linkedDeal.prevOffer
      : linkedDeal.submittedAmount ?? linkedDeal.dealAmount;
  if (amount) return formatCurrency(amount);
  return linkedDeal.productType || 'No amount';
}

function formatProductLabel(productType?: ProductType | string | null): string {
  if (!productType) return 'Product';
  return `${PRODUCT_ICONS[productType] || ''} ${productType}`.trim();
}

function loadStoredClientMeta(clientMetaKey: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(clientMetaKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && 'monthlyRevenue' in parsed) {
      delete parsed.monthlyRevenue;
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function dealSystemStatus(deal: Deal): { label: string; cls: string } | null {
  if (deal.stage === 'QUALIFIED' && !deal.appSubmitted) return { label: 'Needs app', cls: 'sp-needs-app' };
  if (deal.stage === 'QUALIFIED' && deal.appSubmitted && (deal.offers?.length || 0) === 0)
    return { label: 'Awaiting offers', cls: 'sp-awaiting' };
  if (deal.stage === 'QUALIFIED' && (deal.offers?.length || 0) === 1)
    return { label: 'Offer received', cls: 'sp-offer' };
  if (deal.stage === 'QUALIFIED' && (deal.offers?.length || 0) > 1)
    return { label: 'Multiple offers', cls: 'sp-multi' };
  if (deal.stage === 'SUBMITTED_IN_REVIEW')
    return { label: 'In review · Awaiting lender decision', cls: 'sp-awaiting' };
  if (deal.stage === 'APPROVED_OFFERS' && (deal.offers?.length || 0) > 0)
    return { label: 'Offer in — present to client', cls: 'sp-offer' };
  if (deal.stage === 'APPROVED_OFFERS') return { label: 'Approved — awaiting offers', cls: 'sp-awaiting' };
  if (deal.stage === 'COMMITTED_FUNDING') return { label: 'Committed — funding in progress', cls: 'sp-offer' };
  if (deal.stage === 'FUNDED') return { label: 'Funded', cls: 'sp-offer' };
  return null;
}

function hotReason(deal: Deal): string | null {
  if (['FUNDED', 'NURTURE', 'CLOSED'].includes(deal.stage)) return null;
  if (deal.stage === 'APPROVED_OFFERS' || deal.stage === 'COMMITTED_FUNDING') {
    const best = deal.offers?.reduce((a, b) => (a.amount > b.amount ? a : b), deal.offers[0]);
    if (best) return `Offer received from ${best.lenderName || 'lender'}`;
  }
  if ((deal.offers?.length || 0) > 0) return 'Offer received';
  if (deal.lastReplyAt) {
    const hours = (Date.now() - new Date(deal.lastReplyAt).getTime()) / 3600000;
    if (hours <= 48) return 'Client replied recently';
  }
  if (deal.lenderEngaged && deal.appSubmitted) return 'Lender engaged';
  if (deal.isHot) return 'Marked hot';
  return null;
}

interface DealPanelProps {
  dealId: string;
  onClose: () => void;
}

export default function DealPanel({ dealId, onClose }: DealPanelProps) {
  const [activeDealId, setActiveDealId] = useState(dealId);
  const [tab, setTab] = useState<'convo' | 'deal' | 'history'>('deal');
  const [showActionModal, setShowActionModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showFundedModal, setShowFundedModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showNQModal, setShowNQModal] = useState(false);
  const [showEditFundModal, setShowEditFundModal] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  useEffect(() => {
    setActiveDealId(dealId);
  }, [dealId]);

  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal', activeDealId],
    queryFn: async () => {
      const { data } = await dealApi.getDeal(activeDealId);
      return data as Deal;
    },
  });
  const latestPipelineNote = useMemo(() => getLatestPipelineNoteText(deal), [deal]);

  const rerunPipelineMutation = useMutation({
    mutationFn: async (text: string): Promise<ExtractPipelineResponse> => {
      const { data } = await aiApi.extractPipeline({ dealId: activeDealId, inputType: 'rep_note', text });
      return data as ExtractPipelineResponse;
    },
    onSuccess: (result) => {
      if ('signals' in result) {
        queryClient.setQueryData<Deal | undefined>(['deal', activeDealId], (current) =>
          current
            ? {
                ...current,
                pipelineAiSignals: result.signals,
                pipelineAiUpdatedAt: new Date().toISOString(),
              }
            : current,
        );
        queryClient.invalidateQueries({ queryKey: ['deals'] });
        queryClient.invalidateQueries({ queryKey: ['board'] });
        toast.success('Pipeline AI refreshed');
        return;
      }

      toast.success(`Pipeline AI skipped: ${result.reason}`);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Pipeline AI rerun failed');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => dealApi.updateDeal(activeDealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update deal'),
  });

  const moveMutation = useMutation({
    mutationFn: (data: any) => dealApi.moveDeal(activeDealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal moved');
      setShowMoveModal(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Move failed'),
  });

  const actionMutation = useMutation({
    mutationFn: (data: any) => dealApi.completeAction(activeDealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Action completed');
      setShowActionModal(false);
    },
  });

  const offerMutation = useMutation({
    mutationFn: (data: any) => dealApi.addOffer(activeDealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Offer added');
      setShowOfferModal(false);
    },
  });

  const fundMutation = useMutation({
    mutationFn: (data: any) => dealApi.markFunded(activeDealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal marked as funded!');
    },
  });

  const shareMutation = useMutation({
    mutationFn: (data: any) => dealApi.shareDeal(activeDealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Co-rep updated');
    },
  });

  const logAttemptMutation = useMutation({
    mutationFn: (kind: AttemptKind) => dealApi.logAttempt(activeDealId, { kind }),
    onSuccess: (_response, kind) => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast.success(kind === 'not_interested' ? 'Moved to nurture' : 'Attempt logged');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to log attempt'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => dealApi.deleteDeal(activeDealId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast.success('Deal deleted');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const deleteOfferMutation = useMutation({
    mutationFn: (offerId: string) => dealApi.deleteOffer(activeDealId, offerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Offer deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete offer'),
  });

  if (isLoading || !deal) {
    return (
      <div className="panel open" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="w-6 h-6 border-2 border-scl-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const clientName = deal.client?.contactName || deal.client?.businessName || 'Unknown';
  const repLabel = deal.assignedRep ? `${deal.assignedRep.firstName} ${deal.assignedRep.lastName}` : 'Unassigned';
  const sysStatus = dealSystemStatus(deal);
  const hotText = hotReason(deal);
  const assistingIds = (deal.assistingRepIds as string[]) || [];
  const isPrimaryRep = deal.assignedRepId === user?.id;
  const isAssistRep = !!user?.id && assistingIds.includes(user.id);
  const canEditDeal = isAdmin || isPrimaryRep || isAssistRep;
  const canDeleteDeal = isAdmin && deal.stage !== 'FUNDED';
  const canDeleteOffer = (isAdmin || isPrimaryRep || isAssistRep) && !['FUNDED', 'CLOSED'].includes(deal.stage);
  const duePreset = getDuePresetFromDate(deal.nextActionDue);
  const latestEvent = [...(deal.dealEvents || [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const lastActionLabel = latestEvent
    ? latestEvent.eventType.replace(/_/g, ' ')
    : deal.nextAction
      ? `Next action: ${deal.nextAction}`
      : 'No activity yet';
  const smsCampaignSource = extractSmsCampaignSource(deal.clientNotes);
  const contactAttempts = deal.contactAttempts || 0;
  const contactAttemptThreshold = deal.contactAttemptThreshold || 10;
  const attemptsRemaining = Math.max(0, contactAttemptThreshold - contactAttempts);
  const quickLogDisabled = !canEditDeal || ['FUNDED', 'CLOSED'].includes(deal.stage) || logAttemptMutation.isPending;

  const handleRerunPipelineAi = () => {
    if (!latestPipelineNote || rerunPipelineMutation.isPending) return;
    rerunPipelineMutation.mutate(latestPipelineNote);
  };

  const handleStageChange = (nextStage: DealStage) => {
    if (nextStage === deal.stage) return;
    if (nextStage === 'NURTURE' || nextStage === 'CLOSED') {
      setShowMoveModal(true);
      return;
    }
    if (nextStage === 'FUNDED') {
      setShowFundedModal(true);
      return;
    }
    moveMutation.mutate({ stage: nextStage });
  };

  return (
    <>
      <div className="overlay open" onClick={onClose} />
      <div className="panel open">
        <div className="ph">
          <div className="ph-top">
            <div>
              <div className="ph-name">{deal.client?.businessName || 'Unknown'}</div>
              <div className="ph-sub">
                <span style={{ color: 'var(--text3)' }}>{clientName}</span>
                <span style={{ color: 'var(--text3)' }}>·</span>
                {deal.client?.phone && <span>{deal.client.phone}</span>}
                {deal.client?.email ? (
                  <span style={{ color: 'var(--info)' }}>✉ {deal.client.email}</span>
                ) : (
                  <span style={{ color: 'var(--text3)' }}>+ Add email</span>
                )}
              </div>
            </div>
            <div className="ph-actions">
              <span
                className="ph-rep-badge"
                style={{
                  background: deal.assignedRep?.avatarColor
                    ? `${deal.assignedRep.avatarColor}26`
                    : 'rgba(74,158,232,0.16)',
                  color: deal.assignedRep?.avatarColor || '#4A9EE8',
                }}
                title={`Assigned rep: ${repLabel}`}
              >
                {repLabel}
              </span>
              {canDeleteDeal && (
                <button
                  className="ph-close"
                  title="Delete deal"
                  onClick={() => {
                    if (confirm('Delete this deal? This cannot be undone.')) deleteMutation.mutate();
                  }}
                  style={{ color: 'var(--red, #e5534b)', fontSize: '14px' }}
                >
                  🗑
                </button>
              )}
              <button
                type="button"
                className="ph-ai-rerun"
                onClick={handleRerunPipelineAi}
                disabled={!latestPipelineNote || rerunPipelineMutation.isPending}
                title={latestPipelineNote ? 'Re-run Pipeline AI from latest note' : 'Add a note before re-running AI'}
                aria-label="Re-run Pipeline AI from latest note"
              >
                <RefreshCw size={13} aria-hidden className={rerunPipelineMutation.isPending ? 'spin-icon' : ''} />
                <span>{rerunPipelineMutation.isPending ? 'Running' : 'Re-run AI'}</span>
              </button>
              <button className="ph-close" onClick={onClose}>
                ×
              </button>
            </div>
          </div>

          <div className="ph-meta-row">
            <div className="ph-meta-pill">
              <span className="ph-meta-dot ph-meta-dot-stale" aria-hidden />
              <span className="ph-meta-label">Last Contact</span>
              <span className="ph-meta-val">{formatRelativeShort(deal.lastReplyAt || deal.createdAt)}</span>
            </div>
            <div className="ph-meta-pill ph-meta-blue">
              <span className="ph-meta-dot ph-meta-dot-blue" aria-hidden />
              <span className="ph-meta-label">Last Action</span>
              <span className="ph-meta-val">{lastActionLabel}</span>
            </div>
            {hotText ? (
              <div className="ph-meta-pill ph-meta-hot">
                <span className="ph-meta-label">Hot</span>
                <span className="ph-meta-val">{hotText}</span>
              </div>
            ) : null}
          </div>

          <PipelineAiInlineBar signals={deal.pipelineAiSignals} updatedAt={deal.pipelineAiUpdatedAt} />

          <div className="ph-stage-row">
            <select
              className="ph-stage-select"
              value={deal.stage}
              onChange={(e) => handleStageChange(e.target.value as DealStage)}
              disabled={!canEditDeal}
            >
              {(Object.keys(STAGE_LABELS) as DealStage[]).map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
            {deal.productType ? (
              <span className="ph-stage-badge ph-badge-good">{formatProductLabel(deal.productType)}</span>
            ) : null}
            <StackingChip signals={deal.pipelineAiSignals} className="ph-stacking-chip" />
            {smsCampaignSource ? <span className="ph-stage-badge ph-badge-amber">{smsCampaignSource}</span> : null}
            {deal.nextActionDue ? (
              <span
                className={clsx(
                  'ph-stage-badge',
                  duePreset === 'Overdue'
                    ? 'ph-badge-danger'
                    : duePreset === 'Today'
                      ? 'ph-badge-good'
                      : 'ph-badge-amber',
                )}
              >
                {duePreset}
              </span>
            ) : null}
            {sysStatus ? (
              <span className={clsx('ph-stage-badge ph-badge-info', sysStatus.cls)}>{sysStatus.label}</span>
            ) : null}
          </div>

          <StatePillRow deal={deal} className="state-pill-row" />

          {deal.stage !== 'FUNDED' && deal.stage !== 'CLOSED' ? (
            <div className="quick-log-row" aria-label="Quick contact attempt log">
              <div className="quick-log-status">
                <span>WAITING {contactAttempts}/{contactAttemptThreshold}</span>
                <small>{attemptsRemaining} before auto-nurture</small>
              </div>
              <div className="quick-log-actions">
                {QUICK_LOG_ACTIONS.map((action) => (
                  <button
                    key={action.kind}
                    type="button"
                    className={clsx('ql-btn', action.kind === 'not_interested' && 'ql-danger')}
                    onClick={() => logAttemptMutation.mutate(action.kind)}
                    disabled={quickLogDisabled}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              {isAdmin ? (
                <div className="quick-log-admin">
                  <button
                    type="button"
                    className="ql-btn"
                    onClick={() => updateMutation.mutate({ contactAttempts: 0 })}
                    disabled={contactAttempts === 0 || updateMutation.isPending}
                  >
                    Reset
                  </button>
                  <label className="ql-threshold">
                    <span>Threshold</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={contactAttemptThreshold}
                      disabled={updateMutation.isPending}
                      onBlur={(event) => {
                        const nextThreshold = Number.parseInt(event.currentTarget.value, 10);
                        if (!Number.isInteger(nextThreshold) || nextThreshold < 1 || nextThreshold > 50) {
                          event.currentTarget.value = String(contactAttemptThreshold);
                          return;
                        }
                        if (nextThreshold !== contactAttemptThreshold) {
                          updateMutation.mutate({ contactAttemptThreshold: nextThreshold });
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="panel-tabs">
            <button className={`ptab ${tab === 'convo' ? 'act' : ''}`} onClick={() => setTab('convo')}>
              Conversation
            </button>
            <button className={`ptab ${tab === 'deal' ? 'act' : ''}`} onClick={() => setTab('deal')}>
              Deal + Client
            </button>
            <button className={`ptab ${tab === 'history' ? 'act' : ''}`} onClick={() => setTab('history')}>
              Funding History
            </button>
          </div>
        </div>

        <div className="panel-body">
          {tab === 'convo' && <ConversationTab deal={deal} />}
          {tab === 'deal' && (
            <DealClientTab
              key={`${deal.id}:${deal.updatedAt || ''}`}
              deal={deal}
              isAdmin={isAdmin}
              onUpdate={(data: any) => updateMutation.mutate(data)}
              onShare={(data: any) => shareMutation.mutate(data)}
              onEditFundEvent={(feId: string) => setShowEditFundModal(feId)}
              onAddOffer={() => setShowOfferModal(true)}
              onOpenFollowUpModal={() => setShowFollowUpModal(true)}
              onOpenNQModal={() => setShowNQModal(true)}
              onOpenFundedModal={() => setShowFundedModal(true)}
              onDeleteOffer={(offerId: string) => deleteOfferMutation.mutate(offerId)}
              onOpenLinkedDeal={(id: string) => {
                setActiveDealId(id);
                setTab('deal');
              }}
              canDeleteOffer={canDeleteOffer}
              deletingOfferId={deleteOfferMutation.isPending ? (deleteOfferMutation.variables ?? null) : null}
            />
          )}
          {tab === 'history' && <FundingHistoryTab deal={deal} />}
        </div>

        {/* Modals */}
        {showActionModal && (
          <ActionModal
            deal={deal}
            onClose={() => setShowActionModal(false)}
            onSubmit={(data) => actionMutation.mutate(data)}
          />
        )}
        {showMoveModal && (
          <MoveModal
            deal={deal}
            onClose={() => setShowMoveModal(false)}
            onSubmit={(data) => moveMutation.mutate(data)}
          />
        )}
        {showOfferModal && (
          <OfferModal onClose={() => setShowOfferModal(false)} onSubmit={(data) => offerMutation.mutate(data)} />
        )}
        {showFundedModal && (
          <MarkFundedModal
            deal={deal}
            onClose={() => setShowFundedModal(false)}
            onSubmit={(data) => fundMutation.mutate(data)}
          />
        )}
        {showFollowUpModal && (
          <ScheduleFollowUpModal
            deal={deal}
            onClose={() => setShowFollowUpModal(false)}
            onSubmit={(data) => {
              updateMutation.mutate(data);
              setShowFollowUpModal(false);
            }}
          />
        )}
        {showNQModal && (
          <NQCloseModal
            deal={deal}
            onClose={() => setShowNQModal(false)}
            onSubmit={(data) => {
              moveMutation.mutate(data);
              setShowNQModal(false);
            }}
          />
        )}
        {showEditFundModal && (
          <EditFundEventModal
            fundEventId={showEditFundModal}
            deal={deal}
            onClose={() => setShowEditFundModal(null)}
            onSave={() => {
              queryClient.invalidateQueries({ queryKey: ['deal', activeDealId] });
              queryClient.invalidateQueries({ queryKey: ['deals'] });
              setShowEditFundModal(null);
            }}
          />
        )}
      </div>
    </>
  );
}

function ConversationTab({ deal }: { deal: Deal }) {
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['deal-sms', deal.id],
    queryFn: async () => {
      const { data } = await dealApi.getSms(deal.id);
      return data as {
        messages: Array<{
          id: string;
          body: string;
          direction: string;
          status: string;
          createdAt: string;
        }>;
        conversationId: string | null;
      };
    },
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => dealApi.sendSms(deal.id, body),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['deal-sms', deal.id] });
      toast.success('SMS sent');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send SMS'),
  });

  const messages = data?.messages || [];

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMutation.mutate(draft.trim());
  };

  return (
    <div className="sms-pane">
      <div className="sms-thread">
        {isLoading && <div className="msg-meta">Loading messages...</div>}
        {!isLoading && messages.length === 0 && <div className="msg-meta">No messages yet.</div>}
        {messages.map((msg) => {
          const isOut = msg.direction.toLowerCase() === 'outbound';
          return (
            <div key={msg.id} className={`msg ${isOut ? 'out' : 'in'}`}>
              <div className="bubble">{msg.body}</div>
              <div className="msg-meta">
                {new Date(msg.createdAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sms-bar">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply via SMS..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button className="sms-send" onClick={handleSend} disabled={!draft.trim() || sendMutation.isPending}>
          {sendMutation.isPending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function DealClientTab({
  deal,
  onUpdate,
  isAdmin,
  onShare,
  onEditFundEvent,
  onAddOffer,
  onOpenFollowUpModal,
  onOpenNQModal,
  onOpenFundedModal,
  onDeleteOffer,
  onOpenLinkedDeal,
  canDeleteOffer,
  deletingOfferId,
}: {
  deal: Deal;
  onUpdate: (data: any) => void;
  isAdmin: boolean;
  onShare: (data: any) => void;
  onEditFundEvent: (feId: string) => void;
  onAddOffer: () => void;
  onOpenFollowUpModal: () => void;
  onOpenNQModal: () => void;
  onOpenFundedModal: () => void;
  onDeleteOffer: (offerId: string) => void;
  onOpenLinkedDeal: (id: string) => void;
  canDeleteOffer: boolean;
  deletingOfferId: string | null;
}) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showLinkedDealModal, setShowLinkedDealModal] = useState(false);
  const isClosed = deal.stage === 'CLOSED';
  const isFunded = deal.stage === 'FUNDED';
  const assistingIds = (deal.assistingRepIds as string[]) || [];
  const isPrimaryRep = deal.assignedRepId === user?.id;
  const isAssistRep = !!user?.id && assistingIds.includes(user.id);
  const canEdit = isAdmin || isPrimaryRep || isAssistRep;
  const dealTypeOptions: Array<{ label: string; value: ProductType }> = [
    { label: `${PRODUCT_ICONS.MCA} MCA`, value: 'MCA' },
    { label: `${PRODUCT_ICONS.LOC} LOC`, value: 'LOC' },
    { label: `${PRODUCT_ICONS.HELOC} HELOC`, value: 'HELOC' },
    { label: `${PRODUCT_ICONS.SBA} SBA`, value: 'SBA' },
    { label: `${PRODUCT_ICONS.EQUIPMENT} Equipment`, value: 'EQUIPMENT' },
    { label: `${PRODUCT_ICONS.CRE} CRE`, value: 'CRE' },
  ];
  const dueOptions: DuePreset[] = ['Today', 'Tomorrow', 'This week', 'Future date'];
  const sourceOptions = ['Cold Calling', 'Email', 'SMS', 'Referral'];
  const clientMetaKey = `scl_client_meta_${deal.clientId}`;
  const [clientMeta, setClientMeta] = useState<Record<string, string>>(() => loadStoredClientMeta(clientMetaKey));
  const [isNextActionOpen, setIsNextActionOpen] = useState(true);
  const [nextActionDraft, setNextActionDraft] = useState(deal.nextAction || '');
  const [nextDuePreset, setNextDuePreset] = useState<DuePreset>(getDuePresetFromDate(deal.nextActionDue));
  const [nextDueDate, setNextDueDate] = useState(deal.nextActionDue?.split('T')[0] || '');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [newNoteDraft, setNewNoteDraft] = useState('');
  const [localNotes, setLocalNotes] = useState<Array<{ id: string; text: string; at: string }>>([]);
  const [clientNoteDraft, setClientNoteDraft] = useState(deal.clientNotes || '');
  const [amountDraft, setAmountDraft] = useState(
    String(deal.submittedAmount ?? deal.dealAmount ?? '').replace(/\.0+$/, ''),
  );
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const clientSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smsCampaignSource = extractSmsCampaignSource(deal.clientNotes);
  useEffect(
    () => () => {
      if (clientSaveTimer.current) clearTimeout(clientSaveTimer.current);
    },
    [],
  );

  function saveClientMeta(patch: Record<string, string>, persistToClient = false) {
    const next = { ...clientMeta, ...patch };
    setClientMeta(next);
    try {
      localStorage.setItem(clientMetaKey, JSON.stringify(next));
    } catch {
      // no-op
    }
    if (!persistToClient) return;
    if (clientSaveTimer.current) clearTimeout(clientSaveTimer.current);
    clientSaveTimer.current = setTimeout(() => {
      onUpdate({ clientUpdate: patch });
    }, 600);
  }

  const clientPhone = clientMeta.phone ?? deal.client?.phone ?? '';
  const clientEmail = clientMeta.email ?? deal.client?.email ?? '';
  const clientBusiness = clientMeta.businessName ?? deal.client?.businessName ?? '';
  const sourceType = (clientMeta.source || (smsCampaignSource ? 'SMS' : '')).trim();
  const leadSource = (clientMeta.leadSource ?? smsCampaignSource ?? '').trim();
  const pipelineSignals = deal.pipelineAiSignals?.skip_reason ? null : deal.pipelineAiSignals;
  const aiProductInterest = pipelineSignals?.product_interest || [];
  const aiPrimaryProduct = !deal.productType ? aiProductInterest[0] : null;
  const aiPendingAction = !deal.nextAction ? pipelineSignals?.pending_actions?.[0]?.action?.trim() || '' : '';
  const aiRequestedAmount = pipelineSignals?.requested_amount || null;
  const fullDealNote = (deal.notes || '').trim();
  const isSubmittedProduct = ['SBA', 'CRE', 'EQUIPMENT'].includes(deal.productType || '');
  const amountLabel = isSubmittedProduct ? 'Submitted Amount' : 'Requested Amount';
  const amountPayloadKey = isSubmittedProduct ? 'submittedAmount' : 'dealAmount';
  const offers = deal.offers || [];
  const fundingEvent = (deal.fundingEvents || [])[0];
  const stagePresets = STAGE_QUICK_ACTIONS[deal.stage] || [];
  const persistedDuePreset = getDuePresetFromDate(deal.nextActionDue);
  const persistedDueLabel = deal.nextActionDue ? persistedDuePreset : 'No due';
  const linkedDeals = deal.linkedDeals || [];
  const linkedDealRows: Array<{ deal: Deal | LinkedDeal; isCurrent: boolean }> = [
    { deal, isCurrent: true },
    ...linkedDeals.map((linkedDeal) => ({ deal: linkedDeal, isCurrent: false })),
  ];

  const sortedEvents = useMemo(
    () =>
      [...(deal.dealEvents || [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [deal.dealEvents],
  );

  function resolveEventNoteText(note?: string | null): string {
    const text = (note || '').trim();
    if (!text) return '';
    if (fullDealNote && text.length < fullDealNote.length && fullDealNote.startsWith(text)) return fullDealNote;
    return text;
  }

  const noteEntries = (() => {
    const items = sortedEvents
      .filter((event) => (event.eventType || '').toLowerCase().includes('note') && resolveEventNoteText(event.note))
      .map((event) => ({
        id: event.id,
        text: resolveEventNoteText(event.note),
        at: event.createdAt,
      }));

    if (items.length === 0 && (deal.notes || '').trim()) {
      items.push({
        id: `deal-note-${deal.id}`,
        text: deal.notes!.trim(),
        at: deal.updatedAt || deal.createdAt,
      });
    }
    const merged = [...localNotes, ...items];
    const seen = new Set<string>();
    const deduped = merged.filter((item) => {
      const key = `${item.text}|${item.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped.slice(0, 8);
  })();

  const recentActivity = sortedEvents.slice(0, 3);

  function dueClassName(preset: DuePreset | 'No due'): string {
    if (preset === 'Overdue') return 'overdue';
    if (preset === 'Today') return 'today';
    if (preset === 'No due') return 'none';
    return 'tomorrow';
  }

  function openNextActionEditor() {
    if (!canEdit || isClosed) return;
    setNextActionDraft(deal.nextAction || aiPendingAction || '');
    setNextDuePreset(getDuePresetFromDate(deal.nextActionDue));
    setNextDueDate(deal.nextActionDue?.split('T')[0] || '');
    setSelectedPreset(null);
    setIsNextActionOpen(true);
  }

  function closeNextActionEditor() {
    setNextActionDraft(deal.nextAction || '');
    setNextDuePreset(getDuePresetFromDate(deal.nextActionDue));
    setNextDueDate(deal.nextActionDue?.split('T')[0] || '');
    setSelectedPreset(null);
    setIsNextActionOpen(false);
  }

  function setDuePreset(preset: DuePreset) {
    setNextDuePreset(preset);
    if (preset !== 'Future date') setNextDueDate(dateFromDuePreset(preset));
  }

  function saveNextAction() {
    const value = nextActionDraft.trim();
    if (!value) {
      toast.error('Next action is required');
      return;
    }

    const payload: Record<string, string | null> = {};
    if (value !== (deal.nextAction || '')) payload.nextAction = value;

    let dueForSave = '';
    if (nextDuePreset === 'Future date') {
      dueForSave = nextDueDate;
      if (!dueForSave) {
        toast.error('Future date is required');
        return;
      }
    } else {
      dueForSave = dateFromDuePreset(nextDuePreset);
    }
    const existingDue = deal.nextActionDue?.split('T')[0] || '';

    if (dueForSave !== existingDue) payload.nextActionDue = dueForSave || null;
    if (Object.keys(payload).length > 0) onUpdate(payload);
    setIsNextActionOpen(true);
  }

  function saveQuickNote() {
    const value = newNoteDraft.trim();
    if (!value || !canEdit) return;
    onUpdate({ notes: value });
    setLocalNotes((prev) => [
      { id: `local-${Date.now()}`, text: value, at: new Date().toISOString() },
      ...prev,
    ]);
    setNewNoteDraft('');
    requestAnimationFrame(() => {
      noteInputRef.current?.focus();
    });
  }

  function formatActivityText(event: DealEvent): string {
    const label = event.eventType.replace(/_/g, ' ');
    const noteText = resolveEventNoteText(event.note);
    return noteText ? `${label} — ${noteText}` : label;
  }

  return (
    <div className="deal-tab dc-tab">
      {isClosed && (
        <div className="dc-section">
          <div className="dc-inline-warning">
            This deal is currently closed. You can still review notes, activity, and deal details.
          </div>
        </div>
      )}

      {linkedDeals.length > 0 && (
        <div className="dc-section linked-deals-section">
          <div className="dc-sec-title">
            <span>
              Linked Deals · {linkedDealRows.length} cards for {deal.client?.businessName || 'Client'}
            </span>
            <button type="button" className="dc-link-action" onClick={() => setShowLinkedDealModal(true)}>
              + Add product
            </button>
          </div>
          <div className="linked-deals-grid">
            {linkedDealRows.map(({ deal: linkedDeal, isCurrent }) => (
              <button
                key={linkedDeal.id}
                type="button"
                className={clsx('linked-deal-card', isCurrent && 'current')}
                onClick={() => !isCurrent && onOpenLinkedDeal(linkedDeal.id)}
                disabled={isCurrent}
                aria-current={isCurrent ? 'true' : undefined}
              >
                <div className="linked-deal-main">
                  <div className="linked-deal-amount">
                    {formatLinkedDealAmount(linkedDeal)} · {formatProductLabel(linkedDeal.productType)}
                    {linkedDeal.isHot ? <span className="linked-deal-hot">HOT</span> : null}
                  </div>
                  <div className="linked-deal-stage">{linkedDeal.stageLabel || STAGE_LABELS[linkedDeal.stage]}</div>
                  <div className="linked-deal-action">{linkedDeal.nextAction || 'No action set'}</div>
                </div>
                <span className={clsx('linked-deal-status', isCurrent && 'current')}>
                  {isCurrent ? 'VIEWING' : 'OPEN'}
                </span>
              </button>
            ))}
          </div>
          {showLinkedDealModal && (
            <CreateDealModal
              onClose={() => setShowLinkedDealModal(false)}
              onCreated={(createdDeal) => {
                queryClient.invalidateQueries({ queryKey: ['deal', deal.id] });
                queryClient.invalidateQueries({ queryKey: ['deals'] });
                onOpenLinkedDeal(createdDeal.id);
              }}
              prefill={{
                clientId: deal.clientId,
                businessName: deal.client?.businessName,
                contactName: deal.client?.contactName,
                phone: deal.client?.phone,
                email: deal.client?.email,
                assignedRepId: deal.assignedRepId,
              }}
            />
          )}
        </div>
      )}

      <div className="dc-section">
        <div className="dc-sec-title">Next Action</div>
        <div className="na-box">
          {!isNextActionOpen && (
            <button
              type="button"
              className="na-collapsed"
              onClick={openNextActionEditor}
              disabled={!canEdit || isClosed}
              style={!canEdit || isClosed ? { cursor: 'default', opacity: 0.75 } : undefined}
            >
              <span className={clsx('na-current', !(deal.nextAction || '').trim() && 'empty')}>
                {(deal.nextAction || '').trim() ? deal.nextAction : aiPendingAction || 'Tap to set next action'}
              </span>
              {aiPendingAction ? <span className="na-ai-hint">AI</span> : null}
              <span className={clsx('na-due-chip', dueClassName(persistedDueLabel as DuePreset | 'No due'))}>
                {persistedDueLabel}
              </span>
              <span className="na-edit-icon">✎</span>
            </button>
          )}
          <div className={clsx('na-expanded qa-block', isNextActionOpen && 'open')}>
            <div className="preset-label qa-stage-label">
              Quick actions · <strong>{STAGE_LABELS[deal.stage]}</strong>
            </div>
            <div className="preset-row qa-buttons">
              {stagePresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={clsx('preset qa-action', selectedPreset === preset && 'selected')}
                  onClick={() => {
                    if (!canEdit) return;
                    setSelectedPreset(preset);
                    setNextActionDraft(preset);
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="na-edit-lbl">Custom / edit</div>
            <input
              type="text"
              className="qa-input"
              value={nextActionDraft}
              onChange={(e) => setNextActionDraft(e.target.value)}
              placeholder="Or type a custom action..."
              disabled={!canEdit}
            />
            <div className="na-footer qa-date-row">
              <div className="drow qa-date-pills" style={{ marginTop: 0 }}>
                {dueOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={clsx('dbtn qa-date-pill', nextDuePreset === opt && 'active on')}
                    onClick={() => setDuePreset(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="na-cancel" onClick={closeNextActionEditor}>
                  Cancel
                </button>
                <button type="button" className="na-set-btn qa-set" onClick={saveNextAction} disabled={!canEdit || isClosed}>
                  Set Action
                </button>
              </div>
            </div>
            {nextDuePreset === 'Future date' && (
              <div className="dc-future-wrap">
                <input
                  type="date"
                  className="si"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            )}
          </div>
        </div>
        <div className="brow">
          <button type="button" className="bfu" onClick={onOpenFollowUpModal}>
            📅 Schedule Follow-Up
          </button>
          <button type="button" className="blo" onClick={onOpenNQModal}>
            Lost / NQ / Close
          </button>
        </div>
        {canEdit && (deal.stage === 'APPROVED_OFFERS' || deal.stage === 'COMMITTED_FUNDING') && (
          <button type="button" className="dc-inline-action" onClick={onOpenFundedModal}>
            🎉 Mark as Funded ✓
          </button>
        )}
      </div>

      <div className="dc-divider" />

      <div className="dc-section">
        <div className="dc-sec-title">Notes</div>
        <div className="nwrap">
          <textarea
            ref={noteInputRef}
            className="nta"
            value={newNoteDraft}
            onChange={(e) => setNewNoteDraft(e.target.value)}
            placeholder="Add note... Enter saves · Shift+Enter new line"
            disabled={!canEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveQuickNote();
              }
            }}
          />
          <button type="button" className="nsave" onClick={saveQuickNote} disabled={!canEdit}>
            Save
          </button>
        </div>

        <div className="nlog">
          {noteEntries.length > 0 ? (
            noteEntries.map((entry) => (
              <div key={entry.id} className="ni">
                <div className="ndot" style={{ background: '#d4a832' }} />
                <div>
                  <div className="ntxt">{entry.text}</div>
                  <div className="ntm">{formatDateTimeNoSeconds(entry.at)}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="dc-empty-row">No notes yet.</div>
          )}
        </div>

        <div className="dc-field-block">
          <div className="lbl">Client Notes</div>
          <textarea
            className="fita dc-client-note"
            value={clientNoteDraft}
            onChange={(e) => setClientNoteDraft(e.target.value)}
            onBlur={() => {
              if (clientNoteDraft !== (deal.clientNotes || '')) onUpdate({ clientNotes: clientNoteDraft });
            }}
            disabled={!canEdit}
          />
        </div>

        <div className="rbox">
          <div className="rbhdr">Recent Activity</div>
          {recentActivity.length === 0 ? (
            <div className="dc-empty-row">No activity yet.</div>
          ) : (
            recentActivity.map((event) => (
              <div key={event.id} className="ri">
                <div className="rdot" />
                <div>
                  <div className="rtxt">{formatActivityText(event)}</div>
                  <div className="rtm">{formatDateTimeNoSeconds(event.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="dc-divider" />

      <div className="dc-section">
        <div className="dc-sec-title">Deal Details</div>
        <div className="lbl" style={{ marginBottom: 5 }}>
          Deal Type
        </div>
        <div className="pr">
          {dealTypeOptions.map((opt) => {
            const selected = deal.productType === opt.value;
            const suggested = aiProductInterest.includes(opt.value);
            const preselected = aiPrimaryProduct === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={clsx('pill', (selected || preselected) && 'on', suggested && 'pill-ai-suggested')}
                onClick={() => canEdit && onUpdate({ productType: selected ? null : opt.value })}
                title={suggested ? 'AI product interest suggestion' : undefined}
              >
                {opt.label}
                {suggested ? <span className="pill-ai-mark">AI</span> : null}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="lbl" style={{ marginBottom: 4 }}>
            {amountLabel}
          </div>
          <input
            type="number"
            className="fi"
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            onBlur={() => {
              const nextValue = amountDraft.trim();
              if (!nextValue) {
                onUpdate({ [amountPayloadKey]: null });
                return;
              }
              const parsed = Number(nextValue.replace(/[$,]/g, ''));
              onUpdate({ [amountPayloadKey]: Number.isFinite(parsed) ? parsed : null });
            }}
            placeholder={isSubmittedProduct ? 'Optional submitted amount' : 'Optional requested amount'}
            disabled={!canEdit}
          />
          {aiRequestedAmount ? (
            <button
              type="button"
              className="ai-suggestion-pill"
              onClick={() => {
                if (!canEdit || (deal[amountPayloadKey] || 0) > 0) return;
                setAmountDraft(String(aiRequestedAmount.value_usd));
                onUpdate({ [amountPayloadKey]: aiRequestedAmount.value_usd });
              }}
              disabled={!canEdit || (deal[amountPayloadKey] || 0) > 0}
              title={(deal[amountPayloadKey] || 0) > 0 ? 'Manual amount is already set' : 'Apply AI requested amount'}
            >
              AI suggestion · {aiRequestedAmount.raw}
            </button>
          ) : null}
        </div>

        {deal.productType === 'HELOC' && (deal.stage === 'COMMITTED_FUNDING' || deal.stage === 'FUNDED') && (
          <div className="dc-inline-warning" style={{ marginTop: 10 }}>
            ⚠ HELOC — 3-Day Right of Rescission. Do not disburse funds until the legal rescission window expires.
          </div>
        )}
      </div>

      <div className="dc-divider" />

      <div className="dc-section">
        <div className="dc-sec-title">
          <span>Lender Offers ({offers.length})</span>
          {!isClosed && (
            <button className="dc-link-action" type="button" onClick={onAddOffer}>
              + Add offer
            </button>
          )}
        </div>
        {offers.length > 0 ? (
          <div className="offer-list">
            {offers.map((offer) => (
              <div key={offer.id} className={clsx('offer-item', offer.isAccepted && 'selected-offer')}>
                <div className="oi-left">
                  <div className="oi-lender">{offer.lenderName}</div>
                  <div className="oi-detail">{offer.terms || offer.productType || '—'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div className="oi-amount">{formatCurrency(offer.amount)}</div>
                  {offer.isAccepted ? <span style={{ fontSize: 9, color: 'var(--good)' }}>✓ Accepted</span> : null}
                  {canDeleteOffer && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete offer from "${offer.lenderName}"?`)) onDeleteOffer(offer.id);
                      }}
                      disabled={deletingOfferId === offer.id}
                      style={{
                        border: '1px solid var(--urgent-b)',
                        background: 'var(--urgent-bg)',
                        color: 'var(--urgent)',
                        borderRadius: 6,
                        fontSize: 10,
                        padding: '2px 6px',
                        cursor: deletingOfferId === offer.id ? 'not-allowed' : 'pointer',
                        opacity: deletingOfferId === offer.id ? 0.7 : 1,
                      }}
                    >
                      {deletingOfferId === offer.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="dc-empty-row">
            No offers yet. {deal.appSubmitted ? 'Awaiting lender response.' : 'Submit app to start receiving offers.'}
          </div>
        )}
        {!isClosed && (
          <button
            type="button"
            className="blndr"
            onClick={onAddOffer}
            style={{
              width: '100%',
              marginTop: 8,
              background: 'transparent',
              border: '1px solid #22543d',
              borderRadius: 7,
              color: '#68d391',
              fontSize: 12,
              padding: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            + Record lender offer
          </button>
        )}
        {isFunded && fundingEvent && (
          <button className="dc-inline-action" type="button" onClick={() => onEditFundEvent(fundingEvent.id)}>
            Edit funded details
          </button>
        )}
      </div>

      <div className="dc-divider" />

      <div className="dc-section">
        <div className="dc-sec-title">Client Info</div>
        <div className="dc-client-grid">
          <div>
            <div className="lbl">Phone</div>
            <input
              className="fi"
              value={clientPhone}
              onChange={(e) => saveClientMeta({ phone: e.target.value }, true)}
              placeholder="(555) 000-0000"
              disabled={!canEdit}
            />
          </div>
          <div>
            <div className="lbl">Email</div>
            <input
              className="fi"
              value={clientEmail}
              onChange={(e) => saveClientMeta({ email: e.target.value }, true)}
              placeholder="email@company.com"
              disabled={!canEdit}
            />
          </div>
          <div className="dc-grid-full">
            <div className="lbl">Business Name</div>
            <input
              className="fi"
              value={clientBusiness}
              onChange={(e) => saveClientMeta({ businessName: e.target.value })}
              onBlur={(e) => {
                const nextBusiness = e.target.value.trim();
                const currentBusiness = (deal.client?.businessName || '').trim();
                if (nextBusiness !== currentBusiness) onUpdate({ clientUpdate: { businessName: nextBusiness } });
              }}
              placeholder="Business name"
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      <div className="dc-divider" />

      <div className="dc-section">
        <div className="dc-sec-title">Source</div>
        <div className="src-row">
          {sourceOptions.map((src) => (
            <button
              key={src}
              type="button"
              className={clsx('sbtn', sourceType === src && 'on')}
              onClick={() => saveClientMeta({ source: src })}
            >
              {src}
            </button>
          ))}
        </div>
        <div className="dc-field-block">
          <div className="lbl">Lead Source / Leadsheet</div>
          <input
            className="fi"
            value={leadSource}
            onChange={(e) => saveClientMeta({ leadSource: e.target.value })}
            placeholder="e.g. April Cold List, Q1 RE List"
            disabled={!canEdit && !smsCampaignSource}
          />
        </div>
      </div>

      <div className="dc-divider" />

      <div className="dc-section">
        <div className="dc-sec-title">Ownership</div>
        <RepOwnershipSection deal={deal} isAdmin={isAdmin} onShare={onShare} onUpdate={onUpdate} />
      </div>

      <div className="dc-divider" />

      <div className="dc-section">
        <div className="dc-sec-title">Full Activity</div>
        {sortedEvents.length === 0 ? (
          <div className="dc-empty-row">No activity yet.</div>
        ) : (
          sortedEvents.map((event) => (
            <div key={event.id} className="ai">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d4a832', marginTop: 4 }} />
              <div>
                <div className="atxt">{formatActivityText(event)}</div>
                <div className="atm">{formatDateTimeNoSeconds(event.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FundingHistoryTab({ deal }: { deal: Deal }) {
  const [showNewDeal, setShowNewDeal] = useState(false);
  const history = deal.fundingHistory || [];
  const total = history.reduce((sum, round) => sum + (round.amountFunded || 0), 0);
  const priorCount = history.filter((round) => !round.isCurrentDeal).length;
  const historyLabel =
    history.length === 0
      ? 'Funding History'
      : deal.stage === 'FUNDED'
        ? `Funding History · ${history.length} round${history.length === 1 ? '' : 's'}`
        : `Funding History · ${priorCount || history.length}x prior`;

  return (
    <div className="fund-history">
      <div className="client-summary">
        <div
          style={{
            fontSize: 11,
            color: 'var(--text3)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            marginBottom: 8,
          }}
        >
          {deal.client?.businessName || 'Client'}
        </div>
        <div className="cs-row">
          <div className="cs-item">
            <div className="cs-label">Total Funded</div>
            <div className="cs-val" style={{ color: 'var(--good)' }}>
              {formatCurrency(total)}
            </div>
          </div>
          <div className="cs-item">
            <div className="cs-label">Rounds</div>
            <div className="cs-val" style={{ color: 'var(--gold)' }}>
              {history.length}
            </div>
          </div>
          <div className="cs-item">
            <div className="cs-label">Phone</div>
            <div className="cs-val" style={{ fontSize: 12, fontWeight: 400 }}>
              {deal.client?.phone || '—'}
            </div>
          </div>
          <div className="cs-item">
            <div className="cs-label">Email</div>
            <div className="cs-val" style={{ fontSize: 12, fontWeight: 400, color: 'var(--info)' }}>
              {deal.client?.email || '—'}
            </div>
          </div>
        </div>
      </div>

      <button className="add-deal-btn" onClick={() => setShowNewDeal(true)}>
        + New Deal for {deal.client?.businessName || 'Client'}
      </button>
      {showNewDeal && (
        <CreateDealModal
          onClose={() => setShowNewDeal(false)}
          prefill={{
            businessName: deal.client?.businessName,
            contactName: deal.client?.contactName,
            phone: deal.client?.phone,
            email: deal.client?.email,
          }}
        />
      )}

      <div
        className="fund-history-title"
      >
        {historyLabel}
      </div>

      {history.length === 0 && <div className="fund-empty-state">No funding history yet</div>}
      {history.length > 0 && (
        <div className="fund-returning-summary">
          {deal.stage === 'FUNDED'
            ? `${history.length} funded round${history.length === 1 ? '' : 's'} recorded for this client.`
            : `${priorCount || history.length} prior funded round${(priorCount || history.length) === 1 ? '' : 's'} found for this returning customer.`}
        </div>
      )}
      {history.map((round) => (
        <div key={round.id} className={clsx('fund-event', round.isCurrentDeal && 'active-event')}>
          <div className="fe-header">
            <div className="fe-title">{round.lender || 'Lender not recorded'}</div>
            <div className="fe-date">
              {round.fundedDate
                ? new Date(round.fundedDate).toLocaleDateString()
                : new Date(round.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div className="fe-grid">
            <div className="fe-item">
              <div className="fe-label">Funded Amount</div>
              <div className="fe-val g">{formatCurrency(round.amountFunded)}</div>
            </div>
            <div className="fe-item">
              <div className="fe-label">Funding Date</div>
              <div className="fe-val">
                {round.fundedDate ? new Date(round.fundedDate).toLocaleDateString() : '—'}
              </div>
            </div>
            <div className="fe-item">
              <div className="fe-label">Lender</div>
              <div className="fe-val">{round.lender || '—'}</div>
            </div>
          </div>
          <div className="fe-grid fe-grid-secondary">
            <div className="fe-item">
              <div className="fe-label">Product</div>
              <div className="fe-val">{round.productType ? formatProductLabel(round.productType) : '—'}</div>
            </div>
            <div className="fe-item">
              <div className="fe-label">Rep</div>
              <div className="fe-val">{round.repName || deal.assignedRep?.firstName || '—'}</div>
            </div>
            <div className="fe-item">
              <div className="fe-label">Round</div>
              <div className="fe-val">{round.isCurrentDeal ? 'Current deal' : 'Prior deal'}</div>
            </div>
          </div>
          {round.notes && (
            <div className="fe-milestones">
              <div className="ms-item">
                <span className="ms-label">Notes</span>
                <span className="ms-date done">{round.notes}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Details Tab ───
function DetailsTab({
  deal,
  onUpdate,
  isAdmin,
  onShare,
  onEditFundEvent,
}: {
  deal: Deal;
  onUpdate: (data: any) => void;
  isAdmin: boolean;
  onShare: (data: any) => void;
  onEditFundEvent: (feId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Client info */}
      <Section title="Client">
        <Field label="Business" value={deal.client?.businessName} />
        <Field label="Contact" value={deal.client?.contactName} />
        <Field label="Phone" value={deal.client?.phone} />
        <Field label="Email" value={deal.client?.email} />
        {deal.client && deal.client.fundingCount > 0 && (
          <Field
            label="Previously Funded"
            value={`${deal.client.fundingCount}x — ${formatCurrency(deal.client.totalFunded)}`}
          />
        )}
      </Section>

      {/* Deal tracking */}
      <Section title="Deal">
        <Field label="Next Action" value={deal.nextAction || '—'} />
        <Field label="Next Due" value={deal.nextActionDue ? new Date(deal.nextActionDue).toLocaleDateString() : '—'} />
        <Field label="App Submitted" value={deal.appSubmitted ? 'Yes' : 'No'} />
        <Field label="Lender Engaged" value={deal.lenderEngaged ? 'Yes' : 'No'} />
        {deal.commitSubStatus && (
          <div>
            <span className="text-[var(--text-muted)]">Commit Status</span>
            <div className="flex gap-1.5 mt-1">
              {(['DOCS_REQUESTED', 'DOCS_SIGNED', 'FUNDING'] as const).map((s) => (
                <span
                  key={s}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[10px] font-medium',
                    deal.commitSubStatus === s
                      ? 'bg-scl-500/20 text-scl-400 ring-1 ring-scl-500/40'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                  )}
                >
                  {s.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
        {(deal.submittedAmount || deal.dealAmount) && (
          <Field
            label={
              ['SBA', 'CRE', 'EQUIPMENT'].includes(deal.productType || '') ? 'Submitted Amount' : 'Requested Amount'
            }
            value={formatCurrency(deal.submittedAmount ?? deal.dealAmount)}
          />
        )}
        {deal.lender && <Field label="Lender" value={deal.lender} />}
      </Section>

      {/* Rep Ownership — with co-rep editor for admin */}
      <RepOwnershipSection deal={deal} isAdmin={isAdmin} onShare={onShare} onUpdate={onUpdate} />

      {/* Notes */}
      <Section title="Notes">
        <textarea
          defaultValue={deal.notes || ''}
          onBlur={(e) => {
            if (e.target.value !== (deal.notes || '')) {
              onUpdate({ notes: e.target.value });
            }
          }}
          rows={3}
          className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)] resize-none"
          placeholder="Add notes..."
        />
      </Section>

      {/* Funding events with edit links */}
      {deal.fundingEvents && deal.fundingEvents.length > 0 && (
        <Section title="Funding Events">
          {deal.fundingEvents.map((fe) => (
            <div
              key={fe.id}
              className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] mb-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-green-400">{formatCurrency(fe.amountFunded)}</span>
                <button
                  onClick={() => onEditFundEvent(fe.id)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                >
                  Edit
                </button>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">
                {fe.lender && <span>{fe.lender} · </span>}
                {fe.fundedDate && <span>{new Date(fe.fundedDate).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Renewal tasks */}
      {deal.renewalTasks && deal.renewalTasks.length > 0 && (
        <Section title="Renewal Tasks">
          {deal.renewalTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between text-xs py-1">
              <span className="text-[var(--text-secondary)]">{task.taskType.replace(/_/g, ' ')}</span>
              <span
                className={clsx(
                  'px-1.5 py-0.5 rounded',
                  task.status === 'COMPLETED'
                    ? 'bg-green-500/20 text-green-400'
                    : task.status === 'OVERDUE'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-amber-500/20 text-amber-400',
                )}
              >
                {task.status}
              </span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// ─── Activity Tab ───
function ActivityTab({ deal }: { deal: Deal }) {
  const events = deal.dealEvents || [];

  if (events.length === 0) {
    return <p className="text-sm text-[var(--text-muted)] text-center py-8">No activity yet</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="flex gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-scl-500 mt-2 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--text-primary)]">
              <span className="font-medium">{event.eventType.replace(/_/g, ' ')}</span>
              {event.fromStage && event.toStage && (
                <span className="text-[var(--text-muted)]">
                  {' '}
                  — {event.fromStage} → {event.toStage}
                </span>
              )}
            </p>
            {event.note && <p className="text-xs text-[var(--text-muted)] mt-0.5">{event.note}</p>}
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {event.rep ? `${event.rep.firstName} ${event.rep.lastName}` : ''}{' '}
              {formatDateTimeNoSeconds(event.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SMS Tab ───
function SmsTab({ dealId }: { dealId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['deal-sms', dealId],
    queryFn: async () => {
      const { data } = await dealApi.getSms(dealId);
      return data as {
        messages: Array<{
          id: string;
          body: string;
          direction: string;
          status: string;
          createdAt: string;
          fromNumber?: string;
          toNumber?: string;
        }>;
      };
    },
  });

  if (isLoading) return <div className="text-xs text-[var(--text-muted)] p-4">Loading messages...</div>;

  const messages = data?.messages || [];
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="w-8 h-8 text-[var(--text-faint)] mb-2" />
        <p className="text-xs text-[var(--text-muted)]">No SMS conversation linked to this deal</p>
        <p className="text-[10px] text-[var(--text-faint)] mt-1">
          Messages will appear here when linked via lead phone number
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={clsx(
            'max-w-[85%] px-3 py-2 rounded-lg text-xs',
            msg.direction === 'outbound'
              ? 'ml-auto bg-scl-600/20 border border-scl-500/30 text-[var(--text-primary)]'
              : 'mr-auto bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)]',
          )}
        >
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] text-[var(--text-faint)]">
              {new Date(msg.createdAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            {msg.direction === 'outbound' && (
              <span
                className={clsx(
                  'text-[9px]',
                  msg.status === 'delivered'
                    ? 'text-green-400'
                    : msg.status === 'failed'
                      ? 'text-red-400'
                      : 'text-[var(--text-faint)]',
                )}
              >
                {msg.status}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Offers Tab ───
function OffersTab({
  deal,
  onAddOffer,
  showAddButton = true,
}: {
  deal: Deal;
  onAddOffer: () => void;
  showAddButton?: boolean;
}) {
  const offers = deal.offers || [];

  return (
    <div>
      {showAddButton && (
        <button
          onClick={onAddOffer}
          className="w-full mb-3 px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-scl-500 transition"
        >
          <Plus className="w-3 h-3 inline mr-1" />
          Add Offer
        </button>
      )}
      {offers.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-8">No offers yet</p>
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className={clsx(
                'p-3 rounded-lg border',
                offer.isAccepted
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]',
              )}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{offer.lenderName}</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(offer.amount)}</p>
                </div>
                {offer.isAccepted && (
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Accepted</span>
                )}
              </div>
              {offer.terms && <p className="text-xs text-[var(--text-muted)] mt-1">{offer.terms}</p>}
              {offer.expiryDays && (
                <p className="text-[10px] text-amber-400 mt-1">Expires in {offer.expiryDays} days</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ───
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text-secondary)]">{value || '—'}</span>
    </div>
  );
}

// ─── Action Modal ───
function ActionModal({
  deal: _deal,
  onClose,
  onSubmit,
}: {
  deal: Deal;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [actionType, setActionType] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDue, setNextActionDue] = useState('');
  const [note, setNote] = useState('');

  return (
    <ModalOverlay title="Complete Action" onClose={onClose}>
      <div className="ff">
        <div className="fl">Action Completed</div>
        <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="fsel">
          <option value="">Select action type...</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="docs_sent">Docs Sent</option>
          <option value="docs_received">Docs Received</option>
          <option value="follow_up">Follow Up</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="ff">
        <div className="fl">Next Action *</div>
        <input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          className="fi"
          placeholder="e.g. Follow up with lender"
        />
      </div>
      <div className="ff">
        <div className="fl">Due Date *</div>
        <input type="date" value={nextActionDue} onChange={(e) => setNextActionDue(e.target.value)} className="fi" />
      </div>
      <div className="ff">
        <div className="fl">Note</div>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="fi" />
      </div>
      <div className="mfoot">
        <button className="btn-c" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-s"
          onClick={() => {
            if (!nextAction || !nextActionDue) {
              toast.error('Next action and due date are required');
              return;
            }
            onSubmit({ actionType, nextAction, nextActionDue, note });
          }}
        >
          Complete & Set Next
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─── Move Modal ───
function MoveModal({ deal, onClose, onSubmit }: { deal: Deal; onClose: () => void; onSubmit: (data: any) => void }) {
  const [targetStage, setTargetStage] = useState<DealStage | ''>('');
  const [lostReason, setLostReason] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [disqualReason, setDisqualReason] = useState('');

  const stages: { value: DealStage; label: string }[] = [
    { value: 'NEW_LEAD', label: 'New Lead' },
    { value: 'ENGAGED_INTERESTED', label: 'Engaged / Interested' },
    { value: 'QUALIFIED', label: 'Qualified' },
    { value: 'SUBMITTED_IN_REVIEW', label: 'Submitted (In Review)' },
    { value: 'APPROVED_OFFERS', label: 'Approved / Offers' },
    { value: 'COMMITTED_FUNDING', label: 'Committed → Funding' },
    { value: 'FUNDED', label: 'Funded' },
    { value: 'NURTURE', label: 'Nurture (Lost)' },
    { value: 'CLOSED', label: 'Closed (DQ)' },
  ];

  return (
    <ModalOverlay title="Move Deal" onClose={onClose}>
      <div className="ff">
        <div className="fl">Move to Stage</div>
        <select value={targetStage} onChange={(e) => setTargetStage(e.target.value as DealStage)} className="fsel">
          <option value="">Select stage...</option>
          {stages
            .filter((s) => s.value !== deal.stage)
            .map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
        </select>
      </div>
      {targetStage === 'NURTURE' && (
        <>
          <div className="ff">
            <div className="fl">Lost Reason *</div>
            <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} className="fi" />
          </div>
          <div className="ff">
            <div className="fl">Follow-Up Date *</div>
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="fi" />
          </div>
        </>
      )}
      {targetStage === 'CLOSED' && (
        <div className="ff">
          <div className="fl">Disqualification Reason *</div>
          <input value={disqualReason} onChange={(e) => setDisqualReason(e.target.value)} className="fi" />
        </div>
      )}
      <div className="mfoot">
        <button className="btn-c" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-s"
          onClick={() => {
            if (!targetStage) return;
            onSubmit({ stage: targetStage, lostReason, followUpDate, disqualReason });
          }}
        >
          Move Deal
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─── Offer Modal ───
function OfferModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [lenderName, setLenderName] = useState('');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [rate, setRate] = useState('');
  const [productType, setProductType] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <ModalOverlay title="Add Offer" onClose={onClose}>
      <div className="ff">
        <div className="fl">Lender name *</div>
        <input value={lenderName} onChange={(e) => setLenderName(e.target.value)} className="fi" />
      </div>
      <div className="ff">
        <div className="fl">Offer amount *</div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="fi"
          placeholder="50000"
        />
      </div>
      <div className="ff">
        <div className="fl">Term (months)</div>
        <input
          value={termMonths}
          onChange={(e) => setTermMonths(e.target.value)}
          className="fi"
          placeholder="e.g. 12"
        />
      </div>
      <div className="ff">
        <div className="fl">Rate / factor</div>
        <input value={rate} onChange={(e) => setRate(e.target.value)} className="fi" placeholder="e.g. 1.28" />
      </div>
      <div className="ff">
        <div className="fl">Product</div>
        <select className="fsel" value={productType} onChange={(e) => setProductType(e.target.value)}>
          <option value="">—</option>
          <option>MCA</option>
          <option>SBA</option>
          <option>HELOC</option>
          <option>Equipment</option>
          <option>LOC</option>
          <option>CRE</option>
          <option>BRIDGE</option>
        </select>
      </div>
      <div className="ff">
        <div className="fl">Notes</div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="fi" placeholder="Any offer notes" />
      </div>
      <div className="mfoot">
        <button className="btn-c" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-s"
          onClick={() => {
            if (!lenderName || !amount) {
              toast.error('Lender name and amount are required');
              return;
            }
            onSubmit({
              lenderName,
              amount: parseFloat(amount),
              terms: termMonths ? `${termMonths} months` : undefined,
              productType: productType || undefined,
              rate: rate || undefined,
              notes: notes || undefined,
            });
          }}
        >
          Save Offer
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─── Mark Funded Modal (C6 — prototype match) ───
function MarkFundedModal({
  deal,
  onClose,
  onSubmit,
}: {
  deal: Deal;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const offers = deal.offers || [];
  const firstOffer = offers[0];
  const [amountFunded, setAmountFunded] = useState(
    firstOffer ? String(firstOffer.amount) : deal.dealAmount?.toString() || '',
  );
  const [lender, setLender] = useState(firstOffer?.lenderName || '');
  const [fundedDate, setFundedDate] = useState(new Date().toISOString().split('T')[0]);
  const [termMonths, setTermMonths] = useState(firstOffer?.terms?.match(/(\d+)\s*mo/)?.[1] || '');
  const [rate, setRate] = useState('');
  const [productType, setProductType] = useState<string>(deal.productType || 'MCA');
  const [notes, setNotes] = useState('');

  const milestones = useMemo(() => {
    const months = parseInt(termMonths);
    if (!fundedDate || !months) return null;
    return computeRenewalDates(fundedDate, months);
  }, [fundedDate, termMonths]);

  function prefillFromOffer(offer: Offer) {
    setAmountFunded(String(offer.amount));
    setLender(offer.lenderName);
    if (offer.productType) setProductType(offer.productType);
    const termMatch = offer.terms?.match(/(\d+)\s*mo/);
    if (termMatch) setTermMonths(termMatch[1]);
  }

  return (
    <div className="modal-ov open" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Mark as Funded{' '}
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Offer picker if multiple */}
        {offers.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div className="fl" style={{ marginBottom: 6, fontWeight: 500 }}>
              Which offer was accepted?
            </div>
            {offers.map((o) => (
              <div
                key={o.id}
                onClick={() => prefillFromOffer(o)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border2)',
                  background: 'var(--bg4)',
                  marginBottom: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  {o.lenderName} · {o.terms || '—'}
                </span>
                <span style={{ color: 'var(--good)', fontWeight: 600 }}>{formatCurrency(o.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="fr">
          <div className="ff">
            <div className="fl">Funded date *</div>
            <input className="fi" type="date" value={fundedDate} onChange={(e) => setFundedDate(e.target.value)} />
          </div>
          <div className="ff">
            <div className="fl">Amount funded *</div>
            <input
              className="fi"
              value={amountFunded}
              onChange={(e) => setAmountFunded(e.target.value)}
              placeholder="50000"
            />
          </div>
        </div>
        <div className="fr">
          <div className="ff">
            <div className="fl">Funder *</div>
            <input
              className="fi"
              value={lender}
              onChange={(e) => setLender(e.target.value)}
              placeholder="e.g. OnDeck"
            />
          </div>
          <div className="ff">
            <div className="fl">Term (months) *</div>
            <input
              className="fi"
              value={termMonths}
              onChange={(e) => setTermMonths(e.target.value)}
              placeholder="e.g. 12"
            />
          </div>
        </div>
        <div className="fr">
          <div className="ff">
            <div className="fl">Rate / factor</div>
            <input className="fi" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 1.28" />
          </div>
          <div className="ff">
            <div className="fl">Product</div>
            <select className="fsel" value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option>MCA</option>
              <option>SBA</option>
              <option>HELOC</option>
              <option>Equipment</option>
              <option>Conventional</option>
            </select>
          </div>
        </div>
        <div className="ff">
          <div className="fl">Notes</div>
          <input className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any deal notes" />
        </div>

        {/* Renewal milestones preview */}
        <div className="renew-info">
          {milestones ? (
            <>
              Milestones:
              <br />· Check-in: {milestones.checkin}
              <br />· Midpoint renewal: {milestones.midpoint}
              <br />· 30-day payoff warning: {milestones.warn}
              <br />· Payoff: {milestones.payoff}
            </>
          ) : (
            'Enter funded date and term to see auto-renewal milestones.'
          )}
        </div>

        {/* HELOC Rescission Window Warning */}
        {productType === 'HELOC' && (
          <div
            style={{
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 8,
              padding: '8px 12px',
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>⚠️ 3-Day Right of Rescission (Reg Z)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
              HELOC borrowers have 3 business days after closing to cancel. Funds cannot be disbursed during this
              window.
            </div>
          </div>
        )}

        <div className="mfoot">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-s green-s"
            onClick={() => {
              const amt = parseFloat(String(amountFunded).replace(/[^0-9.]/g, ''));
              if (!amt || !fundedDate || !lender) {
                toast.error('Amount, date and funder are required');
                return;
              }
              onSubmit({
                amountFunded: amt,
                productType: productType || undefined,
                lender: lender || undefined,
                fundedDate: fundedDate || undefined,
                termMonths: termMonths ? parseInt(termMonths) : undefined,
                rate: rate ? parseFloat(rate) : undefined,
                notes: notes || undefined,
              });
              onClose();
            }}
          >
            Confirm Funded ✓
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Follow-Up Modal (C4 — prototype match) ───
const FU_SMART_DAYS: Record<string, number[]> = {
  MCA: [90, 120, 150],
  LOC: [90, 120, 150],
  HELOC: [120, 150, 180],
  Equipment: [90, 120, 150],
  EQUIPMENT: [90, 120, 150],
  SBA: [150, 180, 365],
  CRE: [150, 180, 365],
};

const FU_TYPES: { key: string; icon: string; label: string; sub: string }[] = [
  { key: 'renewal', icon: '♻️', label: 'Renewal', sub: 'Funded elsewhere' },
  { key: 'nurture', icon: '🌱', label: 'Nurture', sub: 'Not now' },
  { key: 'statement', icon: '📄', label: 'Statement Refresh', sub: 'Need updated docs' },
  { key: 'timing', icon: '⏰', label: 'Check Timing', sub: 'Not the right time' },
  { key: 'reengage', icon: '↩', label: 'Re-engage', sub: 'Gone quiet' },
];

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function daysFromToday(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
function fmtDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ScheduleFollowUpModal({
  deal,
  onClose,
  onSubmit,
}: {
  deal: Deal;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [fuType, setFuType] = useState(deal.followUpType || '');
  const [fuDate, setFuDate] = useState(deal.followUpDate?.split('T')[0] || '');
  const [fuNote, setFuNote] = useState(deal.followUpNote || '');
  const [extDate, setExtDate] = useState(deal.externalFundedDate?.split('T')[0] || '');

  const datePreview = useMemo(() => {
    if (!fuDate) return '';
    const days = daysFromToday(fuDate);
    if (days < 0) return '⚠ This date is in the past';
    if (days === 0) return `${fmtDateLabel(fuDate)} · Due today`;
    return `${fmtDateLabel(fuDate)} · ${days} days from today`;
  }, [fuDate]);

  const smartSuggestions = useMemo(() => {
    if (fuType !== 'renewal' || !extDate) return null;
    const prod = deal.productType || 'MCA';
    const days = FU_SMART_DAYS[prod] || [90, 120, 150];
    const base = new Date(extDate + 'T00:00:00');
    return days.map((n) => {
      const d = new Date(base);
      d.setDate(d.getDate() + n);
      return {
        days: n,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        iso: d.toISOString().split('T')[0],
      };
    });
  }, [fuType, extDate, deal.productType]);

  return (
    <div className="modal-ov open" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          📅 Schedule Follow-Up{' '}
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12 }}>
          Every deal without a close date becomes a scheduled future opportunity. Nothing dies — it gets rescheduled.
        </div>

        {/* Follow-up type grid */}
        <div className="ff">
          <div className="fl">Follow-up type *</div>
          <div className="fu-type-grid">
            {FU_TYPES.map((t) => (
              <button
                key={t.key}
                className={clsx('fu-type-btn', fuType === t.key && `sel sel-${t.key}`)}
                onClick={() => setFuType(t.key)}
              >
                {t.icon} {t.label}
                <br />
                <span style={{ fontSize: 9, fontWeight: 400 }}>{t.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* External funded date — only for renewal */}
        {fuType === 'renewal' && (
          <div className="ff">
            <div className="fl">
              External funded date <span style={{ color: 'var(--text3)' }}>(if client funded elsewhere)</span>
            </div>
            <input className="fi" type="date" value={extDate} onChange={(e) => setExtDate(e.target.value)} />
          </div>
        )}

        {/* Smart suggestion */}
        {smartSuggestions && (
          <div className="smart-suggest show">
            💡 Smart suggestions for {deal.productType || 'MCA'}:{' '}
            {smartSuggestions.map((s, i) => (
              <span key={s.days}>
                {i > 0 && ' · '}
                <strong onClick={() => setFuDate(s.iso)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                  {s.label} ({s.days}d)
                </strong>
              </span>
            ))}
          </div>
        )}

        {/* Date + quick buttons */}
        <div className="ff">
          <div className="fl">Follow-up date *</div>
          <div className="fu-quick-btns">
            {[30, 60, 90, 120, 150, 180].map((d) => (
              <button key={d} className="fu-quick" onClick={() => setFuDate(addDaysISO(d))}>
                {d === 180 ? '6 months' : `${d} days`}
              </button>
            ))}
          </div>
          <input className="fi" type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
          {fuDate && (
            <div
              style={{
                fontSize: 10,
                color: daysFromToday(fuDate) < 0 ? 'var(--urgent)' : 'var(--text3)',
                marginTop: 4,
              }}
            >
              {datePreview}
            </div>
          )}
        </div>

        {/* Note */}
        <div className="ff">
          <div className="fl">
            Note <span style={{ color: 'var(--text3)' }}>(required — no vague notes)</span>
          </div>
          <input
            className="fi"
            value={fuNote}
            onChange={(e) => setFuNote(e.target.value)}
            placeholder="e.g. Funded with OnDeck in March, check back in 90 days for renewal"
          />
        </div>

        <div className="mfoot">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-s"
            onClick={() => {
              if (!fuType) {
                toast.error('Select a follow-up type');
                return;
              }
              if (!fuDate) {
                toast.error('Follow-up date is required');
                return;
              }
              if (daysFromToday(fuDate) < 0) {
                toast.error('Follow-up date cannot be in the past');
                return;
              }
              if (!fuNote.trim()) {
                toast.error('A note is required — no vague scheduling');
                return;
              }
              onSubmit({
                followUpType: fuType,
                followUpDate: fuDate,
                followUpNote: fuNote.trim(),
                ...(extDate ? { externalFundedDate: extDate } : {}),
              });
            }}
          >
            📅 Schedule Follow-Up
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NQ / Close Modal (C5 — prototype match) ───
const LOST_REASONS = ['Went with competitor', 'Timing issue', 'Declined all offers', 'No response', 'Other'];
const NQ_REASONS = ['Not eligible', 'Declined — credit', 'Declined — revenue', 'Bad lead', 'Do not contact'];

export function NQCloseModal({
  deal: _deal,
  initialCloseType = 'lost',
  onClose,
  onSubmit,
}: {
  deal: Deal;
  initialCloseType?: 'lost' | 'disq';
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [closeType, setCloseType] = useState<'lost' | 'disq'>(initialCloseType);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]);
  const [reengageDate, setReengageDate] = useState(() => addDaysISO(30));
  const [disqualReason, setDisqualReason] = useState(NQ_REASONS[0]);

  return (
    <div className="modal-ov open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Close Deal{' '}
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="close-type">
          <button className={clsx('ct-btn', closeType === 'lost' && 'sel-lost')} onClick={() => setCloseType('lost')}>
            Lost — Recoverable
          </button>
          <button className={clsx('ct-btn', closeType === 'disq' && 'sel-disq')} onClick={() => setCloseType('disq')}>
            NQ / Disqualified
          </button>
        </div>

        {closeType === 'lost' && (
          <div>
            <div className="ff">
              <div className="fl">Reason *</div>
              <select className="fsel" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
                {LOST_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="ff">
              <div className="fl">Re-engage date *</div>
              <input
                className="fi"
                type="date"
                value={reengageDate}
                onChange={(e) => setReengageDate(e.target.value)}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
              → Auto-moves to Nurture. Client + history preserved.
            </div>
          </div>
        )}

        {closeType === 'disq' && (
          <div>
            <div className="ff">
              <div className="fl">Reason *</div>
              <select className="fsel" value={disqualReason} onChange={(e) => setDisqualReason(e.target.value)}>
                {NQ_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 11, color: 'var(--urgent)', marginTop: 4 }}>
              ⚠ Locks permanently. Client record preserved for admin.
            </div>
          </div>
        )}

        <div className="mfoot">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-s"
            onClick={() => {
              if (closeType === 'lost') {
                if (!reengageDate) {
                  toast.error('Re-engage date is required');
                  return;
                }
                onSubmit({
                  stage: 'NURTURE',
                  lostReason,
                  followUpType: 'reengage',
                  followUpDate: reengageDate,
                  followUpNote: `Lost reason: ${lostReason}`,
                });
              } else {
                onSubmit({ stage: 'CLOSED', disqualReason });
              }
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Fund Event Modal (C7 — prototype match) ───
function EditFundEventModal({
  fundEventId,
  deal,
  onClose,
  onSave,
}: {
  fundEventId: string;
  deal: Deal;
  onClose: () => void;
  onSave: () => void;
}) {
  const fe = (deal.fundingEvents || []).find((e) => e.id === fundEventId);
  const [fdDate, setFdDate] = useState(fe?.fundedDate?.split('T')[0] || '');
  const [amt, setAmt] = useState(fe ? String(fe.amountFunded) : '');
  const [lender, setLender] = useState(fe?.lender || '');
  const [term, setTerm] = useState('');
  const [rateVal, setRateVal] = useState('');
  const [prod, setProd] = useState<string>(fe?.productType || 'MCA');
  const [notes, setNotes] = useState(fe?.notes || '');

  const updateMutation = useMutation({
    mutationFn: (data: any) => dealApi.updateDeal(deal.id, data),
    onSuccess: () => {
      toast.success('Funding event updated');
      onSave();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  if (!fe) return null;

  return (
    <div className="modal-ov open" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          Edit Funding Event{' '}
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fr">
          <div className="ff">
            <div className="fl">Funded date</div>
            <input className="fi" type="date" value={fdDate} onChange={(e) => setFdDate(e.target.value)} />
          </div>
          <div className="ff">
            <div className="fl">Amount</div>
            <input className="fi" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="ff">
            <div className="fl">Funder</div>
            <input className="fi" value={lender} onChange={(e) => setLender(e.target.value)} />
          </div>
          <div className="ff">
            <div className="fl">Term (months)</div>
            <input className="fi" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="ff">
            <div className="fl">Rate</div>
            <input className="fi" value={rateVal} onChange={(e) => setRateVal(e.target.value)} />
          </div>
          <div className="ff">
            <div className="fl">Product</div>
            <select className="fsel" value={prod} onChange={(e) => setProd(e.target.value)}>
              <option>MCA</option>
              <option>SBA</option>
              <option>HELOC</option>
              <option>Equipment</option>
              <option>Conventional</option>
            </select>
          </div>
        </div>
        <div className="ff">
          <div className="fl">Notes</div>
          <input className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="mfoot">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-s"
            onClick={() => {
              const parsedAmt = parseFloat(String(amt).replace(/[^0-9.]/g, ''));
              updateMutation.mutate({
                fundingEventUpdate: {
                  id: fundEventId,
                  amountFunded: parsedAmt || fe.amountFunded,
                  lender: lender || fe.lender,
                  fundedDate: fdDate || fe.fundedDate,
                  termMonths: term ? parseInt(term) : undefined,
                  rate: rateVal ? parseFloat(rateVal) : undefined,
                  productType: prod || fe.productType,
                  notes,
                },
              });
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rep Ownership Section (C8 — prototype match) ───
function RepOwnershipSection({
  deal,
  isAdmin,
  onShare,
  onUpdate: _onUpdate,
}: {
  deal: Deal;
  isAdmin: boolean;
  onShare: (data: any) => void;
  onUpdate: (data: any) => void;
}) {
  const { user } = useAuthStore();
  const isPrimaryRep = user?.id === deal.assignedRepId;
  const canManageAssists = isAdmin || isPrimaryRep;
  const { data: reps } = useQuery<Rep[]>({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps();
      return (data as any).reps || data;
    },
    staleTime: 60_000,
  });

  const assistIds: string[] = (deal.assistingRepIds as string[]) || [];
  const allUsers = reps || [];
  const activeReps = allUsers.filter((r) => r.isActive !== false);
  const requiredIds = new Set<string>([deal.assignedRepId, ...assistIds].filter(Boolean) as string[]);
  const basePool = activeReps.length > 0 ? activeReps : allUsers;
  const allReps = [
    ...basePool,
    ...allUsers.filter((r) => requiredIds.has(r.id) && !basePool.some((b) => b.id === r.id)),
  ].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  const assistRowReps = [
    ...allReps.filter((r) => r.id !== deal.assignedRepId),
    ...allReps.filter((r) => r.id === deal.assignedRepId),
  ];

  function setPrimary(repId: string) {
    if (!isAdmin || repId === deal.assignedRepId) return;
    onShare({ assignedRepId: repId, assistingRepIds: assistIds.filter((id) => id !== repId) });
  }

  function toggleAssist(repId: string) {
    if (!canManageAssists || repId === deal.assignedRepId) return;
    const newAssists = assistIds.includes(repId) ? assistIds.filter((id) => id !== repId) : [...assistIds, repId];
    onShare({ assistingRepIds: newAssists });
  }

  return (
    <>
      <div className="dc-own-wrap">
        <div className="dc-own-row">
          <span className="dc-own-label">Primary</span>
          {allReps.map((r) => {
            const isSel = r.id === deal.assignedRepId;
            return (
              <button
                key={r.id}
                type="button"
                className={clsx('dc-own-avatar', isSel && 'pri')}
                onClick={() => setPrimary(r.id)}
                disabled={!isAdmin}
                title={`${r.firstName} ${r.lastName}${isSel ? ' (primary)' : ''}`}
              >
                {r.initials || `${r.firstName[0]}${r.lastName?.[0] || ''}`}
              </button>
            );
          })}
        </div>

        <div className="dc-own-row">
          <span className="dc-own-label">
            Assist
          </span>
          {assistRowReps.map((r) => {
            const isAssisting = assistIds.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                className={clsx('dc-own-avatar', isAssisting && 'asc')}
                onClick={() => toggleAssist(r.id)}
                disabled={!canManageAssists}
                title={`${r.firstName} ${r.lastName}${isAssisting ? ' (assisting)' : ''}`}
              >
                {r.initials || `${r.firstName[0]}${r.lastName?.[0] || ''}`}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Renewal date computation helper ───
function computeRenewalDates(fdRaw: string, months: number) {
  const fd = new Date(fdRaw + 'T00:00:00');
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const addD = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  const addM = (d: Date, n: number) => {
    const r = new Date(d);
    r.setMonth(r.getMonth() + n);
    return r;
  };
  const mid = addM(fd, Math.round(months / 2));
  const payoff = addM(fd, months);
  const checkinD = addD(fd, 35);
  const warnD = addD(payoff, -30);
  return { checkin: fmt(checkinD), midpoint: fmt(mid), warn: fmt(warnD), payoff: fmt(payoff) };
}

// ─── Modal wrapper (kept for ActionModal, MoveModal, OfferModal) ───
function ModalOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-ov open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {title}{' '}
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
