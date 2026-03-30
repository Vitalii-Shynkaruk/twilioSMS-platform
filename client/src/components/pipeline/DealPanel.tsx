import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealApi, repApi } from '../../services/api';
import { MessageSquare, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import type { Deal, DealStage, Rep, Offer, ProductType } from '../../types';
import { formatCurrency } from './DealCard';
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

function dealSystemStatus(deal: Deal): { label: string; cls: string } | null {
  if (deal.stage === 'QUALIFIED' && !deal.appSubmitted) return { label: 'Needs app', cls: 'sp-needs-app' };
  if (deal.stage === 'QUALIFIED' && deal.appSubmitted && (deal.offers?.length || 0) === 0) return { label: 'Awaiting offers', cls: 'sp-awaiting' };
  if (deal.stage === 'QUALIFIED' && (deal.offers?.length || 0) === 1) return { label: 'Offer received', cls: 'sp-offer' };
  if (deal.stage === 'QUALIFIED' && (deal.offers?.length || 0) > 1) return { label: 'Multiple offers', cls: 'sp-multi' };
  if (deal.stage === 'SUBMITTED_IN_REVIEW') return { label: 'In review · Awaiting lender decision', cls: 'sp-awaiting' };
  if (deal.stage === 'APPROVED_OFFERS' && (deal.offers?.length || 0) > 0) return { label: 'Offer in — present to client', cls: 'sp-offer' };
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

  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal', dealId],
    queryFn: async () => {
      const { data } = await dealApi.getDeal(dealId);
      return data as Deal;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => dealApi.updateDeal(dealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal updated');
    },
  });

  const moveMutation = useMutation({
    mutationFn: (data: any) => dealApi.moveDeal(dealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal moved');
      setShowMoveModal(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Move failed'),
  });

  const actionMutation = useMutation({
    mutationFn: (data: any) => dealApi.completeAction(dealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Action completed');
      setShowActionModal(false);
    },
  });

  const offerMutation = useMutation({
    mutationFn: (data: any) => dealApi.addOffer(dealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Offer added');
      setShowOfferModal(false);
    },
  });

  const fundMutation = useMutation({
    mutationFn: (data: any) => dealApi.markFunded(dealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal marked as funded!');
    },
  });

  const shareMutation = useMutation({
    mutationFn: (data: any) => dealApi.shareDeal(dealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Co-rep updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => dealApi.deleteDeal(dealId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast.success('Deal deleted');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
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
                {deal.nextAction && (
                  <span className="ph-badge" style={{ background: 'var(--bg4)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>
                    {deal.nextAction}
                  </span>
                )}
                {hotText && (
                  <span className="ph-badge" style={{ background: 'var(--hot-bg)', color: 'var(--hot)', border: '1px solid var(--hot-b)' }}>
                    🔥 {hotText}
                  </span>
                )}
                <span
                  className="ph-badge"
                  style={{ background: deal.assignedRep?.avatarColor ? `${deal.assignedRep.avatarColor}26` : 'rgba(74,158,232,0.16)', color: deal.assignedRep?.avatarColor || '#4A9EE8' }}
                >
                  {repLabel}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {isAdmin && (
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
              <button className="ph-close" onClick={onClose}>
                ×
              </button>
            </div>
          </div>

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
              deal={deal}
              isAdmin={isAdmin}
              sysStatus={dealSystemStatus(deal)}
              onUpdate={(data: any) => updateMutation.mutate(data)}
              onShare={(data: any) => shareMutation.mutate(data)}
              onMove={(data: any) => moveMutation.mutate(data)}
              onEditFundEvent={(feId: string) => setShowEditFundModal(feId)}
              onAddOffer={() => setShowOfferModal(true)}
              onOpenActionModal={() => setShowActionModal(true)}
              onOpenMoveModal={() => setShowMoveModal(true)}
              onOpenFollowUpModal={() => setShowFollowUpModal(true)}
              onOpenNQModal={() => setShowNQModal(true)}
              onOpenFundedModal={() => setShowFundedModal(true)}
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
              queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
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
        <button
          className="sms-send"
          onClick={handleSend}
          disabled={!draft.trim() || sendMutation.isPending}
        >
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
  sysStatus,
  onShare,
  onMove,
  onEditFundEvent,
  onAddOffer,
  onOpenActionModal,
  onOpenMoveModal,
  onOpenFollowUpModal,
  onOpenNQModal,
  onOpenFundedModal,
}: {
  deal: Deal;
  onUpdate: (data: any) => void;
  isAdmin: boolean;
  sysStatus: { label: string; cls: string } | null;
  onShare: (data: any) => void;
  onMove: (data: any) => void;
  onEditFundEvent: (feId: string) => void;
  onAddOffer: () => void;
  onOpenActionModal: () => void;
  onOpenMoveModal: () => void;
  onOpenFollowUpModal: () => void;
  onOpenNQModal: () => void;
  onOpenFundedModal: () => void;
}) {
  const isClosed = deal.stage === 'CLOSED';
  const isFunded = deal.stage === 'FUNDED';
  const canEdit = isAdmin || !!deal.assignedRepId;
  const stages: DealStage[] = [
    'NEW_LEAD',
    'ENGAGED_INTERESTED',
    'QUALIFIED',
    'SUBMITTED_IN_REVIEW',
    'APPROVED_OFFERS',
    'COMMITTED_FUNDING',
    'FUNDED',
    'NURTURE',
    'CLOSED',
  ];
  const dealTypeOptions: Array<{ label: string; value: ProductType }> = [
    { label: 'MCA', value: 'MCA' },
    { label: 'LOC', value: 'LOC' },
    { label: 'HELOC', value: 'HELOC' },
    { label: 'Equipment', value: 'EQUIPMENT' },
    { label: 'SBA', value: 'SBA' },
    { label: 'CRE', value: 'CRE' },
  ];
  const revenueRanges = ['Under $10k', '$10k–$25k', '$25k–$50k', '$50k–$100k', '$100k–$250k', '$250k–$500k', '$500k–$1M', '$1M+', 'Custom'];
  const sourceOptions = ['Cold Calling', 'Email', 'SMS', 'Referral'];
  const clientMetaKey = `scl_client_meta_${deal.clientId}`;
  const [clientMeta, setClientMeta] = useState<Record<string, string>>({});
  const [nextActionDraft, setNextActionDraft] = useState(deal.nextAction || '');
  const [exactDueDate, setExactDueDate] = useState(deal.nextActionDue?.split('T')[0] || '');
  const [showFutureDate, setShowFutureDate] = useState(false);
  const [noteDraft, setNoteDraft] = useState(deal.notes || '');
  const [clientNoteDraft, setClientNoteDraft] = useState(deal.clientNotes || '');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(clientMetaKey);
      setClientMeta(raw ? JSON.parse(raw) : {});
    } catch {
      setClientMeta({});
    }
  }, [clientMetaKey]);

  useEffect(() => setNextActionDraft(deal.nextAction || ''), [deal.id, deal.nextAction]);
  useEffect(() => setNoteDraft(deal.notes || ''), [deal.id, deal.notes]);
  useEffect(() => setClientNoteDraft(deal.clientNotes || ''), [deal.id, deal.clientNotes]);
  useEffect(() => {
    const date = deal.nextActionDue?.split('T')[0] || '';
    setExactDueDate(date);
    if (!date) {
      setShowFutureDate(true);
      return;
    }
    const diff = Math.round((new Date(date + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    setShowFutureDate(diff > 7);
  }, [deal.id, deal.nextActionDue]);

  function saveClientMeta(patch: Record<string, string>) {
    const next = { ...clientMeta, ...patch };
    setClientMeta(next);
    try {
      localStorage.setItem(clientMetaKey, JSON.stringify(next));
    } catch {
      // no-op
    }
  }

  function applyDuePreset(preset: 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Future date') {
    const d = new Date();
    if (preset === 'Future date') {
      setShowFutureDate(true);
      return;
    }
    if (preset === 'Overdue') d.setDate(d.getDate() - 1);
    if (preset === 'Tomorrow') d.setDate(d.getDate() + 1);
    if (preset === 'This week') d.setDate(d.getDate() + 4);
    const iso = d.toISOString().split('T')[0];
    setExactDueDate(iso);
    setShowFutureDate(false);
    onUpdate({ nextActionDue: iso });
  }

  function currentDuePreset(): 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Future date' {
    if (!exactDueDate) return 'Future date';
    const diff = Math.round((new Date(exactDueDate + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    if (diff < 0) return 'Overdue';
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff <= 7) return 'This week';
    return 'Future date';
  }

  const duePreset = currentDuePreset();
  const clientPhone = clientMeta.phone ?? deal.client?.phone ?? '';
  const clientEmail = clientMeta.email ?? deal.client?.email ?? '';
  const clientBusiness = clientMeta.businessName ?? deal.client?.businessName ?? '';
  const clientRevenue = clientMeta.monthlyRevenue ?? '';
  const clientSource = clientMeta.source ?? '';

  const offers = deal.offers || [];
  const fundingEvent = (deal.fundingEvents || [])[0];

  return (
    <div className="deal-tab">
      {sysStatus && (
        <div className="dsb">
          <div className="dsbt">System Status</div>
          <div className={`status-pill ${sysStatus.cls}`} style={{ display: 'inline-flex' }}>
            <div className="sp-dot" />
            <span className="sp-text">{sysStatus.label}</span>
          </div>
        </div>
      )}

      <div className="dsb">
        <div className="dsbt">Deal</div>
        <div className="sf">
          <div className="sf-l">Stage</div>
          <select
            className="si"
            value={deal.stage}
            onChange={(e) => {
              const nextStage = e.target.value as DealStage;
              if (nextStage === deal.stage) return;
              if (nextStage === 'NURTURE' || nextStage === 'CLOSED') {
                onOpenMoveModal();
                return;
              }
              if (nextStage === 'FUNDED') {
                onOpenFundedModal();
                return;
              }
              onMove({ stage: nextStage });
            }}
            disabled={!canEdit}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="sf">
          <div className="sf-l">Deal types</div>
          <div className="dt-grid">
            {dealTypeOptions.map((opt) => {
              const selected = deal.productType === opt.value;
              return (
                <div
                  key={opt.value}
                  className={clsx('dt-opt', selected && 'sel')}
                  onClick={() => canEdit && onUpdate({ productType: selected ? null : opt.value })}
                >
                  <div className="dt-chk">{selected ? <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg> : ''}</div>
                  <span>{opt.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sf">
          <div className="sf-l">
            Ownership {!isAdmin && <span style={{ fontSize: 9, color: 'var(--text3)' }}>(admin only)</span>}
          </div>
          <RepOwnershipSection deal={deal} isAdmin={isAdmin} onShare={onShare} onUpdate={onUpdate} />
        </div>
      </div>

      {!isClosed && (
        <div className="dsb">
          <div className="dsbt">
            <span>Lender Offers ({offers.length})</span>
            <button className="dsbt-action" onClick={onAddOffer}>
              + Add offer
            </button>
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0 8px' }}>
              No offers yet. {deal.appSubmitted ? 'Awaiting lender response.' : 'Submit app to start receiving offers.'}
            </div>
          )}
          <button className="add-offer-btn" onClick={onAddOffer}>
            + Record lender offer
          </button>
        </div>
      )}

      <div className="dsb">
        <div className="dsbt">
          Client Info
          {clientBusiness ? (
            <span style={{ color: 'var(--good)', fontWeight: 400, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
              · {clientBusiness}
            </span>
          ) : null}
        </div>
        <div className="sf">
          <div className="sf-l">Monthly revenue</div>
          <div className="rev-grid">
            {revenueRanges.map((range) => (
              <div
                key={range}
                className={clsx('rev-opt', clientRevenue === range && 'sel')}
                onClick={() => saveClientMeta({ monthlyRevenue: range })}
              >
                {range}
              </div>
            ))}
          </div>
        </div>
        <div className="sf">
          <div className="sf-l">Source</div>
          <div className="src-row">
            {sourceOptions.map((src) => (
              <button
                key={src}
                type="button"
                className={clsx('src-chip', clientSource === src && 'sel')}
                onClick={() => saveClientMeta({ source: src })}
              >
                {src}
              </button>
            ))}
          </div>
        </div>
        <div className="sf">
          <div className="sf-l">Phone</div>
          <input
            className="si"
            value={clientPhone}
            onChange={(e) => saveClientMeta({ phone: e.target.value })}
            placeholder="(555) 000-0000"
          />
        </div>
        <div className="sf">
          <div className="sf-l" style={{ color: 'var(--info)' }}>
            ✉ Email
          </div>
          <input
            className="si"
            value={clientEmail}
            onChange={(e) => saveClientMeta({ email: e.target.value })}
            placeholder="email@company.com"
          />
        </div>
        <div className="sf">
          <div className="sf-l">Business</div>
          <input
            className="si"
            value={clientBusiness}
            onChange={(e) => saveClientMeta({ businessName: e.target.value })}
            placeholder="Business name"
          />
        </div>
      </div>

      {/* Scheduled Follow-Up section for NURTURE deals */}
      {deal.stage === 'NURTURE' && deal.followUpType && (
        <div className="dsb">
          <div className="dsbt">
            Scheduled Follow-Up
            <button className="dsbt-action" onClick={onOpenFollowUpModal}>Edit</button>
          </div>
          <div style={{ background: 'var(--bg4)', borderRadius: 7, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className={`q-reason-pill qr-${deal.followUpType}`}>
                {deal.followUpType === 'renewal' ? '♻️ Renewal' :
                 deal.followUpType === 'reengage' ? '↩ Re-engage' :
                 deal.followUpType === 'timing' ? '⏰ Check Timing' :
                 deal.followUpType === 'nurture' ? '🌱 Nurture' :
                 deal.followUpType === 'statement' ? '📄 Statement' : deal.followUpType}
              </span>
              {deal.followUpDate && (
                <span className={`q-due ${new Date(deal.followUpDate) < new Date() ? 'qd-overdue' : 'qd-ok'}`}>
                  Due {new Date(deal.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
            {deal.externalFundedDate && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>
                External funded: {new Date(deal.externalFundedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {Math.round((Date.now() - new Date(deal.externalFundedDate).getTime()) / 86400000)}d ago
              </div>
            )}
            {deal.followUpNote && (
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{deal.followUpNote}</div>
            )}
          </div>
        </div>
      )}

      {isFunded && fundingEvent && (
        <div className="dsb">
          <div className="dsbt">
            Funded Details
            <button className="dsbt-action" onClick={() => onEditFundEvent(fundingEvent.id)}>
              Edit
            </button>
          </div>
          <div className="sf-row">
            <div className="sf">
              <div className="sf-l">Amount</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--good)' }}>{formatCurrency(fundingEvent.amountFunded)}</div>
            </div>
            <div className="sf">
              <div className="sf-l">Funder</div>
              <div style={{ fontSize: 12 }}>{fundingEvent.lender || '—'}</div>
            </div>
            <div className="sf">
              <div className="sf-l">Product</div>
              <div style={{ fontSize: 12 }}>{fundingEvent.productType || deal.productType || '—'}</div>
            </div>
            <div className="sf">
              <div className="sf-l">Funded date</div>
              <div style={{ fontSize: 12 }}>
                {fundingEvent.fundedDate ? new Date(fundingEvent.fundedDate).toLocaleDateString('en-US') : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isClosed && (
        <div className="dsb">
          <div className="dsbt">Next Action</div>
          <div className="sf">
            <div className="sf-l">Action</div>
            <input
              className="si"
              value={nextActionDraft}
              onChange={(e) => setNextActionDraft(e.target.value)}
              onBlur={() => {
                if (nextActionDraft !== (deal.nextAction || '')) onUpdate({ nextAction: nextActionDraft });
              }}
              placeholder="e.g. Present offer, Follow up..."
              disabled={!canEdit}
            />
          </div>
          <div className="sf">
            <div className="sf-l">Due</div>
            <div className="due-row">
              {(['Overdue', 'Today', 'Tomorrow', 'This week', 'Future date'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={clsx('due-chip', duePreset === opt && 'sel')}
                  onClick={() => applyDuePreset(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className={clsx('dp-wrap', showFutureDate && 'show')}>
              <input
                type="date"
                className="dp-inp"
                value={exactDueDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setExactDueDate(v);
                  setShowFutureDate(true);
                  onUpdate({ nextActionDue: v || null });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {canEdit && !isClosed && (
        <div className="dsb">
          <div className="dsbt">Actions</div>
          {deal.stage === 'APPROVED_OFFERS' && (
            <button
              className="act-btn"
              style={{ background: 'var(--good-bg)', borderColor: 'var(--good-b)', color: 'var(--good)' }}
              onClick={() => onMove({ stage: 'COMMITTED_FUNDING' })}
            >
              ✅ Client Accepted Terms → Committed
            </button>
          )}
          {(deal.stage === 'COMMITTED_FUNDING' || deal.stage === 'APPROVED_OFFERS') && (
            <button className="act-btn act-funded" onClick={onOpenFundedModal}>
              🎉 Mark as Funded ✓
            </button>
          )}
          <button
            className="act-btn"
            style={{ background: 'var(--info-bg)', borderColor: 'var(--info-b)', color: 'var(--info)' }}
            onClick={onOpenFollowUpModal}
          >
            📅 Schedule Follow-Up
          </button>
          <button className="act-btn act-nq" onClick={onOpenNQModal}>
            Lost / NQ / Close Deal
          </button>
        </div>
      )}

      <div className="dsb">
        <div className="dsbt">Notes</div>
        <textarea
          className="note-box"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft !== (deal.notes || '')) onUpdate({ notes: noteDraft });
          }}
          disabled={!canEdit}
          placeholder="Add notes..."
        />
        <div className="sf-l" style={{ marginTop: 8 }}>Client notes</div>
        <textarea
          className="note-box"
          value={clientNoteDraft}
          onChange={(e) => setClientNoteDraft(e.target.value)}
          onBlur={() => {
            if (clientNoteDraft !== (deal.clientNotes || '')) onUpdate({ clientNotes: clientNoteDraft });
          }}
          disabled={!canEdit}
          placeholder="Notes about the client relationship..."
        />
      </div>

      <div className="dsb">
        <div className="dsbt">Activity</div>
        {(deal.dealEvents || []).length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>No activity yet.</div>
        ) : (
          (deal.dealEvents || []).slice(0, 8).map((event) => {
            const type = event.eventType?.toLowerCase() || '';
            let dotColor = 'var(--text3)';
            if (type.includes('funded') || type.includes('offer')) dotColor = 'var(--good)';
            else if (type.includes('submit') || type.includes('app')) dotColor = 'var(--watch)';
            else if (type.includes('stage') || type.includes('move') || type.includes('created')) dotColor = 'var(--gold)';
            else if (type.includes('sms') || type.includes('reply') || type.includes('message')) dotColor = 'var(--info)';
            else if (type.includes('action') || type.includes('complete')) dotColor = 'var(--good)';
            return (
              <div key={event.id} className="tl-item">
                <div className="tl-dot" style={{ background: dotColor }} />
                <div>
                  <div className="tl-text">
                    {event.eventType.replace(/_/g, ' ')}
                    {event.note ? ` — ${event.note}` : ''}
                  </div>
                  <div className="tl-time">{new Date(event.createdAt).toLocaleString('en-US')}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FundingHistoryTab({ deal }: { deal: Deal }) {
  const [showNewDeal, setShowNewDeal] = useState(false);
  const events = deal.fundingEvents || [];
  const total = events.reduce((sum, e) => sum + (e.amountFunded || 0), 0);

  return (
    <div className="fund-history">
      <div className="client-summary">
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
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
            <div className="cs-label">Events</div>
            <div className="cs-val" style={{ color: 'var(--gold)' }}>
              {events.length}
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

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>
        Funding History ({events.length})
      </div>

      {events.length === 0 && <div className="msg-meta">No funding events yet.</div>}
      {events.map((event) => (
        <div key={event.id} className="fund-event">
          <div className="fe-header">
            <div className="fe-title">{event.lender || 'Funding Event'}</div>
            <div className="fe-date">
              {event.fundedDate ? new Date(event.fundedDate).toLocaleDateString() : new Date(event.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div className="fe-grid">
            <div className="fe-item">
              <div className="fe-label">Amount</div>
              <div className="fe-val g">{formatCurrency(event.amountFunded)}</div>
            </div>
            <div className="fe-item">
              <div className="fe-label">Product</div>
              <div className="fe-val">{event.productType || '—'}</div>
            </div>
            <div className="fe-item">
              <div className="fe-label">Rep</div>
              <div className="fe-val">{deal.assignedRep?.firstName || '—'}</div>
            </div>
          </div>
          {event.notes && (
            <div className="fe-milestones">
              <div className="ms-item">
                <span className="ms-label">Notes</span>
                <span className="ms-date done">{event.notes}</span>
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
              {new Date(event.createdAt).toLocaleString()}
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

function NQCloseModal({
  deal: _deal,
  onClose,
  onSubmit,
}: {
  deal: Deal;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [closeType, setCloseType] = useState<'lost' | 'disq'>('lost');
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
                onSubmit({ stage: 'NURTURE', lostReason, followUpDate: reengageDate });
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
  const { data: reps } = useQuery<Rep[]>({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps();
      return (data as any).reps || data;
    },
    staleTime: 60_000,
  });

  const assistIds: string[] = (deal.assistingRepIds as string[]) || [];
  const activeReps = (reps || []).filter((r) => r.isActive !== false);
  const repOnly = activeReps.filter((r) => r.role === 'REP');
  const requiredIds = new Set<string>([deal.assignedRepId, ...assistIds].filter(Boolean) as string[]);
  const basePool = repOnly.length > 0 ? repOnly : activeReps;
  const allReps = [
    ...basePool,
    ...activeReps.filter((r) => requiredIds.has(r.id) && !basePool.some((b) => b.id === r.id)),
  ].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  const primary = allReps.find((r) => r.id === deal.assignedRepId);
  const assists = allReps.filter((r) => assistIds.includes(r.id));

  function setPrimary(repId: string) {
    if (!isAdmin || repId === deal.assignedRepId) return;
    onShare({ assignedRepId: repId, assistingRepIds: assistIds.filter((id) => id !== repId) });
  }

  function toggleAssist(repId: string) {
    if (!isAdmin || repId === deal.assignedRepId) return;
    const newAssists = assistIds.includes(repId) ? assistIds.filter((id) => id !== repId) : [...assistIds, repId];
    onShare({ assistingRepIds: newAssists });
  }

  return (
    <>
      <div className="own-row">
        <span className="own-label pl">Primary</span>
        {allReps.map((r) => {
          const isSel = r.id === deal.assignedRepId;
          return (
            <div
              key={r.id}
              className={clsx('own-rep-chip', isSel && 'sel-primary')}
              onClick={() => setPrimary(r.id)}
              style={!isAdmin ? { cursor: 'default', opacity: 0.6 } : undefined}
              title={`${r.firstName} ${r.lastName}${isSel ? ' (primary)' : ''}`}
            >
              <div
                className="av"
                style={{ background: `${r.avatarColor || '#6366f1'}2e`, color: r.avatarColor || '#6366f1', width: 16, height: 16, fontSize: 7 }}
              >
                {r.initials || `${r.firstName[0]}${r.lastName?.[0] || ''}`}
              </div>
              {r.firstName}
              {isSel && <span style={{ fontSize: 9, opacity: 0.7 }}>✓</span>}
            </div>
          );
        })}
      </div>

      <div className="own-row">
        <span className="own-label al">Assist</span>
        {allReps
          .filter((r) => r.id !== deal.assignedRepId)
          .map((r) => {
            const isAssisting = assistIds.includes(r.id);
            return (
              <div
                key={r.id}
                className={clsx('own-rep-chip', isAssisting && 'sel-assist')}
                onClick={() => toggleAssist(r.id)}
                style={!isAdmin ? { cursor: 'default', opacity: 0.6 } : undefined}
                title={`${r.firstName} ${r.lastName}${isAssisting ? ' (assisting)' : ' — click to add'}`}
              >
                <div
                  className="av"
                  style={{ background: `${r.avatarColor || '#6366f1'}2e`, color: r.avatarColor || '#6366f1', width: 16, height: 16, fontSize: 7 }}
                >
                  {r.initials || `${r.firstName[0]}${r.lastName?.[0] || ''}`}
                </div>
                {r.firstName}
                {isAssisting ? (
                  <span style={{ fontSize: 9, opacity: 0.7 }}>✓</span>
                ) : (
                  <span style={{ fontSize: 9, color: 'var(--text3)' }}>+</span>
                )}
              </div>
            );
          })}
        {assists.length === 0 && <span style={{ fontSize: 9, color: 'var(--text3)' }}>None — click rep to add</span>}
      </div>

      {assists.length > 0 && primary && (
        <div style={{ fontSize: 10, color: 'var(--info)', marginTop: 3 }}>
          👥 Shared with {assists.map((r) => r.firstName).join(', ')}. Primary owner: {primary.firstName}.
        </div>
      )}
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
