import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, isToday, addDays, setHours, setMinutes, nextMonday } from 'date-fns';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import {
  Search,
  Send,
  Clock,
  CheckCheck,
  AlertTriangle,
  MessageSquare,
  Phone,
  Mail,
  X,
  ChevronLeft,
  ChevronDown,
  Plus,
  Check,
} from 'lucide-react';

import api, { inboxApi } from '../services/api';
import { Conversation, Message, SmsTemplate, ConversationNote, ConversationActivity } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import { SmsCounter } from '../components/SmsCounter';
import { useWebSocketStore } from '../stores/webSocketStore';
import { useAuthStore } from '../stores/authStore';
import AIBanner from '../components/inbox/AIBanner';
import AISuggestions from '../components/inbox/AISuggestions';
import HOTToast from '../components/inbox/HOTToast';
import { InboxCardAIChips, InboxCardScoreBar } from '../components/inbox/InboxCardAI';
import '../styles/sms-inbox.css';
import '../styles/ai-inbox.css';

type InboxFilter =
  | 'all'
  | 'unread'
  | 'hot'
  | 'email_rcv'
  | 'my_campaigns'
  | 'interested'
  | 'followup'
  | 'in_pipeline'
  | 'dnc';
type InboxSort = 'ai_priority' | 'newest_activity' | 'oldest_untouched' | 'unread_first' | 'hot_first';

// Pixel-perfect: 1:1 с прототипом scl-inbox-v11.html
// Одна строка-flex-wrap, как в .inbox-filters прототипа
const FILTER_ALL: Array<{ id: InboxFilter; label: string; tone?: 'hot' }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'hot', label: '🔥 Hot', tone: 'hot' },
  { id: 'email_rcv', label: '✉ Email Rcv' },
  { id: 'interested', label: '✓ Interested' },
  { id: 'followup', label: '⏰ Follow-Up' },
  { id: 'in_pipeline', label: '→ In Pipeline' },
  { id: 'dnc', label: '⛔ DNC' },
  { id: 'my_campaigns', label: '🎯 My Campaigns' },
];

const SORT_OPTIONS: Array<{ id: InboxSort; label: string }> = [
  { id: 'ai_priority', label: '⚡ AI Priority' },
  { id: 'newest_activity', label: 'Newest Activity' },
  { id: 'oldest_untouched', label: 'Oldest Untouched' },
  { id: 'unread_first', label: 'Unread First' },
  { id: 'hot_first', label: 'Hot First' },
];

const PIPELINE_STAGE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'New Lead', value: 'NEW_LEAD' },
  { label: 'Engaged / Interested', value: 'ENGAGED_INTERESTED' },
  { label: 'Qualified', value: 'QUALIFIED' },
  { label: 'Submitted (In Review)', value: 'SUBMITTED_IN_REVIEW' },
  { label: 'Approved / Offers', value: 'APPROVED_OFFERS' },
  { label: 'Nurture', value: 'NURTURE' },
];

const INBOX_SOUND_MUTE_KEY = 'scl_inbox_sound_muted';

function playNewReplyTone() {
  if (localStorage.getItem(INBOX_SOUND_MUTE_KEY) === '1') return;
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 760;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.15);
    setTimeout(() => ctx.close().catch(() => {}), 250);
  } catch {
    // autoplay blocked
  }
}

function getFollowBadge(nextFollowupAt?: string | null) {
  if (!nextFollowupAt) return null;
  const d = new Date(nextFollowupAt);
  const now = new Date();
  const dn = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (dn < nn) return '⏱ Overdue';
  if (dn === nn) return '⏱ Follow Today';
  return '⏱ Follow-Up';
}

function getConversationBadges(conv: Conversation): Array<{ label: string; cls: string }> {
  const badges: Array<{ label: string; cls: string }> = [];
  if (conv.hotLead) badges.push({ label: '🔥 Hot', cls: 'inbox-badge-hot' });
  if (conv.emailReceived) badges.push({ label: '✉ Email Rcv', cls: 'inbox-badge-email' });
  if (conv.leadStatus === 'Interested') badges.push({ label: '✓ Interested', cls: 'inbox-badge-interested' });
  if (conv.isInPipeline) badges.push({ label: '→ In Pipeline', cls: 'inbox-badge-pipeline' });
  if (conv.leadStatus === 'DNC') badges.push({ label: '⛔ DNC', cls: 'inbox-badge-dnc' });
  const follow = getFollowBadge(conv.nextFollowupAt);
  if (follow) {
    const cls = follow.includes('Overdue') ? 'inbox-badge-overdue' : 'inbox-badge-followup';
    badges.push({ label: follow, cls });
  }
  return badges;
}

function toDisplayName(value?: string | null) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === trimmed.toUpperCase()) {
    return trimmed.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return trimmed;
}

function formatThreadDateLabel(dateValue: string | Date) {
  const dt = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  const base = format(dt, 'MMM d, yyyy').toUpperCase();
  return isToday(dt) ? `${base} — TODAY` : base;
}

function messageDate(message: Message) {
  return message.sentAt ? new Date(message.sentAt) : new Date(message.createdAt);
}

function MsgStatusText({ status }: { status: string }) {
  // Pixel-perfect proto: компактный inline формат "· ✓✓"
  if (status === 'DELIVERED' || status === 'READ') {
    return <span className="inbox-msg-status delivered">· ✓✓</span>;
  }
  if (status === 'FAILED' || status === 'UNDELIVERED' || status === 'BLOCKED') {
    return <span className="inbox-msg-status failed">· ✗</span>;
  }
  return <span className="inbox-msg-status sent">· ✓</span>;
}

