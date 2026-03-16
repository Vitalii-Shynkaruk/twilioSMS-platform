import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Plus, Edit3, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const presetColors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function TagsTab() {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [editingTag, setEditingTag] = useState<{ id: string; name: string; color: string } | null>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data } = await api.get('/settings/tags');
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/settings/tags', { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setName('');
      toast.success('Tag created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) =>
      api.put(`/settings/tags/${id}`, { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setEditingTag(null);
      toast.success('Tag updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag deleted');
    },
  });

  const tags = data?.tags || [];

  return (
    <div className="card p-6 space-y-6">
      <h3 className="text-base font-semibold text-dark-100">Manage Tags</h3>

      {/* Create Tag */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="label">Tag Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Hot Lead"
          />
        </div>
        <div>
          <label className="label">Color</label>
          <div className="flex items-center gap-2">
            {presetColors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={clsx(
                  'w-7 h-7 rounded-full transition-transform',
                  color === c && 'ring-2 ring-offset-2 ring-offset-dark-900 ring-white scale-110'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
          className="btn-primary"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </button>
      </div>

      {/* Tags List */}
      <div className="space-y-2">
        {tags.map((tag: any) => (
          <div
            key={tag.id}
            className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg"
          >
            {editingTag?.id === tag.id && editingTag ? (
              <div className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-1">
                  {presetColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditingTag({ id: editingTag.id, name: editingTag.name, color: c })}
                      className={clsx(
                        'w-5 h-5 rounded-full transition-transform',
                        editingTag.color === c && 'ring-2 ring-offset-1 ring-offset-dark-900 ring-white scale-110'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input
                  className="input py-1 text-sm flex-1"
                  value={editingTag.name}
                  onChange={(e) => setEditingTag({ id: editingTag.id, name: e.target.value, color: editingTag.color })}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editingTag.name.trim()) {
                      updateMutation.mutate({ id: editingTag.id, name: editingTag.name, color: editingTag.color });
                    }
                    if (e.key === 'Escape') setEditingTag(null);
                  }}
                />
                <button
                  onClick={() => updateMutation.mutate({ id: editingTag.id, name: editingTag.name, color: editingTag.color })}
                  disabled={!editingTag.name.trim() || updateMutation.isPending}
                  className="btn-primary py-1 px-3 text-xs"
                >
                  Save
                </button>
                <button onClick={() => setEditingTag(null)} className="btn-ghost py-1 px-2 text-xs">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-sm text-dark-200">{tag.name}</span>
                  <span className="text-xs text-dark-500">
                    {tag._count?.leads || 0} leads
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingTag({ id: tag.id, name: tag.name, color: tag.color })}
                    className="btn-ghost p-1 text-dark-500 hover:text-dark-200"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete tag "${tag.name}"? This will remove it from all leads.`)) {
                        deleteMutation.mutate(tag.id);
                      }
                    }}
                    className="btn-ghost p-1 text-dark-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
