import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  Phone,
  Activity,
  Snowflake,
  Plus,
  RefreshCw,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  Trash2,
  Edit3,
  Search,
  ChevronDown,
  ChevronUp,
  Hash,
  ArrowUpDown,
  Signal,
  CloudDownload,
  Users,
  UserCheck,
  Unlink,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

/* ─── Types ─── */
interface PhoneNumberItem {
  id: string;
  phoneNumber: string;
  friendlyName: string | null;
  twilioSid: string;
  status: 'ACTIVE' | 'COOLING' | 'WARMING' | 'FLAGGED' | 'DISABLED' | 'SUSPENDED';
  dailySentCount: number;
  dailyLimit: number;
  deliveryRate: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  errorStreak: number;
  isRamping: boolean;
  rampDay: number;
  coolingUntil: string | null;
  cooldownReason: string | null;
  createdAt: string;
  lastSentAt: string | null;
  assignments: { user: { id: string; firstName: string; lastName: string } }[];
}

interface Assignment {
  id: string;
  assignedDate: string;
  isActive: boolean;
  user: { id: string; firstName: string; lastName: string };
  phoneNumber: { id: string; phoneNumber: string; status: string; dailySentCount: number; dailyLimit: number };
}

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
}

type SortField = 'phoneNumber' | 'status' | 'dailySentCount' | 'deliveryRate' | 'rampDay';
type SortDir = 'asc' | 'desc';
type PageTab = 'numbers' | 'assignments';

