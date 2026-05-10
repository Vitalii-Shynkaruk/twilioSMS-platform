import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import type { PipelineStage } from './types';
import { hexToRgba } from './utils';
import toast from 'react-hot-toast';

const PRESET_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316',
  '#84cc16', '#a855f7',
];

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'DOCS_REQUESTED', 'SUBMITTED', 'FUNDED', 'NOT_INTERESTED', 'DNC'];

export default function StageModal({ stage, onClose }: { stage?: PipelineStage; onClose: () => void }) {
  const isEdit = !!stage;
  const queryClient = useQueryClient();
  const [name, setName] = useState(stage?.name || '');
  const [color, setColor] = useState(stage?.color || '#6366f1');
  const [mappedStatus, setMappedStatus] = useState(stage?.mappedStatus || '');

  const saveMutation = useMutation({
    mutationFn: () =>
      isEdit
        ? api.put(`/pipeline/stages/${stage!.id}`, { name, color, mappedStatus: mappedStatus || null })
        : api.post('/pipeline/stages', { name, color, mappedStatus: mappedStatus || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success(isEdit ? 'Stage updated' : 'Stage created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark-50">
            {isEdit ? 'Edit Stage' : 'Add Pipeline Stage'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) saveMutation.mutate(); }}
          className="space-y-4"
        >
          <div>
            <label className="label">Stage Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Qualified"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={clsx(
                    'w-8 h-8 rounded-full transition-all duration-150',
                    color === c && 'ring-2 ring-offset-2 ring-offset-dark-900 ring-white scale-110'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg" style={{ backgroundColor: hexToRgba(color, 0.1) }}>
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm" style={{ color }}>{name || 'Preview'}</span>
          </div>
          <div>
            <label className="label">Auto-set Lead Status</label>
            <select className="input" value={mappedStatus} onChange={(e) => setMappedStatus(e.target.value)}>
              <option value="">None (no auto-change)</option>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="text-xs text-dark-500 mt-1">When a lead is moved to this stage, automatically update its status</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending || !name.trim()} className="btn-primary">
              {saveMutation.isPending ? 'Saving...' : isEdit ? 'Update Stage' : 'Create Stage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
