import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi, dealApi, repApi } from '../../services/api';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import type { Rep, ProductType, PipelineAiSignals } from '../../types';

interface CreateDealModalProps {
  onClose: () => void;
  onCreated?: (deal: CreatedDeal) => void;
  prefill?: {
    clientId?: string;
    businessName?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    assignedRepId?: string;
  };
}

interface CreatedDeal {
  id: string;
  clientId?: string;
  assignedRepId?: string | null;
  stage?: string;
}

interface CreateDealPayload {
  clientId?: string;
  businessName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  productType?: ProductType;
  dealAmount?: number;
  submittedAmount?: number;
  assignedRepId?: string;
  nextAction?: string;
  nextActionDue?: string;
  notes?: string;
  pipelineAiSignals?: PipelineAiSignals;
}

type PipelinePreviewResponse = { signals: PipelineAiSignals } | { skipped: true; reason: string };

const LONG_CYCLE_PRODUCTS = new Set<ProductType>(['SBA', 'CRE', 'EQUIPMENT']);
const SUPPORTED_PRODUCTS = new Set<ProductType>(['MCA', 'LOC', 'EQUIPMENT', 'HELOC', 'SBA', 'CRE', 'BRIDGE']);

function isProductType(value: unknown): value is ProductType {
  return typeof value === 'string' && SUPPORTED_PRODUCTS.has(value as ProductType);
}

