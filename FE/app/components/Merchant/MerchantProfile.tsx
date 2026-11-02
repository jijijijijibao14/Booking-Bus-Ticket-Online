import { useEffect, useState, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, Wallet as WalletIcon, Edit2, Save, ArrowUpRight, User, LogOut } from 'lucide-react';
import { getMerchantProfile, getMerchantWallet, updateMerchantProfile } from '@/api';
import { formControlClassName, formLabelClassName } from '@/utils/form-styles';
import { toast } from 'sonner';
import AvatarUploader from '../AvatarUploader';

export default function MerchantInfo() {
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'info' | 'wallet'>('info');
  const [editMode, setEditMode] = useState(false);
  const [values, setValues] = useState({
    fullname: '',
    email: '',
    phone: '',
    companyName: '',
  });

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await getMerchantProfile();
        const data = res.data?.data;
        setMerchant(data);

        setValues({
          fullname: data?.fullname ?? '',
          email: data?.email ?? '',
          phone: data?.phone ?? '',
          companyName: data?.companyName ?? data?.company_name ?? '',
        });

        // Fetch wallet balance for the partner
        try {
          const walletRes = await getMerchantWallet();
          const wb = walletRes.data?.data?.wallet_balance ?? walletRes.data?.data?.walletBalance ?? 0;
          setMerchant((prev: any) => ({ ...(prev || {}), wallet_balance: wb }));
        } catch (werr) {
          console.warn('Không lấy được ví đối tác:', werr);
        }
      } catch (err) {
        console.error(err);
        setError('Không thể tải thông tin đối tác. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleLogout = () => {
    ['token', 'role', 'userName', 'userEmail', 'userPhone', 'userStatus'].forEach((key) =>
      localStorage.removeItem(key),
    );
    navigate('/login');
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    const phonePattern = /^(?:\+?84|0)(?:3[2-9]|5[2689]|7[06789]|8[1-9]|9[0-46-9])[0-9]{7}$/;
    if (values.phone && !phonePattern.test(values.phone.trim())) {
      setError('Số điện thoại phải là số di động Việt Nam hợp lệ.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await updateMerchantProfile({
        full_name: values.fullname,
        email: values.email,
        phone: values.phone,
        brand_name: values.companyName,
      });
      const data = res.data;
      const updated = data?.data ?? values;
      setMerchant(updated);
      setEditMode(false);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Không thể lưu thông tin đối tác. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const walletBalance = Number(
    merchant?.wallet_balance ??
      merchant?.walletBalance ??
      merchant?.wallet?.balance ??
      0,
  );
  const walletCurrency =
    merchant?.wallet_currency ??
    merchant?.wallet?.currency ??
    merchant?.currency ??
    'VND';
  const formattedWalletBalance = walletBalance.toLocaleString('vi-VN');

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" /> Quay về trang chủ
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          <aside className="lg:col-span-1">
            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <div className="mb-6 text-center">
                <AvatarUploader fallback={<Building2 className="h-9 w-9" />} />
                <h2 className="text-xl font-bold text-foreground">
                  {merchant?.fullname ?? 'Đối tác'}
                </h2>
                <p className="break-all text-sm text-muted-foreground">
                  {merchant?.email ?? ''}
                </p>
              </div>

              <nav className="space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                    activeTab === 'info'
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <User className="h-5 w-5" />
                  <span>Thông tin cá nhân</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('wallet')}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                    activeTab === 'wallet'
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <WalletIcon className="h-5 w-5" />
                  <span>Ví đối tác</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Đăng xuất</span>
                </button>
              </nav>
            </div>
          </aside>

          <main className="lg:col-span-3">
            {loading && (
              <div className="rounded-2xl border border-border bg-white py-10 text-center text-sm text-muted-foreground">
                Đang tải thông tin...
              </div>
            )}

            {error && <div className="rounded-2xl border border-red-200 bg-white py-10 text-center text-red-500">{error}</div>}

            {!loading && !error && merchant && (
              <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                <div className="border-b border-border px-7 py-6">
                  <h1 className="text-2xl font-bold text-foreground">
                    {activeTab === 'info' ? 'Thông tin cá nhân' : 'Ví đối tác'}
                  </h1>
                  <p className="mt-1 text-muted-foreground">
                    {activeTab === 'info'
                      ? 'Quản lý thông tin hồ sơ đối tác.'
                      : 'Quản lý số dư ví đối tác.'}
                  </p>
                </div>
                <div className="p-7">
                  {activeTab === 'info' ? (
                    <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-3xl border border-border bg-muted p-6">
                    <label htmlFor="merchant-fullname" className={`${formLabelClassName} mb-2`}>Tên đối tác</label>
                    <input
                      id="merchant-fullname"
                      name="fullname"
                      value={values.fullname}
                      onChange={handleChange}
                      disabled={!editMode}
                      className={formControlClassName}
                    />
                  </div>

                  <div className="rounded-3xl border border-border bg-muted p-6">
                    <label htmlFor="merchant-email" className={`${formLabelClassName} mb-2`}>Email</label>
                    <input
                      id="merchant-email"
                      name="email"
                      value={values.email}
                      onChange={handleChange}
                      disabled={!editMode}
                      className={formControlClassName}
                    />
                  </div>

                  <div className="rounded-3xl border border-border bg-muted p-6">
                    <label htmlFor="merchant-phone" className={`${formLabelClassName} mb-2`}>Liên hệ</label>
                    <input
                      id="merchant-phone"
                      type="tel"
                      name="phone"
                      value={values.phone}
                      onChange={handleChange}
                      disabled={!editMode}
                      className={formControlClassName}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {editMode ? (
                    <>
                      <button
                        onClick={handleSave}
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                      >
                        <Save className="w-4 h-4" /> Lưu
                      </button>
                      <button
                        onClick={() => {
                          setEditMode(false);
                          setValues({
                            fullname: merchant.fullname ?? '',
                            email: merchant.email ?? '',
                            phone: merchant.phone ?? '',
                            companyName:
                              merchant.companyName ?? merchant.company_name ?? '',
                          });
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-muted px-5 py-2 text-sm font-medium text-muted-foreground"
                      >
                        Hủy
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditMode(true)}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                    >
                      <Edit2 className="w-4 h-4" /> Chỉnh sửa
                    </button>
                  )}
                </div>
              </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-blue-100 bg-gradient-to-r from-white to-blue-50 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <WalletIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Ví đối tác</h2>
                      <p className="text-sm text-slate-500">Số dư hiện có</p>
                    </div>
                  </div>
                  <div className="sm:ml-auto sm:text-right">
                    <p className="text-2xl font-bold tracking-tight text-slate-900">
                      {formattedWalletBalance} <span className="text-sm font-medium">{walletCurrency}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.info('Chưa liên kết với ngân hàng')}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Rút tiền
                  </button>
                </div>
              </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}