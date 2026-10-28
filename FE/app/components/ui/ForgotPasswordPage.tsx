import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword, resetPassword } from '../../api';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [isReset, setIsReset] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Vui lòng nhập địa chỉ Email!');
      return;
    }

    setLoading(true);
    try {
      await forgotPassword({ email });
      setOtpSent(true);
      toast.success('Mã OTP khôi phục mật khẩu đã được gửi.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      toast.error('Vui lòng nhập mã OTP gồm 6 chữ số.');
      return;
    }
    if (!/^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{6,}$/.test(newPassword)) {
      toast.error('Mật khẩu cần tối thiểu 6 ký tự, có chữ hoa và ký tự đặc biệt.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Xác nhận mật khẩu không khớp.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ email, otp, newPassword });
      setIsReset(true);
      toast.success('Đặt lại mật khẩu thành công.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể đặt lại mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-100">
        {!otpSent ? (
          <>
            <h2 className="text-2xl font-bold text-center text-[#1e3a8a] mb-2">Quên mật khẩu?</h2>
            <p className="text-center text-gray-500 mb-6 text-sm">
              Nhập email đã đăng ký để nhận mã OTP khôi phục mật khẩu.
            </p>

            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email của bạn</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ví dụ: khachhang@gmail.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1e3a8a] text-white py-3 rounded-lg font-semibold hover:bg-blue-800 transition disabled:bg-gray-400"
              >
                {loading ? 'Đang gửi...' : 'Gửi mã OTP'}
              </button>
            </form>
          </>
        ) : isReset ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Đã đổi mật khẩu!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Bạn có thể đăng nhập bằng mật khẩu mới.
            </p>
            <Link to="/login" className="text-sm text-[#ea580c] hover:underline font-medium">
              Đến trang đăng nhập
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-center text-[#1e3a8a] mb-2">Xác minh OTP</h2>
            <p className="text-center text-gray-500 mb-6 text-sm">
              Nhập mã 6 chữ số đã gửi đến <b>{email}</b>. Mã có hiệu lực trong 5 phút.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Nhập mã 6 chữ số"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự, có chữ hoa và ký tự đặc biệt"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a8a] outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1e3a8a] text-white py-3 rounded-lg font-semibold hover:bg-blue-800 transition disabled:bg-gray-400"
              >
                {loading ? 'Đang xác minh...' : 'Xác minh và đổi mật khẩu'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtp('');
              }}
              className="w-full mt-3 text-sm text-gray-500 hover:text-[#1e3a8a]"
            >
              Đổi email
            </button>
          </>
        )}

        <div className="mt-6 text-center border-t pt-4">
          <Link to="/login" className="text-sm text-[#ea580c] hover:underline font-medium">
            Quay lại Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}