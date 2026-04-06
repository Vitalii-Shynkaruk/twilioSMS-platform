// © BuyReadySite.com — Phase 1: SMS Inbox Rebuild (3-panel layout)
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { inboxApi } from '../services/api';
import { Conversation, Message, SmsTemplate, ConversationNote } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import { SmsCounter } from '../components/SmsCounter';
import { useWebSocketStore } from '../stores/webSocketStore';
import {
  Search,
  Send,
  Clock,
  CheckCheck,
  AlertTriangle,
  MessageSquare,
  Phone,
  X,
  Flame,
  Mail,
  ThumbsUp,
  Ban,
  CalendarClock,
  FileText,
  UserPlus,
  Sparkles,
  ChevronLeft,
  Plus,
  Trash2,
  Star,
  Briefcase,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import '../styles/sms-inbox.css';

// ─── Типы фильтров ───
type InboxFilter = 'all' | 'unread' | 'hot' | 'interested' | 'dnc' | 'email_rcv' | 'followup';

const FILTERS: Array<{ id: InboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'hot', label: 'Hot' },
  { id: 'interested', label: 'Interested' },
  { id: 'dnc', label: 'DNC' },
  { id: 'email_rcv', label: 'Email Rcv' },
  { id: 'followup', label: 'Follow-up' },
];

// ─── Утилита: бейджи разговора ───
function getConvBadges(conv: Conversation) {
  const badges: Array<{ label: string; cls: string }> = [];
  if (conv.hotLead) badges.push({ label: 'HOT', cls: 'inbox-badge-hot' });
  if (conv.leadStatus === 'Interested') badges.push({ label: 'INTERESTED', cls: 'inbox-badge-interested' });
  if (conv.leadStatus === 'DNC') badges.push({ label: 'DNC', cls: 'inbox-badge-dnc' });
  if (conv.emailReceived) badges.push({ label: 'EMAIL', cls: 'inbox-badge-email' });
  if (conv.nextFollowupAt) badges.push({ label: 'F/U', cls: 'inbox-badge-followup' });
  return badges;
}

// ============================================
// ГЛАВНЫЙ КОМПОНЕНТ
// ============================================
export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const wsConnected = useWebSocketStore((s) => s.connected);
  const socket = useWebSocketStore((s) => s.socket);
  const [searchParams, setSearchParams] = useSearchParams();

  // Lead query param
  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (leadId) {
      inboxApi
        .getOrCreateByLead(leadId)
        .then(({ data }) => {
          if (data.conversation) {
            setSelectedId(data.conversation.id);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
          }
        })
        .catch(() => {});
      setSearchParams({}, { replace: true });
    }
  }, []);

  // Join conversation channel
  useEffect(() => {
    if (socket && selectedId) {
      socket.emit('join:conversation', selectedId);
    }
  }, [socket, selectedId]);

  // Reset page on filter/search change
  const handleFilterChange = useCallback((f: InboxFilter) => {
    setFilter(f);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
  }, []);

  // Маппинг фильтра Phase 1 → серверный
  const serverFilter = useMemo(() => {
    switch (filter) {
      case 'all':
        return 'all';
      case 'unread':
        return 'unread';
      case 'interested':
        return 'interested';
      case 'dnc':
        return 'dnc';
      default:
        return 'all'; // hot, email_rcv, followup — клиентская фильтрация
    }
  }, [filter]);

  // Загружаем разговоры
  const { data: convData, isLoading } = useQuery({
    queryKey: ['conversations', debouncedSearch, serverFilter, page],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: '50',
        withFilterCounts: 'true',
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (serverFilter !== 'all') params.filter = serverFilter;
      if (serverFilter === 'unread') params.unreadOnly = 'true';
      const { data } = await inboxApi.listConversations(params);
      return data;
    },
    refetchInterval: wsConnected ? false : 15000,
  });

  const totalPages = convData?.pagination?.pages || 1;
  const filterCounts = (convData?.filterCounts || {}) as Record<string, number>;

  // Клиентская фильтрация для Phase 1 полей
  const conversations = useMemo(() => {
    const list: Conversation[] = convData?.conversations || [];
    switch (filter) {
      case 'hot':
        return list.filter((c) => c.hotLead);
      case 'email_rcv':
        return list.filter((c) => c.emailReceived);
      case 'followup':
        return list.filter((c) => c.nextFollowupAt);
      default:
        return list;
    }
  }, [convData?.conversations, filter]);

  const handleBack = useCallback(() => setSelectedId(null), []);

  return (
    <div className={clsx('inbox-root', selectedId && 'has-selected')}>
      {/* ─── Левая панель: Список разговоров ─── */}
      <div className="inbox-left">
        <div className="inbox-left-header">
          <div className="inbox-search">
            <Search className="inbox-search-icon" />
            <input
              type="text"
              className="inbox-search-input"
              placeholder="Search..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Фильтры */}
        <div className="inbox-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={clsx('inbox-filter-btn', filter === f.id && 'active')}
              onClick={() => handleFilterChange(f.id)}
            >
              {f.label}
              {filterCounts[f.id] !== undefined && <span className="inbox-filter-count">{filterCounts[f.id]}</span>}
            </button>
          ))}
        </div>

        {/* Список */}
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

          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onClick={() => setSelectedId(conv.id)}
            />
          ))}
        </div>

        {/* Пагинация */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 12px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              Prev
            </button>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ─── Центральная панель: Тред ─── */}
      <div className="inbox-center">
        {selectedId ? (
          <MessageThread conversationId={selectedId} wsConnected={wsConnected} onBack={handleBack} />
        ) : (
          <div className="inbox-empty">
            <div className="inbox-empty-content">
              <MessageSquare className="inbox-empty-icon" />
              <p className="inbox-empty-text">Select a conversation</p>
              <p className="inbox-empty-sub">Choose from the list to view messages</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Правая панель: Сайдбар ─── */}
      {selectedId && <RightSidebar conversationId={selectedId} />}
    </div>
  );
}

