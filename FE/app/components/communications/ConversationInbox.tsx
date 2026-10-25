import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import {
  getConversationMessages,
  getConversations,
  openConversation,
  sendConversationMessage,
} from '@/api';

interface Conversation {
  conversationId: number;
  conversationType: string;
  customerName: string | null;
  partnerName: string | null;
  lastMessage: string | null;
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
  role: 'Partner' | 'Admin';
}

export default function ConversationInbox({ role }: ConversationInboxProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadConversations = useCallback(async () => {
    const response = await getConversations();
    setConversations(response.data.data);
    return response.data.data as Conversation[];
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => getConversations()
      .then((response) => {
        if (!mounted) return;
        const data = response.data.data as Conversation[];
        setConversations(data);
        setSelectedId((currentId) => currentId ?? data[0]?.conversationId ?? null);
      })
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
  }, []);

  useEffect(() => {
    if (!selectedId) {
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
  }, [selectedId]);

  const startSupportConversation = async () => {
    try {
      setError('');
      const response = await openConversation({ type: 'support' });
      const data = await loadConversations();
      const id = Number(response.data.data.conversationId);
      setSelectedId(id);
      if (!data.some((conversation) => conversation.conversationId === id)) {
        await loadConversations();
      }
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không thể mở hội thoại hỗ trợ.');
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
  const title = role === 'Partner'
    ? selectedConversation?.conversationType === 'PARTNER_SUPPORT' ? 'Hỗ trợ VIỆTGO' : selectedConversation?.customerName
    : selectedConversation?.conversationType === 'CUSTOMER_SUPPORT' ? selectedConversation?.customerName : selectedConversation?.partnerName;

  return (
    <section className="rounded-3xl border border-blue-100 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-50 p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tin nhắn</h2>
          <p className="text-sm text-slate-500">{role === 'Admin' ? 'Hội thoại hỗ trợ cần phản hồi' : 'Trò chuyện với khách hàng và VIỆTGO'}</p>
        </div>
        {role === 'Partner' && (
          <button type="button" onClick={startSupportConversation} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">
            Nhắn VIỆTGO
          </button>
        )}
      </header>
      <div className="grid min-h-[460px] md:grid-cols-[280px_1fr]">
        <aside className="border-b border-blue-50 md:border-b-0 md:border-r">
          {loading ? (
            <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-blue-700" />
          ) : conversations.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Chưa có hội thoại.</p>
          ) : (
            conversations.map((conversation) => {
              const itemTitle = role === 'Partner'
                ? conversation.conversationType === 'PARTNER_SUPPORT' ? 'Hỗ trợ VIỆTGO' : conversation.customerName
                : conversation.conversationType === 'CUSTOMER_SUPPORT' ? conversation.customerName : conversation.partnerName;
              return (
                <button
                  key={conversation.conversationId}
                  type="button"
                  onClick={() => {
                    setError('');
                    setSelectedId(conversation.conversationId);
                  }}
                  className={`block w-full border-b border-blue-50 p-4 text-left transition ${selectedId === conversation.conversationId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <p className="truncate font-semibold text-slate-800">{itemTitle || 'Cuộc trò chuyện'}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{conversation.lastMessage || 'Bắt đầu trò chuyện'}</p>
                </button>
              );
            })
          )}
        </aside>
        <div className="flex min-h-[400px] flex-col">
          <div className="border-b border-blue-50 px-5 py-4 font-semibold text-slate-800">{title || 'Chọn hội thoại'}</div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((message) => {
              const ownMessage = message.senderRole === role;
              return (
                <div key={message.messageId} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${ownMessage ? 'ml-auto bg-blue-700 text-white' : 'bg-white text-slate-700 shadow-sm'}`}>
                  {!ownMessage && <p className="mb-1 text-xs font-semibold text-blue-700">{message.senderName}</p>}
                  <p className="whitespace-pre-wrap break-words">{message.messageText}</p>
                  <time className="mt-1 block text-right text-[10px] opacity-70">{new Date(message.createdAt).toLocaleString('vi-VN')}</time>
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
