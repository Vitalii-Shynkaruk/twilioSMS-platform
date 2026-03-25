import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealApi } from '../../services/api';
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
import type { Deal, DealStage } from '../../types';
import { STAGE_COLORS, formatCurrency } from './DealCard';

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
  const [tab, setTab] = useState<'details' | 'activity' | 'offers'>('details');
  const [showActionModal, setShowActionModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showFundedModal, setShowFundedModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const queryClient = useQueryClient();

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

          {/* Secondary actions: Follow-Up, Call, Text */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowFollowUpModal(true)}
              className="px-2.5 py-1 text-[10px] font-medium rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
            >
              <Calendar className="w-3 h-3 inline mr-0.5" />
              Follow-Up
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
          {(['details', 'activity', 'offers'] as const).map((t) => (
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
          {tab === 'details' && <DetailsTab deal={deal} onUpdate={(data: any) => updateMutation.mutate(data)} />}
          {tab === 'activity' && <ActivityTab deal={deal} />}
          {tab === 'offers' && <OffersTab deal={deal} onAddOffer={() => setShowOfferModal(true)} />}
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
            onClose={() => setShowFollowUpModal(false)}
            onSubmit={(data) => {
              updateMutation.mutate(data);
              setShowFollowUpModal(false);
            }}
          />
        )}
      </div>
    </>
  );
}

