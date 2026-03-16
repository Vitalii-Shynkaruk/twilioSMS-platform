import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  ShieldX, Upload, Download, Trash2, Search, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SuppressionTab() {
  const [phones, setPhones] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['suppression', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      const { data } = await api.get(`/settings/suppression?${params}`);
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const phoneList = phones.split('\n').filter(Boolean).map((p) => p.trim());
      const results = [];
      for (const phone of phoneList) {
        try {
          await api.post('/settings/suppression', { phone, reason: 'manual' });
          results.push(phone);
        } catch { /* skip duplicates */ }
      }
      return { added: results.length };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['suppression'] });
      setPhones('');
      toast.success(`Added ${res.added} to suppression list`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/suppression/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppression'] });
      toast.success('Removed from suppression list');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const handleExport = async () => {
    try {
      const { data } = await api.get('/settings/suppression/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `suppression-list-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Exported suppression list');
    } catch {
      toast.error('Export failed');
    }
  };

  const entries = data?.entries || [];
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 };

  return (
    <div className="card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-dark-100">Suppression List</h3>
        <button onClick={handleExport} className="btn-ghost text-sm">
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </button>
      </div>
      <p className="text-sm text-dark-400">
        Numbers on this list will never receive messages. STOP keywords are automatically added.
      </p>

      {/* Bulk Add */}
      <div className="space-y-3">
        <label className="label">Add Numbers (one per line)</label>
        <textarea
          className="input min-h-[100px] font-mono text-sm"
          placeholder={"+12125551234\n+13105559876"}
          value={phones}
          onChange={(e) => setPhones(e.target.value)}
        />
        <button
          onClick={() => addMutation.mutate()}
          disabled={!phones.trim() || addMutation.isPending}
          className="btn-primary text-sm"
        >
          <Upload className="w-4 h-4 mr-1" />
          Add to List
        </button>
      </div>

      {/* Stats + Search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-lg flex-1">
          <ShieldX className="w-5 h-5 text-red-400" />
          <p className="text-sm font-medium text-dark-200">
            {pagination.total} suppressed numbers
          </p>
        </div>
        <div className="relative w-64">
          <Search className="w-4 h-4 text-dark-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by phone..."
            className="input pl-9 py-2 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Entries List */}
      <div className="space-y-1">
        {entries.map((entry: any) => (
          <div
            key={entry.id}
            className="flex items-center justify-between py-2 px-3 bg-dark-800/30 rounded text-sm group hover:bg-dark-700/30 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="font-mono text-dark-300">{entry.phone}</span>
              <span className="text-xs text-dark-500">{entry.reason}</span>
              <span className="text-xs text-dark-600">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button
              onClick={() => deleteMutation.mutate(entry.id)}
              className="btn-ghost p-1 text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-dark-500 text-center py-4">
            {search ? 'No matching entries' : 'Suppression list is empty'}
          </p>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-dark-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-ghost p-1.5 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
              className="btn-ghost p-1.5 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
