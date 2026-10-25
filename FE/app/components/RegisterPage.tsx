import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Phone, Briefcase, ArrowLeft } from 'lucide-react';
import { requestRegistrationOtp, verifyRegistrationOtp } from '@/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<'Customer' | 'Partner'>('Customer');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSecondsRemaining, setOtpSecondsRemaining] = useState(120);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    // Các trường dành riêng cho nhà xe
    brandName: '',
    licenseNumber: '',
  });

  useEffect(() => {
    if (!otpSent || otpSecondsRemaining <= 0) return;

    const timer = window.setTimeout(() => {
      setOtpSecondsRemaining((remaining) => remaining - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [otpSent, otpSecondsRemaining]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const buildRegistrationPayload = () => {
    const generatedUsername = formData.email.split('@')[0];

    return {
      username: generatedUsername,
      email: formData.email,
      password: formData.password,
      full_name: formData.fullName,
      phone: formData.phone,
      role: role,
      ...(role === 'Partner' && {
        brand_name: formData.brandName,
        license_number: formData.licenseNumber,
      }),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otpSent && otpSecondsRemaining <= 0) {
      toast.error('Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.');
      return;
    }

    if (!otpSent && formData.password !== formData.confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp!');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!otpSent) {
        await requestRegistrationOtp(buildRegistrationPayload());
        setOtpSent(true);
        setOtp('');
        setOtpSecondsRemaining(120);
        toast.success('Mã OTP đã được gửi đến email của bạn.');
        return;
      }

      const response = await verifyRegistrationOtp({
        ...buildRegistrationPayload(),
        otp,
      });

      if (response.data.success) {
        toast.success(response.data.message || 'Đăng ký thành công!');
        navigate('/login');
      } else {
        toast.error(response.data.message || 'Đăng ký thất bại.');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại!';
      if (message.includes('nhập sai 5 lần')) {
        setOtpSecondsRemaining(0);
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    try {
      await requestRegistrationOtp(buildRegistrationPayload());
      setOtp('');
      setOtpSecondsRemaining(120);
      toast.success('Mã OTP mới đã được gửi đến email của bạn.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể gửi lại mã OTP.');
    } finally {
      setIsResending(false);
    }
  };

  const otpCountdown = `${String(Math.floor(otpSecondsRemaining / 60)).padStart(2, '0')}:${String(otpSecondsRemaining % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-sky-100 p-4">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="fixed left-5 top-5 z-50 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/95 px-4 py-2 text-sm font-semibold text-blue-800 shadow-lg transition hover:bg-blue-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Về trang chủ
      </button>
      <div className="max-w-md w-full bg-white rounded-2xl border border-blue-100 shadow-xl p-8">
        <div className="mb-6 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-2">Đăng Ký Tài Khoản</h2>
          <p className="text-muted-foreground">Chọn loại tài khoản và tham gia cùng VIỆTGO</p>
        </div>

        {!otpSent && (
        <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
          <button
            type="button"
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              role === 'Customer' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setRole('Customer')}
          >
            <User className="w-4 h-4" /> Khách Hàng
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-md font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              role === 'Partner' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setRole('Partner')}
          >
            <Briefcase className="w-4 h-4" /> Nhà Xe (Đối Tác)
          </button>
        </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!otpSent ? (
          <>
          {/* HỌ VÀ TÊN */}
          <div>
            <label className="block text-sm mb-1 text-foreground">Họ và Tên người đại diện</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Nguyễn Văn A"
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* EMAIL */}
          <div>
            <label className="block text-sm mb-1 text-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="xxxx@gmail.com"
                pattern=".+@gmail\.com"
                title="Email phải kết thúc bằng @gmail.com"
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* SỐ ĐIỆN THOẠI */}
          <div>
            <label className="block text-sm mb-1 text-foreground">Số điện thoại</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="09xxxxxxxx"
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* CÁC TRƯỜNG ĐẶC THÙ CHO ĐỐI TÁC (CHỈ HIỂN THỊ KHI CHỌN PARTNER) */}
          {role === 'Partner' && (
            <>
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-4 animate-fadeIn">
                <div>
                  <label className="block text-sm mb-1 text-blue-900 font-medium">Tên thương hiệu nhà xe</label>
                  <input
                    type="text"
                    name="brandName"
                    value={formData.brandName}
                    onChange={handleChange}
                    placeholder="Ví dụ: Nhà Xe Phương Trang"
                    className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-blue-900 font-medium">Số giấy phép kinh doanh</label>
                  <input
                    type="text"
                    name="licenseNumber"
                    value={formData.licenseNumber}
                    onChange={handleChange}
                    placeholder="GPKD-12345678"
                    className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    required
                  />
                </div>
              </div>
            </>
          )}

          {/* MẬT KHẨU */}
          <div>
            <label className="block text-sm mb-1 text-foreground">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* XÁC NHẬN MẬT KHẨU */}
          <div>
            <label className="block text-sm mb-1 text-foreground">Xác nhận mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          </>
          ) : (
          <>
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Nhập mã xác minh đã gửi đến <span className="font-medium text-foreground">{formData.email}</span>
              </p>
              <div>
                <label htmlFor="registration-otp" className="block text-sm mb-2 text-foreground">Mã OTP</label>
                <input
                  id="registration-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-border rounded-lg text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <p role="status" className="text-sm text-muted-foreground">
                {otpSecondsRemaining > 0 ? `Mã hết hạn sau ${otpCountdown}` : 'Mã OTP đã hết hạn.'}
              </p>
              {otpSecondsRemaining <= 0 && (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResending}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  {isResending ? 'Đang gửi mã...' : 'Gửi lại mã OTP'}
                </button>
              )}
            </div>
          </>
          )}

          <button
            type="submit"
            disabled={isSubmitting || (otpSent && otpSecondsRemaining <= 0)}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity mt-2"
          >
            {isSubmitting
              ? 'Đang xử lý...'
              : otpSent
                ? 'Xác minh OTP'
                : `Đăng Ký ${role === 'Customer' ? 'Khách Hàng' : 'Đối Tác'}`}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Đã có tài khoản?{' '}
          <button onClick={() => navigate('/login')} className="text-primary hover:underline">
            Đăng nhập ngay
          </button>
        </p>
      </div>
    </div>
  );
}
