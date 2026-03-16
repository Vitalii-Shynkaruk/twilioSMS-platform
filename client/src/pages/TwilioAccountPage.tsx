import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  DollarSign,
  Phone,
  Shield,
  Radio,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Server,
  Zap,
  MessageSquare,
  TrendingUp,
  FileCheck,
  Users,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { clsx } from 'clsx';
import { format } from 'date-fns';

/* ─── Status badge helper ─── */
function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="text-xs text-dark-500">—</span>;
  const s = String(status).toLowerCase();
  const isGood = ['active', 'approved', 'verified', 'compliant', 'twilio-approved', 'in-progress'].some((g) =>
    s.includes(g),
  );
  const isBad = ['suspended', 'failed', 'rejected', 'closed', 'non-compliant'].some((b) => s.includes(b));
  const isPending = ['pending', 'review', 'draft', 'in_review'].some((p) => s.includes(p));
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
        isGood && 'bg-green-500/15 text-green-400',
        isBad && 'bg-red-500/15 text-red-400',
        isPending && 'bg-amber-500/15 text-amber-400',
        !isGood && !isBad && !isPending && 'bg-dark-700 text-dark-300',
      )}
    >
      {isGood && <CheckCircle2 className="w-3 h-3" />}
      {isBad && <XCircle className="w-3 h-3" />}
      {isPending && <Clock className="w-3 h-3" />}
      {status}
    </span>
  );
}