function dateFromPipelineTiming(timing?: string | null): string {
  if (!timing || timing === 'later') return '';
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (timing === 'next_week') date.setDate(date.getDate() + 7);
  if (timing === 'this_week') date.setDate(date.getDate() + 4);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAiMoney(signal?: { raw?: string | null; value_usd?: number | null } | null): string {
  if (!signal) return '—';
  if (signal.raw) return signal.raw;
  if (signal.value_usd) return `$${Math.round(signal.value_usd).toLocaleString()}`;
  return '—';
}

export default function CreateDealModal({ onClose, onCreated, prefill }: CreateDealModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [businessName, setBusinessName] = useState(prefill?.businessName || '');
  const [contactName, setContactName] = useState(prefill?.contactName || '');
  const [phone, setPhone] = useState(prefill?.phone || '');
  const [email, setEmail] = useState(prefill?.email || '');
  const [productType, setProductType] = useState<ProductType | ''>('');
  const [dealAmount, setDealAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [leadContext, setLeadContext] = useState('');
  const [aiPreview, setAiPreview] = useState<PipelineAiSignals | null>(null);
  const [aiPreviewSkipped, setAiPreviewSkipped] = useState('');
  const latestLeadContextRef = useRef('');
  const [assignedRepId, setAssignedRepId] = useState(prefill?.assignedRepId || user?.id || '');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDue, setNextActionDue] = useState('');

  const { data: reps } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps({ activeOnly: 'true' });
      return data as Rep[];
    },
    enabled: isAdmin,
  });

  const previewMutation = useMutation({
    mutationFn: async (text: string): Promise<PipelinePreviewResponse> => {
      const { data } = await aiApi.previewPipeline({ inputType: 'rep_note', text });
      return data as PipelinePreviewResponse;
    },
    onSuccess: (result, text) => {
      if (text !== latestLeadContextRef.current) return;
      if ('signals' in result) {
        setAiPreview(result.signals);
        setAiPreviewSkipped('');
        const suggestedProduct = result.signals.product_interest.find(isProductType);
        const requestedAmount = result.signals.requested_amount?.value_usd || null;
        const pendingAction = result.signals.pending_actions[0];
        const pendingDue = dateFromPipelineTiming(pendingAction?.timing);

        if (suggestedProduct) {
          setProductType((current) => current || suggestedProduct);
        }
        if (requestedAmount) {
          setDealAmount((current) => current || String(Math.round(requestedAmount)));
        }
        if (pendingAction?.action) {
          setNextAction((current) => current || pendingAction.action);
        }
        if (pendingDue) {
          setNextActionDue((current) => current || pendingDue);
        }
        return;
      }
      setAiPreview(null);
      setAiPreviewSkipped(result.reason);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { error?: string } }; message?: string };
      setAiPreview(null);
      setAiPreviewSkipped(apiError.response?.data?.error || apiError.message || 'preview_failed');
    },
  });

  useEffect(() => {
    const text = leadContext.trim();
    if (text.length < 18) return;

    const timer = window.setTimeout(() => {
      previewMutation.mutate(text);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [leadContext, previewMutation]);

  const mutation = useMutation({
    mutationFn: (payload: CreateDealPayload) => dealApi.createDeal(payload),
    onSuccess: async (response) => {
      const createdDeal = response.data && typeof response.data.id === 'string' ? (response.data as CreatedDeal) : null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['deals'] }),
        createdDeal ? queryClient.invalidateQueries({ queryKey: ['deal', createdDeal.id] }) : Promise.resolve(),
      ]);
      await queryClient.refetchQueries({ queryKey: ['deals'], type: 'active' });
      if (createdDeal) {
        onCreated?.(createdDeal);
        window.dispatchEvent(new CustomEvent('scl:deal-created', { detail: createdDeal }));
      }
      toast.success('Deal created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create deal'),
  });

  const handleSubmit = () => {
    if (!businessName) {
      toast.error('Business name is required');
      return;
    }
    if (!productType) {
      toast.error('Product type is required');
      return;
    }
    const longCycle = LONG_CYCLE_PRODUCTS.has(productType as ProductType);
    if (longCycle && !dealAmount) {
      toast.error('Submitted amount is required for this product type');
      return;
    }
    const parsedAmount = dealAmount ? parseFloat(dealAmount) : undefined;
    const combinedNotes = [notes.trim(), leadContext.trim() ? `About this lead: ${leadContext.trim()}` : '']
      .filter(Boolean)
      .join('\n\n');
    mutation.mutate({
      clientId: prefill?.clientId || undefined,
      businessName,
      contactName: contactName || undefined,
      phone: phone || undefined,
      email: email || undefined,
      productType: productType || undefined,
      dealAmount: !longCycle ? parsedAmount : undefined,
      submittedAmount: longCycle ? parsedAmount : undefined,
      assignedRepId: assignedRepId || undefined,
      nextAction: nextAction || undefined,
      nextActionDue: nextActionDue || undefined,
      notes: combinedNotes || undefined,
      pipelineAiSignals: aiPreview || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 shadow-xl"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {prefill ? `New Deal — ${prefill.businessName || 'Client'}` : 'New Deal'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)]"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Business Name *</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Contact Name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">
              About this lead · use of funds · context
            </label>
            <textarea
              value={leadContext}
              onChange={(e) => {
                const nextValue = e.target.value;
                const trimmedValue = nextValue.trim();
                latestLeadContextRef.current = trimmedValue;
                setLeadContext(nextValue);
                if (trimmedValue.length < 18) {
                  setAiPreview(null);
                  setAiPreviewSkipped('');
                }
              }}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)] min-h-[84px] resize-none"
              placeholder="e.g. Auto repair shop, $75k monthly revenue, needs $40k for equipment, call tomorrow"
              aria-describedby="pipeline-ai-preview"
            />
            <div id="pipeline-ai-preview" aria-live="polite" className="mt-2 min-h-[28px]">
              {previewMutation.isPending ? (
                <div className="text-[11px] text-blue-400">Pipeline AI reading lead context...</div>
              ) : aiPreview ? (
                <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-2">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-300">
                    AI preview
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <span className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1">
                      Industry: {aiPreview.industry || '?'}
                    </span>
                    <span className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1">
                      Revenue: {formatAiMoney(aiPreview.monthly_revenue)}
                    </span>
                    <span className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1">
                      Amount: {formatAiMoney(aiPreview.requested_amount)}
                    </span>
                    <span className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1">
                      Product: {aiPreview.product_interest[0] || '?'}
                    </span>
                    <span className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1">
                      Use: {aiPreview.use_of_funds?.detail || aiPreview.use_of_funds?.category || '?'}
                    </span>
                    <span className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1">
                      Action: {aiPreview.pending_actions[0]?.action || '?'}
                      {aiPreview.pending_actions[0]?.timing ? ` · ${aiPreview.pending_actions[0]?.timing}` : ''}
                    </span>
                  </div>
                </div>
              ) : aiPreviewSkipped ? (
                <div className="text-[11px] text-[var(--text-muted)]">Pipeline AI skipped: {aiPreviewSkipped}</div>
              ) : null}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Product Type</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            >
              <option value="">Select...</option>
              <option value="MCA">MCA</option>
              <option value="LOC">Line of Credit</option>
              <option value="EQUIPMENT">Equipment</option>
              <option value="HELOC">HELOC</option>
              <option value="SBA">SBA</option>
              <option value="CRE">CRE</option>
              <option value="BRIDGE">Bridge</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">
              {LONG_CYCLE_PRODUCTS.has(productType as ProductType)
                ? 'Submitted Amount *'
                : ['MCA', 'LOC', 'HELOC', 'BRIDGE'].includes(productType)
                  ? 'Requested Amount'
                  : 'Amount'}
            </label>
            <input
              type="number"
              value={dealAmount}
              onChange={(e) => setDealAmount(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
              placeholder=""
              disabled={!productType}
            />
            {['SBA', 'CRE', 'EQUIPMENT'].includes(productType) && (
              <p className="text-xs text-blue-400 mt-1">This deal will be created in Submitted (In Review)</p>
            )}
          </div>
          {isAdmin && reps && (
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Assigned Rep</label>
              <select
                value={assignedRepId}
                onChange={(e) => setAssignedRepId(e.target.value)}
                className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
              >
                {reps.map((rep: Rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.initials || rep.firstName} - {rep.firstName} {rep.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Next Action</label>
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
              placeholder="Call merchant"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Due Date</label>
            <input
              type="date"
              value={nextActionDue}
              onChange={(e) => setNextActionDue(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)]"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Quick note (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-2 text-[var(--text-primary)] min-h-[72px] resize-none"
              placeholder="e.g. 6 trucks, needs $400k, call after 4pm"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!businessName || !productType || mutation.isPending}
          className="w-full mt-4 py-2.5 rounded-lg bg-scl-500 text-white text-sm font-medium hover:bg-scl-600 disabled:opacity-50 transition"
        >
          {mutation.isPending ? 'Creating...' : 'Create Deal'}
        </button>
      </div>
    </div>
  );
}
