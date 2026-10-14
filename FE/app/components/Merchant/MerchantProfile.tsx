import { useEffect, useState, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, Wallet as WalletIcon, Edit2, Save } from 'lucide-react';
import { getMerchantProfile, getMerchantWallet, updateMerchantProfile } from '@/api';

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

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
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
    } catch (err) {
      console.error(err);
      setError('Không thể lưu thông tin đối tác. Vui lòng thử lại.');
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
    <div className="min-h-screen bg-muted p-8">
      <button
        onClick={() => navigate('/merchant')}
        className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-lg bg-white border border-border text-sm font-medium shadow-sm hover:bg-slate-50"
      >
        <ArrowLeft className="w-4 h-4" /> Quay về
      </button>

      <div className="bg-white rounded-3xl border border-border p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Thông tin đối tác</p>
            <h1 className="text-3xl font-semibold text-foreground">
              {merchant?.fullname ?? 'Đối tác'}
            </h1>
          </div>
        </div>

        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('info')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'info'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-slate-100'
            }`}
          >
            Thông tin đối tác
          </button>
          <button
            onClick={() => setActiveTab('wallet')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'wallet'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-slate-100'
            }`}
          >
            Ví đối tác
          </button>
        </div>

        {loading && (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Đang tải thông tin...
          </div>
        )}

        {error && <div className="text-center py-10 text-red-500">{error}</div>}

        {!loading && !error && merchant && (
          <>
            {activeTab === 'info' ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-3xl border border-border bg-muted p-6">
                    <p className="text-sm text-muted-foreground mb-2">Tên đối tác</p>
                    <input
                      name="fullname"
                      value={values.fullname}
                      onChange={handleChange}
                      disabled={!editMode}
                      className="w-full rounded-xl border border-border bg-white p-3 text-foreground outline-none"
                    />
                  </div>

                  <div className="rounded-3xl border border-border bg-muted p-6">
                    <p className="text-sm text-muted-foreground mb-2">Email</p>
                    <input
                      name="email"
                      value={values.email}
                      onChange={handleChange}
                      disabled={!editMode}
                      className="w-full rounded-xl border border-border bg-white p-3 text-foreground outline-none"
                    />
                  </div>

                  <div className="rounded-3xl border border-border bg-muted p-6">
                    <p className="text-sm text-muted-foreground mb-2">Liên hệ</p>
                    <input
                      name="phone"
                      value={values.phone}
                      onChange={handleChange}
                      disabled={!editMode}
                      className="w-full rounded-xl border border-border bg-white p-3 text-foreground outline-none"
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
              <div className="rounded-3xl border border-border bg-muted p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <WalletIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      Ví đối tác
                    </h2>
                  </div>
                </div>

                <div className="bg-primary text-primary-foreground p-6 rounded-xl mb-8 shadow-lg shadow-primary/20">
                  <div className="rounded-3xl border border-border bg-white p-6">
                    <p className="text-sm text-muted-foreground mb-2">Số dư</p>
                    <p className="text-2xl font-semibold text-foreground">
                      {formattedWalletBalance} {walletCurrency}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}