import { useCallback, useEffect, useState } from 'react';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import {
  User,
  Wallet,
  History,
  LogOut,
  ArrowLeft,
} from 'lucide-react';

import PersonalInfo from './PersonalInfo';
import WalletComponent from './Wallet';
import BookingHistory from './bookings/BookingHistory';
import { getUserProfile } from '@/api';

type ProfileTab = 'info' | 'wallet' | 'history';

interface ProfileUser {
  name: string;
  email: string;
  phone: string;
  walletBalance: number;
}

function isProfileTab(
  value: string | null,
): value is ProfileTab {
  return (
    value === 'info' ||
    value === 'wallet' ||
    value === 'history'
  );
}

/**
 * Backend cũ/mới trong project có thể trả dữ liệu theo nhiều dạng:
 *
 * response.data.user
 * response.data.data.user
 * response.data.data
 * response.data
 *
 * và tên field có thể là camelCase hoặc snake_case.
 *
 * Hàm này chuẩn hóa về đúng format mà PersonalInfo + Wallet cần.
 */
function normalizeProfileResponse(
  response: any,
): ProfileUser {
  const payload =
    response?.data?.data?.user ??
    response?.data?.user ??
    response?.data?.data ??
    response?.data ??
    {};

  const name =
    payload.name ??
    payload.fullName ??
    payload.full_name ??
    payload.userName ??
    payload.user_name ??
    localStorage.getItem('userName') ??
    '';

  const email =
    payload.email ??
    payload.userEmail ??
    payload.user_email ??
    localStorage.getItem('userEmail') ??
    '';

  const phone =
    payload.phone ??
    payload.phoneNumber ??
    payload.phone_number ??
    payload.userPhone ??
    payload.user_phone ??
    localStorage.getItem('userPhone') ??
    '';

  const rawWalletBalance =
    payload.walletBalance ??
    payload.wallet_balance ??
    payload.balance ??
    0;

  const walletBalance = Number(rawWalletBalance);

  return {
    name: String(name ?? ''),
    email: String(email ?? ''),
    phone: String(phone ?? ''),
    walletBalance: Number.isFinite(walletBalance)
      ? walletBalance
      : 0,
  };
}

export default function CustomerProfile() {
  const navigate = useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  const tabFromUrl = searchParams.get('tab');

  /*
   * Tab được lấy trực tiếp từ URL:
   *
   * /profile?tab=history
   * /profile?tab=wallet
   * /profile?tab=info
   */
  const activeTab: ProfileTab =
    isProfileTab(tabFromUrl)
      ? tabFromUrl
      : 'info';

  const [user, setUser] =
    useState<ProfileUser>({
      name: '',
      email: '',
      phone: '',
      walletBalance: 0,
    });

  const [loading, setLoading] =
    useState(true);

  const [profileError, setProfileError] =
    useState('');

  const fetchProfile = useCallback(
    async () => {
      try {
        setProfileError('');

        const response =
          await getUserProfile();

        // Giữ log này trong lúc test.
        // Nếu backend đổi response shape, ta nhìn Console là biết ngay.
        console.log(
          'getUserProfile response:',
          response.data,
        );

        const normalizedUser =
          normalizeProfileResponse(response);

        setUser(normalizedUser);

        // Đồng bộ localStorage để sidebar/login cũ vẫn dùng đúng dữ liệu.
        localStorage.setItem(
          'userName',
          normalizedUser.name,
        );
        localStorage.setItem(
          'userEmail',
          normalizedUser.email,
        );
        localStorage.setItem(
          'userPhone',
          normalizedUser.phone,
        );
      } catch (error: any) {
        console.error(
          'Failed to fetch user profile:',
          error,
        );

        setProfileError(
          error?.response?.data?.message ||
            'Không thể tải thông tin người dùng.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const token =
      localStorage.getItem('token');

    const role =
      localStorage.getItem('role');

    if (
      !token ||
      role !== 'Customer'
    ) {
      navigate('/login');
      return;
    }

    setLoading(true);
    void fetchProfile();
  }, [navigate, fetchProfile]);

  /**
   * Khi user chuyển sang tab Ví, gọi lại profile
   * để số dư sau PAYMENT / REFUND luôn là số mới nhất.
   */
  useEffect(() => {
    if (activeTab === 'wallet') {
      void fetchProfile();
    }
  }, [activeTab, fetchProfile]);

  const handleTabChange = (
    tab: ProfileTab,
  ) => {
    setSearchParams(
      {
        tab,
      },
      {
        replace: true,
      },
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userPhone');

    navigate('/login');
  };

  const menuItems = [
    {
      id: 'info' as ProfileTab,
      label: 'Thông tin cá nhân',
      icon: User,
    },
    {
      id: 'wallet' as ProfileTab,
      label: 'Ví của tôi',
      icon: Wallet,
    },
    {
      id: 'history' as ProfileTab,
      label: 'Lịch sử đặt vé',
      icon: History,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <p className="text-muted-foreground">
          Đang tải thông tin người dùng...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Quay về trang chủ
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {profileError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {profileError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
              <div className="text-center mb-6">
                <User className="w-16 h-16 text-primary mx-auto mb-3 p-3 bg-primary/10 rounded-full" />

                <h2 className="font-bold text-xl text-foreground">
                  {user.name || 'Khách hàng'}
                </h2>

                <p className="text-sm text-muted-foreground break-all">
                  {user.email || 'Chưa có email'}
                </p>
              </div>

              <nav className="space-y-2">
                {menuItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() =>
                      handleTabChange(item.id)
                    }
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-5 h-5" />
                  Đăng xuất
                </button>
              </nav>
            </div>
          </aside>

          <main className="lg:col-span-3">
            {activeTab === 'info' && (
              <PersonalInfo user={user} />
            )}

            {activeTab === 'wallet' && (
              <WalletComponent
                walletBalance={
                  user.walletBalance
                }
              />
            )}

            {activeTab === 'history' && (
              <BookingHistory />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}