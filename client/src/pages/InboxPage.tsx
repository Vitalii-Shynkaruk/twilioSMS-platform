import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Conversation, Message } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import { SmsCounter } from '../components/SmsCounter';
import { useWebSocketStore, useWebSocketEvent } from '../stores/webSocketStore';
import {
  Search,
  Send,
  User,
  Clock,
  CheckCheck,
  AlertTriangle,
  MessageSquare,
  ChevronDown,
  Phone,
  Tag,
  MoreVertical,
  UserX,
  Archive,
  Bell,
  BellOff,
  X,
  Copy,
  ExternalLink,
  Ban,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [inboxPage, setInboxPage] = useState(1);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conv: Conversation } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const wsConnected = useWebSocketStore((s) => s.connected);
  const socket = useWebSocketStore((s) => s.socket);

  // Close inbox context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Join specific conversation channel when selected
  useEffect(() => {
    if (socket && selectedId) {
      socket.emit('join:conversation', selectedId);
    }
  }, [socket, selectedId]);

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations', debouncedSearch, showUnreadOnly, inboxPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', inboxPage.toString());
      params.set('limit', '50');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showUnreadOnly) params.set('unreadOnly', 'true');
      const { data } = await api.get(`/inbox?${params}`);
      return data;
    },
    refetchInterval: wsConnected ? false : 15000, // Only poll when WebSocket disconnected
  });

  const conversations: Conversation[] = conversationsData?.conversations || [];
  const inboxTotalPages = conversationsData?.pagination?.pages || 1;

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation List */}
      <div className="w-[380px] flex flex-col border-r border-dark-700/50" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Search Header */}
        <div className="p-4 border-b border-dark-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-dark-50">Inbox</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                className={clsx(
                  'badge cursor-pointer',
                  showUnreadOnly ? 'bg-scl-600/30 text-scl-300' : 'bg-dark-700 text-dark-400'
                )}
              >
                Unread
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="input pl-10 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex gap-3 p-3">
                  <div className="w-10 h-10 bg-dark-700 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-dark-700 rounded w-2/3" />
                    <div className="h-3 bg-dark-700 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {conversations.length === 0 && !isLoading && (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-dark-800/80 flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-7 h-7 text-dark-500" />
              </div>
              <p className="text-sm font-medium text-dark-300">No conversations yet</p>
              <p className="text-xs text-dark-500 mt-1.5">Conversations appear here when leads are contacted via campaigns or direct messages</p>
            </div>
          )}
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onClick={() => setSelectedId(conv.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, conv });
              }}
            />
          ))}
        </div>

        {/* Inbox Pagination */}
        {inboxTotalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-dark-700/50">
            <button
              onClick={() => setInboxPage(p => Math.max(1, p - 1))}
              disabled={inboxPage <= 1}
              className="text-xs text-dark-400 hover:text-dark-200 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-[10px] text-dark-500">{inboxPage}/{inboxTotalPages}</span>
            <button
              onClick={() => setInboxPage(p => Math.min(inboxTotalPages, p + 1))}
              disabled={inboxPage >= inboxTotalPages}
              className="text-xs text-dark-400 hover:text-dark-200 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Inbox Context Menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-[100] w-52 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button onClick={() => { setSelectedId(ctxMenu.conv.id); setCtxMenu(null); }} className="ctx-menu-item">
            <MessageSquare className="w-3.5 h-3.5" /> Open Thread
          </button>
          <button onClick={() => { navigator.clipboard.writeText(ctxMenu.conv.lead?.phone || ''); toast.success('Phone copied'); setCtxMenu(null); }} className="ctx-menu-item">
            <Copy className="w-3.5 h-3.5" /> Copy Phone
          </button>
          <button onClick={() => { window.open(`/leads?id=${ctxMenu.conv.leadId}`, '_self'); setCtxMenu(null); }} className="ctx-menu-item">
            <ExternalLink className="w-3.5 h-3.5" /> View Lead
          </button>
        </div>
      )}

      {/* Message Thread */}
      <div className="flex-1 flex flex-col bg-dark-950" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {selectedId ? (
          <MessageThread conversationId={selectedId} wsConnected={wsConnected} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-14 h-14 mx-auto text-dark-700 mb-4" />
              <p className="text-dark-400 font-medium">Select a conversation</p>
              <p className="text-sm text-dark-600 mt-1">Choose a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
  onContextMenu,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const lead = conversation.lead;
  const lastMessage = conversation.messages?.[0];

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={clsx(
        'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-dark-800/50 transition-colors border-b border-dark-800/30',
        isSelected && 'bg-dark-800/70 border-l-2 border-l-scl-500'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-scl-600/20 flex items-center justify-center text-scl-400 text-sm font-semibold">
          {lead?.firstName?.[0]}{lead?.lastName?.[0] || ''}
        </div>
        {conversation.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-scl-500 text-white text-[10px] font-bold flex items-center justify-center">
            {conversation.unreadCount}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className={clsx(
            'text-sm truncate',
            conversation.unreadCount > 0 ? 'font-semibold text-dark-100' : 'font-medium text-dark-300'
          )}>
            {lead?.firstName} {lead?.lastName || ''}
          </p>
          <span className="text-[10px] text-dark-500 shrink-0 ml-2">
            {conversation.lastMessageAt
              ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
              : ''}
          </span>
        </div>
        <p className="text-xs text-dark-500 truncate mt-0.5">
          {lastMessage
            ? `${lastMessage.direction === 'OUTBOUND' ? 'You: ' : ''}${lastMessage.body}`
            : lead?.phone}
        </p>
        {/* Tags */}
        {lead?.tags && lead.tags.length > 0 && (
          <div className="flex gap-1 mt-1.5">
            {lead.tags.slice(0, 2).map((lt) => (
              <span
                key={lt.tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: lt.tag.color + '33', color: lt.tag.color }}
              >
                {lt.tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function MessageThread({ conversationId, wsConnected }: { conversationId: string; wsConnected: boolean }) {
  const [replyText, setReplyText] = useState('');
  const [showThreadMenu, setShowThreadMenu] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const threadMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close thread menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (threadMenuRef.current && !threadMenuRef.current.contains(e.target as Node)) {
        setShowThreadMenu(false);
      }
    };
    if (showThreadMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showThreadMenu]);

  const { data, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await api.get(`/inbox/${conversationId}`);
      return data;
    },
    refetchInterval: wsConnected ? false : 8000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.post(`/inbox/${conversationId}/reply`, { body }),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send'),
  });

  const markReadMutation = useMutation({
    mutationFn: () => api.post(`/inbox/${conversationId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/leads/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      toast.success('Lead status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
    enabled: showReassign,
  });

  const assignMutation = useMutation({
    mutationFn: (repId: string) => api.put(`/inbox/${conversationId}/assign`, { repId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversation reassigned');
      setShowReassign(false);
      setShowThreadMenu(false);
    },
    onError: () => toast.error('Failed to reassign'),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages]);

  // Auto mark as read when opened
  useEffect(() => {
    if (data?.conversation?.unreadCount > 0) {
      markReadMutation.mutate();
    }
  }, [conversationId, data?.conversation?.unreadCount]);

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
      toast.error('AI not available — check OpenAI settings');
    } finally {
      setAiLoading(false);
    }
  };

  const conversation = data?.conversation;
  const messages: Message[] = data?.messages || [];

  return (
    <>
      {/* Thread Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-dark-700/50" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-scl-600/20 flex items-center justify-center text-scl-400 text-sm font-semibold">
            {conversation?.lead?.firstName?.[0]}{conversation?.lead?.lastName?.[0] || ''}
          </div>
          <div>
            <p className="text-sm font-semibold text-dark-100">
              {conversation?.lead?.firstName} {conversation?.lead?.lastName || ''}
            </p>
            <p className="text-xs text-dark-500 flex items-center gap-1.5">
              <Phone className="w-3 h-3" />
              {conversation?.lead?.phone}
              {conversation?.lead?.status && (
                <span className="ml-2 badge-info text-[10px]">{conversation.lead.status}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowThreadMenu(!showThreadMenu)}
              className="btn-ghost p-2"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showThreadMenu && (
              <div
                ref={threadMenuRef}
                className="absolute right-0 top-full mt-1 w-52 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1"
              >
                <button
                  onClick={() => {
                    setShowThreadMenu(false);
                    markReadMutation.mutate();
                    toast.success('Marked as read');
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                >
                  <Bell className="w-3.5 h-3.5" /> Mark as Read
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowReassign(!showReassign)}
                    className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Reassign
                  </button>
                  {showReassign && (
                    <div className="absolute left-full top-0 ml-1 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1">
                      <p className="px-3 py-1.5 text-[10px] text-dark-500 font-medium uppercase tracking-wider">Assign to Rep</p>
                      {(usersData?.users || []).map((user: any) => (
                        <button
                          key={user.id}
                          onClick={() => assignMutation.mutate(user.id)}
                          className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                        >
                          <div className="w-5 h-5 rounded-full bg-scl-600/20 flex items-center justify-center text-[10px] text-scl-400 font-bold">
                            {user.name?.[0] || user.email?.[0] || '?'}
                          </div>
                          <span className="truncate">{user.name || user.email}</span>
                        </button>
                      ))}
                      {(!usersData?.users || usersData.users.length === 0) && (
                        <p className="px-3 py-2 text-xs text-dark-500">Loading users...</p>
                      )}
                    </div>
                  )}
                </div>
                {conversation?.lead && (
                  <>
                    <button
                      onClick={() => {
                        setShowThreadMenu(false);
                        statusMutation.mutate({ id: conversation.lead.id, status: 'INTERESTED' });
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                    >
                      <User className="w-3.5 h-3.5" /> Mark Interested
                    </button>
                    <button
                      onClick={() => {
                        setShowThreadMenu(false);
                        statusMutation.mutate({ id: conversation.lead.id, status: 'NOT_INTERESTED' });
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                    >
                      <UserX className="w-3.5 h-3.5" /> Mark Not Interested
                    </button>
                    <div className="border-t border-dark-700 my-1" />
                    <button
                      onClick={() => {
                        setShowThreadMenu(false);
                        statusMutation.mutate({ id: conversation.lead.id, status: 'DNC' });
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-700/50 flex items-center gap-2"
                    >
                      <X className="w-3.5 h-3.5" /> Mark DNC
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-6 h-6 border-2 border-scl-500 border-t-transparent rounded-full" />
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input */}
      <div className="border-t border-dark-700/50 p-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {conversation?.lead?.optedOut ? (
          <div className="flex items-center justify-center gap-2 text-sm text-red-400 py-2">
            <AlertTriangle className="w-4 h-4" />
            This lead has opted out. Cannot send messages.
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleAiDraft}
              disabled={aiLoading}
              className="btn-ghost px-3 py-2.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
              title="AI Draft Reply"
            >
              <Sparkles className={clsx('w-4 h-4', aiLoading && 'animate-pulse')} />
            </button>
            <textarea
              className="input flex-1 min-h-[44px] max-h-[120px] resize-none py-2.5"
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
            {replyText.length > 0 && (
              <SmsCounter text={replyText} className="absolute -top-5 right-14" />
            )}
            <button
              type="submit"
              disabled={!replyText.trim() || sendMutation.isPending}
              className="btn-primary px-4 py-2.5"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === 'OUTBOUND';

  return (
    <div className={clsx('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[70%] rounded-2xl px-4 py-2.5',
          isOutbound
            ? 'bg-scl-600 text-white rounded-br-md'
            : 'bg-dark-800 text-dark-200 rounded-bl-md border border-dark-700/50'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
        <div
          className={clsx(
            'flex items-center gap-1.5 mt-1',
            isOutbound ? 'justify-end' : 'justify-start'
          )}
        >
          <span className={clsx(
            'text-[10px]',
            isOutbound ? 'text-scl-200/70' : 'text-dark-500'
          )}>
            {message.sentAt
              ? format(new Date(message.sentAt), 'h:mm a')
              : format(new Date(message.createdAt), 'h:mm a')}
          </span>
          {isOutbound && <MessageStatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function MessageStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'DELIVERED':
      return <CheckCheck className="w-3.5 h-3.5 text-scl-200" />;
    case 'SENT':
      return <CheckCheck className="w-3.5 h-3.5 text-scl-200/50" />;
    case 'FAILED':
    case 'UNDELIVERED':
    case 'BLOCKED':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-300" />;
    case 'QUEUED':
    case 'SENDING':
      return <Clock className="w-3.5 h-3.5 text-scl-200/50" />;
    default:
      return null;
  }
}
