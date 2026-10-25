import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import {
  getChatPartners,
  getConversations,
  getConversationMessages,
  openConversation,
  sendConversationMessage,
} from '@/api';

interface ChatPartner {
  partnerId: number;
  brandName: string;
}

interface ChatMessage {
  messageId: number;
  senderId: number;
  senderRole: string;
  senderName: string;
  messageText: string;
  createdAt: string;
}

interface Conversation {
  conversationId: number;
  conversationType: string;
  partnerName: string | null;
  lastMessage: string | null;
}

export default function CustomerChatWidget() {
  const navigate = useNavigate();
  const isCustomer = localStorage.getItem('role') === 'Customer';
  const isLoggedIn = Boolean(localStorage.getItem('token'));
  const [isOpen, setIsOpen] = useState(false);
  const [partners, setPartners] = useState<ChatPartner[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isCustomer) return;
    getChatPartners()
      .then((response) => setPartners(response.data.data))
      .catch((requestError) => {
        console.error('Could not load customer chat partner list:', requestError);
        setError('Không thể tải danh sách nhà xe.');
      });
  }, [isCustomer]);

  useEffect(() => {
    if (!isCustomer || !isLoggedIn || !isOpen) return;
    let mounted = true;
    const loadConversations = () => getConversations()
      .then((response) => {
        if (mounted) setConversations(response.data.data);
      })
      .catch((requestError) => {
        if (!mounted) return;
        console.error('Could not load customer conversations:', requestError);
        setError(requestError.response?.data?.message || 'Không thể tải danh sách hội thoại.');
      });
    void loadConversations();
    const refreshInterval = window.setInterval(loadConversations, 5000);
    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [isCustomer, isLoggedIn, isOpen]);

  useEffect(() => {
    if (!conversationId || !isOpen) return;
    let mounted = true;
    setLoading(true);
    const loadMessages = () => getConversationMessages(conversationId)
      .then((response) => {
        if (mounted) setMessages(response.data.data);
      })
      .catch((requestError) => {
        if (!mounted) return;
        console.error('Could not load customer chat messages:', requestError);
        setError(requestError.response?.data?.message || 'Không thể tải tin nhắn.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    loadMessages();
    const refreshInterval = window.setInterval(loadMessages, 5000);
    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [conversationId, isOpen]);

  if (!isCustomer) return null;

  const startConversation = async (type: 'partner' | 'support', partnerId?: number) => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    setError('');
    try {
      const response = await openConversation({ type, partnerId });
      const openedConversationId = Number(response.data.data.conversationId);
      setConversationId(openedConversationId);
      const [messagesResponse, conversationsResponse] = await Promise.all([
        getConversationMessages(openedConversationId),
        getConversations(),
      ]);
      setMessages(messagesResponse.data.data);
      setConversations(conversationsResponse.data.data);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không thể mở cuộc trò chuyện.');
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedMessage = messageText.trim();
    if (!conversationId || !trimmedMessage) return;
    setError('');
    try {
      await sendConversationMessage(conversationId, trimmedMessage);
      setMessageText('');
      const response = await getConversationMessages(conversationId);
      setMessages(response.data.data);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không gửi được tin nhắn.');
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {isOpen && (
        <section className="mb-3 flex h-[min(580px,75vh)] w-[min(390px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl">
          <header className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-600 px-5 py-4 text-white">
            <div>
              <h2 className="font-bold">Trung tâm trò chuyện</h2>
              <p className="text-xs text-blue-100">Kết nối nhà xe và VIỆTGO</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Đóng trò chuyện">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="grid grid-cols-2 gap-2 border-b border-blue-50 p-3">
            <button
              type="button"
              onClick={() => startConversation('support')}
              className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
            >
              Nhắn VIỆTGO
            </button>
            <select
              aria-label="Chọn nhà xe để nhắn tin"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) startConversation('partner', Number(event.target.value));
                event.target.value = '';
              }}
              className="min-w-0 rounded-xl border border-blue-100 bg-white px-2 py-2 text-sm text-blue-900"
            >
              <option value="">Chọn nhà xe</option>
              {partners.map((partner) => (
                <option key={partner.partnerId} value={partner.partnerId}>{partner.brandName}</option>
              ))}
            </select>
          </div>
          {isLoggedIn && (
            <div className="border-b border-blue-50 px-3 pb-3">
              <select
                aria-label="Chọn hội thoại trước đây"
                value={conversationId ?? ''}
                onChange={(event) => {
                  const selectedId = Number(event.target.value);
                  if (selectedId > 0) {
                    setError('');
                    setConversationId(selectedId);
                  }
                }}
                className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="">Hội thoại của bạn</option>
                {conversations.map((conversation) => (
                  <option key={conversation.conversationId} value={conversation.conversationId}>
                    {conversation.conversationType === 'CUSTOMER_SUPPORT'
                      ? 'Hỗ trợ VIỆTGO'
                      : conversation.partnerName || 'Nhà xe'}
                    {conversation.lastMessage ? ` — ${conversation.lastMessage}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isLoggedIn ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-slate-600">Đăng nhập để bắt đầu nhắn tin với nhà xe hoặc bộ phận hỗ trợ.</p>
              <button type="button" onClick={() => navigate('/login')} className="rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white">
                Đăng nhập
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                {!conversationId && (
                  <p className="pt-8 text-center text-sm text-slate-500">Chọn một nhà xe hoặc nhắn tin cho VIỆTGO để bắt đầu.</p>
                )}
                {loading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-700" />}
                {messages.map((message) => {
                  const ownMessage = message.senderRole === 'Customer';
                  return (
                    <div key={message.messageId} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${ownMessage ? 'ml-auto bg-blue-700 text-white' : 'bg-white text-slate-700 shadow-sm'}`}>
                      {!ownMessage && <p className="mb-1 text-xs font-semibold text-blue-700">{message.senderName}</p>}
                      <p className="whitespace-pre-wrap break-words">{message.messageText}</p>
                      <time className={`mt-1 block text-right text-[10px] ${ownMessage ? 'text-blue-100' : 'text-slate-400'}`}>
                        {new Date(message.createdAt).toLocaleString('vi-VN')}
                      </time>
                    </div>
                  );
                })}
              </div>
              {error && <p role="alert" className="px-4 py-2 text-xs text-rose-600">{error}</p>}
              <form onSubmit={handleSend} className="flex gap-2 border-t border-blue-50 p-3">
                <input
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  maxLength={2000}
                  placeholder="Nhập tin nhắn..."
                  disabled={!conversationId}
                  className="min-w-0 flex-1 rounded-xl border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
                <button type="submit" disabled={!conversationId || !messageText.trim()} aria-label="Gửi tin nhắn" className="rounded-xl bg-blue-700 px-3 text-white disabled:opacity-40">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </section>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Mở trò chuyện"
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-xl shadow-blue-900/20 transition hover:scale-105 hover:bg-blue-800"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </div>
  );
}
