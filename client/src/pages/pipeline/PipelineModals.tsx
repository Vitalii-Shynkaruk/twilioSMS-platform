import { useState } from 'react';
import { X } from 'lucide-react';
import type { PipelineCard, UserItem } from './types';

export function AssignRepModal({
  card,
  users,
  onAssign,
  onClose,
}: {
  card: PipelineCard;
  users: UserItem[];
  onAssign: (repId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark-50">Assign Rep</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-dark-400 mb-3">
          {card.lead.firstName} {card.lead.lastName || ''} · {card.lead.phone}
        </p>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          <button
            onClick={() => onAssign(null)}
            className="w-full text-left p-2.5 rounded-lg text-sm hover:bg-dark-700/50 text-dark-400 transition-colors"
          >
            Unassign
          </button>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => onAssign(u.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg text-sm hover:bg-dark-700/50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-scl-600/20 flex items-center justify-center text-xs font-semibold text-scl-400">
                {u.firstName[0]}
              </div>
              <span className="text-dark-200">{u.firstName} {u.lastName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NoteModal({
  card,
  onSave,
  onClose,
}: {
  card: PipelineCard;
  onSave: (notes: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(card.lead.notes || card.notes || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark-50">Note</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-dark-400 mb-3">
          {card.lead.firstName} {card.lead.lastName || ''} · {card.lead.phone}
        </p>
        <textarea
          className="input min-h-[120px] text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note about this lead..."
          autoFocus
        />
        <div className="flex justify-end gap-3 pt-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onSave(text)} className="btn-primary">Save Note</button>
        </div>
      </div>
    </div>
  );
}