export default function InboxPage() {
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [sort, setSort] = useState<InboxSort>('ai_priority');
  const [sortOpen, setSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const sortRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const wsConnected = useWebSocketStore((s) => s.connected);
  const socket = useWebSocketStore((s) => s.socket);
  const [searchParams, setSearchParams] = useSearchParams();

  // Инициализируем campaign filter прямо из URL (ленивый initializer, без useEffect)
  const [campaignFilter, setCampaignFilter] = useState<string | null>(() => searchParams.get('campaign'));
  const [inboxScope, setInboxScope] = useState<'admin' | 'mine'>(() => (isAdminOrManager ? 'admin' : 'mine'));

  // Обработка ?campaign=ID и ?lead=ID — очищаем URL после считывания
  useEffect(() => {
    const campId = searchParams.get('campaign');
    const leadId = searchParams.get('lead');

    if (campId || leadId) {
      setSearchParams({}, { replace: true });
    }

    if (leadId) {
      inboxApi
        .getOrCreateByLead(leadId)
        .then(({ data }) => {
          if (data.conversation) {
            setSelectedId(data.conversation.id);
            queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
          }
        })
        .catch(() => {});
    }
  }, [queryClient, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isAdminOrManager && inboxScope !== 'mine') {
      setInboxScope('mine');
    }
  }, [isAdminOrManager, inboxScope]);

  useEffect(() => {
    if (!socket || !selectedId) return;
    socket.emit('join:conversation', selectedId);
    return () => {
      socket.emit('leave:conversation', selectedId);
    };
  }, [socket, selectedId]);

  // Phase 1: Socket.io listeners для AI обновлений (список + открытый thread)
  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
    };
    socket.on('ai-classified', refresh);
    socket.on('revenue_updated', refresh);
    // FIX: входящее сообщение должно немедленно обновлять список диалогов,
    // unread-summary и открытый тред (раньше была только подзвучка → задержка до 4с).
    const onNewMessage = (payload: { direction?: string; conversationId?: string; conversation?: { id?: string } }) => {
      const convId = payload?.conversationId || payload?.conversation?.id;
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-unread-summary'] });
      if (convId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', convId] });
      }
      if (payload?.direction === 'INBOUND') {
        playNewReplyTone();
      }
    };
    // Backend шлёт `message` в room `conversation:<id>` для участников открытого треда.
    const onConversationMessage = (payload: { conversationId?: string }) => {
      if (payload?.conversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', payload.conversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
    };
    socket.on('new-message', onNewMessage);
    socket.on('message', onConversationMessage);
    return () => {
      socket.off('ai-classified', refresh);
      socket.off('revenue_updated', refresh);
      socket.off('new-message', onNewMessage);
      socket.off('message', onConversationMessage);
    };
  }, [socket, queryClient]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!sortRef.current) return;
      if (!sortRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedSort = SORT_OPTIONS.find((option) => option.id === sort) || SORT_OPTIONS[0];

  const { data: convData, isLoading } = useQuery({
    queryKey: ['inbox-conversations', debouncedSearch, filter, sort, page, campaignFilter, inboxScope, isAdminOrManager],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        limit: '50',
        withFilterCounts: 'true',
        filter,
        sort,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (campaignFilter) params.campaignId = campaignFilter;
      if (isAdminOrManager) params.scope = inboxScope;
      const { data } = await inboxApi.listConversations(params);
      return data;
    },
    refetchInterval: wsConnected ? false : 4000,
  });

  const conversations: Conversation[] = convData?.conversations || [];
  // Phase 1: клиентская AI Priority сортировка (HOT наверх → score DESC → время)
  const sortedConversations = useMemo(() => {
    if (sort !== 'ai_priority') return conversations;
    return [...conversations].sort((a, b) => {
      const overdueA = a.nextFollowupAt && new Date(a.nextFollowupAt).getTime() < Date.now() ? 2000 : 0;
      const overdueB = b.nextFollowupAt && new Date(b.nextFollowupAt).getTime() < Date.now() ? 2000 : 0;
      const sa = overdueA + (a.aiClassification === 'HOT' ? 1000 : 0) + (a.aiLeadScore ?? 0);
      const sb = overdueB + (b.aiClassification === 'HOT' ? 1000 : 0) + (b.aiLeadScore ?? 0);
      if (sb !== sa) return sb - sa;
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });
  }, [conversations, sort]);
  const filterCounts = (convData?.filterCounts || {}) as Record<string, number>;
  const summaryCounts = (convData?.summaryCounts || {
    overdueFollowups: 0,
    hotAiFlagged: 0,
    newToday: 0,
    unread: 0,
    inPipelineQualified: 0,
  }) as {
    overdueFollowups: number;
    hotAiFlagged: number;
    newToday: number;
    unread: number;
    inPipelineQualified: number;
  };
  const totalPages = convData?.pagination?.pages || 1;
  const totalConversations = convData?.pagination?.total ?? conversations.length;

  return (
    <div className={clsx('inbox-root', 'phase1', selectedId && 'has-selected')}>
      <HOTToast />
      <div className="inbox-left">
        {/* Campaign filter banner */}
        {campaignFilter && (
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border-b border-purple-500/20 text-xs text-purple-300">
            <span className="font-medium">📬 All replies from this campaign (opt-outs included)</span>
            <button
              onClick={() => setCampaignFilter(null)}
              className="ml-auto text-purple-400 hover:text-purple-200 font-medium"
            >
              ✕ Clear
            </button>
          </div>
        )}
        <div className="inbox-left-header">
          <div className="inbox-title-row px-2">
            <span className="inbox-title">INBOX</span>
            <span className="inbox-title-count">{totalConversations}</span>
          </div>

          {isAdminOrManager && (
            <div className="inbox-view-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={inboxScope === 'admin'}
                className={clsx('inbox-view-toggle-btn', inboxScope === 'admin' && 'active')}
                onClick={() => {
                  setInboxScope('admin');
                  setPage(1);
                }}
              >
                👁 ADMIN VIEW
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inboxScope === 'mine'}
                className={clsx('inbox-view-toggle-btn', inboxScope === 'mine' && 'active')}
                onClick={() => {
                  setInboxScope('mine');
                  setPage(1);
                }}
              >
                👤 MY CONVS
              </button>
            </div>
          )}

          {isAdminOrManager && (
            <div className="inbox-master-card">
              <div className="inbox-master-title">✦ ADMIN MASTER VIEW</div>
              <div className="inbox-master-row">
                <span className="inbox-master-label">⏰ Overdue follow-ups</span>
                <span className="inbox-master-value">{summaryCounts.overdueFollowups}</span>
              </div>
              <div className="inbox-master-row">
                <span className="inbox-master-label">🔥 HOT (AI-flagged)</span>
                <span className="inbox-master-value">{summaryCounts.hotAiFlagged}</span>
              </div>
              <div className="inbox-master-row">
                <span className="inbox-master-label">💬 New today</span>
                <span className="inbox-master-value">{summaryCounts.newToday}</span>
              </div>
              <div className="inbox-master-row">
                <span className="inbox-master-label">✉ Unread</span>
                <span className="inbox-master-value">{summaryCounts.unread}</span>
              </div>
              <div className="inbox-master-row">
                <span className="inbox-master-label">→ In Pipeline</span>
                <span className="inbox-master-value">{summaryCounts.inPipelineQualified}</span>
              </div>
            </div>
          )}

          <div className="inbox-search">
            <Search className="inbox-search-icon" />
            <input
              type="text"
              className="inbox-search-input"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="inbox-sort-row">
            <span className="inbox-sort-label">Sort</span>
            <div className="inbox-sort" ref={sortRef}>
              <button
                type="button"
                className="inbox-sort-select"
                onClick={() => setSortOpen((open) => !open)}
              >
                <span>{selectedSort.label}</span>
                <ChevronDown size={13} />
              </button>
              {sortOpen && (
                <div className="inbox-sort-menu">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={clsx('inbox-sort-option', sort === option.id && 'active')}
                      onClick={() => {
                        setSort(option.id);
                        setSortOpen(false);
                        setPage(1);
                      }}
                    >
                      <span>{option.label}</span>
                      {sort === option.id && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="inbox-filters one-row">
          {FILTER_ALL.map((f) => (
            <button
              key={f.id}
              className={clsx('inbox-filter-btn', f.tone && `tone-${f.tone}`, filter === f.id && 'active')}
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
            >
              {f.label}
              <span className="inbox-filter-count">{filterCounts[f.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="inbox-conv-list">
          {isLoading && (
            <div style={{ padding: 12 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0' }}>
                  <div className="inbox-skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="inbox-skeleton" style={{ width: '60%', marginBottom: 6 }} />
                    <div className="inbox-skeleton" style={{ width: '80%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && conversations.length === 0 && (
            <div className="inbox-empty">
              <div className="inbox-empty-content">
                <MessageSquare className="inbox-empty-icon" />
                <p className="inbox-empty-text">No conversations</p>
                <p className="inbox-empty-sub">Conversations appear when leads are contacted</p>
              </div>
            </div>
          )}

          {sortedConversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onClick={() => setSelectedId(conv.id)}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="inbox-pagination">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </button>
            <span>
              {page}/{totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </button>
          </div>
        )}
      </div>

      {selectedId ? (
        <MessageThread conversationId={selectedId} onBack={() => setSelectedId(null)} wsConnected={wsConnected} />
      ) : (
        <div className="inbox-center">
          <div className="inbox-empty">
            <div className="inbox-empty-content">
              <MessageSquare className="inbox-empty-icon" />
              <p className="inbox-empty-text">Select a conversation</p>
              <p className="inbox-empty-sub">Choose from the list to view messages</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const lead = conversation.lead;
  const lastMsg = conversation.messages?.[0];
  const badges = getConversationBadges(conversation);
  const leadFirstName = toDisplayName(lead?.firstName);
  const leadLastName = toDisplayName(lead?.lastName);

  return (
    <div
      className={clsx('inbox-conv-item', isSelected && 'selected', conversation.unreadCount > 0 && 'unread')}
      onClick={onClick}
    >
      <div className="inbox-avatar">
        {lead?.firstName?.[0]}
        {lead?.lastName?.[0] || ''}
      </div>

      <div className="inbox-conv-info">
        <div className="inbox-conv-head-row">
          <div className="inbox-conv-name">
            {leadFirstName} {leadLastName}
          </div>
          <span className="inbox-conv-time">
            {conversation.lastMessageAt
              ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
              : ''}
          </span>
          {/* Pixel-perfect: мини-бейдж rep в верхнем правом углу карточки (как в proto: AR/JB/SB) */}
          {(conversation.statusStrip?.assignedRep || conversation.assignedRep) && (
            <span className="inbox-conv-rep-badge" title={`Assigned rep`}>
              {(() => {
                const r =
                  conversation.statusStrip?.assignedRep ||
                  (conversation.assignedRep
                    ? `${conversation.assignedRep.firstName || ''} ${conversation.assignedRep.lastName || ''}`
                    : '');
                return r
                  .split(/\s+/)
                  .map((p: string) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
              })()}
            </span>
          )}
        </div>

        <div className="inbox-conv-number-pill">
          {conversation.fromNumber || lead?.phone}
          {conversation.fromNumberFriendlyName ? ` · ${conversation.fromNumberFriendlyName}` : ''}
        </div>

        <div className="inbox-conv-preview">
          {lastMsg ? `${lastMsg.direction === 'OUTBOUND' ? '↑ ' : ''}${lastMsg.body}` : lead?.company || lead?.phone}
        </div>

        {badges.length > 0 && (
          <div className="inbox-conv-meta">
            {badges.map((b) => (
              <span key={`${conversation.id}-${b.label}`} className={clsx('inbox-badge', b.cls)}>
                {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Phase 1 AI: HOT badge + signal chips (revenue/ask/urgency) */}
        <InboxCardAIChips conversation={conversation} />
        {/* Phase 1 AI: тонкая score-bar (без числа) */}
        <InboxCardScoreBar conversation={conversation} />
      </div>

      {conversation.unreadCount > 0 && <span className="inbox-unread-dot" />}
    </div>
  );
}

function MessageThread({
  conversationId,
  onBack,
  wsConnected,
}: {
  conversationId: string;
  onBack: () => void;
  wsConnected: boolean;
}) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [replyText, setReplyText] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateScope, setTemplateScope] = useState<'mine' | 'team' | 'global'>('mine');
  const [showPipelinePicker, setShowPipelinePicker] = useState(false);

  const [showNotePopover, setShowNotePopover] = useState(false);
  const [internalNoteText, setInternalNoteText] = useState('');

  const [showSchedulePopover, setShowSchedulePopover] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  const [showTagPopover, setShowTagPopover] = useState(false);
  const [tagState, setTagState] = useState({
    hot: false,
    email: false,
    interested: false,
    dnc: false,
  });

  const [showFollowupPopover, setShowFollowupPopover] = useState(false);
  const [followupDateTime, setFollowupDateTime] = useState('');
  const [followupReason, setFollowupReason] = useState('');

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await inboxApi.getConversation(conversationId);
      return data;
    },
    refetchInterval: wsConnected ? false : 4000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', 'inbox-assign'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
    enabled: showAssignModal && isAdmin,
  });

  const markReadMutation = useMutation({
    mutationFn: () => inboxApi.markRead(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-unread-summary'] });
    },
    retry: false,
  });

  const markUnreadMutation = useMutation({
    mutationFn: () => inboxApi.markUnread(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-unread-summary'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      onBack();
      toast.success('Marked as unread');
    },
    onError: () => toast.error('Failed to mark unread'),
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => inboxApi.sendReply(conversationId, body),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'Failed to send'),
  });

  const statusMutation = useMutation({
    mutationFn: (updates: Parameters<typeof inboxApi.updateStatus>[1]) =>
      inboxApi.updateStatus(conversationId, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      // Pixel-perfect proto: toast на каждое действие (как в scl-inbox-v11.html)
      const v = variables as Record<string, unknown>;
      if (v.leadStatus === 'Interested') toast.success('✓ Marked Interested', { icon: '🔥' });
      else if (v.leadStatus === 'Not Interested') toast('Marked Not Interested');
      else if (v.leadStatus === 'DNC') toast.success('Marked as DNC', { icon: '⛔' });
      else if (v.leadStatus === '') toast('Status cleared');
      else if (typeof v.emailReceived === 'boolean') toast.success(v.emailReceived ? 'Email received' : 'Email cleared');
      else if (v.nextFollowupAt) toast.success('Follow-up scheduled', { icon: '⏰' });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const addToPipelineMutation = useMutation({
    mutationFn: (dealStage?: string) => inboxApi.addToPipeline(conversationId, undefined, dealStage),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      setShowPipelinePicker(false);
      toast.success('Added to Pipeline');
      if (data?.deal?.id) {
        navigate(`/pipeline?deal=${data.deal.id}`);
      }
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error || 'Failed to add to pipeline';
      toast.error(message);
    },
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) => inboxApi.createNote(conversationId, body),
    onSuccess: () => {
      setInternalNoteText('');
      setShowNotePopover(false);
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['notes', conversationId] });
      toast.success('Internal note saved');
    },
    onError: () => toast.error('Failed to save note'),
  });

  const scheduleMutation = useMutation({
    mutationFn: (payload: { body: string; scheduledAt: string }) =>
      inboxApi.createScheduled({ conversationId, body: payload.body, scheduledAt: payload.scheduledAt }),
    onSuccess: () => {
      setShowSchedulePopover(false);
      setScheduleAt('');
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      toast.success('Message scheduled');
    },
    onError: () => toast.error('Failed to schedule message'),
  });

  const assignMutation = useMutation({
    mutationFn: (repId: string) => inboxApi.assignRep(conversationId, repId),
    onSuccess: () => {
      setShowAssignModal(false);
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
      toast.success('Rep assigned and notified');
    },
    onError: () => toast.error('Failed to assign rep'),
  });

  const suggestionFeedbackMutation = useMutation({
    mutationFn: (payload: { action: 'skip' | 'use' | 'override'; suggestionText?: string; reason?: string }) =>
      inboxApi.createClassificationFeedback(conversationId, payload),
    onError: () => toast.error('Failed to save AI feedback'),
  });

  const conversation: Conversation | undefined = data?.conversation;
  const messages: Message[] = data?.messages || [];
  const statusStrip = conversation?.statusStrip;
  const leadFirstName = toDisplayName(conversation?.lead?.firstName);
  const leadLastName = toDisplayName(conversation?.lead?.lastName);

  // Pixel-perfect proto: ID последнего INBOUND ≤ aiClassifiedAt — он триггернул HOT
  const hotTriggerMessageId = useMemo(() => {
    if (conversation?.aiClassification !== 'HOT' || !conversation?.aiClassifiedAt) return null;
    const cutoff = new Date(conversation.aiClassifiedAt).getTime();
    let candidateId: string | null = null;
    let candidateTs = -Infinity;
    for (const m of messages) {
      if (m.direction !== 'INBOUND') continue;
      const ts = messageDate(m).getTime();
      if (ts <= cutoff && ts > candidateTs) {
        candidateTs = ts;
        candidateId = m.id;
      }
    }
    return candidateId;
  }, [messages, conversation?.aiClassification, conversation?.aiClassifiedAt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (conversation?.unreadCount && conversation.unreadCount > 0 && !markReadMutation.isPending) {
      markReadMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.unreadCount, conversationId]);

  useEffect(() => {
    if (!conversation) return;
    setTagState({
      hot: !!conversation.hotLead,
      email: !!conversation.emailReceived,
      interested: conversation.leadStatus === 'Interested',
      dnc: conversation.leadStatus === 'DNC',
    });
  }, [conversation]);

  useEffect(() => {
    if (!showAssignModal) return;
    const currentAssigned = conversation?.assignedRepId || '';
    setSelectedRepId(currentAssigned);
  }, [showAssignModal, conversation?.assignedRepId]);

  useEffect(() => {
    if (!showAssignModal || selectedRepId) return;
    const activeReps = (usersData?.users || []).filter((u: any) => u.role === 'REP' && u.isActive !== false);
    if (activeReps.length > 0) {
      setSelectedRepId(activeReps[0].id);
    }
  }, [showAssignModal, selectedRepId, usersData]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!replyText.trim()) return;
    sendMutation.mutate(replyText.trim());
  };

  const insertTemplateIntoCompose = useCallback(
    (template: SmsTemplate) => {
      const body = (template.body || '').trim();
      if (!body) {
        toast.error('Template is empty');
        return;
      }
      setReplyText((prev) => (prev ? `${prev}\n${body}` : body));
      inboxApi.logTemplateUsage(template.id, conversationId).catch(() => {});
      setShowTemplates(false);
      setTimeout(() => composeTextareaRef.current?.focus(), 0);
      toast.success('Template inserted');
    },
    [conversationId],
  );

  const applyQuickFollowup = (preset: 'tomorrow_9' | 'tomorrow_14' | 'next_monday') => {
    const now = new Date();
    let when = now;
    if (preset === 'tomorrow_9') {
      when = setMinutes(setHours(addDays(now, 1), 9), 0);
    } else if (preset === 'tomorrow_14') {
      when = setMinutes(setHours(addDays(now, 1), 14), 0);
    } else {
      when = setMinutes(setHours(nextMonday(now), 9), 0);
    }
    statusMutation.mutate({ nextFollowupAt: when.toISOString() });
    setShowFollowupPopover(false);
    toast.success('Follow-up saved');
  };

  const openScheduleFromPreset = (preset: 'tomorrow_9' | 'tomorrow_14' | 'next_monday') => {
    const now = new Date();
    let when = now;
    if (preset === 'tomorrow_9') when = setMinutes(setHours(addDays(now, 1), 9), 0);
    if (preset === 'tomorrow_14') when = setMinutes(setHours(addDays(now, 1), 14), 0);
    if (preset === 'next_monday') when = setMinutes(setHours(nextMonday(now), 9), 0);
    setScheduleAt(when.toISOString().slice(0, 16));
  };

  const deliveryLegend = (
    <div className="inbox-compose-meta">
      <div className="inbox-kbd-row">/ TEMPLATES · ⌘↵ SEND · N NOTE · S SCHEDULE · F FOLLOW-UP</div>
      <div className="inbox-sound-row">SOUND TEST: 🔥 Hot lead · 💬 New reply · 🔇 Mute</div>
    </div>
  );

  if (!conversation) {
    return (
      <div className="inbox-center">
        <div className="inbox-empty">
          <div className="inbox-empty-content">
            <MessageSquare className="inbox-empty-icon" />
            <p className="inbox-empty-text">Loading conversation...</p>
          </div>
        </div>
      </div>
    );
  }

  const fromNumber = statusStrip?.fromNumber || conversation.fromNumber || conversation.lead?.phone || '';
  const fromFriendly = statusStrip?.fromNumberFriendlyName || conversation.fromNumberFriendlyName || '';
  const inPipeline = conversation.isInPipeline || statusStrip?.pipelineState === 'in_pipeline';
  const leadEmail = (conversation.lead?.email || '').trim();
  const aiSignals = (conversation.aiSignals || {}) as Record<string, unknown>;
  const aiSuggestedFollowupTime =
    typeof aiSignals.suggestedFollowupTime === 'string' ? aiSignals.suggestedFollowupTime : '';
  const aiSuggestedFollowupReason =
    typeof aiSignals.suggestedFollowupReason === 'string' ? aiSignals.suggestedFollowupReason : '';
  const nextFollowupDate = conversation.nextFollowupAt ? new Date(conversation.nextFollowupAt) : null;
  const nextFollowupOverdue = !!nextFollowupDate && nextFollowupDate.getTime() < Date.now();

  const openGmailCompose = () => {
    if (!leadEmail) return;
    const subject = encodeURIComponent(`Re: ${conversation.lead?.company || 'Funding options'}`);
    const body = encodeURIComponent(replyText || '');
    const to = encodeURIComponent(leadEmail);
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="inbox-center">
        <div className="inbox-thread-header phase1">
          <div className="inbox-thread-row row1">
            <div className="inbox-thread-info">
              <button onClick={onBack} className="inbox-tool-btn inbox-back-btn" aria-label="Back">
                <ChevronLeft size={18} />
              </button>
              <div>
                <div className="inbox-thread-name">
                  {leadFirstName} {leadLastName}
                </div>
                <div className="inbox-thread-phone">
                  <Phone size={10} />
                  {conversation.lead?.phone}
                  {conversation.lead?.company ? ` · ${conversation.lead.company}` : ''}
                  {conversation.lead?.source ? <span className="thread-source"> · Source: {conversation.lead.source}</span> : null}
                </div>
              </div>
            </div>

            {/* Pixel-perfect: action-chips в правом верхнем углу как в proto */}
            <div className="inbox-thread-actions-bar">
              <button
                className={clsx('inbox-action-btn', conversation.leadStatus === 'Interested' && 'active-interested')}
                onClick={() =>
                  statusMutation.mutate({ leadStatus: conversation.leadStatus === 'Interested' ? '' : 'Interested' })
                }
              >
                <Check size={12} /> Mark Interested
              </button>
              <button
                className="inbox-action-btn"
                onClick={() => statusMutation.mutate({ leadStatus: 'Not Interested' })}
              >
                <X size={12} /> Not Interested
              </button>
              <button
                className={clsx('inbox-action-btn', conversation.leadStatus === 'DNC' && 'active-dnc')}
                onClick={() => statusMutation.mutate({ leadStatus: conversation.leadStatus === 'DNC' ? '' : 'DNC' })}
              >
                DNC
              </button>
              <button
                className={clsx('inbox-action-btn', conversation.emailReceived && 'active-email')}
                onClick={() => statusMutation.mutate({ emailReceived: !conversation.emailReceived })}
              >
                <Mail size={12} /> Email Rcv
              </button>
              <button
                className="inbox-action-btn pipeline"
                onClick={() => (inPipeline ? navigate('/pipeline') : setShowPipelinePicker(true))}
              >
                <Plus size={12} /> {inPipeline ? 'In Pipeline' : 'Pipeline'}
              </button>
              <button
                className="inbox-action-btn followup-btn"
                onClick={() => setShowFollowupPopover((p) => !p)}
                title="Schedule follow-up"
              >
                <Clock size={12} /> Follow-Up
              </button>
            </div>
          </div>

          <div className="inbox-thread-row row2 status-strip">
            {conversation.aiClassification ? (
              <span
                className={clsx(
                  'inbox-strip-badge ai-cls',
                  conversation.aiClassification === 'HOT' && 'hot',
                  conversation.aiClassification === 'WARM' && 'warm',
                  conversation.aiClassification === 'NURTURE' && 'nurture',
                )}
                title="AI classification"
              >
                {conversation.aiClassification === 'HOT' && '🔥 HOT'}
                {conversation.aiClassification === 'WARM' && '🌡 WARM'}
                {conversation.aiClassification === 'NURTURE' && '🌱 NURTURE'}
              </span>
            ) : null}
            {conversation.hotLead ? <span className="inbox-strip-badge hot">🔥 Hot Lead</span> : null}
            {nextFollowupDate && (
              <span className={clsx('inbox-strip-badge follow', nextFollowupOverdue && 'overdue')}>
                <Clock size={11} style={{ marginRight: 3 }} />
                {formatDistanceToNow(nextFollowupDate, { addSuffix: true })}
                {nextFollowupOverdue ? ' · OVERDUE' : ''}
              </span>
            )}
          </div>

          {showFollowupPopover && (
            <div className="inbox-popover followup-popover">
              <button onClick={() => applyQuickFollowup('tomorrow_9')}>Tomorrow 9:00 AM</button>
              <button onClick={() => applyQuickFollowup('tomorrow_14')}>Tomorrow 2:00 PM</button>
              <button onClick={() => applyQuickFollowup('next_monday')}>Next Monday</button>
              {aiSuggestedFollowupTime && (
                <button
                  onClick={() => {
                    const parsedDate = new Date(aiSuggestedFollowupTime);
                    if (Number.isNaN(parsedDate.getTime())) {
                      toast.error('Invalid AI follow-up suggestion');
                      return;
                    }
                    statusMutation.mutate({ nextFollowupAt: parsedDate.toISOString() });
                    if (aiSuggestedFollowupReason) {
                      noteMutation.mutate(`[AI Follow-up] ${aiSuggestedFollowupReason}`);
                    }
                    setShowFollowupPopover(false);
                    toast.success('AI follow-up applied');
                  }}
                >
                  AI Suggested: {format(new Date(aiSuggestedFollowupTime), 'MMM d, h:mm a')}
                </button>
              )}
              {aiSuggestedFollowupReason && <div className="inbox-popover-helper">Reason: {aiSuggestedFollowupReason}</div>}
              <input
                type="datetime-local"
                value={followupDateTime}
                onChange={(e) => setFollowupDateTime(e.target.value)}
                className="inbox-followup-input"
              />
              <input
                type="text"
                value={followupReason}
                onChange={(e) => setFollowupReason(e.target.value)}
                className="inbox-followup-input"
                placeholder="Optional reason"
              />
              <div className="inbox-popover-actions">
                <button
                  onClick={() => {
                    if (!followupDateTime) return;
                    statusMutation.mutate({ nextFollowupAt: new Date(followupDateTime).toISOString() });
                    if (followupReason.trim()) {
                      noteMutation.mutate(`[Follow-up reason] ${followupReason.trim()}`);
                    }
                    setFollowupReason('');
                    setShowFollowupPopover(false);
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    statusMutation.mutate({ nextFollowupAt: null });
                    setFollowupReason('');
                    setShowFollowupPopover(false);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        <AIBanner conversation={conversation as any} />

        <div className="inbox-messages phase1">
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <div className="inbox-spinner" />
            </div>
          )}

          {messages.map((msg, index) => {
            const currentDate = messageDate(msg);
            const prev = index > 0 ? messages[index - 1] : null;
            const showSeparator =
              !prev || format(messageDate(prev), 'yyyy-MM-dd') !== format(currentDate, 'yyyy-MM-dd');

            // Pixel-perfect proto: помечаем последнее INBOUND перед AI HOT classification + system-event после
            const isHotTrigger =
              conversation?.aiClassification === 'HOT' &&
              conversation?.aiClassifiedAt &&
              msg.direction === 'INBOUND' &&
              hotTriggerMessageId === msg.id;

            // Fragment вместо <div> — иначе align-self на .inbox-msg не срабатывает
            return (
              <Fragment key={msg.id}>
                {showSeparator && (
                  <div className="inbox-date-separator">
                    <span className="line" />
                    <span className="label">{formatThreadDateLabel(currentDate)}</span>
                    <span className="line" />
                  </div>
                )}
                <MessageBubble message={{ ...(msg as any), hot: isHotTrigger } as Message} />
                {isHotTrigger && (
                  <div className="inbox-system-event">🔥 HOT classification — admin notified via mobile SMS</div>
                )}
              </Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {!conversation?.lead?.optedOut && (
          <AISuggestions
            suggestions={(conversation as any)?.aiSuggestions}
            signals={(conversation as any)?.aiSignals}
            onUseSuggestion={(text) => {
              setReplyText(text);
              composeTextareaRef.current?.focus();
              suggestionFeedbackMutation.mutate({ action: 'use', suggestionText: text });
            }}
            onEditSuggestion={(text) => {
              setReplyText(text);
              composeTextareaRef.current?.focus();
            }}
            onSkipSuggestion={(text) => {
              suggestionFeedbackMutation.mutate({ action: 'skip', suggestionText: text });
              toast.success('Suggestion skipped');
            }}
          />
        )}

        <div className="inbox-compose phase1">
          <div className="inbox-sending-from">
            SENDING FROM <span className="number">{fromNumber}</span>
            {fromFriendly ? ` — ${fromFriendly}` : ''}
          </div>

          {/* Pixel-perfect: emoji-иконки 1:1 с прототипом (proto использует 📄 📅 🔗 🏷) */}
          <div className="inbox-compose-tools phase1">
            <button className="inbox-tool-btn icon-emoji" title="Templates" onClick={() => setShowTemplates(true)}>
              📄
            </button>
            <button className="inbox-tool-btn icon-emoji" title="Schedule" onClick={() => setShowSchedulePopover((p) => !p)}>
              📅
            </button>
            <button className="inbox-tool-btn icon-emoji" title="Note (internal)" onClick={() => setShowNotePopover((p) => !p)}>
              🔗
            </button>
            <button className="inbox-tool-btn icon-emoji" title="Tag" onClick={() => setShowTagPopover((p) => !p)}>
              🏷
            </button>
            {replyText && <SmsCounter text={replyText} />}
          </div>

          {showNotePopover && (
            <div className="inbox-popover compose-note-popover">
              <textarea
                className="inbox-note-input"
                placeholder="Internal note (never sent to merchant)..."
                value={internalNoteText}
                onChange={(e) => setInternalNoteText(e.target.value)}
              />
              <div className="inbox-popover-actions">
                <button
                  disabled={!internalNoteText.trim()}
                  onClick={() => noteMutation.mutate(internalNoteText.trim())}
                >
                  Save Note
                </button>
                <button onClick={() => setShowNotePopover(false)}>Close</button>
              </div>
            </div>
          )}

          {showSchedulePopover && (
            <div className="inbox-popover compose-schedule-popover">
              <button onClick={() => openScheduleFromPreset('tomorrow_9')}>Tomorrow 9:00 AM</button>
              <button onClick={() => openScheduleFromPreset('tomorrow_14')}>Tomorrow 2:00 PM</button>
              <button onClick={() => openScheduleFromPreset('next_monday')}>Next Monday</button>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="inbox-followup-input"
              />
              <div className="inbox-popover-actions">
                <button
                  disabled={!scheduleAt || !replyText.trim()}
                  onClick={() => {
                    if (!replyText.trim()) {
                      toast.error('Type message first');
                      return;
                    }
                    scheduleMutation.mutate({
                      body: replyText.trim(),
                      scheduledAt: new Date(scheduleAt).toISOString(),
                    });
                  }}
                >
                  Schedule Message
                </button>
                <button onClick={() => setShowSchedulePopover(false)}>Close</button>
              </div>
            </div>
          )}

          {showTagPopover && (
            <div className="inbox-popover compose-tag-popover">
              <label>
                <input
                  type="checkbox"
                  checked={tagState.hot}
                  onChange={(e) => setTagState((s) => ({ ...s, hot: e.target.checked }))}
                />
                🔥 Hot Lead
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={tagState.email}
                  onChange={(e) => setTagState((s) => ({ ...s, email: e.target.checked }))}
                />
                ✉ Email Rcv
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={tagState.interested}
                  onChange={(e) => setTagState((s) => ({ ...s, interested: e.target.checked }))}
                />
                ✓ Interested
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={tagState.dnc}
                  onChange={(e) => setTagState((s) => ({ ...s, dnc: e.target.checked }))}
                />
                ⛔ DNC
              </label>
              <div className="inbox-popover-actions">
                <button
                  onClick={() => {
                    statusMutation.mutate({
                      hotLead: tagState.hot,
                      emailReceived: tagState.email,
                      leadStatus: tagState.dnc ? 'DNC' : tagState.interested ? 'Interested' : '',
                    });
                    setShowTagPopover(false);
                  }}
                >
                  Apply
                </button>
                <button onClick={() => setShowTagPopover(false)}>Close</button>
              </div>
            </div>
          )}

          <form onSubmit={handleSend} className="inbox-compose-form">
            <textarea
              className="inbox-compose-textarea"
              placeholder="Type your message..."
              value={replyText}
              ref={composeTextareaRef}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                  e.preventDefault();
                  setShowTemplates(true);
                }
                if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
            />
            <button type="submit" className="inbox-compose-btn" disabled={!replyText.trim() || sendMutation.isPending}>
              <Send size={16} />
            </button>
          </form>
          {deliveryLegend}
        </div>

        {showTemplates && (
          <TemplateModal
            scope={templateScope}
            canCreateGlobal={isAdmin}
            onScopeChange={setTemplateScope}
            onSelect={insertTemplateIntoCompose}
            onClose={() => setShowTemplates(false)}
          />
        )}

        {showAssignModal && isAdmin && (
          <div className="inbox-template-overlay" onClick={() => setShowAssignModal(false)}>
            <div className="inbox-assign-modal" onClick={(e) => e.stopPropagation()}>
              <div className="inbox-template-header">
                <h3>Assign Rep</h3>
                <button className="inbox-tool-btn" onClick={() => setShowAssignModal(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="inbox-assign-body">
                <div className="inbox-assign-sub">Admin-only. Select rep and notify immediately.</div>
                <div className="inbox-assign-list">
                  {(usersData?.users || [])
                    .filter((u: any) => u.role === 'REP' && u.isActive !== false)
                    .map((u: any) => {
                      const isSelected = selectedRepId === u.id;
                      const isCurrent = conversation?.assignedRepId === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className={clsx('inbox-assign-row', isSelected && 'selected')}
                          onClick={() => setSelectedRepId(u.id)}
                        >
                          <span className="inbox-assign-name">
                            {u.firstName} {u.lastName}
                          </span>
                          <span className="inbox-assign-badges">
                            {isCurrent ? <span className="badge-current">Current</span> : null}
                            {isSelected ? <span className="badge-selected">Selected</span> : null}
                          </span>
                        </button>
                      );
                    })}
                </div>
                <div className="inbox-popover-actions">
                  <button
                    disabled={!selectedRepId || assignMutation.isPending}
                    onClick={() => assignMutation.mutate(selectedRepId)}
                  >
                    Assign & Notify
                  </button>
                  <button onClick={() => setShowAssignModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showPipelinePicker && (
          <div className="inbox-template-overlay" onClick={() => setShowPipelinePicker(false)}>
            <div className="inbox-stage-picker" onClick={(e) => e.stopPropagation()}>
              <div className="inbox-template-header">
                <h3>Add to Pipeline</h3>
                <button className="inbox-tool-btn" onClick={() => setShowPipelinePicker(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="inbox-stage-list">
                {PIPELINE_STAGE_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    className="inbox-stage-item"
                    onClick={() => addToPipelineMutation.mutate(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="inbox-stage-footer">
                Tap a stage to move instantly. No confirmation needed. SMS stays active.
              </div>
            </div>
          </div>
        )}
      </div>

      <RightSidebar conversationId={conversationId} conversation={conversation} activity={data?.activity || []} />
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === 'OUTBOUND';
  const dt = messageDate(message);
  const isHot = !outbound && (message as unknown as { hot?: boolean }).hot === true;

  // Pixel-perfect proto: время и статус инлайн через ·
  return (
    <div className={clsx('inbox-msg', outbound ? 'outbound' : 'inbound', isHot && 'hot')}>
      <div className="inbox-msg-bubble">{message.body}</div>
      <div className="inbox-msg-meta">
        <span>{format(dt, 'h:mm a')}</span>
        {outbound && <MsgStatusText status={message.status} />}
        {isHot && <span className="inbox-msg-hot-tag">🔥 HOT</span>}
      </div>
    </div>
  );
}

function RightSidebar({
  conversationId,
  conversation,
  activity,
}: {
  conversationId: string;
  conversation: Conversation;
  activity: ConversationActivity[];
}) {
  const [tab, setTab] = useState<'contact' | 'ai_state' | 'alerts'>('contact');

  return (
    <div className="inbox-right phase1">
      <div className="inbox-sidebar-tabs">
        <button className={clsx(tab === 'contact' && 'active')} onClick={() => setTab('contact')}>
          Contact
        </button>
        <button className={clsx(tab === 'ai_state' && 'active')} onClick={() => setTab('ai_state')}>
          AI State
        </button>
        <button className={clsx(tab === 'alerts' && 'active')} onClick={() => setTab('alerts')}>
          Alerts
        </button>
      </div>

      {tab === 'contact' && (
        <>
          <ContactInfoSection conversation={conversation} title="Contact Info" />
          <NotesSection conversationId={conversationId} title="Notes" />
        </>
      )}
      {tab === 'ai_state' && <AIStateSection conversation={conversation} />}
      {tab === 'alerts' && <AlertsSection conversation={conversation} />}
    </div>
  );
}

function AIStateSection({ conversation }: { conversation: Conversation }) {
  const signals = (conversation as any)?.aiSignals || {};
  const rows: Array<{ key: string; value?: string | number | null }> = [
    { key: 'Classification', value: conversation.aiClassification || '—' },
    { key: 'Lead Score', value: conversation.aiLeadScore ?? '—' },
    { key: 'Product', value: signals.product || '—' },
    { key: 'Industry', value: signals.industry || '—' },
    { key: 'Revenue', value: signals.revenue || '—' },
    { key: 'Urgency', value: signals.urgency || '—' },
    { key: 'Ask', value: signals.ask || '—' },
    { key: 'Last Classified', value: conversation.aiClassifiedAt ? format(new Date(conversation.aiClassifiedAt), 'MMM d, h:mm a') : '—' },
  ];

  return (
    <div className="inbox-sidebar-section contact-grid">
      {rows.map((row) => (
        <div key={row.key} className="inbox-contact-row">
          <div className="inbox-contact-key">{row.key}</div>
          <div className="inbox-contact-value">{String(row.value ?? '—')}</div>
        </div>
      ))}
    </div>
  );
}

function AlertsSection({ conversation }: { conversation: Conversation }) {
  const nextFollow = conversation.nextFollowupAt ? new Date(conversation.nextFollowupAt) : null;
  const isOverdue = !!nextFollow && nextFollow.getTime() < Date.now();

  return (
    <div className="inbox-sidebar-section">
      <div className="inbox-activity-list">
        <div className={clsx('inbox-activity-item', isOverdue && 'tone-warning')}>
          <div className="inbox-activity-text">
            {nextFollow
              ? isOverdue
                ? 'Follow-up overdue. Prioritize this conversation now.'
                : 'Follow-up scheduled.'
              : 'No follow-up alert set.'}
          </div>
          <div className="inbox-activity-time">
            {nextFollow ? format(nextFollow, 'MMM d, h:mm a') : '—'}
          </div>
        </div>
        <div className="inbox-activity-item">
          <div className="inbox-activity-text">
            {conversation.aiClassification === 'HOT'
              ? 'HOT lead detected. Keep response time tight.'
              : 'No HOT alert active for this thread.'}
          </div>
          <div className="inbox-activity-time">{conversation.aiClassification || '—'}</div>
        </div>
      </div>
    </div>
  );
}

function ContactInfoSection({ conversation, title: _title }: { conversation: Conversation; title?: string }) {
  // Структура 1:1 с прототипом scl-inbox-v11.html: 3 раздела (CONTACT INFO / DEAL INFO / REP PERFORMANCE)
  const info = conversation.contactInfo || {};
  const signals = (conversation.aiSignals || {}) as Record<string, unknown>;
  const extractedRevenue = (conversation as unknown as { extractedRevenue?: number | null }).extractedRevenue;
  const extractedAsk = (conversation as unknown as { extractedAsk?: string | null }).extractedAsk;
  const extractedIndustry = (conversation as unknown as { extractedIndustry?: string | null }).extractedIndustry;
  const helocFit = (conversation as unknown as { helocFitFlag?: boolean | null }).helocFitFlag;
  const repStats = (conversation as unknown as {
    repStats?: { avgFirstResponseSec: number | null; aiUsageRatePct: number | null; aiConversionsCount: number };
  }).repStats;

  const formatRevenue = (val: number | null | undefined): string => {
    if (val == null) return '—';
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 2)}M`;
    if (val >= 1_000) return `$${Math.round(val / 1_000)}k`;
    return `$${val}`;
  };

  // M/SS если <1ч; H:MM если меньше суток; иначе Xd
  const formatResponseTime = (sec: number): string => {
    if (sec < 3600) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    if (sec < 24 * 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return `${h}h ${m}m`;
    }
    return `${Math.floor(sec / 86400)}d`;
  };

  const contactRows: Array<{ key: string; value?: string | null; gold?: boolean }> = [
    { key: 'Email', value: info.email || conversation.lead?.email || '' },
    { key: 'Phone', value: info.phone || conversation.lead?.phone || '' },
    { key: 'Company', value: info.company || conversation.lead?.company || '' },
    { key: 'Source', value: info.source || conversation.lead?.source || '' },
    { key: 'Assigned Rep', value: info.assignedRep || conversation.statusStrip?.assignedRep || '', gold: true },
  ];

  // ROUTING — показываем если есть assignedRep, format "⚡ Auto → INITIALS"
  const repName = (info.assignedRep || conversation.statusStrip?.assignedRep || '').trim();
  const repInitials = repName
    ? repName
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '';
  const routingValue = repInitials ? `⚡ Auto → ${repInitials}` : '';

  const dealRows: Array<{ key: string; value?: string | null; tone?: 'hot' | 'gold' }> = [
    { key: 'Product', value: (signals.product as string) || info.product || '' },
    { key: 'Ask', value: extractedAsk || (signals.ask as string) || '' },
    { key: 'Revenue', value: extractedRevenue != null ? formatRevenue(extractedRevenue) : ((signals.revenue as string) || '') },
    { key: 'Industry', value: extractedIndustry || (signals.industry as string) || '' },
    { key: 'HELOC Fit', value: helocFit == null ? '' : helocFit ? '✓ Yes' : '— No' },
    {
      key: 'AI Status',
      value: conversation.aiClassification
        ? conversation.aiClassification === 'HOT'
          ? '🔥 HOT'
          : conversation.aiClassification === 'WARM'
            ? '🌡 WARM'
            : '🌱 NURTURE'
        : '',
      tone: conversation.aiClassification === 'HOT' ? 'hot' : undefined,
    },
  ];

  const hasDealData = dealRows.some((r) => r.value);

  return (
    <>
      <div className="inbox-sidebar-section contact-grid">
        <div className="inbox-sidebar-title">Contact Info</div>
        {contactRows.map((row) => (
          <div key={row.key} className="inbox-contact-row">
            <div className="inbox-contact-key">{row.key}</div>
            <div className={clsx('inbox-contact-value', row.gold && 'value-gold')}>{row.value || '—'}</div>
          </div>
        ))}
      </div>

      {hasDealData ? (
        <div className="inbox-sidebar-section contact-grid">
          <div className="inbox-sidebar-title">Deal Info</div>
          {dealRows.map((row) => (
            <div key={row.key} className="inbox-contact-row">
              <div className="inbox-contact-key">{row.key}</div>
              <div className={clsx('inbox-contact-value', row.tone === 'hot' && 'value-hot')}>{row.value || '—'}</div>
            </div>
          ))}
          {routingValue ? (
            <div className="inbox-contact-row">
              <div className="inbox-contact-key">Routing</div>
              <div className="inbox-contact-value value-gold">{routingValue}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {repName ? (
        <div className="inbox-sidebar-section rep-perf-section">
          <div className="inbox-sidebar-title">REP PERFORMANCE · {repInitials}</div>
          <div className="rep-perf-grid">
            <div className="rep-perf-row">
              <span className="rep-perf-label">AVG 1ST RESPONSE</span>
              <span className={clsx('rep-perf-value', repStats?.avgFirstResponseSec == null && 'muted')}>
                {repStats?.avgFirstResponseSec != null ? formatResponseTime(repStats.avgFirstResponseSec) : '—'}
              </span>
            </div>
            <div className="rep-perf-row">
              <span className="rep-perf-label">AI USAGE RATE</span>
              <span className={clsx('rep-perf-value', repStats?.aiUsageRatePct == null && 'muted')}>
                {repStats?.aiUsageRatePct != null ? `${repStats.aiUsageRatePct}%` : '—'}
              </span>
            </div>
            <div className="rep-perf-row">
              <span className="rep-perf-label">AI CONVERSIONS</span>
              <span className={clsx('rep-perf-value', !repStats?.aiConversionsCount && 'muted')}>
                {repStats?.aiConversionsCount ? `${repStats.aiConversionsCount} pipeline adds` : '—'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ActivitySection({ activity }: { activity: ConversationActivity[] }) {
  if (!activity || activity.length === 0) {
    return (
      <div className="inbox-sidebar-section">
        <div className="inbox-empty-sub">No activity yet</div>
      </div>
    );
  }

  return (
    <div className="inbox-sidebar-section">
      <div className="inbox-activity-list">
        {activity.map((evt) => (
          <div key={evt.id} className={clsx('inbox-activity-item', evt.tone && `tone-${evt.tone}`)}>
            <div className="inbox-activity-text">{evt.text}</div>
            <div className="inbox-activity-time">{format(new Date(evt.at), 'MMM d, h:mm a')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesSection({ conversationId, title }: { conversationId: string; title?: string }) {
  const [noteText, setNoteText] = useState('');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notes', conversationId],
    queryFn: async () => {
      const { data } = await inboxApi.listNotes(conversationId);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: string) => inboxApi.createNote(conversationId, body),
    onSuccess: () => {
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['notes', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
    onError: () => toast.error('Failed to add note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => inboxApi.deleteNote(conversationId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });

  const notes: ConversationNote[] = data?.notes || [];

  return (
    <div className="inbox-sidebar-section">
      {title ? <div className="inbox-sidebar-title">{title}</div> : null}
      {notes.map((note) => (
        <div key={note.id} className="inbox-note-item">
          <div className="inbox-note-meta-top">
            <span className="inbox-note-author">
              {note.authorInitials || '??'}
              {note.authorRole === 'ADMIN' ? ' (admin)' : ''}
            </span>
            <span className="inbox-note-time">
              {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
            </span>
            <button
              className="inbox-tool-btn"
              onClick={() => deleteMutation.mutate(note.id)}
              title="Delete note"
            >
              <X size={11} />
            </button>
          </div>
          <div className="inbox-note-body">{note.body}</div>
        </div>
      ))}
      <textarea
        className="inbox-note-input"
        placeholder="Add a note..."
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
      />
      <button
        className="inbox-add-note-btn"
        style={{ width: '100%', marginTop: 6, justifyContent: 'center' }}
        disabled={!noteText.trim()}
        onClick={() => createMutation.mutate(noteText.trim())}
      >
        <Plus size={12} /> Add Note
      </button>
      <div className="inbox-notes-helper">
        AI reads all notes for context extraction (revenue, industry, objections). Notes are universal — admin and rep
        notes both feed the model.
      </div>
    </div>
  );
}

function TemplateModal({
  scope,
  canCreateGlobal,
  onScopeChange,
  onSelect,
  onClose,
}: {
  scope: 'mine' | 'team' | 'global';
  canCreateGlobal: boolean;
  onScopeChange: (scope: 'mine' | 'team' | 'global') => void;
  onSelect: (template: SmsTemplate) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [category, setCategory] = useState<'all' | 'favs' | 'recent' | 'follow_up' | 'first_touch'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{ name: string; body: string; category: string }>({
    name: '',
    body: '',
    category: '',
  });
  const [draft, setDraft] = useState<{
    name: string;
    body: string;
    category: string;
    visibility: 'PRIVATE' | 'TEAM' | 'GLOBAL';
  }>({
    name: '',
    body: '',
    category: '',
    visibility: 'PRIVATE',
  });

  const defaultVisibility = useMemo<'PRIVATE' | 'TEAM' | 'GLOBAL'>(() => {
    if (scope === 'global' && canCreateGlobal) return 'GLOBAL';
    if (scope === 'team') return 'TEAM';
    return 'PRIVATE';
  }, [canCreateGlobal, scope]);

  const toggleCreate = () => {
    setShowCreate((prev) => {
      const next = !prev;
      if (next) {
        setDraft((current) => ({ ...current, visibility: defaultVisibility }));
      }
      return next;
    });
  };

  const createTemplateMutation = useMutation({
    mutationFn: (payload: { name: string; body: string; category?: string; visibility?: string }) =>
      inboxApi.createTemplate(payload),
    onSuccess: ({ data }) => {
      const created: SmsTemplate | undefined = data?.template;
      toast.success('Template created');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowCreate(false);
      setDraft({
        name: '',
        body: '',
        category: '',
        visibility: defaultVisibility,
      });
      if (created?.id) setSelectedId(created.id);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error || 'Failed to create template';
      toast.error(message);
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: (payload: { id: string; name: string; body: string; category?: string }) =>
      inboxApi.updateTemplate(payload.id, {
        name: payload.name,
        body: payload.body,
        category: payload.category || null,
      }),
    onSuccess: ({ data }) => {
      const updated: SmsTemplate | undefined = data?.template;
      toast.success('Template updated');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (updated?.id) setSelectedId(updated.id);
      setIsEditing(false);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error || 'Failed to update template';
      toast.error(message);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => inboxApi.deleteTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelectedId(null);
      setIsEditing(false);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error || 'Failed to delete template';
      toast.error(message);
    },
  });

  const { data } = useQuery({
    queryKey: ['templates', scope, debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string> = { scope };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await inboxApi.listTemplates(params);
      return data;
    },
  });

  const templates: SmsTemplate[] = data?.templates || [];

  const filteredTemplates = useMemo(() => {
    let list = [...templates];
    if (category === 'favs') list = list.filter((t) => t.isFavorite);
    if (category === 'recent') list = list.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 25);
    if (category === 'follow_up') list = list.filter((t) => (t.category || '').toLowerCase().includes('follow'));
    if (category === 'first_touch') list = list.filter((t) => (t.category || '').toLowerCase().includes('first'));
    return list;
  }, [category, templates]);

  const selectedTemplate = filteredTemplates.find((t) => t.id === selectedId) || filteredTemplates[0] || null;

  return (
    <div className="inbox-template-overlay" onClick={onClose}>
      <div className="inbox-template-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="inbox-template-header">
          <h3>SMS Templates</h3>
          <button className="inbox-tool-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="inbox-template-body-grid">
          <div className="inbox-template-left-pane">
            <div className="inbox-template-scope-tabs">
              <button
                className={clsx(scope === 'mine' && 'active')}
                onClick={() => {
                  setIsEditing(false);
                  onScopeChange('mine');
                }}
              >
                Mine
              </button>
              <button
                className={clsx(scope === 'team' && 'active')}
                onClick={() => {
                  setIsEditing(false);
                  onScopeChange('team');
                }}
              >
                Team
              </button>
              <button
                className={clsx(scope === 'global' && 'active')}
                onClick={() => {
                  setIsEditing(false);
                  onScopeChange('global');
                }}
              >
                Global
              </button>
            </div>

            <div className="inbox-template-toolbar">
              <button type="button" className="inbox-action-btn" onClick={toggleCreate}>
                <Plus size={12} /> {showCreate ? 'Close' : 'New Template'}
              </button>
            </div>

            {showCreate && (
              <div className="inbox-template-create">
                <input
                  type="text"
                  className="inbox-search-input"
                  placeholder="Template name"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  type="text"
                  className="inbox-search-input"
                  placeholder="Category (optional)"
                  value={draft.category}
                  onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                />
                <select
                  className="inbox-template-select"
                  value={draft.visibility}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      visibility: e.target.value as 'PRIVATE' | 'TEAM' | 'GLOBAL',
                    }))
                  }
                >
                  <option value="PRIVATE">PRIVATE</option>
                  <option value="TEAM">TEAM</option>
                  {canCreateGlobal ? <option value="GLOBAL">GLOBAL</option> : null}
                </select>
                <textarea
                  className="inbox-note-input"
                  rows={4}
                  placeholder="Template body..."
                  value={draft.body}
                  onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
                />
                <div className="inbox-template-create-actions">
                  <button
                    type="button"
                    disabled={!draft.name.trim() || !draft.body.trim() || createTemplateMutation.isPending}
                    onClick={() =>
                      createTemplateMutation.mutate({
                        name: draft.name.trim(),
                        body: draft.body.trim(),
                        category: draft.category.trim() || undefined,
                        visibility: draft.visibility,
                      })
                    }
                  >
                    Save Template
                  </button>
                </div>
              </div>
            )}

            <div className="inbox-search" style={{ marginBottom: 8 }}>
              <Search className="inbox-search-icon" />
              <input
                type="text"
                className="inbox-search-input"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="inbox-template-categories">
              <button className={clsx(category === 'all' && 'active')} onClick={() => setCategory('all')}>
                All
              </button>
              <button className={clsx(category === 'favs' && 'active')} onClick={() => setCategory('favs')}>
                Favs
              </button>
              <button className={clsx(category === 'recent' && 'active')} onClick={() => setCategory('recent')}>
                Recent
              </button>
              <button className={clsx(category === 'follow_up' && 'active')} onClick={() => setCategory('follow_up')}>
                Follow-Up
              </button>
              <button
                className={clsx(category === 'first_touch' && 'active')}
                onClick={() => setCategory('first_touch')}
              >
                First Touch
              </button>
            </div>

            <div className="inbox-template-list compact">
              {filteredTemplates.length === 0 && <div className="inbox-template-empty">No templates found</div>}
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  className={clsx('inbox-template-item compact', selectedTemplate?.id === t.id && 'selected')}
                  onClick={() => {
                    setSelectedId(t.id);
                    setIsEditing(false);
                  }}
                >
                  <div className="inbox-template-name">{t.name}</div>
                  <div className="inbox-template-meta-row">
                    <span>{t.visibility}</span>
                    <span>{t.category || 'General'}</span>
                    <span>Used {t.usageCount || 0}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="inbox-template-preview-pane">
            {selectedTemplate ? (
              <>
                <div className="inbox-template-preview-title">{isEditing ? editDraft.name : selectedTemplate.name}</div>
                <div className="inbox-template-preview-badges">
                  <span>{selectedTemplate.visibility}</span>
                  <span>{(isEditing ? editDraft.category : selectedTemplate.category) || 'General'}</span>
                  <span>{selectedTemplate.ownerName || 'Owner'}</span>
                </div>
                {isEditing ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input
                      type="text"
                      className="inbox-search-input"
                      placeholder="Template name"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="inbox-search-input"
                      placeholder="Category"
                      value={editDraft.category}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, category: e.target.value }))}
                    />
                    <textarea
                      className="inbox-note-input"
                      rows={8}
                      placeholder="Template body..."
                      value={editDraft.body}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, body: e.target.value }))}
                    />
                  </div>
                ) : (
                  <pre className="inbox-template-preview-body">{selectedTemplate.body}</pre>
                )}
                <div className="inbox-template-preview-meta">
                  <div>Used count: {selectedTemplate.usageCount || 0}</div>
                  <div>
                    Last used:{' '}
                    {selectedTemplate.lastUsedAt
                      ? format(new Date(selectedTemplate.lastUsedAt), 'MMM d, yyyy h:mm a')
                      : 'Never'}
                  </div>
                </div>
                <div className="inbox-template-preview-actions">
                  {!isEditing ? (
                    <>
                      <button type="button" className="inbox-action-btn" onClick={() => onSelect(selectedTemplate)}>
                        Insert Template
                      </button>
                      <button
                        type="button"
                        className="inbox-action-btn"
                        onClick={() => {
                          setIsEditing(true);
                          setEditDraft({
                            name: selectedTemplate.name || '',
                            body: selectedTemplate.body || '',
                            category: selectedTemplate.category || '',
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inbox-action-btn"
                        onClick={() => {
                          if (!window.confirm('Delete this template?')) return;
                          deleteTemplateMutation.mutate(selectedTemplate.id);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="inbox-action-btn"
                        disabled={!editDraft.name.trim() || !editDraft.body.trim() || updateTemplateMutation.isPending}
                        onClick={() =>
                          updateTemplateMutation.mutate({
                            id: selectedTemplate.id,
                            name: editDraft.name.trim(),
                            body: editDraft.body.trim(),
                            category: editDraft.category.trim() || undefined,
                          })
                        }
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        className="inbox-action-btn"
                        onClick={() => {
                          setIsEditing(false);
                          setEditDraft({
                            name: selectedTemplate.name || '',
                            body: selectedTemplate.body || '',
                            category: selectedTemplate.category || '',
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="inbox-template-empty">Select a template</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
