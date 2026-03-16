import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useWebSocketStore, useWebSocketQuerySync } from '../../stores/webSocketStore';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  LayoutDashboard,
  Send,
  MessageSquare,
  Kanban,
  Users,
  Phone,
  Bot,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Shield,
  Radio,
  FlaskConical,
  BarChart3,
  Search,
  Command,
  X,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import ThemeToggle from '../ThemeToggle';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Campaigns', href: '/campaigns', icon: Send },
  { name: 'Inbox', href: '/inbox', icon: MessageSquare },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Numbers', href: '/numbers', icon: Phone, roles: ['ADMIN', 'MANAGER'] },
  { name: 'Automation', href: '/automation', icon: Bot },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Twilio', href: '/twilio', icon: Radio, roles: ['ADMIN'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['ADMIN'] },
];

const SMS_MODE_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; icon: any }> = {
  live: { label: 'Live', color: 'text-green-400', bg: 'bg-green-500/10', dot: 'bg-green-500', icon: Radio },
  twilio_test: { label: 'Twilio Test', color: 'text-cyan-400', bg: 'bg-cyan-500/10', dot: 'bg-cyan-500', icon: Shield },
  simulation: {
    label: 'Simulation',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    dot: 'bg-amber-500',
    icon: FlaskConical,
  },
};

export default function AppLayout({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Global WebSocket connection — connect on mount, disconnect on logout
  const { connect, disconnect } = useWebSocketStore();
  useEffect(() => {
    const token = localStorage.getItem('scl_token');
    if (token) connect(token);
    return () => disconnect();
  }, [connect, disconnect]);

  // Auto-invalidate queries on WebSocket events (messages, campaigns, leads)
  useWebSocketQuerySync();

  // Unread inbox count for badge
  const { data: inboxData } = useQuery({
    queryKey: ['inbox-unread-count'],
    queryFn: async () => {
      const { data } = await api.get('/inbox?unreadOnly=true&limit=1');
      return data;
    },
    refetchInterval: 30000,
  });
  const unreadCount = inboxData?.conversations?.length || 0;

  // SMS mode from diagnostics
  const { data: diagData } = useQuery({
    queryKey: ['sms-mode'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/diagnostics');
      return data;
    },
    refetchInterval: 30000,
  });
  const smsMode = diagData?.smsMode || 'live';
  const modeConfig = SMS_MODE_CONFIG[smsMode] || SMS_MODE_CONFIG.live;
  const ModeIcon = modeConfig.icon;

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K — open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        setCommandQuery('');
      }
      // Escape — close command palette
      if (e.key === 'Escape') {
        setCommandOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus command input when opened
  useEffect(() => {
    if (commandOpen) {
      setTimeout(() => commandInputRef.current?.focus(), 50);
    }
  }, [commandOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNav = navigation.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  // Command palette filtered items
  const commandItems = filteredNav.filter((item) => item.name.toLowerCase().includes(commandQuery.toLowerCase()));

  const handleCommandSelect = (href: string) => {
    setCommandOpen(false);
    setCommandQuery('');
    navigate(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
          style={{
            background: 'linear-gradient(135deg, #4c63e6 0%, #2f3fb3 100%)',
            boxShadow: '0 2px 8px rgba(76, 99, 230, 0.3)',
          }}
        >
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
              Secure Credit Lines
            </span>
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-faint)' }}>
              SMS Platform
            </span>
          </div>
        )}
        <button
          onClick={() => {
            setCollapsed(!collapsed);
            setMobileOpen(false);
          }}
          className="ml-auto p-1 text-dark-500 hover:text-dark-300 transition-colors hidden lg:block"
        >
          {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto p-1 text-dark-500 hover:text-dark-300 transition-colors lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick search trigger */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <button
            onClick={() => setCommandOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Quick navigation...</span>
            <kbd
              className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-faint)' }}
            >
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            className={({ isActive }) =>
              clsx('sidebar-link relative', isActive && 'active', collapsed && 'justify-center px-2')
            }
            title={collapsed ? item.name : undefined}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
            {item.name === 'Inbox' && unreadCount > 0 && (
              <span
                className={clsx(
                  'absolute bg-scl-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center',
                  collapsed ? 'top-0 right-0 w-4 h-4' : 'right-2 top-1/2 -translate-y-1/2 w-5 h-5',
                )}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* SMS Mode Indicator + User section */}
      <div className="border-t p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
        {/* SMS Mode pill */}
        <NavLink
          to="/settings?tab=system"
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors cursor-pointer',
            modeConfig.bg,
            'hover:opacity-80',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? `SMS: ${modeConfig.label}` : undefined}
        >
          <div className="relative shrink-0">
            <ModeIcon className={clsx('w-4 h-4', modeConfig.color)} />
            <span
              className={clsx('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-dark-900', modeConfig.dot)}
            />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className={clsx('text-xs font-semibold', modeConfig.color)}>{modeConfig.label}</p>
              <p className="text-[10px] text-dark-500 truncate">SMS Mode</p>
            </div>
          )}
        </NavLink>

        {!collapsed && (
          <div className="flex justify-center px-1 pb-1">
            <ThemeToggle />
          </div>
        )}
        <div className={clsx('flex items-center gap-3 px-3 py-2 rounded-lg', collapsed && 'justify-center px-0')}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{
              background: 'linear-gradient(135deg, #4c63e6 0%, #2f3fb3 100%)',
            }}
          >
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>
                {user?.role}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="p-1.5 hover:text-red-400 transition-colors shrink-0"
            style={{ color: 'var(--text-faint)' }}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — Desktop */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col border-r transition-all duration-300',
          collapsed ? 'w-[72px]' : 'w-[260px]',
        )}
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar — Mobile */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] border-r transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div
          className="sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b lg:hidden"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1" style={{ color: 'var(--text-muted)' }}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Shield className="w-5 h-5 text-scl-500" />
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              SCL
            </span>
          </div>
          <button onClick={() => setCommandOpen(true)} className="p-1.5" style={{ color: 'var(--text-muted)' }}>
            <Search className="w-5 h-5" />
          </button>
        </div>
        {children || <Outlet />}
      </main>

      {/* Command Palette (Cmd+K) */}
      {commandOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCommandOpen(false)} />
          <div
            className="relative w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <Search className="w-5 h-5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Navigate to..."
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-primary)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commandItems.length > 0) {
                    handleCommandSelect(commandItems[0].href);
                  }
                }}
              />
              <kbd
                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-faint)' }}
              >
                ESC
              </kbd>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-2">
              {commandItems.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                  No results found
                </p>
              ) : (
                commandItems.map((item) => (
                  <button
                    key={item.href}
                    onClick={() => handleCommandSelect(item.href)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-dark-800/50"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <item.icon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span>{item.name}</span>
                    {item.name === 'Inbox' && unreadCount > 0 && (
                      <span className="ml-auto bg-scl-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
