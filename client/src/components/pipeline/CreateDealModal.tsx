import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dealApi, repApi } from '../../services/api';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import type { Rep, ProductType } from '../../types';

interface CreateDealModalProps {
  onClose: () => void;
  prefill?: {
    businessName?: string;
    contactName?: string;
    phone?: string;
    email?: string;
  };
}

export default function CreateDealModal({ onClose, prefill }: CreateDealModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [businessName, setBusinessName] = useState(prefill?.businessName || '');
  const [contactName, setContactName] = useState(prefill?.contactName || '');
  const [phone, setPhone] = useState(prefill?.phone || '');
  const [email, setEmail] = useState(prefill?.email || '');
  const [productType, setProductType] = useState<ProductType | ''>('');
  const [dealAmount, setDealAmount] = useState('');
  const [assignedRepId, setAssignedRepId] = useState(user?.id || '');
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

  const mutation = useMutation({
    mutationFn: (data: any) => dealApi.createDeal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
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
    const longCycle = ['SBA', 'CRE', 'EQUIPMENT'].includes(productType);
    if (longCycle && !dealAmount) {
      toast.error('Submitted amount is required for this product type');
      return;
    }
    mutation.mutate({
      businessName,
      contactName: contactName || undefined,
      phone: phone || undefined,
      email: email || undefined,
      productType: productType || undefined,
      dealAmount: dealAmount ? parseFloat(dealAmount) : undefined,
      assignedRepId: assignedRepId || undefined,
      nextAction: nextAction || undefined,
      nextActionDue: nextActionDue || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl w-full max-w-lg p-5 shadow-xl"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {prefill ? `New Deal — ${prefill.businessName || 'Client'}` : 'New Deal'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-tertiary)]">
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
              {['SBA', 'CRE', 'EQUIPMENT'].includes(productType)
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
        </div>

        <button
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
