import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { clsx } from 'clsx';

export default function ActivityLogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['activityLog'],
    queryFn: async () => {
      const { data } = await api.get('/settings/activity?limit=100');
      return data;
    },
  });

  const logs: any[] = data?.logs || [];

  const actionColor = (action: string) => {
    if (action.includes('delete') || action.includes('remove')) return 'text-red-400 bg-red-500/10';
    if (action.includes('create') || action.includes('add')) return 'text-green-400 bg-green-500/10';
    if (action.includes('update') || action.includes('edit') || action.includes('assign')) return 'text-blue-400 bg-blue-500/10';
    if (action.includes('login') || action.includes('auth')) return 'text-purple-400 bg-purple-500/10';
    return 'text-dark-400 bg-dark-700/50';
  };

  return (
    <div className="card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-dark-100">Activity Log</h3>
        <span className="text-xs text-dark-500">{logs.length} recent events</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-dark-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-dark-500 text-center py-8">No activity recorded yet</p>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log: any) => (
            <div
              key={log.id}
              className="flex items-center gap-3 py-2.5 px-3 bg-dark-800/30 rounded-lg hover:bg-dark-700/30 transition-colors"
            >
              <div className={clsx('px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider', actionColor(log.action))}>
                {log.action}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-dark-200 truncate">
                  {log.description || log.details || log.action}
                </p>
              </div>
              {log.user && (
                <span className="text-xs text-dark-500 shrink-0">
                  {log.user.firstName} {log.user.lastName}
                </span>
              )}
              <span className="text-xs text-dark-600 shrink-0">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
