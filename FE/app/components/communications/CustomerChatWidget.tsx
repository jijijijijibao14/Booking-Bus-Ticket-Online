import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import ConversationInbox from './ConversationInbox';

export default function CustomerChatWidget() {
  const navigate = useNavigate();
  useLocation(); // render lại khi đổi trang để cập nhật vai trò sau khi đăng nhập/đăng xuất
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const storedRole = localStorage.getItem('role');
  const role = storedRole === 'Customer' || storedRole === 'Partner' || storedRole === 'Admin' ? storedRole : null;
  const isLoggedIn = Boolean(localStorage.getItem('token'));

  if (!role) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <div className={isOpen ? 'mb-3 h-[min(580px,calc(100dvh-6rem))] w-[min(460px,calc(100vw-2rem))]' : 'hidden'}>
        {isLoggedIn ? (
          <ConversationInbox
            role={role}
            visible={isOpen}
            compact
            onUnreadCountChange={setUnreadCount}
          />
        ) : (
          <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-600 px-4 py-3 text-white">
              <div>
                <h2 className="text-sm font-bold">Trung tâm trò chuyện</h2>
                <p className="text-xs text-blue-100">Kết nối nhà xe và VIỆTGO</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Đóng trò chuyện">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-slate-600">Đăng nhập để xem và tiếp tục các cuộc trò chuyện của bạn.</p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Đăng nhập
              </button>
            </div>
          </section>
        )}
      </div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="relative ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg transition hover:bg-blue-800"
        aria-label={isOpen ? 'Đóng trò chuyện' : 'Mở trò chuyện'}
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