// ─── Details Tab ───
function DetailsTab({ deal, onUpdate }: { deal: Deal; onUpdate: (data: any) => void }) {
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

      {/* Rep */}
      <Section title="Rep">
        <div className="flex items-center gap-2">
          {deal.assignedRep && (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: deal.assignedRep.avatarColor || '#6366f1' }}
            >
              {deal.assignedRep.initials || deal.assignedRep.firstName[0]}
            </div>
          )}
          <span className="text-sm text-[var(--text-primary)]">
            {deal.assignedRep ? `${deal.assignedRep.firstName} ${deal.assignedRep.lastName}` : 'Unassigned'}
          </span>
        </div>
      </Section>

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
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Action Completed</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          >
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
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Next Action *</label>
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            placeholder="e.g. Follow up with lender"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Due Date *</label>
          <input
            type="date"
            value={nextActionDue}
            onChange={(e) => setNextActionDue(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)] resize-none"
          />
        </div>
        <button
          onClick={() => {
            if (!nextAction || !nextActionDue) {
              toast.error('Next action and due date are required');
              return;
            }
            onSubmit({ actionType, nextAction, nextActionDue, note });
          }}
          disabled={!nextAction || !nextActionDue}
          className="w-full py-2 rounded-lg bg-scl-500 text-white text-sm font-medium hover:bg-scl-600 disabled:opacity-50 transition"
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
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Move to Stage</label>
          <select
            value={targetStage}
            onChange={(e) => setTargetStage(e.target.value as DealStage)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          >
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
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Lost Reason *</label>
              <input
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Follow-Up Date *</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
              />
            </div>
          </>
        )}
        {targetStage === 'CLOSED' && (
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Disqualification Reason *</label>
            <input
              value={disqualReason}
              onChange={(e) => setDisqualReason(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
        )}
        <button
          onClick={() => {
            if (!targetStage) return;
            onSubmit({ stage: targetStage, lostReason, followUpDate, disqualReason });
          }}
          disabled={
            !targetStage ||
            (targetStage === 'NURTURE' && (!lostReason || !followUpDate)) ||
            (targetStage === 'CLOSED' && !disqualReason)
          }
          className="w-full py-2 rounded-lg bg-scl-500 text-white text-sm font-medium hover:bg-scl-600 disabled:opacity-50 transition"
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
  const [terms, setTerms] = useState('');
  const [expiryDays, setExpiryDays] = useState('');

  return (
    <ModalOverlay title="Add Offer" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Lender Name *</label>
          <input
            value={lenderName}
            onChange={(e) => setLenderName(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Amount *</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            placeholder="50000"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Terms</label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)] resize-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Expiry (days)</label>
          <input
            type="number"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          />
        </div>
        <button
          onClick={() => {
            if (!lenderName || !amount) {
              toast.error('Lender name and amount are required');
              return;
            }
            onSubmit({
              lenderName,
              amount: parseFloat(amount),
              terms: terms || undefined,
              expiryDays: expiryDays ? parseInt(expiryDays) : undefined,
            });
          }}
          disabled={!lenderName || !amount}
          className="w-full py-2 rounded-lg bg-scl-500 text-white text-sm font-medium hover:bg-scl-600 disabled:opacity-50 transition"
        >
          Add Offer
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─── Mark Funded Modal (Rule #4) ───
function MarkFundedModal({
  deal,
  onClose,
  onSubmit,
}: {
  deal: Deal;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [amountFunded, setAmountFunded] = useState(deal.dealAmount?.toString() || '');
  const [lender, setLender] = useState('');
  const [fundedDate, setFundedDate] = useState(new Date().toISOString().split('T')[0]);
  const [termMonths, setTermMonths] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <ModalOverlay title="Mark as Funded" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Amount Funded *</label>
            <input
              type="number"
              value={amountFunded}
              onChange={(e) => setAmountFunded(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Funded Date *</label>
            <input
              type="date"
              value={fundedDate}
              onChange={(e) => setFundedDate(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Funder / Lender</label>
          <input
            value={lender}
            onChange={(e) => setLender(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Term (months)</label>
            <input
              type="number"
              value={termMonths}
              onChange={(e) => setTermMonths(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Rate / Factor</label>
            <input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)] resize-none"
          />
        </div>

        {/* Renewal milestones preview */}
        <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">
            Auto-created renewal milestones:
          </p>
          <div className="text-[10px] text-[var(--text-secondary)] space-y-0.5">
            <p>• 35-day check-in</p>
            <p>• Midpoint review</p>
            <p>• 30-day payoff approach</p>
          </div>
        </div>

        <button
          onClick={() => {
            if (!amountFunded) {
              toast.error('Amount is required');
              return;
            }
            onSubmit({
              amountFunded: parseFloat(amountFunded),
              productType: deal.productType,
              lender: lender || undefined,
              fundedDate: fundedDate || undefined,
              termMonths: termMonths ? parseInt(termMonths) : undefined,
              rate: rate ? parseFloat(rate) : undefined,
              notes: notes || undefined,
            });
            onClose();
          }}
          disabled={!amountFunded}
          className="w-full py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
        >
          <DollarSign className="w-4 h-4 inline mr-1" />
          Confirm Funding
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─── Schedule Follow-Up Modal (Rule #12: type + date + note ALL required) ───
function ScheduleFollowUpModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [followUpType, setFollowUpType] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');

  return (
    <ModalOverlay title="Schedule Follow-Up" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Type *</label>
          <select
            value={followUpType}
            onChange={(e) => setFollowUpType(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          >
            <option value="">Select type...</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="meeting">Meeting</option>
            <option value="docs_check">Documents Check</option>
            <option value="renewal">Renewal</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Date *</label>
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Note *</label>
          <textarea
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
            rows={2}
            className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)] resize-none"
            placeholder="What needs to happen and why..."
          />
        </div>
        <button
          onClick={() => {
            if (!followUpType || !followUpDate || !followUpNote) {
              toast.error('All fields are required');
              return;
            }
            onSubmit({ followUpType, followUpDate, followUpNote });
          }}
          disabled={!followUpType || !followUpDate || !followUpNote}
          className="w-full py-2 rounded-lg bg-scl-500 text-white text-sm font-medium hover:bg-scl-600 disabled:opacity-50 transition"
        >
          Schedule Follow-Up
        </button>
      </div>
    </ModalOverlay>
  );
}

// ─── Modal wrapper ───
function ModalOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl w-full max-w-md p-4 shadow-xl"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-tertiary)]">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