// ============================================
// ЛЕВАЯ ПАНЕЛЬ: Элемент списка
// ============================================
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
  const badges = getConvBadges(conversation);

  return (
    <div
      className={clsx('inbox-conv-item', isSelected && 'selected', conversation.unreadCount > 0 && 'unread')}
      onClick={onClick}
    >
      <div className="inbox-avatar">
        {lead?.firstName?.[0]}
        {lead?.lastName?.[0] || ''}
        {conversation.unreadCount > 0 && <span className="inbox-avatar-badge">{conversation.unreadCount}</span>}
      </div>

      <div className="inbox-conv-info">
        <div className="inbox-conv-name">
          {lead?.firstName} {lead?.lastName || ''}
        </div>
        <div className="inbox-conv-preview">
          {lastMsg ? `${lastMsg.direction === 'OUTBOUND' ? 'You: ' : ''}${lastMsg.body}` : lead?.phone}
        </div>
        {badges.length > 0 && (
          <div className="inbox-conv-meta">
            {badges.map((b) => (
              <span key={b.label} className={clsx('inbox-badge', b.cls)}>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <span className="inbox-conv-time">
        {conversation.lastMessageAt
          ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
          : ''}
      </span>
    </div>
  );
}

// ============================================
// ЦЕНТРАЛЬНАЯ ПАНЕЛЬ: Тред сообщений
// ============================================
function MessageThread({
  conversationId,
  wsConnected,
  onBack,
}: {
  conversationId: string;
  wsConnected: boolean;
  onBack: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await inboxApi.getConversation(conversationId);
      return data;
    },
    refetchInterval: wsConnected ? false : 8000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => inboxApi.sendReply(conversationId, body),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error || 'Failed to send'),
  });

  const markReadMutation = useMutation({
    mutationFn: () => inboxApi.markRead(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  // Авто-скролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages]);

  // Авто-прочтение
  const unreadCount = data?.conversation?.unreadCount ?? 0;
  useEffect(() => {
    if (unreadCount > 0) {
      markReadMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, unreadCount]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    sendMutation.mutate(replyText.trim());
  };

  const handleAiDraft = async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post('/ai/draft-reply', { conversationId });
      setReplyText(data.draft);
      toast.success('AI draft generated');
    } catch {
      toast.error('AI not available');
    } finally {
      setAiLoading(false);
    }
  };

  const handleTemplateSelect = (template: SmsTemplate) => {
    // Вставляем текст шаблона в compose (не отправляем)
    setReplyText((prev) => prev + (prev ? '\n' : '') + template.body);
    setShowTemplates(false);
    // Логируем использование
    inboxApi.logTemplateUsage(template.id, conversationId).catch(() => {});
  };

  const conversation = data?.conversation;
  const messages: Message[] = data?.messages || [];

  return (
    <>
      {/* Header */}
      <div className="inbox-thread-header">
        <div className="inbox-thread-info">
          <button
            onClick={onBack}
            className="inbox-tool-btn"
            style={{ display: 'none' }}
            // Показываем только на мобильных — CSS управляет видимостью
          >
            <ChevronLeft size={18} />
          </button>
          <div className="inbox-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
            {conversation?.lead?.firstName?.[0]}
            {conversation?.lead?.lastName?.[0] || ''}
          </div>
          <div>
            <div className="inbox-thread-name">
              {conversation?.lead?.firstName} {conversation?.lead?.lastName || ''}
            </div>
            <div className="inbox-thread-phone">
              <Phone size={10} />
              {conversation?.lead?.phone}
            </div>
          </div>
        </div>
      </div>

      {/* Сообщения */}
      <div className="inbox-messages">
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <div
              style={{
                width: 24,
                height: 24,
                border: '2px solid var(--accent-primary)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <div className="inbox-compose">
        {conversation?.lead?.optedOut ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#f87171',
              fontSize: 13,
              padding: 8,
            }}
          >
            <AlertTriangle size={16} />
            This lead has opted out. Cannot send messages.
          </div>
        ) : (
          <>
            <div className="inbox-compose-tools">
              <button className="inbox-tool-btn" title="Templates" onClick={() => setShowTemplates(true)}>
                <FileText size={16} />
              </button>
              <button className="inbox-tool-btn" title="AI Draft" onClick={handleAiDraft} disabled={aiLoading}>
                <Sparkles size={16} className={aiLoading ? 'animate-pulse' : ''} />
              </button>
              {replyText && <SmsCounter text={replyText} />}
            </div>
            <form onSubmit={handleSend} className="inbox-compose-form">
              <textarea
                className="inbox-compose-textarea"
                placeholder="Type your message..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                rows={1}
                aria-label="Reply message"
              />
              <button
                type="submit"
                className="inbox-compose-btn"
                disabled={!replyText.trim() || sendMutation.isPending}
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Template Modal */}
      {showTemplates && <TemplateModal onSelect={handleTemplateSelect} onClose={() => setShowTemplates(false)} />}
    </>
  );
}

// ============================================
// ПУЗЫРЬ СООБЩЕНИЯ
// ============================================
function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === 'OUTBOUND';

  return (
    <div className={clsx('inbox-msg', isOutbound ? 'outbound' : 'inbound')}>
      <p>{message.body}</p>
      <div className="inbox-msg-time">
        <span>
          {message.sentAt ? format(new Date(message.sentAt), 'h:mm a') : format(new Date(message.createdAt), 'h:mm a')}
        </span>
        {isOutbound && <MsgStatusIcon status={message.status} />}
      </div>
    </div>
  );
}

function MsgStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'DELIVERED':
      return <CheckCheck size={12} style={{ color: 'rgba(255,255,255,0.8)' }} />;
    case 'SENT':
      return <CheckCheck size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />;
    case 'FAILED':
    case 'UNDELIVERED':
    case 'BLOCKED':
      return <AlertTriangle size={12} style={{ color: '#fca5a5' }} />;
    case 'QUEUED':
    case 'SENDING':
      return <Clock size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />;
    default:
      return null;
  }
}

