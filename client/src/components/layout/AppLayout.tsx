import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useWebSocketStore, useWebSocketQuerySync } from '../../stores/webSocketStore';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Send,
  MessageSquare,
  LayoutGrid,
  Users,
  Phone,
  Zap,
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
  Target,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

// Navigation v2 — grouped by section
const navGroups = [
  {
    label: 'CORE',
    items: [
      { name: 'Command Center', href: '/command-center', icon: Target },
      { name: 'Pipeline', href: '/pipeline', icon: LayoutGrid },
      { name: 'Leads', href: '/leads', icon: Users },
    ],
  },
  {
    label: 'OUTREACH',
    items: [
      { name: 'Campaigns', href: '/campaigns', icon: Send },
      { name: 'Inbox', href: '/inbox', icon: MessageSquare },
      { name: 'Automation', href: '/automation', icon: Zap },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { name: 'Numbers', href: '/numbers', icon: Phone },
      { name: 'Analytics', href: '/analytics', icon: BarChart3 },
      { name: 'Twilio', href: '/twilio', icon: Radio, roles: ['ADMIN'] as string[] },
      { name: 'Settings', href: '/settings', icon: Settings, roles: ['ADMIN'] as string[] },
    ],
  },
];

// Flat list for command palette
const navigation = navGroups.flatMap((g) => g.items);

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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const isInboxRoute = location.pathname.startsWith('/inbox');

  // Auto-collapse sidebar on Pipeline / Command Center for maximum content visibility
  useEffect(() => {
    if (
      location.pathname === '/pipeline' ||
      location.pathname === '/command-center' ||
      location.pathname === '/inbox'
    ) {
      setCollapsed(true);
    }
  }, [location.pathname]);

  // Global WebSocket connection — connect on mount, disconnect on logout
  const { connect, disconnect } = useWebSocketStore();
  useEffect(() => {
    const token = localStorage.getItem('scl_token');
    if (token) connect(token);
    return () => disconnect();
  }, [connect, disconnect]);

  // Auto-invalidate queries on WebSocket events (messages, campaigns, leads)
  useWebSocketQuerySync();

  // Unread inbox count for badge — показываем число непрочитанных conversations,
  // чтобы sidebar совпадал с Inbox/Admin View и фильтром Unread.
  const { data: inboxData } = useQuery({
    queryKey: ['inbox-unread-summary'],
    queryFn: async () => {
      const { data } = await api.get('/inbox/unread-summary');
      return data as { unreadConversations: number; unreadMessages: number };
    },
    refetchInterval: 15000,
  });
  const unreadCount = inboxData?.unreadConversations || 0;

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

  // Filtered nav groups (respecting roles)
  const filteredNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
    }))
    .filter((group) => group.items.length > 0);

  // Command palette filtered items
  const commandItems = filteredNav.filter((item) => item.name.toLowerCase().includes(commandQuery.toLowerCase()));

  const handleCommandSelect = (href: string) => {
    setCommandOpen(false);
    setCommandQuery('');
    navigate(href);
  };

  // On mobile, always render expanded sidebar content (icons + labels)
  const sidebarCollapsed = collapsed && !mobileOpen;

  const sidebarContent = (
    <>
      {/* Brand Header */}
      <div
        className={clsx('flex items-center h-16', sidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-3.5')}
        style={{ borderBottom: '1px solid var(--scl-border)' }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: isInboxRoute
              ? 'linear-gradient(135deg, rgba(184,150,62,0.92), rgba(217,178,78,0.98))'
              : 'linear-gradient(135deg, #1A5FC8, #2B7FE8)',
            fontSize: 12,
            fontWeight: 700,
            color: isInboxRoute ? '#1c1710' : '#FFFFFF',
          }}
        >
          S
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col min-w-0">
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--scl-white)', letterSpacing: '0.04em' }}>
              SCL Capital
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--scl-text-g)',
                textTransform: 'uppercase',
                letterSpacing: '0.10em',
                marginTop: 2,
              }}
            >
              Secure Credit Lines
            </span>
          </div>
        )}
        {!sidebarCollapsed && (
          <button
            onClick={() => {
              setCollapsed(!collapsed);
              setMobileOpen(false);
            }}
            className="ml-auto p-1 transition-colors hidden lg:block"
            style={{ color: 'var(--scl-text-m)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto p-1 transition-colors lg:hidden"
          style={{ color: 'var(--scl-text-m)' }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick search trigger */}
      {!sidebarCollapsed && (
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

      {/* Expand button when collapsed */}
      {sidebarCollapsed && (
        <div className="flex justify-center pt-2 px-2 hidden lg:flex">
          <button
            onClick={() => setCollapsed(false)}
            className="p-2 rounded-lg text-dark-500 hover:text-dark-300 hover:bg-dark-800/50 transition-colors"
            title="Expand sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation — grouped with section labels */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto" data-nav-version="2">
        {filteredNavGroups.map((group) => (
          <div key={group.label}>
            {!sidebarCollapsed && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--scl-text-g)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  padding: '14px 14px 4px',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === '/'}
                  className={({ isActive }) =>
                    clsx('sidebar-link relative', isActive && 'active', sidebarCollapsed && 'justify-center')
                  }
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <item.icon className="w-5 h-5 shrink-0 min-w-5 min-h-5" />
                  {!sidebarCollapsed && <span className="text-sm font-medium">{item.name}</span>}
                  {item.name === 'Inbox' && unreadCount > 0 && (
                    <span
                      className={clsx(
                        'absolute text-white text-[10px] font-bold rounded-full flex items-center justify-center',
                        sidebarCollapsed ? 'top-0 right-0 w-4 h-4' : 'right-2 top-1/2 -translate-y-1/2 w-5 h-5',
                      )}
                      style={{ backgroundColor: 'var(--scl-blue)' }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* SMS Mode Indicator + User section */}
      <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--scl-border)' }}>
        {/* SMS Mode pill */}
        <NavLink
          to="/settings?tab=system"
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors cursor-pointer',
            modeConfig.bg,
            'hover:opacity-80',
            sidebarCollapsed && 'justify-center',
          )}
          title={sidebarCollapsed ? `SMS: ${modeConfig.label}` : undefined}
        >
          <div className="relative shrink-0">
            <ModeIcon className={clsx('w-4 h-4', modeConfig.color)} />
            <span
              className={clsx('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-dark-900', modeConfig.dot)}
            />
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className={clsx('text-xs font-semibold', modeConfig.color)}>{modeConfig.label}</p>
              <p className="text-[10px] text-dark-500 truncate">SMS Mode</p>
            </div>
          )}
        </NavLink>

        <div
          className={clsx(
            'relative flex items-center gap-3 px-3 py-2 rounded-lg',
            sidebarCollapsed && 'justify-center',
          )}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #1A5FC8 0%, #2B7FE8 100%)',
            }}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowUserMenu(!showUserMenu)}>
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

          {/* User dropdown menu */}
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-50" onClick={() => setShowUserMenu(false)} />
              <div
                className="absolute bottom-full left-0 mb-1 z-50 w-48 rounded-lg border shadow-xl py-1"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
              >
                <button
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-tertiary)] transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => {
                    setShowUserMenu(false);
                    setShowChangePassword(true);
                  }}
                >
                  🔒 Change Password
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-tertiary)] transition-colors text-red-400"
                  onClick={() => {
                    setShowUserMenu(false);
                    handleLogout();
                  }}
                >
                  🚪 Log Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={clsx('flex h-screen overflow-hidden', isInboxRoute && 'inbox-layout')}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — Desktop */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col border-r transition-all duration-300',
          collapsed ? 'w-14' : 'w-[260px]',
        )}
        style={{
          backgroundColor: 'var(--scl-sidebar)',
          borderColor: 'var(--scl-border)',
        }}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar — Mobile */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-[150] flex flex-col w-[280px] border-r transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          backgroundColor: 'var(--scl-sidebar)',
          borderColor: 'var(--scl-border)',
        }}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div
          className="sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b lg:hidden"
          style={{
            backgroundColor: 'var(--scl-sidebar)',
            borderColor: 'var(--scl-border)',
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
        <div className="flex-1 min-h-0 overflow-auto">{children || <Outlet />}</div>
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

      {/* Change Password Modal */}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('All fields are required');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password updated successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border p-5 shadow-xl"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Change Password
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full text-sm rounded-lg p-2 border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full text-sm rounded-lg p-2 border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full text-sm rounded-lg p-2 border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg border"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 text-sm rounded-lg bg-scl-500 text-white font-medium hover:bg-scl-600 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
