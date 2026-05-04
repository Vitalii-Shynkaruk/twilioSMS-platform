import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Plus, Edit3, Trash2, X, UnlockKeyhole } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { ConfirmDialog } from '../ConfirmDialog';
import { PHASE1_LEAN } from '../../config/featureFlags';
import { useAuthStore } from '../../stores/authStore';

function isOtpLocked(user: any) {
  return !!user.otpLockedUntil && new Date(user.otpLockedUntil) > new Date();
}

export default function UsersTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; user: any } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [ctxMenu]);

  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted');
      setDeletingUser(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const unlockOtpMutation = useMutation({
    mutationFn: (id: string) => api.post(`/auth/users/${id}/unlock-otp`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('OTP lock cleared');
      setCtxMenu(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to clear OTP lock'),
  });

  const users = data?.users || [];

  return (
    <div className="card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-dark-100">Team Members</h3>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4 mr-1" />
          Add User
        </button>
      </div>

      <div className="space-y-2">
        {users.map((user: any) => (
          <div
            key={user.id}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, user });
            }}
            className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg group cursor-pointer hover:bg-dark-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-scl-600/20 flex items-center justify-center text-scl-400 text-sm font-semibold">
                {user.firstName?.[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-dark-200">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-dark-500">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!user.isActive && <span className="badge bg-red-500/20 text-red-300 text-[10px]">Disabled</span>}
              {isOtpLocked(user) && (
                <span className="badge bg-amber-500/20 text-amber-300 text-[10px]">OTP Locked</span>
              )}
              <span
                className={clsx(
                  'badge text-[10px]',
                  user.role === 'ADMIN'
                    ? 'bg-red-500/20 text-red-300'
                    : user.role === 'MANAGER'
                      ? 'bg-yellow-500/20 text-yellow-300'
                      : 'bg-blue-500/20 text-blue-300',
                )}
              >
                {user.role}
              </span>
              {currentUser?.role === 'ADMIN' && isOtpLocked(user) && (
                <button
                  onClick={() => unlockOtpMutation.mutate(user.id)}
                  className="btn-ghost p-1.5 transition-opacity text-amber-300 hover:text-amber-200"
                  title="Clear OTP lock"
                  aria-label={`Clear OTP lock for ${user.firstName} ${user.lastName}`}
                  disabled={unlockOtpMutation.isPending}
                >
                  <UnlockKeyhole className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setEditingUser(user)} className="btn-ghost p-1.5 transition-opacity" title="Edit">
                <Edit3 className="w-3.5 h-3.5 text-dark-400" />
              </button>
              <button
                onClick={() => setDeletingUser(user)}
                className="btn-ghost p-1.5 transition-opacity text-red-400 hover:text-red-300"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="bg-dark-800 border border-dark-600 rounded-lg shadow-xl py-1 min-w-[140px]"
        >
          <button
            onClick={() => {
              setEditingUser(ctxMenu.user);
              setCtxMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-dark-200 hover:bg-dark-700 flex items-center gap-2"
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => {
              setDeletingUser(ctxMenu.user);
              setCtxMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-dark-700 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          {currentUser?.role === 'ADMIN' && isOtpLocked(ctxMenu.user) && (
            <button
              onClick={() => unlockOtpMutation.mutate(ctxMenu.user.id)}
              className="w-full text-left px-4 py-2 text-sm text-amber-300 hover:bg-dark-700 flex items-center gap-2"
              disabled={unlockOtpMutation.isPending}
            >
              <UnlockKeyhole className="w-3.5 h-3.5" /> Clear OTP lock
            </button>
          )}
        </div>
      )}

      {showCreate && <UserFormModal onClose={() => setShowCreate(false)} />}
      {editingUser && (
        <UserFormModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onDelete={() => {
            setDeletingUser(editingUser);
            setEditingUser(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deletingUser}
        title="Delete User"
        message={`Are you sure you want to delete ${deletingUser?.firstName} ${deletingUser?.lastName}? This will deactivate the account.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteMutation.mutate(deletingUser.id)}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  );
}

function UserFormModal({ user, onClose, onDelete }: { user?: any; onClose: () => void; onDelete?: () => void }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'REP',
    isActive: user?.isActive ?? true,
    mobilePhone: user?.mobilePhone || '',
    hotAlertsEnabled: user?.hotAlertsEnabled ?? true,
  });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      if (isEdit) {
        const payload: any = {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          role: form.role,
          isActive: form.isActive,
          mobilePhone: form.mobilePhone,
          hotAlertsEnabled: form.hotAlertsEnabled,
        };
        if (form.password) payload.password = form.password;
        return api.put(`/auth/users/${user.id}`, payload);
      } else {
        return api.post('/auth/register', form);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(isEdit ? 'User updated' : 'User created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark-50">{isEdit ? 'Edit User' : 'Add User'}</h3>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name</label>
              <input
                className="input"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input
                className="input"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">{isEdit ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              {...(!isEdit && { required: true, minLength: 6 })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="REP">Representative</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={form.isActive ? 'active' : 'disabled'}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            )}
          </div>
          {/* HOT alerts: mobile phone + toggle (toggle скрыт в PHASE1_LEAN) */}
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-3">
            <p className="text-xs font-semibold text-orange-300">HOT Alerts (mobile SMS)</p>
            <div>
              <label className="label">Mobile Phone (E.164, e.g. +13105551234)</label>
              <input
                className="input"
                type="tel"
                value={form.mobilePhone}
                onChange={(e) => setForm({ ...form, mobilePhone: e.target.value })}
                placeholder="+1..."
              />
            </div>
            {!PHASE1_LEAN && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hotAlertsEnabled}
                  onChange={(e) => setForm({ ...form, hotAlertsEnabled: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-dark-200">Receive SMS for hot leads</span>
              </label>
            )}
          </div>
          <div className="flex items-center justify-between pt-2">
            {isEdit && onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete User
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={mutation.isPending} className="btn-primary">
                {mutation.isPending ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
