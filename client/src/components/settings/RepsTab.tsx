import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repApi } from '../../services/api';
import { useState } from 'react';
import { Plus, Edit2, Target, Save, X } from 'lucide-react';

import type { Rep } from '../../types';

export default function RepsTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: reps, isLoading } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps();
      return data as Rep[];
    },
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

      <div className="space-y-2">
        {reps?.map((rep) => (
          <RepRow
            key={rep.id}
            rep={rep}
            isEditing={editingId === rep.id}
            onEdit={() => setEditingId(rep.id)}
            onCancel={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              qc.invalidateQueries({ queryKey: ['reps'] });
            }}
          />
        ))}
      </div>

      {/* Team Goals */}
      <TeamGoals />
    </div>
  );
}

function RepRow({
  rep,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
}: {
  rep: Rep;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
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
    <div className="flex items-center gap-4 p-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
        style={{ backgroundColor: rep.avatarColor || '#6366f1' }}
      >
        {rep.initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {rep.firstName} {rep.lastName}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {rep.email} · {rep.role}
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
          <button onClick={onEdit} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <Edit2 className="w-3.5 h-3.5" />
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
    avatarColor: '#6366f1',
  });

  const create = useMutation({
    mutationFn: () => repApi.createRep(form),
    onSuccess,
  });

  return (
    <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg space-y-3">
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
