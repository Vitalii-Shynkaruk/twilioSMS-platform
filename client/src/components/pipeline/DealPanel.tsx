import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealApi, repApi } from '../../services/api';
import {
  X,
  Phone,
  MessageSquare,
  DollarSign,
  Clock,
  Flame,
  ChevronRight,
  Plus,
  CheckCircle2,
  Calendar,
  Shield,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import type { Deal, DealStage, Rep, Offer, ProductType } from '../../types';
import { STAGE_COLORS, formatCurrency } from './DealCard';
import { useAuthStore } from '../../stores/authStore';

const STAGE_LABELS: Record<DealStage, string> = {
  NEW_LEAD: 'New Lead',
  ENGAGED_INTERESTED: 'Engaged / Interested',
  QUALIFIED: 'Qualified',
  SUBMITTED_IN_REVIEW: 'Submitted (In Review)',
  APPROVED_OFFERS: 'Approved / Offers',
  COMMITTED_FUNDING: 'Committed → Funding',
  FUNDED: 'Funded',
  NURTURE: 'Nurture (Lost)',
  CLOSED: 'Closed (DQ)',
};

interface DealPanelProps {
  dealId: string;
  onClose: () => void;
}

export default function DealPanel({ dealId, onClose }: DealPanelProps) {
  const [tab, setTab] = useState<'details' | 'activity' | 'offers' | 'sms'>('details');
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

  if (isLoading || !deal) {
    return (
      <div className="fixed inset-y-0 right-0 w-[480px] bg-[var(--bg-primary)] border-l border-[var(--border-primary)] shadow-2xl z-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-scl-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stageColor = STAGE_COLORS[deal.stage] || '#6366f1';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-[480px] max-w-full bg-[var(--bg-primary)] border-l border-[var(--border-primary)] shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stageColor }} />
              <span className="text-xs font-medium text-[var(--text-secondary)]">{STAGE_LABELS[deal.stage]}</span>
              {deal.isHot && <Flame className="w-3.5 h-3.5 text-orange-500" />}
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-tertiary)]">
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{deal.client?.businessName || 'Unknown'}</h2>
          <div className="flex items-center gap-3 mt-1">
            {deal.dealAmount ? (
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {formatCurrency(deal.dealAmount)}
              </span>
            ) : (
              <span className="text-sm text-amber-400 italic">Needs amount</span>
            )}
            {deal.productType && (
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                {deal.productType}
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              <Clock className="w-3 h-3 inline mr-0.5" />
              {deal.daysInStage}d in stage
            </span>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShowActionModal(true)}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-scl-500 text-white hover:bg-scl-600 transition"
            >
              <CheckCircle2 className="w-3 h-3 inline mr-1" />
              Complete Action
            </button>
            <button
              onClick={() => setShowMoveModal(true)}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition"
            >
              <ChevronRight className="w-3 h-3 inline mr-1" />
              Move Stage
            </button>
            {deal.stage === 'COMMITTED_FUNDING' && (
              <button
                onClick={() => setShowFundedModal(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
              >
                <DollarSign className="w-3 h-3 inline mr-1" />
                Fund
              </button>
            )}
          </div>

          {/* Secondary actions */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowFollowUpModal(true)}
              className="px-2.5 py-1 text-[10px] font-medium rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
            >
              <Calendar className="w-3 h-3 inline mr-0.5" />
              Follow-Up
            </button>
            <button
              onClick={() => setShowNQModal(true)}
              className="px-2.5 py-1 text-[10px] font-medium rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-red-400 transition"
            >
              Lost / NQ
            </button>
            {deal.client?.phone && (
              <>
                <a
                  href={`tel:${deal.client.phone}`}
                  className="px-2.5 py-1 text-[10px] font-medium rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-green-400 transition"
                >
                  <Phone className="w-3 h-3 inline mr-0.5" />
                  Call
                </a>
                <a
                  href={`sms:${deal.client.phone}`}
                  className="px-2.5 py-1 text-[10px] font-medium rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-blue-400 transition"
                >
                  <MessageSquare className="w-3 h-3 inline mr-0.5" />
                  Text
                </a>
              </>
            )}
          </div>

          {/* HELOC Rescission Window Notice — Rule #10/#20 */}
          {deal.productType === 'HELOC' && deal.commitSubStatus === 'DOCS_SIGNED' && (
            <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-400">HELOC Rescission Window</p>
                <p className="text-[10px] text-amber-300/70">
                  3-day right of rescission applies. Do not proceed with funding until the rescission period has
                  expired.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-primary)]">
          {(['details', 'activity', 'offers', 'sms'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'flex-1 px-4 py-2.5 text-xs font-medium capitalize transition',
                tab === t
                  ? 'text-scl-500 border-b-2 border-scl-500'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {t} {t === 'offers' && deal.offers?.length ? `(${deal.offers.length})` : ''}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'details' && (
            <DetailsTab
              deal={deal}
              onUpdate={(data: any) => updateMutation.mutate(data)}
              isAdmin={isAdmin}
              onShare={(data: any) => shareMutation.mutate(data)}
              onEditFundEvent={(feId: string) => setShowEditFundModal(feId)}
            />
          )}
          {tab === 'activity' && <ActivityTab deal={deal} />}
          {tab === 'offers' && <OffersTab deal={deal} onAddOffer={() => setShowOfferModal(true)} />}
          {tab === 'sms' && <SmsTab dealId={deal.id} />}
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
function OffersTab({ deal, onAddOffer }: { deal: Deal; onAddOffer: () => void }) {
  const offers = deal.offers || [];

  return (
    <div>
      <button
        onClick={onAddOffer}
        className="w-full mb-3 px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-scl-500 transition"
      >
        <Plus className="w-3 h-3 inline mr-1" />
        Add Offer
      </button>
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

function ScheduleFollowUpModal({
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

  const allReps = reps || [];
  const primary = allReps.find((r) => r.id === deal.assignedRepId);
  const assistIds: string[] = (deal.assistingRepIds as string[]) || [];
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
    <Section title="Rep Ownership">
      {/* Primary row */}
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
                className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                style={{ backgroundColor: r.avatarColor || '#6366f1' }}
              >
                {r.initials || r.firstName[0]}
              </div>
              {r.firstName}
              {isSel && <span style={{ fontSize: 9, opacity: 0.7 }}>✓</span>}
            </div>
          );
        })}
      </div>

      {/* Assist row */}
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
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                  style={{ backgroundColor: r.avatarColor || '#6366f1' }}
                >
                  {r.initials || r.firstName[0]}
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

      {/* Shared note */}
      {assists.length > 0 && primary && (
        <div style={{ fontSize: 10, color: 'var(--info)', marginTop: 3 }}>
          👥 This deal appears on {assists.map((r) => r.firstName).join(', ')}&apos;s pipeline too. They can view and
          work it but {primary.firstName} is the primary owner.
        </div>
      )}
    </Section>
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