/* ─── Collapsible Section ─── */
function Section({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: any;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-dark-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-scl-500/15 flex items-center justify-center">
            <Icon className="w-5 h-5 text-scl-400" />
          </div>
          <h3 className="text-sm font-semibold text-dark-100">{title}</h3>
          {count !== undefined && (
            <span className="text-xs text-dark-400 bg-dark-800 px-2 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-dark-400" /> : <ChevronDown className="w-4 h-4 text-dark-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

/* ─── Error display ─── */
function SectionError({ error }: { error: any }) {
  if (!error) return null;
  const msg = typeof error === 'object' && error.error ? error.error : String(error);
  return (
    <div className="flex items-center gap-2 text-xs text-dark-400 py-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
      <span>{msg}</span>
    </div>
  );
}

/* ─────────────────────────────────── Main Page ─────────────────────────────────── */
export default function TwilioAccountPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['twilio-diagnostics'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/twilio-diagnostics');
      return data;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/numbers/sync-twilio'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['numbers'] });
      queryClient.invalidateQueries({ queryKey: ['twilio-diagnostics'] });
      toast.success(res.data.message);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Sync failed'),
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 bg-dark-800 rounded w-64 animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-dark-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-dark-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8">
        <div className="card p-8 flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400" />
          <h2 className="text-lg font-semibold text-dark-100">Twilio Not Configured</h2>
          <p className="text-sm text-dark-400 max-w-md">
            Configure your Twilio Account SID and Auth Token in Settings → Integrations to view account diagnostics.
          </p>
        </div>
      </div>
    );
  }

  const balance = data.balance;
  const account = data.account;
  const phoneNumbers = Array.isArray(data.phoneNumbers) ? data.phoneNumbers : [];
  const messagingServices = Array.isArray(data.messagingServices) ? data.messagingServices : [];
  const a2pBrands = Array.isArray(data.a2pBrands) ? data.a2pBrands : [];
  const a2pCampaigns = Array.isArray(data.a2pCampaigns) ? data.a2pCampaigns : [];
  const usage = Array.isArray(data.usage) ? data.usage : [];
  const usageByCategory = Array.isArray(data.usageByCategory) ? data.usageByCategory : [];
  const tollFree = Array.isArray(data.tollFreeVerifications) ? data.tollFreeVerifications : [];
  const bundles = Array.isArray(data.complianceBundles) ? data.complianceBundles : [];
  const trustHub = Array.isArray(data.trustHubProfiles) ? data.trustHubProfiles : [];
  const subAccounts = Array.isArray(data.subAccounts) ? data.subAccounts : [];
  const todayVolume = data.todayVolume || {};
  const twilioMsgStats = data.twilioMessageStats24h || {};

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Twilio Account</h1>
          <p className="text-sm text-dark-400 mt-1">
            Account diagnostics, balance, compliance, and full sync — all data from Twilio API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className={clsx('w-4 h-4', syncMutation.isPending && 'animate-spin')} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Numbers'}
          </button>
          <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Top Cards: Balance, Account, Volume ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Balance */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400 uppercase tracking-wider">Balance</p>
              {balance?.error ? (
                <p className="text-sm text-red-400">{balance.error}</p>
              ) : (
                <p className="text-2xl font-bold text-dark-50">
                  {balance?.currency === 'USD' ? '$' : ''}
                  {parseFloat(balance?.balance || '0').toFixed(2)}
                </p>
              )}
            </div>
          </div>
          {balance?.currency && !balance.error && <p className="text-xs text-dark-500">{balance.currency}</p>}
        </div>

        {/* Account Status */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-scl-500/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-scl-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400 uppercase tracking-wider">Account</p>
              {account?.error ? (
                <p className="text-sm text-red-400">{account.error}</p>
              ) : (
                <>
                  <p className="text-base font-semibold text-dark-100 truncate max-w-[200px]">
                    {account?.friendlyName || '—'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={account?.status} />
                    <span className="text-xs text-dark-500">{account?.type}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* SMS Mode */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <Radio className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400 uppercase tracking-wider">SMS Mode</p>
              <p className="text-base font-semibold text-dark-100 capitalize">{data.smsMode || 'unknown'}</p>
              <p className="text-xs text-dark-500 mt-0.5">SID: {data.configuredSid}</p>
            </div>
          </div>
        </div>

        {/* Today Volume */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400 uppercase tracking-wider">Today Volume</p>
              {todayVolume.error ? (
                <p className="text-sm text-red-400">{todayVolume.error}</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-dark-50">{todayVolume.sent || 0}</p>
                  <p className="text-xs text-dark-500 mt-0.5">
                    Failed: {todayVolume.failed || 0}
                    {todayVolume.failureRate > 0 && (
                      <span className={clsx('ml-1', todayVolume.failureRate > 5 ? 'text-red-400' : 'text-dark-400')}>
                        ({todayVolume.failureRate}%)
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Phone Numbers from Twilio ── */}
      <Section title="Phone Numbers (Twilio)" icon={Phone} count={phoneNumbers.length}>
        {data.phoneNumbers?.error ? (
          <SectionError error={data.phoneNumbers} />
        ) : phoneNumbers.length === 0 ? (
          <p className="text-sm text-dark-400 py-3">No phone numbers found in Twilio account</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-dark-400 uppercase tracking-wider border-b border-dark-700/50">
                  <th className="pb-2 pr-4">Number</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">SMS</th>
                  <th className="pb-2 pr-4">MMS</th>
                  <th className="pb-2 pr-4">Voice</th>
                  <th className="pb-2 pr-4">Status Callback</th>
                  <th className="pb-2">SID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {phoneNumbers.map((n: any) => (
                  <tr key={n.sid} className="hover:bg-dark-800/20">
                    <td className="py-2 pr-4 font-mono text-dark-200">{n.phoneNumber}</td>
                    <td className="py-2 pr-4 text-dark-300">{n.friendlyName || '—'}</td>
                    <td className="py-2 pr-4">
                      {n.smsEnabled ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-dark-600" />
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {n.mmsEnabled ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-dark-600" />
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {n.voiceEnabled ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-dark-600" />
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-dark-400 truncate max-w-[200px]">
                      {n.statusCallback || '—'}
                    </td>
                    <td className="py-2 font-mono text-xs text-dark-500 truncate max-w-[150px]">{n.sid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Messaging Services ── */}
      <Section title="Messaging Services" icon={Server} count={messagingServices.length}>
        {data.messagingServices?.error ? (
          <SectionError error={data.messagingServices} />
        ) : messagingServices.length === 0 ? (
          <p className="text-sm text-dark-400 py-3">No messaging services configured</p>
        ) : (
          <div className="space-y-3">
            {messagingServices.map((s: any) => (
              <div key={s.sid} className="rounded-lg border border-dark-700/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-dark-100">{s.friendlyName}</span>
                  <span className="font-mono text-xs text-dark-500">{s.sid}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-dark-400">Use Case:</span>
                    <span className="ml-1 text-dark-200">{s.usecase || '—'}</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Sticky Sender:</span>
                    <span className="ml-1 text-dark-200">{s.stickySender ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Area Geomatch:</span>
                    <span className="ml-1 text-dark-200">{s.areaToBind ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Fallback Long Code:</span>
                    <span className="ml-1 text-dark-200">{s.fallbackToLongCode ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                {s.inboundRequestUrl && (
                  <div className="text-xs">
                    <span className="text-dark-400">Inbound URL:</span>
                    <span className="ml-1 text-dark-300 font-mono">{s.inboundRequestUrl}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── A2P 10DLC Registration ── */}
      <Section title="A2P 10DLC Brands" icon={Shield} count={a2pBrands.length}>
        {data.a2pBrands?.error ? (
          <SectionError error={data.a2pBrands} />
        ) : a2pBrands.length === 0 ? (
          <div className="py-3 space-y-2">
            <p className="text-sm text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              No A2P brand registrations found
            </p>
            <p className="text-xs text-dark-400">
              You need to register your brand for A2P 10DLC compliance. Visit Twilio Console → Messaging → Trust Hub.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {a2pBrands.map((b: any) => (
              <div key={b.sid} className="rounded-lg border border-dark-700/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-dark-100">Brand: {b.sid.slice(0, 20)}...</span>
                  <StatusBadge status={b.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-dark-400">Type:</span>{' '}
                    <span className="text-dark-200">{b.brandType || '—'}</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Created:</span>{' '}
                    <span className="text-dark-200">
                      {b.dateCreated ? format(new Date(b.dateCreated), 'MMM d, yyyy') : '—'}
                    </span>
                  </div>
                  {b.failureReason && (
                    <div className="col-span-2">
                      <span className="text-red-400">Failure: {b.failureReason}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── A2P Campaigns ── */}
      <Section
        title="A2P Campaigns"
        icon={MessageSquare}
        count={a2pCampaigns.length}
        defaultOpen={a2pCampaigns.length > 0}
      >
        {a2pCampaigns.length === 0 ? (
          <p className="text-sm text-dark-400 py-3">No A2P campaigns registered yet</p>
        ) : (
          <div className="space-y-3">
            {a2pCampaigns.map((c: any, i: number) => (
              <div key={c.sid || i} className="rounded-lg border border-dark-700/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-dark-100">{c.usecase || c.description || c.sid}</span>
                  <StatusBadge status={c.campaignStatus} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-dark-300">
                  <div>
                    Messaging Service:{' '}
                    <span className="font-mono text-dark-400">{c.messagingServiceSid?.slice(0, 15)}...</span>
                  </div>
                  <div>
                    Brand: <span className="font-mono text-dark-400">{c.brandRegistrationSid?.slice(0, 15)}...</span>
                  </div>
                  {c.description && <div className="col-span-2 text-dark-400">&ldquo;{c.description}&rdquo;</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Trust Hub Profiles ── */}
      <Section title="Trust Hub Profiles" icon={FileCheck} count={trustHub.length} defaultOpen={trustHub.length > 0}>
        {data.trustHubProfiles?.error ? (
          <SectionError error={data.trustHubProfiles} />
        ) : trustHub.length === 0 ? (
          <p className="text-sm text-dark-400 py-3">No Trust Hub customer profiles found</p>
        ) : (
          <div className="space-y-3">
            {trustHub.map((p: any) => (
              <div key={p.sid} className="rounded-lg border border-dark-700/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-dark-100">{p.friendlyName || p.sid}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="text-xs text-dark-400">
                  Policy: {p.policySid || '—'} · Created:{' '}
                  {p.dateCreated ? format(new Date(p.dateCreated), 'MMM d, yyyy') : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Compliance Bundles ── */}
      <Section title="Regulatory Compliance" icon={FileCheck} count={bundles.length} defaultOpen={bundles.length > 0}>
        {data.complianceBundles?.error ? (
          <SectionError error={data.complianceBundles} />
        ) : bundles.length === 0 ? (
          <p className="text-sm text-dark-400 py-3">No regulatory compliance bundles</p>
        ) : (
          <div className="space-y-3">
            {bundles.map((b: any) => (
              <div key={b.sid} className="rounded-lg border border-dark-700/40 p-3 flex items-center justify-between">
                <div>
                  <span className="text-sm text-dark-200">{b.friendlyName || b.sid}</span>
                  <div className="text-xs text-dark-400 mt-0.5">Regulation: {b.regulationSid || '—'}</div>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Toll-Free Verifications ── */}
      {tollFree.length > 0 && (
        <Section title="Toll-Free Verifications" icon={Phone} count={tollFree.length} defaultOpen={false}>
          <div className="space-y-2">
            {tollFree.map((v: any) => (
              <div key={v.sid} className="flex items-center justify-between rounded-lg border border-dark-700/40 p-3">
                <span className="font-mono text-sm text-dark-200">{v.phoneNumber}</span>
                <StatusBadge status={v.status} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Sub-Accounts ── */}
      {subAccounts.length > 0 && (
        <Section title="Sub-Accounts" icon={Users} count={subAccounts.length} defaultOpen={false}>
          <div className="space-y-2">
            {subAccounts.map((a: any) => (
              <div key={a.sid} className="flex items-center justify-between rounded-lg border border-dark-700/40 p-3">
                <div>
                  <span className="text-sm text-dark-200">{a.friendlyName}</span>
                  <div className="text-xs text-dark-400 font-mono">{a.sid}</div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Usage & Costs (30 days) ── */}
      <Section title="Usage & Costs (30 days)" icon={CreditCard} count={usageByCategory.length} defaultOpen={true}>
        {data.usageByCategory?.error ? (
          <SectionError error={data.usageByCategory} />
        ) : usageByCategory.length === 0 ? (
          <p className="text-sm text-dark-400 py-3">No usage data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-dark-400 uppercase tracking-wider border-b border-dark-700/50">
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Description</th>
                  <th className="pb-2 pr-4 text-right">Count</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {usageByCategory.map((u: any, i: number) => (
                  <tr key={i} className="hover:bg-dark-800/20">
                    <td className="py-2 pr-4 text-dark-200 font-mono text-xs">{u.category}</td>
                    <td className="py-2 pr-4 text-dark-300 text-xs">{u.description}</td>
                    <td className="py-2 pr-4 text-right text-dark-200">{u.count}</td>
                    <td className="py-2 text-right font-mono text-dark-200">
                      {u.priceUnit === 'USD' ? '$' : ''}
                      {parseFloat(u.price || '0').toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-dark-700">
                  <td colSpan={3} className="py-2 text-xs font-semibold text-dark-200">
                    Total Cost
                  </td>
                  <td className="py-2 text-right font-mono font-semibold text-dark-100">
                    $
                    {usageByCategory
                      .reduce((sum: number, u: any) => sum + Math.abs(parseFloat(u.price || '0')), 0)
                      .toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      {/* ── SMS Usage (specific) ── */}
      {usage.length > 0 && (
        <Section title="SMS Usage Records" icon={TrendingUp} count={usage.length} defaultOpen={false}>
          <div className="space-y-2">
            {usage.map((u: any, i: number) => (
              <div key={i} className="rounded-lg border border-dark-700/40 p-3 grid grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-dark-400">Period:</span>{' '}
                  <span className="text-dark-200">
                    {u.startDate} → {u.endDate}
                  </span>
                </div>
                <div>
                  <span className="text-dark-400">Count:</span>{' '}
                  <span className="text-dark-200">
                    {u.count} {u.countUnit}
                  </span>
                </div>
                <div>
                  <span className="text-dark-400">Cost:</span>{' '}
                  <span className="text-dark-200">
                    {u.priceUnit === 'USD' ? '$' : ''}
                    {u.price}
                  </span>
                </div>
                <div>
                  <span className="text-dark-400">Category:</span> <span className="text-dark-200">{u.category}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Twilio 24h Message Stats ── */}
      {twilioMsgStats.statuses && !twilioMsgStats.error && (
        <Section title="Twilio Message Statuses (24h sample)" icon={Activity} defaultOpen={false}>
          <div className="flex flex-wrap gap-3">
            {Object.entries(twilioMsgStats.statuses).map(([status, count]: [string, any]) => (
              <div key={status} className="rounded-lg border border-dark-700/40 px-4 py-2 text-center">
                <p className="text-lg font-bold text-dark-100">{count}</p>
                <p className="text-xs text-dark-400 capitalize">{status}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Timestamp ── */}
      <div className="text-xs text-dark-500 text-center py-2">
        Last fetched: {data.timestamp ? format(new Date(data.timestamp), 'MMM d, yyyy HH:mm:ss') : '—'}
      </div>
    </div>
  );
}
