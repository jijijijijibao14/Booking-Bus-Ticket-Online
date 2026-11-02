import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import {
  getChatPartners,
  getConversationMessages,
  getConversations,
  openConversation,
  sendConversationMessage,
} from '@/api';
import {
  getUnreadConversationCount,
  isConversationUnread,
  markConversationRead,
} from '@/utils/chat-unread';
import UserAvatar from './UserAvatar';

interface Conversation {
  conversationId: number;
  conversationType: string;
  partnerId: number | null;
  customerId: number | null;
  customerName: string | null;
  partnerName: string | null;
  lastMessage: string | null;
  lastMessageId: number | null;
  lastMessageSenderRole: string | null;
}

interface ChatMessage {
  messageId: number;
  senderId: number;
  senderName: string;
  senderRole: string;
  messageText: string;
  createdAt: string;
}

interface ConversationInboxProps {
  role: 'Customer' | 'Partner' | 'Admin';
  onUnreadCountChange?: (count: number) => void;
  visible?: boolean;
  compact?: boolean;
}

export default function ConversationInbox({
  role,
  onUnreadCountChange,
  visible = true,
  compact = false,
}: ConversationInboxProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatPartners, setChatPartners] = useState<{ partnerId: number; brandName: string }[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadConversations = useCallback(async () => {
    const response = await getConversations();
    const data = response.data.data as Conversation[];
    const selectedConversation = data.find((conversation) => conversation.conversationId === selectedId);
    if (visible && selectedConversation?.lastMessageId) markConversationRead(selectedConversation, role);
    setConversations(data);
    onUnreadCountChange?.(getUnreadConversationCount(data, role));
    return data;
  }, [onUnreadCountChange, role, selectedId, visible]);

  useEffect(() => {
    if (role !== 'Customer') return;
    getChatPartners()
      .then((response) => setChatPartners(response.data.data))
      .catch((requestError) => {
        console.error('Could not load chat partner list:', requestError);
        setError(requestError.response?.data?.message || 'Không thể tải danh sách nhà xe.');
      });
  }, [role]);

  useEffect(() => {
    let mounted = true;
    const load = () => loadConversations()
      .catch((requestError) => {
        console.error('Could not load conversation inbox:', requestError);
        if (mounted) setError(requestError.response?.data?.message || 'Không thể tải tin nhắn.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    load();
    const refreshInterval = window.setInterval(load, 5000);
    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!visible && selectedId) {
      const selectedConversation = conversations.find((item) => item.conversationId === selectedId);
      if (compact || !selectedConversation?.lastMessageId) setSelectedId(null);
    }
  }, [compact, conversations, selectedId, visible]);

  useEffect(() => {
    if (!selectedId || !visible) {
      setMessages([]);
      return;
    }
    let mounted = true;
    const load = () => getConversationMessages(selectedId)
      .then((response) => {
        if (mounted) setMessages(response.data.data);
      })
      .catch((requestError) => {
        if (!mounted) return;
        console.error('Could not load thread messages:', requestError);
        setError(requestError.response?.data?.message || 'Không thể tải tin nhắn.');
      });
    load();
    const refreshInterval = window.setInterval(load, 5000);
    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [selectedId, visible]);

  const startConversation = async (type: 'support' | 'partner', partnerId?: number) => {
    try {
      setError('');
      const response = await openConversation({ type, partnerId });
      const id = Number(response.data.data.conversationId);
      const [conversationsResponse, messagesResponse] = await Promise.all([
        getConversations(),
        getConversationMessages(id),
      ]);
      const data = conversationsResponse.data.data as Conversation[];
      setConversations(data);
      setSelectedId(id);
      setMessages(messagesResponse.data.data);
      onUnreadCountChange?.(getUnreadConversationCount(data, role));
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không thể mở hội thoại.');
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!selectedId || !text) return;
    try {
      setError('');
      await sendConversationMessage(selectedId, text);
      setMessageText('');
      const response = await getConversationMessages(selectedId);
      setMessages(response.data.data);
      await loadConversations();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không gửi được tin nhắn.');
    }
  };

  const selectedConversation = conversations.find((item) => item.conversationId === selectedId);
  const visibleConversations = conversations.filter((conversation) =>
    Number(conversation.lastMessageId) > 0 || conversation.conversationId === selectedId,
  );
  const getConversationTitle = (conversation: Conversation) => {
    if (conversation.conversationType === 'CUSTOMER_SUPPORT' || conversation.conversationType === 'PARTNER_SUPPORT') {
      if (role === 'Customer' && conversation.conversationType === 'CUSTOMER_SUPPORT') return 'Hỗ trợ VIỆTGO';
      if (role === 'Partner' && conversation.conversationType === 'PARTNER_SUPPORT') return 'Hỗ trợ VIỆTGO';
    }
    if (role === 'Partner') return conversation.customerName;
    if (role === 'Customer') return conversation.partnerName;
    return conversation.conversationType === 'CUSTOMER_SUPPORT'
      ? conversation.customerName
      : conversation.partnerName;
  };
  const title = selectedConversation ? getConversationTitle(selectedConversation) : null;
  const isSupportConversation = (conversation: Conversation) =>
    getConversationTitle(conversation) === 'Hỗ trợ VIỆTGO';
  const getCounterpartId = (conversation: Conversation) => {
    if (role === 'Partner') return conversation.customerId;
    if (role === 'Customer') return conversation.partnerId;
    return conversation.conversationType === 'CUSTOMER_SUPPORT' ? conversation.customerId : conversation.partnerId;
  };

  return (
    <section
      hidden={!visible}
      className={compact
        ? 'flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl'
        : 'rounded-3xl border border-blue-100 bg-white shadow-sm'}
    >
      <header className={`flex flex-wrap items-center justify-between gap-2 border-b border-blue-50 ${compact ? 'p-3' : 'gap-3 p-5'}`}>
        <div>
          <h2 className={`${compact ? 'text-base' : 'text-xl'} font-bold text-slate-900`}>{role === 'Customer' ? 'Trung tâm trò chuyện' : 'Tin nhắn'}</h2>
          <p className={`${compact ? 'text-xs' : 'text-sm'} text-slate-500`}>
            {role === 'Admin'
              ? 'Hội thoại hỗ trợ cần phản hồi'
              : role === 'Customer'
                ? 'Hội thoại của bạn với nhà xe và VIỆTGO'
                : 'Trò chuyện với khách hàng và VIỆTGO'}
          </p>
        </div>
        {(role === 'Partner' || role === 'Customer') && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void startConversation('support')}
              className={`rounded-lg border border-blue-200 ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'} font-semibold text-blue-800 hover:bg-blue-50`}
            >
              Nhắn VIỆTGO
            </button>
            {role === 'Customer' && (
              <select
                aria-label="Chọn nhà xe để nhắn tin"
                defaultValue=""
                onChange={(event) => {
                  const partnerId = Number(event.target.value);
                  if (partnerId > 0) void startConversation('partner', partnerId);
                  event.target.value = '';
                }}
                className={`min-w-0 max-w-48 rounded-lg border border-blue-100 bg-white px-2 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'} text-blue-900`}
              >
                <option value="">Nhắn nhà xe</option>
                {chatPartners.map((partner) => (
                  <option key={partner.partnerId} value={partner.partnerId}>{partner.brandName}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </header>
      <div className={compact
        ? 'grid min-h-0 flex-1 grid-rows-1'
        : 'grid min-h-[460px] md:grid-cols-[minmax(0,2fr)_minmax(0,8fr)]'}>
        <aside className={`min-h-0 overflow-y-auto border-b border-blue-50 bg-slate-50/70 md:border-b-0 md:border-r ${
          compact
            ? selectedId ? 'hidden' : 'block'
            : selectedId ? 'hidden md:block' : 'block'
        }`}>
          {loading ? (
            <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-blue-700" />
          ) : visibleConversations.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">
              {role === 'Admin' ? 'Chưa có hội thoại cần phản hồi.' : 'Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện mới.'}
            </p>
          ) : (
            visibleConversations.map((conversation) => {
              const itemTitle = getConversationTitle(conversation);
              return (
                <button
                  key={conversation.conversationId}
                  type="button"
                  onClick={() => {
                    setError('');
                    setSelectedId(conversation.conversationId);
                    markConversationRead(conversation, role);
                    onUnreadCountChange?.(
                      getUnreadConversationCount(
                        conversations.filter((item) => item.conversationId !== conversation.conversationId),
                        role,
                      ),
                    );
                  }}
                  className={`m-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl border p-3 text-left transition ${
                    isConversationUnread(conversation, role)
                      ? 'border-blue-200 bg-blue-50/80 shadow-sm'
                      : selectedId === conversation.conversationId
                        ? 'border-blue-200 bg-white shadow-sm'
                        : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50'
                  }`}
                >
                  <UserAvatar
                    userId={isSupportConversation(conversation) ? null : getCounterpartId(conversation)}
                    name={itemTitle}
                    className={conversation.conversationType.includes('SUPPORT')
                      ? 'h-11 w-11 bg-violet-100 text-violet-700'
                      : 'h-11 w-11 bg-blue-100 text-blue-700'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className={`truncate text-sm ${isConversationUnread(conversation, role) ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
                        {itemTitle || 'Cuộc trò chuyện'}
                      </span>
                      {isConversationUnread(conversation, role) && (
                        <span className="shrink-0 rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                          Mới
                        </span>
                      )}
                    </span>
                    <span className={`mt-1 block truncate text-xs ${
                      isConversationUnread(conversation, role) ? 'font-medium text-slate-700' : 'text-slate-500'
                    }`}>
                      {conversation.lastMessage
                        ? `${conversation.lastMessageSenderRole === role ? 'Bạn: ' : ''}${conversation.lastMessage}`
                        : 'Bắt đầu trò chuyện'}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </aside>
        <div className={`min-h-0 flex-col ${
          compact
            ? selectedId ? 'flex' : 'hidden'
            : selectedId ? 'flex' : 'hidden md:flex'
        }`}>
          <div className={`flex min-w-0 items-center gap-2 border-b border-blue-50 ${compact ? 'px-3 py-2.5 text-sm' : 'px-5 py-4'} font-semibold text-slate-800`}>
            {selectedId && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setSelectedId(null);
                }}
                aria-label="Quay lại danh sách hội thoại"
                className={`shrink-0 rounded-full p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-800 ${compact ? '' : 'md:hidden'}`}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <span className="truncate">{title || 'Chọn hội thoại'}</span>
          </div>
          <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 ${compact ? 'p-3' : 'p-4'}`}>
            {messages.map((message) => {
              const ownMessage = message.senderRole === role;
              return (
                <div key={message.messageId} className={`flex items-end gap-2 ${ownMessage ? 'justify-end' : ''}`}>
                  {!ownMessage && (
                    <UserAvatar userId={message.senderId} name={message.senderName} className="h-8 w-8 bg-blue-100 text-xs text-blue-700" />
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${ownMessage ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 shadow-sm'}`}>
                    {!ownMessage && <p className="mb-1 text-xs font-semibold text-blue-700">{message.senderName}</p>}
                    <p className="whitespace-pre-wrap break-words">{message.messageText}</p>
                    <time className="mt-1 block text-right text-[10px] opacity-70">{new Date(message.createdAt).toLocaleString('vi-VN')}</time>
                  </div>
                </div>
              );
            })}
          </div>
          {error && <p role="alert" className="px-4 py-2 text-sm text-rose-600">{error}</p>}
          <form onSubmit={handleSend} className="flex gap-2 border-t border-blue-50 p-3">
            <input
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              maxLength={2000}
              disabled={!selectedId}
              placeholder="Trả lời tin nhắn..."
              className="min-w-0 flex-1 rounded-xl border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
            />
            <button type="submit" disabled={!selectedId || !messageText.trim()} aria-label="Gửi tin nhắn" className="rounded-xl bg-blue-700 px-3 text-white disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
