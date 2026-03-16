import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tag, Users, ShieldX, Key, Settings, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import TagsTab from '../components/settings/TagsTab';
import UsersTab from '../components/settings/UsersTab';
import SuppressionTab from '../components/settings/SuppressionTab';
import IntegrationsTab from '../components/settings/IntegrationsTab';
import SystemTab from '../components/settings/SystemTab';
import ActivityLogTab from '../components/settings/ActivityLogTab';

type Tab = 'tags' | 'users' | 'suppression' | 'system' | 'integrations' | 'activity';

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab');
    if (t && ['tags', 'users', 'suppression', 'system', 'integrations', 'activity'].includes(t)) return t as Tab;
    return 'tags';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['tags', 'users', 'suppression', 'system', 'integrations', 'activity'].includes(t)) {
      setTab(t as Tab);
    }
  }, [searchParams]);

  const handleTabChange = (key: Tab) => {
    setTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'tags', label: 'Tags', icon: <Tag className="w-4 h-4" /> },
    { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { key: 'suppression', label: 'Suppression', icon: <ShieldX className="w-4 h-4" /> },
    { key: 'integrations', label: 'Integrations', icon: <Key className="w-4 h-4" /> },
    { key: 'system', label: 'System', icon: <Settings className="w-4 h-4" /> },
    { key: 'activity', label: 'Activity Log', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-50">Settings</h1>
        <p className="text-sm text-dark-400 mt-1">Manage system configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800/50 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-dark-700 text-dark-100'
                : 'text-dark-400 hover:text-dark-200'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'tags' && <TagsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'suppression' && <SuppressionTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'activity' && <ActivityLogTab />}
    </div>
  );
}
