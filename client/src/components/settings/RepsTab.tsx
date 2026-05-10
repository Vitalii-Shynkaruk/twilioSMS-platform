import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repApi } from '../../services/api';
import { useState } from 'react';
import { Plus, Edit2, Target, Save, X, Power } from 'lucide-react';
import toast from 'react-hot-toast';

import type { Rep } from '../../types';

export default function RepsTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRepData, setEditRepData] = useState<Rep | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: reps, isLoading } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps();
      return data as Rep[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => repApi.updateRep(id, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reps'] });
      toast.success('Rep status updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update'),
  });

  if (isLoading) {
    return <div className="text-sm text-[var(--text-muted)]">Loading reps...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Sales Reps ({reps?.length || 0})</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-scl-600 text-white rounded-lg hover:bg-scl-500 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Add Rep
        </button>
      </div>

      {showCreate && (
        <CreateRepForm
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['reps'] });
          }}
        />
      )}

      {editRepData && (
        <EditRepModal
          rep={editRepData}
          onClose={() => setEditRepData(null)}
          onSaved={() => {
            setEditRepData(null);
            qc.invalidateQueries({ queryKey: ['reps'] });
          }}
        />
      )}

      <div className="space-y-2">
        {reps?.map((rep) => (
          <RepRow
            key={rep.id}
            rep={rep}
            isEditing={editingId === rep.id}
            onEdit={() => setEditingId(rep.id)}
            onEditFull={() => setEditRepData(rep)}
            onCancel={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              qc.invalidateQueries({ queryKey: ['reps'] });
            }}
            onToggleActive={() => toggleActive.mutate({ id: rep.id, isActive: !rep.isActive })}
          />
        ))}
      </div>

      <TeamGoals />
    </div>
  );
}