// ============================================
// ПРАВАЯ ПАНЕЛЬ: Сайдбар
// ============================================
function RightSidebar({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await inboxApi.getConversation(conversationId);
      return data;
    },
  });

  const conversation: Conversation | undefined = data?.conversation;
  const lead = conversation?.lead;

  // Статус мутации
  const statusMutation = useMutation({
    mutationFn: (updates: Parameters<typeof inboxApi.updateStatus>[1]) =>
      inboxApi.updateStatus(conversationId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  if (!conversation) return null;

  return (
    <div className="inbox-right">
      {/* Lead Info */}
      <div className="inbox-sidebar-section">
        <div className="inbox-lead-name">
          {lead?.firstName} {lead?.lastName || ''}
        </div>
        <div className="inbox-lead-phone">
          <Phone size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          {lead?.phone}
        </div>
        {lead?.company && (
          <div className="inbox-lead-company">
            <Briefcase size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {lead.company}
          </div>
        )}
        {conversation.assignedRep && (
          <div style={{ marginTop: 8 }}>
            <div className="inbox-assigned">
              <div className="inbox-assigned-avatar">{conversation.assignedRep.firstName?.[0]}</div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                  {conversation.assignedRep.firstName} {conversation.assignedRep.lastName}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Assigned Rep</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="inbox-sidebar-section">
        <div className="inbox-sidebar-title">Quick Actions</div>
        <div className="inbox-action-grid">
          <button
            className={clsx('inbox-action-btn', conversation.hotLead && 'active-hot')}
            onClick={() => statusMutation.mutate({ hotLead: !conversation.hotLead })}
          >
            <Flame size={13} /> Hot
          </button>
          <button
            className={clsx('inbox-action-btn', conversation.leadStatus === 'Interested' && 'active-interested')}
            onClick={() =>
              statusMutation.mutate({
                leadStatus: conversation.leadStatus === 'Interested' ? '' : 'Interested',
              })
            }
          >
            <ThumbsUp size={13} /> Interested
          </button>
          <button
            className={clsx('inbox-action-btn', conversation.leadStatus === 'DNC' && 'active-dnc')}
            onClick={() =>
              statusMutation.mutate({
                leadStatus: conversation.leadStatus === 'DNC' ? '' : 'DNC',
              })
            }
          >
            <Ban size={13} /> DNC
          </button>
          <button
            className={clsx('inbox-action-btn', conversation.emailReceived && 'active-email')}
            onClick={() => statusMutation.mutate({ emailReceived: !conversation.emailReceived })}
          >
            <Mail size={13} /> Email Rcv
          </button>
        </div>
      </div>

      {/* Follow-up */}
      <div className="inbox-sidebar-section">
        <div className="inbox-sidebar-title">Follow-up</div>
        <FollowUpPicker
          key={`${conversationId}-${conversation.nextFollowupAt}`}
          conversationId={conversationId}
          currentDate={conversation.nextFollowupAt || null}
        />
      </div>

      {/* Notes */}
      <div className="inbox-sidebar-section">
        <div className="inbox-sidebar-title">Notes</div>
        <NotesSection conversationId={conversationId} />
      </div>

      {/* Assign Rep */}
      <div className="inbox-sidebar-section">
        <div className="inbox-sidebar-title">Assign Rep</div>
        <AssignRepSection conversationId={conversationId} currentRepId={conversation.assignedRepId} />
      </div>
    </div>
  );
}

// ============================================
// FOLLOW-UP PICKER
// ============================================
function FollowUpPicker({ conversationId, currentDate }: { conversationId: string; currentDate: string | null }) {
  const queryClient = useQueryClient();
  const computedDate = currentDate ? new Date(currentDate).toISOString().slice(0, 16) : '';
  const [dateValue, setDateValue] = useState(computedDate);

  const mutation = useMutation({
    mutationFn: (val: string | null) =>
      inboxApi.updateStatus(conversationId, {
        nextFollowupAt: val ? new Date(val).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(dateValue ? 'Follow-up set' : 'Follow-up cleared');
    },
  });

  return (
    <div className="inbox-followup-picker">
      <CalendarClock size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        type="datetime-local"
        className="inbox-followup-input"
        value={dateValue}
        onChange={(e) => {
          setDateValue(e.target.value);
          if (e.target.value) {
            mutation.mutate(e.target.value);
          }
        }}
        style={{ flex: 1 }}
      />
      {currentDate && (
        <button
          className="inbox-tool-btn"
          onClick={() => {
            setDateValue('');
            mutation.mutate(null);
          }}
          title="Clear follow-up"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ============================================
// NOTES SECTION
// ============================================
function NotesSection({ conversationId }: { conversationId: string }) {
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
    },
    onError: () => toast.error('Failed to add note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => inboxApi.deleteNote(conversationId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', conversationId] });
    },
  });

  const notes: ConversationNote[] = data?.notes || [];

  return (
    <div>
      {notes.map((note) => (
        <div key={note.id} className="inbox-note-item">
          <div className="inbox-note-body">{note.body}</div>
          <div className="inbox-note-meta">
            <span>{format(new Date(note.createdAt), 'MMM d, h:mm a')}</span>
            <button
              className="inbox-tool-btn"
              onClick={() => deleteMutation.mutate(note.id)}
              title="Delete note"
              style={{ padding: 2 }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      ))}
      <textarea
        className="inbox-note-input"
        placeholder="Add a note..."
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
      />
      <button
        className="inbox-action-btn"
        style={{ width: '100%', marginTop: 6, justifyContent: 'center' }}
        disabled={!noteText.trim()}
        onClick={() => createMutation.mutate(noteText.trim())}
      >
        <Plus size={12} /> Add Note
      </button>
    </div>
  );
}

// ============================================
// ASSIGN REP
// ============================================
function AssignRepSection({ conversationId, currentRepId }: { conversationId: string; currentRepId?: string }) {
  const [showPicker, setShowPicker] = useState(false);
  const queryClient = useQueryClient();

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
    enabled: showPicker,
  });

  const mutation = useMutation({
    mutationFn: (repId: string) => inboxApi.assignRep(conversationId, repId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Rep assigned');
      setShowPicker(false);
    },
  });

  return (
    <div>
      <button className="inbox-action-btn" style={{ width: '100%' }} onClick={() => setShowPicker(!showPicker)}>
        <UserPlus size={13} /> {showPicker ? 'Cancel' : 'Change Rep'}
      </button>
      {showPicker && (
        <div style={{ marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
          {(usersData?.users || []).map((user: { id: string; name?: string; email?: string }) => (
            <button
              key={user.id}
              onClick={() => mutation.mutate(user.id)}
              className="inbox-action-btn"
              style={{
                width: '100%',
                marginBottom: 4,
                justifyContent: 'flex-start',
                ...(user.id === currentRepId
                  ? { borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }
                  : {}),
              }}
            >
              <div className="inbox-assigned-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>
                {user.name?.[0] || user.email?.[0] || '?'}
              </div>
              <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name || user.email}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// TEMPLATE MODAL
// ============================================
function TemplateModal({ onSelect, onClose }: { onSelect: (t: SmsTemplate) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);

  const { data } = useQuery({
    queryKey: ['templates', debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await inboxApi.listTemplates(params);
      return data;
    },
  });

  const toggleFavMutation = useMutation({
    mutationFn: (id: string) => inboxApi.toggleFavorite(id),
  });

  // Сортируем: favorites first
  const sorted = useMemo(() => {
    const list: SmsTemplate[] = data?.templates || [];
    return [...list].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (b.usageCount || 0) - (a.usageCount || 0);
    });
  }, [data?.templates]);

  return (
    <div className="inbox-template-overlay" onClick={onClose}>
      <div className="inbox-template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inbox-template-header">
          <h3>SMS Templates</h3>
          <button className="inbox-tool-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="inbox-search">
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
        </div>

        <div className="inbox-template-list">
          {sorted.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              No templates found
            </div>
          )}
          {sorted.map((t) => (
            <div key={t.id} className="inbox-template-item" onClick={() => onSelect(t)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="inbox-template-name">{t.name}</div>
                <button
                  className="inbox-tool-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavMutation.mutate(t.id);
                  }}
                  style={{ padding: 2 }}
                >
                  <Star size={12} fill={t.isFavorite ? 'var(--accent-primary)' : 'none'} />
                </button>
              </div>
              <div className="inbox-template-body">{t.body}</div>
              {t.category && (
                <span
                  className="inbox-badge"
                  style={{ marginTop: 4, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                >
                  {t.category}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