/* ─── Main Page ─── */
export default function NumbersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PageTab>('numbers');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editNumber, setEditNumber] = useState<PhoneNumberItem | null>(null);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<PhoneNumberItem | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('phoneNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  /* ── Queries ── */
  const { data, isLoading } = useQuery({
    queryKey: ['numbers'],
    queryFn: async () => {
      const { data } = await api.get('/numbers');
      return data;
    },
  });

  const { data: poolsData } = useQuery({
    queryKey: ['numberPools'],
    queryFn: async () => {
      const { data } = await api.get('/numbers/pools');
      return data;
    },
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['numberAssignments'],
    queryFn: async () => {
      const { data } = await api.get('/numbers/assignments');
      return data;
    },
  });

  /* ── Mutations ── */
  const coolMutation = useMutation({
    mutationFn: (id: string) => api.post(`/numbers/${id}/cool`, { reason: 'manual', hours: 24 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Number cooling for 24 hours');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to cool number'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/numbers/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Number activated');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to activate'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/numbers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Number deleted');
      setDeleteConfirm(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/numbers/sync-twilio'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success(res.data.message);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Twilio sync failed'),
  });

  const unassignMutation = useMutation({
    mutationFn: (repId: string) => api.delete(`/numbers/assignments/${repId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numberAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Numbers unassigned');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to unassign'),
  });

  const numbers: PhoneNumberItem[] = data?.numbers || [];
  const pools = poolsData?.pools || [];
  const assignments: Assignment[] = assignmentsData?.assignments || [];

  /* ── Stats ── */
  const activeCount = numbers.filter((n) => n.status === 'ACTIVE').length;
  const coolingCount = numbers.filter((n) => n.status === 'COOLING').length;
  const flaggedCount = numbers.filter((n) => n.status === 'FLAGGED').length;
  const warmingCount = numbers.filter((n) => n.status === 'WARMING').length;
  const avgHealth = numbers.length > 0
    ? Math.round(numbers.reduce((sum, n) => sum + (n.deliveryRate || 0), 0) / numbers.length)
    : 0;
  const totalCapacity = numbers.reduce((sum, n) => sum + n.dailyLimit, 0);
  const totalUsed = numbers.reduce((sum, n) => sum + n.dailySentCount, 0);

  /* ── Rep assignments grouped ── */
  const repAssignments = useMemo(() => {
    const map = new Map<string, { rep: Assignment['user']; numbers: Assignment['phoneNumber'][] }>();
    for (const a of assignments) {
      const existing = map.get(a.user.id);
      if (existing) {
        existing.numbers.push(a.phoneNumber);
      } else {
        map.set(a.user.id, { rep: a.user, numbers: [a.phoneNumber] });
      }
    }
    return Array.from(map.values());
  }, [assignments]);

  const assignedNumberIds = new Set(assignments.map((a) => a.phoneNumber.id));
  const unassignedNumbers = numbers.filter((n) => n.status === 'ACTIVE' && !assignedNumberIds.has(n.id));

  /* ── Filter & sort ── */
  const filteredNumbers = useMemo(() => {
    let list = [...numbers];
    if (statusFilter !== 'ALL') {
      list = list.filter((n) => n.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.phoneNumber.includes(q) ||
          (n.friendlyName && n.friendlyName.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'phoneNumber': cmp = a.phoneNumber.localeCompare(b.phoneNumber); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'dailySentCount': cmp = a.dailySentCount - b.dailySentCount; break;
        case 'deliveryRate': cmp = a.deliveryRate - b.deliveryRate; break;
        case 'rampDay': cmp = (a.rampDay || 0) - (b.rampDay || 0); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [numbers, statusFilter, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-dark-600" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-scl-400" />
      : <ChevronDown className="w-3 h-3 text-scl-400" />;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Phone Numbers</h1>
          <p className="text-sm text-dark-400 mt-1">
            {numbers.length} number{numbers.length !== 1 ? 's' : ''} · Capacity: {totalUsed.toLocaleString()}/{totalCapacity.toLocaleString()} today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <CloudDownload className={clsx('w-4 h-4', syncMutation.isPending && 'animate-pulse')} />
            {syncMutation.isPending ? 'Syncing…' : 'Sync Twilio'}
          </button>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['numbers'] })}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {activeTab === 'assignments' ? (
            <button onClick={() => setShowBulkAssign(true)} className="btn-primary flex items-center gap-2">
              <UserCheck className="w-4 h-4" /> Assign Numbers
            </button>
          ) : (
            <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Number
            </button>
          )}
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 p-0.5 bg-dark-800 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('numbers')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors font-medium',
            activeTab === 'numbers' ? 'bg-dark-700 text-dark-100 shadow-sm' : 'text-dark-400 hover:text-dark-200'
          )}
        >
          <Phone className="w-4 h-4" /> Numbers
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors font-medium',
            activeTab === 'assignments' ? 'bg-dark-700 text-dark-100 shadow-sm' : 'text-dark-400 hover:text-dark-200'
          )}
        >
          <Users className="w-4 h-4" />
          Daily Assignments
          {assignments.length > 0 && (
            <span className="text-[10px] bg-scl-600/30 text-scl-300 px-1.5 py-0.5 rounded-full">{assignments.length}</span>
          )}
        </button>
      </div>

      {/* ────────────── NUMBERS TAB ────────────── */}
      {activeTab === 'numbers' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="Active" value={activeCount} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
            <StatCard label="Warming" value={warmingCount} icon={<Signal className="w-5 h-5" />} color="yellow" />
            <StatCard label="Cooling" value={coolingCount} icon={<Snowflake className="w-5 h-5" />} color="blue" />
            <StatCard label="Flagged" value={flaggedCount} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
            <StatCard label="Avg Health" value={`${avgHealth}%`} icon={<Activity className="w-5 h-5" />} color="scl" />
            <StatCard label="Sent Today" value={totalUsed.toLocaleString()} icon={<Hash className="w-5 h-5" />} color="purple" />
          </div>

          {/* Pools Section */}
          {pools.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-dark-200 mb-3">Number Pools</h3>
              <div className="flex flex-wrap gap-3">
                {pools.map((pool: any) => (
                  <div
                    key={pool.id}
                    className="bg-dark-800/50 rounded-lg px-4 py-2.5 border border-dark-700/50 flex items-center gap-3"
                  >
                    <p className="text-sm font-medium text-dark-200">{pool.name}</p>
                    <span className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      pool.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-dark-700 text-dark-400'
                    )}>
                      {pool.isActive ? 'Active' : 'Off'}
                    </span>
                    <span className="text-xs text-dark-500">{pool._count?.members || 0} nums</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="text"
                placeholder="Search by number or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 w-full"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {['ALL', 'ACTIVE', 'WARMING', 'COOLING', 'FLAGGED', 'DISABLED'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={clsx(
                    'px-3 py-1.5 text-xs rounded-lg font-medium transition-colors',
                    statusFilter === s
                      ? 'bg-scl-600/20 text-scl-300 border border-scl-600/40'
                      : 'bg-dark-800/50 text-dark-400 border border-dark-700/50 hover:text-dark-200'
                  )}
                >
                  {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Numbers Table */}
          <NumbersTable
            numbers={filteredNumbers}
            isLoading={isLoading}
            totalCount={numbers.length}
            expandedRow={expandedRow}
            setExpandedRow={setExpandedRow}
            toggleSort={toggleSort}
            SortIcon={SortIcon}
            setShowAssign={setShowAssign}
            setEditNumber={setEditNumber}
            setDeleteConfirm={setDeleteConfirm}
            setShowAddModal={setShowAddModal}
            coolMutation={coolMutation}
            activateMutation={activateMutation}
            syncMutation={syncMutation}
          />
        </>
      )}

      {/* ────────────── DAILY ASSIGNMENTS TAB ────────────── */}
      {activeTab === 'assignments' && (
        <DailyAssignmentsView
          repAssignments={repAssignments}
          unassignedNumbers={unassignedNumbers}
          isLoading={assignmentsLoading}
          totalAssignments={assignments.length}
          onBulkAssign={() => setShowBulkAssign(true)}
          onUnassign={(repId) => unassignMutation.mutate(repId)}
          unassignPending={unassignMutation.isPending}
        />
      )}

      {/* Modals */}
      {showAssign && <AssignModal numberId={showAssign} onClose={() => setShowAssign(null)} />}
      {showAddModal && <AddNumberModal onClose={() => setShowAddModal(false)} />}
      {editNumber && <EditNumberModal number={editNumber} onClose={() => setEditNumber(null)} />}
      {showBulkAssign && <BulkAssignModal numbers={numbers} onClose={() => setShowBulkAssign(false)} />}
      {deleteConfirm && (
        <ConfirmDeleteModal
          number={deleteConfirm}
          onConfirm={() => { deleteMutation.mutate(deleteConfirm.id); setDeleteConfirm(null); }}
          onClose={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Numbers Table
   ═══════════════════════════════════════════════ */

function NumbersTable({
  numbers, isLoading, totalCount, expandedRow, setExpandedRow,
  toggleSort, SortIcon, setShowAssign, setEditNumber, setDeleteConfirm,
  setShowAddModal, coolMutation, activateMutation, syncMutation,
}: {
  numbers: PhoneNumberItem[];
  isLoading: boolean;
  totalCount: number;
  expandedRow: string | null;
  setExpandedRow: (id: string | null) => void;
  toggleSort: (field: SortField) => void;
  SortIcon: React.FC<{ field: SortField }>;
  setShowAssign: (id: string | null) => void;
  setEditNumber: (n: PhoneNumberItem | null) => void;
  setDeleteConfirm: (n: PhoneNumberItem | null) => void;
  setShowAddModal: (v: boolean) => void;
  coolMutation: any;
  activateMutation: any;
  syncMutation: any;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-700/50">
              <th className="table-th cursor-pointer select-none" onClick={() => toggleSort('phoneNumber')}>
                <div className="flex items-center gap-1">Number <SortIcon field="phoneNumber" /></div>
              </th>
              <th className="table-th cursor-pointer select-none" onClick={() => toggleSort('status')}>
                <div className="flex items-center gap-1">Status <SortIcon field="status" /></div>
              </th>
              <th className="table-th">Health</th>
              <th className="table-th cursor-pointer select-none" onClick={() => toggleSort('dailySentCount')}>
                <div className="flex items-center gap-1">Sent Today <SortIcon field="dailySentCount" /></div>
              </th>
              <th className="table-th">Daily Limit</th>
              <th className="table-th cursor-pointer select-none" onClick={() => toggleSort('deliveryRate')}>
                <div className="flex items-center gap-1">Delivery <SortIcon field="deliveryRate" /></div>
              </th>
              <th className="table-th cursor-pointer select-none" onClick={() => toggleSort('rampDay')}>
                <div className="flex items-center gap-1">Ramp <SortIcon field="rampDay" /></div>
              </th>
              <th className="table-th">Assigned To</th>
              <th className="table-th w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  {[...Array(9)].map((_, j) => (
                    <td key={j} className="table-td">
                      <div className="h-4 bg-dark-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && numbers.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-16">
                  <Phone className="w-10 h-10 text-dark-600 mx-auto mb-3" />
                  <p className="text-dark-400 text-sm">
                    {totalCount === 0 ? 'No phone numbers yet' : 'No numbers match filters'}
                  </p>
                  {totalCount === 0 && (
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Add Number
                      </button>
                      <button onClick={() => syncMutation.mutate()} className="btn-ghost text-sm flex items-center gap-2">
                        <CloudDownload className="w-4 h-4" /> Sync from Twilio
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}

            {numbers.map((number) => {
              const assignee = number.assignments?.[0]?.user;
              const isExpanded = expandedRow === number.id;

              return (
                <tr
                  key={number.id}
                  className={clsx(
                    'border-b border-dark-800/50 transition-colors',
                    isExpanded ? 'bg-dark-800/40' : 'hover:bg-dark-800/20'
                  )}
                >
                  <td className="table-td">
                    <button
                      onClick={() => setExpandedRow(isExpanded ? null : number.id)}
                      className="flex items-center gap-2 group text-left"
                    >
                      <Phone className="w-4 h-4 text-dark-500 group-hover:text-scl-400 transition-colors shrink-0" />
                      <div>
                        <span className="text-sm font-mono text-dark-200">{number.phoneNumber}</span>
                        {number.friendlyName && number.friendlyName !== number.phoneNumber && (
                          <p className="text-[10px] text-dark-500 leading-tight">{number.friendlyName}</p>
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-2 pl-6 pb-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        <div><span className="text-dark-500">SID:</span> <span className="text-dark-300 font-mono">{number.twilioSid?.startsWith('manual_') ? 'Manual' : (number.twilioSid?.length > 20 ? number.twilioSid.slice(0, 20) + '…' : number.twilioSid)}</span></div>
                        <div><span className="text-dark-500">Created:</span> <span className="text-dark-300">{new Date(number.createdAt).toLocaleDateString()}</span></div>
                        <div><span className="text-dark-500">Total Sent:</span> <span className="text-dark-300">{(number.totalSent ?? 0).toLocaleString()}</span></div>
                        <div><span className="text-dark-500">Delivered:</span> <span className="text-dark-300">{(number.totalDelivered ?? 0).toLocaleString()}</span></div>
                        <div><span className="text-dark-500">Failed:</span> <span className="text-dark-300">{(number.totalFailed ?? 0).toLocaleString()}</span></div>
                        <div><span className="text-dark-500">Error Streak:</span> <span className={clsx('text-dark-300', (number.errorStreak || 0) > 3 && 'text-red-400')}>{number.errorStreak || 0}</span></div>
                        {number.coolingUntil && (
                          <div className="col-span-2"><span className="text-dark-500">Cooling Until:</span> <span className="text-blue-300">{new Date(number.coolingUntil).toLocaleString()}</span> — {number.cooldownReason}</div>
                        )}
                        {number.lastSentAt && (
                          <div><span className="text-dark-500">Last Sent:</span> <span className="text-dark-300">{new Date(number.lastSentAt).toLocaleString()}</span></div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="table-td"><NumberStatusBadge status={number.status} /></td>
                  <td className="table-td"><HealthBar score={Math.round(number.deliveryRate || 0)} /></td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-dark-300">{number.dailySentCount}</span>
                      <UsageBar used={number.dailySentCount} limit={number.dailyLimit} />
                    </div>
                  </td>
                  <td className="table-td">
                    <span className="text-sm text-dark-400">{number.dailyLimit}</span>
                  </td>
                  <td className="table-td">
                    <span className={clsx(
                      'text-sm font-medium',
                      (number.deliveryRate || 0) >= 95 ? 'text-emerald-400' :
                      (number.deliveryRate || 0) >= 85 ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {(number.deliveryRate || 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="table-td">
                    <span className={clsx('text-sm', number.isRamping ? 'text-yellow-400' : 'text-dark-500')}>
                      {number.isRamping ? `Day ${number.rampDay}` : 'Done'}
                    </span>
                  </td>
                  <td className="table-td">
                    {assignee ? (
                      <span className="text-xs text-dark-300">
                        {assignee.firstName} {assignee.lastName?.[0]}.
                      </span>
                    ) : (
                      <button
                        onClick={() => setShowAssign(number.id)}
                        className="text-xs text-scl-400 hover:text-scl-300 transition-colors"
                      >
                        Assign
                      </button>
                    )}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1">
                      {number.status === 'ACTIVE' ? (
                        <button
                          onClick={() => coolMutation.mutate(number.id)}
                          className="btn-ghost p-1.5 text-blue-400 hover:text-blue-300"
                          title="Cool down for 24h"
                        >
                          <Snowflake className="w-3.5 h-3.5" />
                        </button>
                      ) : number.status !== 'DISABLED' ? (
                        <button
                          onClick={() => activateMutation.mutate(number.id)}
                          className="btn-ghost p-1.5 text-emerald-400 hover:text-emerald-300"
                          title="Activate"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => setEditNumber(number)}
                        className="btn-ghost p-1.5 text-dark-400 hover:text-dark-200"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(number)}
                        className="btn-ghost p-1.5 text-dark-500 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Daily Assignments View
   ═══════════════════════════════════════════════ */

function DailyAssignmentsView({
  repAssignments, unassignedNumbers, isLoading, totalAssignments,
  onBulkAssign, onUnassign, unassignPending,
}: {
  repAssignments: { rep: { id: string; firstName: string; lastName: string }; numbers: { id: string; phoneNumber: string; status: string; dailySentCount: number; dailyLimit: number }[] }[];
  unassignedNumbers: PhoneNumberItem[];
  isLoading: boolean;
  totalAssignments: number;
  onBulkAssign: () => void;
  onUnassign: (repId: string) => void;
  unassignPending: boolean;
}) {
  const [expandedRep, setExpandedRep] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-6">
            <div className="h-6 w-48 bg-dark-700 rounded animate-pulse mb-3" />
            <div className="h-4 w-32 bg-dark-700 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-scl-500/20 text-scl-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-lg font-bold text-dark-100">{repAssignments.length}</p>
            <p className="text-[11px] text-dark-500 uppercase tracking-wider">Reps with Numbers</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-lg font-bold text-dark-100">{totalAssignments}</p>
            <p className="text-[11px] text-dark-500 uppercase tracking-wider">Assigned Today</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-lg font-bold text-dark-100">{unassignedNumbers.length}</p>
            <p className="text-[11px] text-dark-500 uppercase tracking-wider">Unassigned Active</p>
          </div>
        </div>
      </div>

      {/* Rep Cards */}
      {repAssignments.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-dark-200 mb-2">No Daily Assignments</h3>
          <p className="text-sm text-dark-400 mb-5 max-w-sm mx-auto">
            Assign phone numbers to reps for today's campaigns. Each rep needs at least one number to send messages.
          </p>
          <button onClick={onBulkAssign} className="btn-primary inline-flex items-center gap-2">
            <UserCheck className="w-4 h-4" /> Assign Numbers to Reps
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {repAssignments.map(({ rep, numbers }) => {
            const isExpanded = expandedRep === rep.id;
            const repTotalCapacity = numbers.reduce((s, n) => s + n.dailyLimit, 0);
            const repTotalUsed = numbers.reduce((s, n) => s + n.dailySentCount, 0);
            const usagePct = repTotalCapacity > 0 ? Math.round((repTotalUsed / repTotalCapacity) * 100) : 0;

            return (
              <div key={rep.id} className="card overflow-hidden">
                {/* Rep Header */}
                <button
                  onClick={() => setExpandedRep(isExpanded ? null : rep.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-dark-800/30 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-scl-600/20 flex items-center justify-center text-scl-400 font-semibold shrink-0">
                    {rep.firstName[0]}{rep.lastName?.[0] || ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-dark-100">{rep.firstName} {rep.lastName}</p>
                    <p className="text-xs text-dark-500">
                      {numbers.length} number{numbers.length !== 1 ? 's' : ''} · {repTotalUsed}/{repTotalCapacity} sent
                    </p>
                  </div>
                  {/* Usage bar */}
                  <div className="w-28 hidden md:block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-dark-500">Usage</span>
                      <span className={clsx(
                        'text-[10px] font-medium',
                        usagePct >= 90 ? 'text-red-400' : usagePct >= 70 ? 'text-yellow-400' : 'text-emerald-400'
                      )}>{usagePct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full transition-all',
                          usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500'
                        )}
                        style={{ width: `${Math.min(usagePct, 100)}%` }}
                      />
                    </div>
                  </div>
                  {/* Number count pill */}
                  <span className="px-2.5 py-1 bg-dark-800 rounded-lg text-xs text-dark-300 font-medium">
                    {numbers.length}
                  </span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-dark-500" /> : <ChevronDown className="w-4 h-4 text-dark-500" />}
                </button>

                {/* Expanded: Numbers list */}
                {isExpanded && (
                  <div className="border-t border-dark-700/50">
                    <div className="p-3 space-y-1">
                      {numbers.map((num) => {
                        const usePct = num.dailyLimit > 0 ? Math.round((num.dailySentCount / num.dailyLimit) * 100) : 0;
                        return (
                          <div key={num.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-dark-800/40 transition-colors">
                            <Phone className="w-3.5 h-3.5 text-dark-500 shrink-0" />
                            <span className="text-sm font-mono text-dark-200 flex-1">{num.phoneNumber}</span>
                            <NumberStatusBadge status={num.status} />
                            <div className="flex items-center gap-2 text-xs text-dark-400 w-24 justify-end">
                              <span>{num.dailySentCount}/{num.dailyLimit}</span>
                              <div className="w-10 h-1 bg-dark-700 rounded-full overflow-hidden">
                                <div
                                  className={clsx('h-full rounded-full', usePct >= 90 ? 'bg-red-500' : usePct >= 70 ? 'bg-yellow-500' : 'bg-scl-500')}
                                  style={{ width: `${Math.min(usePct, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t border-dark-700/50 p-3 flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnassign(rep.id); }}
                        disabled={unassignPending}
                        className="btn-ghost text-xs flex items-center gap-1.5 text-red-400/70 hover:text-red-400"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Unassign All
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned numbers notice */}
      {unassignedNumbers.length > 0 && (
        <div className="card p-4 border border-yellow-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-300">
                {unassignedNumbers.length} active number{unassignedNumbers.length !== 1 ? 's' : ''} not assigned today
              </p>
              <p className="text-xs text-dark-400 mt-0.5">
                These numbers won't be used for campaigns until assigned to a rep.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {unassignedNumbers.slice(0, 8).map((n) => (
                  <span key={n.id} className="text-[11px] font-mono bg-dark-800 px-2 py-0.5 rounded text-dark-300">
                    {n.phoneNumber}
                  </span>
                ))}
                {unassignedNumbers.length > 8 && (
                  <span className="text-[11px] text-dark-500 px-2 py-0.5">
                    +{unassignedNumbers.length - 8} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Bulk Assign Modal
   ═══════════════════════════════════════════════ */

function BulkAssignModal({ numbers, onClose }: { numbers: PhoneNumberItem[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());
  const [numberSearch, setNumberSearch] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ repId, phoneNumberIds }: { repId: string; phoneNumberIds: string[] }) =>
      api.post('/numbers/assign', { repId, phoneNumberIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numberAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success(`Assigned ${selectedNumbers.size} numbers`);
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Assignment failed'),
  });

  const users: UserItem[] = usersData?.users || [];
  const reps = users.filter((u) => u.role === 'REP' || u.role === 'ADMIN' || u.role === 'MANAGER');

  const availableNumbers = useMemo(() => {
    let list = numbers.filter((n) => n.status === 'ACTIVE');
    if (numberSearch.trim()) {
      const q = numberSearch.toLowerCase();
      list = list.filter(
        (n) =>
          n.phoneNumber.includes(q) ||
          (n.friendlyName && n.friendlyName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [numbers, numberSearch]);

  function toggleNumber(id: string) {
    setSelectedNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedNumbers.size === availableNumbers.length) {
      setSelectedNumbers(new Set());
    } else {
      setSelectedNumbers(new Set(availableNumbers.map((n) => n.id)));
    }
  }

  function handleAssign() {
    if (!selectedRep || selectedNumbers.size === 0) return;
    assignMutation.mutate({ repId: selectedRep, phoneNumberIds: Array.from(selectedNumbers) });
  }

  const selectedRepUser = reps.find((u) => u.id === selectedRep);
  const selectedCapacity = availableNumbers
    .filter((n) => selectedNumbers.has(n.id))
    .reduce((s, n) => s + n.dailyLimit, 0);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="card w-full max-w-lg p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-dark-50">Assign Numbers to Rep</h3>
            <p className="text-xs text-dark-500 mt-0.5">Select a rep and pick numbers for today's campaigns</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* Step 1: Select Rep */}
        <div className="mb-5">
          <label className="block text-xs text-dark-400 mb-1.5">Sales Rep</label>
          <select
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
            className="input w-full"
          >
            <option value="">Choose a rep…</option>
            {reps.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.role})
              </option>
            ))}
          </select>
        </div>

        {/* Step 2: Select Numbers */}
        {selectedRep && (
          <>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-dark-400">
                Phone Numbers ({selectedNumbers.size} selected
                {selectedCapacity > 0 ? ` · ${selectedCapacity.toLocaleString()} msg/day capacity` : ''})
              </label>
              <button onClick={selectAll} className="text-[11px] text-scl-400 hover:text-scl-300 transition-colors">
                {selectedNumbers.size === availableNumbers.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-500" />
              <input
                type="text"
                placeholder="Filter numbers…"
                value={numberSearch}
                onChange={(e) => setNumberSearch(e.target.value)}
                className="input pl-8 w-full text-sm py-1.5"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0 max-h-[300px] mb-5 rounded-lg border border-dark-700/50 p-1.5">
              {availableNumbers.length === 0 ? (
                <div className="text-center py-8 text-dark-500 text-sm">No active numbers available</div>
              ) : (
                availableNumbers.map((num) => {
                  const isSelected = selectedNumbers.has(num.id);
                  const usePct = num.dailyLimit > 0 ? Math.round((num.dailySentCount / num.dailyLimit) * 100) : 0;
                  const assignee = num.assignments?.[0]?.user;

                  return (
                    <button
                      key={num.id}
                      onClick={() => toggleNumber(num.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                        isSelected
                          ? 'bg-scl-600/15 border border-scl-600/30'
                          : 'hover:bg-dark-800/50 border border-transparent'
                      )}
                    >
                      <div className={clsx(
                        'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        isSelected
                          ? 'bg-scl-500 border-scl-500'
                          : 'border-dark-600 bg-dark-800'
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-dark-200">{num.phoneNumber}</span>
                          {num.isRamping && (
                            <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1 py-0.5 rounded">
                              Ramp D{num.rampDay}
                            </span>
                          )}
                          {assignee && (
                            <span className="text-[9px] bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded">
                              → {assignee.firstName}
                            </span>
                          )}
                        </div>
                        {num.friendlyName && num.friendlyName !== num.phoneNumber && (
                          <p className="text-[10px] text-dark-500 truncate">{num.friendlyName}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-dark-400">{num.dailySentCount}/{num.dailyLimit}</p>
                        <div className="w-12 h-1 bg-dark-700 rounded-full overflow-hidden mt-0.5">
                          <div
                            className={clsx('h-full rounded-full', usePct >= 90 ? 'bg-red-500' : usePct >= 70 ? 'bg-yellow-500' : 'bg-scl-500')}
                            style={{ width: `${Math.min(usePct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Summary & Action */}
        <div className="flex items-center justify-between pt-3 border-t border-dark-700/50">
          <div className="text-xs text-dark-400">
            {selectedRep && selectedNumbers.size > 0 && selectedRepUser && (
              <span>
                Assign <span className="text-dark-200 font-medium">{selectedNumbers.size}</span> number{selectedNumbers.size !== 1 ? 's' : ''} to{' '}
                <span className="text-dark-200 font-medium">{selectedRepUser.firstName}</span>
                {' '}({selectedCapacity.toLocaleString()} msgs/day)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button
              onClick={handleAssign}
              disabled={!selectedRep || selectedNumbers.size === 0 || assignMutation.isPending}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {assignMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
              Assign {selectedNumbers.size > 0 ? selectedNumbers.size : ''} Numbers
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ═══════════════════════════════════════════════
   Shared Helper Components
   ═══════════════════════════════════════════════ */

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    blue: 'bg-blue-500/20 text-blue-400',
    red: 'bg-red-500/20 text-red-400',
    scl: 'bg-scl-500/20 text-scl-400',
    purple: 'bg-purple-500/20 text-purple-400',
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', colorMap[color] || color)}>
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-dark-100">{value}</p>
        <p className="text-[11px] text-dark-500 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function NumberStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/20 text-emerald-300',
    COOLING: 'bg-blue-500/20 text-blue-300',
    WARMING: 'bg-yellow-500/20 text-yellow-300',
    FLAGGED: 'bg-red-500/20 text-red-300',
    DISABLED: 'bg-dark-700 text-dark-400',
    SUSPENDED: 'bg-orange-500/20 text-orange-300',
  };
  return <span className={clsx('badge', styles[status] || '')}>{status}</span>;
}

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 90 ? 'bg-emerald-500' :
    score >= 70 ? 'bg-yellow-500' :
    score >= 50 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs text-dark-400 tabular-nums w-6 text-right">{score}</span>
    </div>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-scl-500';
  return (
    <div className="w-12 h-1 bg-dark-700 rounded-full overflow-hidden" title={`${used}/${limit}`}>
      <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Single-Number Assign Modal
   ═══════════════════════════════════════════════ */

function AssignModal({ numberId, onClose }: { numberId: string; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post('/numbers/assign', { repId: userId, phoneNumberIds: [numberId] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      queryClient.invalidateQueries({ queryKey: ['numberAssignments'] });
      toast.success('Number assigned');
      onClose();
    },
  });

  const users = usersData?.users || [];

  return (
    <ModalOverlay onClose={onClose}>
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark-50">Assign Number</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {users.map((user: any) => (
            <button
              key={user.id}
              onClick={() => assignMutation.mutate(user.id)}
              disabled={assignMutation.isPending}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-full bg-scl-600/20 flex items-center justify-center text-scl-400 text-sm font-semibold">
                {user.firstName?.[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-dark-200">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-dark-500">{user.role}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ═══════════════════════════════════════════════
   Add / Edit / Delete Modals
   ═══════════════════════════════════════════════ */

function AddNumberModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'single' | 'bulk'>('single');
  const [phone, setPhone] = useState('+1');
  const [friendlyName, setFriendlyName] = useState('');
  const [dailyLimit, setDailyLimit] = useState(200);
  const [isRamping, setIsRamping] = useState(true);
  const [bulkText, setBulkText] = useState('');

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/numbers', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Number added');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add number'),
  });

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ phoneNumber: phone.trim(), friendlyName: friendlyName.trim() || undefined, dailyLimit, isRamping });
  };

  const handleBulkSubmit = () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    let created = 0;
    const total = lines.length;
    const createNext = (idx: number) => {
      if (idx >= total) {
        toast.success(`Added ${created} of ${total} numbers`);
        queryClient.invalidateQueries({ queryKey: ['numbers'] });
        onClose();
        return;
      }
      const num = lines[idx].startsWith('+') ? lines[idx] : `+1${lines[idx].replace(/\D/g, '')}`;
      api.post('/numbers', { phoneNumber: num, dailyLimit, isRamping })
        .then(() => { created++; })
        .catch(() => {})
        .finally(() => createNext(idx + 1));
    };
    createNext(0);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-dark-50">Add Phone Number</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 mb-5 p-0.5 bg-dark-800 rounded-lg">
          <button onClick={() => setTab('single')} className={clsx('flex-1 py-1.5 text-xs rounded-md transition-colors', tab === 'single' ? 'bg-dark-700 text-dark-100' : 'text-dark-400 hover:text-dark-200')}>
            Single
          </button>
          <button onClick={() => setTab('bulk')} className={clsx('flex-1 py-1.5 text-xs rounded-md transition-colors', tab === 'bulk' ? 'bg-dark-700 text-dark-100' : 'text-dark-400 hover:text-dark-200')}>
            Bulk Import
          </button>
        </div>

        {tab === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Phone Number</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+12125551234" className="input w-full font-mono" autoFocus required />
            </div>
            <div>
              <label className="block text-xs text-dark-400 mb-1">Friendly Name (optional)</label>
              <input type="text" value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} placeholder="NYC Office Line" className="input w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-dark-400 mb-1">Daily Limit</label>
                <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} min={1} max={10000} className="input w-full" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isRamping} onChange={(e) => setIsRamping(e.target.checked)} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500" />
                  <span className="text-sm text-dark-300">Enable ramping</span>
                </label>
              </div>
            </div>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary w-full flex items-center justify-center gap-2">
              {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Number
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Phone Numbers (one per line)</label>
              <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} className="input w-full font-mono text-sm resize-none" placeholder={"+12125551234\n+12125551235\n+12125551236"} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-dark-400 mb-1">Daily Limit (all)</label>
                <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} min={1} max={10000} className="input w-full" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isRamping} onChange={(e) => setIsRamping(e.target.checked)} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500" />
                  <span className="text-sm text-dark-300">Enable ramping</span>
                </label>
              </div>
            </div>
            <button onClick={handleBulkSubmit} disabled={!bulkText.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Import {bulkText.split('\n').filter(l => l.trim()).length} Numbers
            </button>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}

function EditNumberModal({ number, onClose }: { number: PhoneNumberItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [friendlyName, setFriendlyName] = useState(number.friendlyName || '');
  const [status, setStatus] = useState(number.status);
  const [dailyLimit, setDailyLimit] = useState(number.dailyLimit);
  const [isRamping, setIsRamping] = useState(number.isRamping);

  const updateMutation = useMutation({
    mutationFn: (body: any) => api.put(`/numbers/${number.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      toast.success('Number updated');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ friendlyName: friendlyName.trim() || undefined, status, dailyLimit, isRamping });
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-dark-50">Edit Number</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-dark-400 font-mono mb-4">{number.phoneNumber}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-dark-400 mb-1">Friendly Name</label>
            <input type="text" value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="block text-xs text-dark-400 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input w-full">
              <option value="ACTIVE">Active</option>
              <option value="WARMING">Warming</option>
              <option value="COOLING">Cooling</option>
              <option value="FLAGGED">Flagged</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Daily Limit</label>
              <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} min={1} max={10000} className="input w-full" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isRamping} onChange={(e) => setIsRamping(e.target.checked)} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500" />
                <span className="text-sm text-dark-300">Ramping</span>
              </label>
            </div>
          </div>
          <button type="submit" disabled={updateMutation.isPending} className="btn-primary w-full flex items-center justify-center gap-2">
            {updateMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
            Save Changes
          </button>
        </form>
      </div>
    </ModalOverlay>
  );
}

function ConfirmDeleteModal({ number, onConfirm, onClose }: { number: PhoneNumberItem; onConfirm: () => void; onClose: () => void }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-red-400" />
        </div>
        <h3 className="text-lg font-bold text-dark-50 mb-2">Delete Number?</h3>
        <p className="text-sm text-dark-400 mb-1">This will permanently remove</p>
        <p className="text-base font-mono text-dark-200 mb-5">{number.phoneNumber}</p>
        <p className="text-xs text-dark-500 mb-5">All assignments and pool memberships will also be removed.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors">
            Delete
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