function RepRow({
  rep,
  isEditing,
  onEdit,
  onEditFull,
  onCancel,
  onSaved,
  onToggleActive,
}: {
  rep: Rep;
  isEditing: boolean;
  onEdit: () => void;
  onEditFull: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onToggleActive: () => void;
}) {
  const [monthly, setMonthly] = useState(rep.monthlyGoal?.toString() || '');
  const [annual, setAnnual] = useState(rep.annualGoal?.toString() || '');

  const updateGoals = useMutation({
    mutationFn: () =>
      repApi.updateGoals(rep.id, {
        monthlyGoal: monthly ? parseFloat(monthly) : undefined,
        annualGoal: annual ? parseFloat(annual) : undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <div className={`flex items-center gap-4 p-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg ${!rep.isActive ? 'opacity-50' : ''}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
        style={{ backgroundColor: rep.avatarColor || '#6366f1' }}
      >
        {rep.initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {rep.firstName} {rep.lastName}
          {!rep.isActive && <span className="ml-2 text-xs text-red-400">(inactive)</span>}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {rep.email} · {rep.role} · SMS lock: {rep.smsOutboundThreshold ?? 1}
        </p>
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Monthly $"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className="w-24 px-2 py-1 text-xs rounded bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
          <input
            type="number"
            placeholder="Annual $"
            value={annual}
            onChange={(e) => setAnnual(e.target.value)}
            className="w-24 px-2 py-1 text-xs rounded bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
          <button onClick={() => updateGoals.mutate()} className="p-1 text-green-400 hover:text-green-300">
            <Save className="w-4 h-4" />
          </button>
          <button onClick={onCancel} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {rep.monthlyGoal && (
            <span className="text-xs text-[var(--text-muted)]">
              <Target className="w-3 h-3 inline mr-1" />${(rep.monthlyGoal / 1000).toFixed(0)}K/mo
            </span>
          )}
          <button onClick={onEdit} title="Edit goals" className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <Target className="w-3.5 h-3.5" />
          </button>
          <button onClick={onEditFull} title="Edit rep details" className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleActive}
            title={rep.isActive ? 'Deactivate rep' : 'Reactivate rep'}
            className={`p-1 ${rep.isActive ? 'text-green-400 hover:text-red-400' : 'text-red-400 hover:text-green-400'}`}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function CreateRepForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    initials: '',
    password: '',
    smsOutboundThreshold: '1',
    avatarColor: '#6366f1',
  });

  const autoInitials = (first: string, last: string) =>
    ((first[0] || '') + (last[0] || '')).toUpperCase();

  const create = useMutation({
    mutationFn: () => repApi.createRep({ ...form, initials: form.initials || autoInitials(form.firstName, form.lastName) }),
    onSuccess,
    onError: (err: any) => toast.error(err.response?.data?.error || 'Create failed'),
  });

  return (
    <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="First Name"
          value={form.firstName}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({ ...f, firstName: v, initials: autoInitials(v, f.lastName) }));
          }}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
        />
        <input
          placeholder="Last Name"
          value={form.lastName}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({ ...f, lastName: v, initials: autoInitials(f.firstName, v) }));
          }}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
        />
        <input
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
        />
        <input
          placeholder="Initials (e.g. JB)"
          value={form.initials}
          onChange={(e) => setForm({ ...form, initials: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
        />
        <input
          type="number"
          min="0"
          placeholder="SMS lock threshold (default 1)"
          value={form.smsOutboundThreshold}
          onChange={(e) => setForm({ ...form, smsOutboundThreshold: e.target.value })}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--text-muted)]">Color:</label>
        <input
          type="color"
          value={form.avatarColor}
          onChange={(e) => setForm({ ...form, avatarColor: e.target.value })}
          className="w-6 h-6"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => create.mutate()}
          disabled={!form.firstName || !form.email || !form.password}
          className="px-4 py-2 text-xs font-medium bg-scl-600 text-white rounded-lg hover:bg-scl-500 disabled:opacity-40 transition"
        >
          Create Rep
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditRepModal({ rep, onClose, onSaved }: { rep: Rep; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: rep.firstName || '',
    lastName: rep.lastName || '',
    email: rep.email || '',
    initials: rep.initials || '',
    role: rep.role || 'REP',
    smsOutboundThreshold: String(rep.smsOutboundThreshold ?? 1),
    avatarColor: rep.avatarColor || '#6366f1',
  });

  const update = useMutation({
    mutationFn: () => repApi.updateRep(rep.id, form),
    onSuccess: () => {
      toast.success('Rep updated');
      onSaved();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 w-[400px] space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Edit Rep: {rep.firstName} {rep.lastName}</h3>
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="First Name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
          <input
            placeholder="Last Name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
          <input
            placeholder="Initials"
            value={form.initials}
            onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })}
            className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]">Role:</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'ADMIN' | 'MANAGER' | 'REP' })}
              className="px-2 py-1 text-xs rounded bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            >
              <option value="REP">REP</option>
              <option value="MANAGER">MANAGER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]">Color:</label>
            <input
              type="color"
              value={form.avatarColor}
              onChange={(e) => setForm({ ...form, avatarColor: e.target.value })}
              className="w-6 h-6"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]">SMS Lock:</label>
            <input
              type="number"
              min="0"
              value={form.smsOutboundThreshold}
              onChange={(e) => setForm({ ...form, smsOutboundThreshold: e.target.value })}
              className="w-20 px-2 py-1 text-xs rounded bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => update.mutate()}
            disabled={!form.firstName || !form.email}
            className="px-4 py-2 text-xs font-medium bg-scl-600 text-white rounded-lg hover:bg-scl-500 disabled:opacity-40 transition"
          >
            Save Changes
          </button>
          <button onClick={onClose} className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamGoals() {
  const qc = useQueryClient();
  const [monthly, setMonthly] = useState('');
  const [annual, setAnnual] = useState('');
  const [editing, setEditing] = useState(false);

  const update = useMutation({
    mutationFn: () =>
      repApi.updateTeamGoals({
        monthlyGoal: monthly ? parseFloat(monthly) : undefined,
        annualGoal: annual ? parseFloat(annual) : undefined,
      }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['reps'] });
    },
  });

  return (
    <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Team Goals</h3>
      {editing ? (
        <div className="flex items-center gap-3">
          <input
            type="number"
            placeholder="Monthly Team Goal $"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className="w-40 px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
          <input
            type="number"
            placeholder="Annual Team Goal $"
            value={annual}
            onChange={(e) => setAnnual(e.target.value)}
            className="w-40 px-3 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
          />
          <button
            onClick={() => update.mutate()}
            className="px-3 py-2 text-xs font-medium bg-scl-600 text-white rounded-lg"
          >
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-[var(--text-muted)]">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-xs text-scl-400 hover:text-scl-300">
          <Target className="w-3 h-3 inline mr-1" /> Edit team goals
        </button>
      )}
    </div>
  );
}
