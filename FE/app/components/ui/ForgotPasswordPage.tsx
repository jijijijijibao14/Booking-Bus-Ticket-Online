import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../api';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Vui lòng nhập địa chỉ Email!');
      return;
    }

    setLoading(true);
    try {
      await forgotPassword({ email });
      setIsSent(true); 
      toast.success('Gửi liên kết thành công!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-100">
        {!isSent ? (
          <>
            <h2 className="text-2xl font-bold text-center text-[#1e3a8a] mb-2">Quên mật khẩu?</h2>
            <p className="text-center text-gray-500 mb-6 text-sm">
              Đừng lo lắng! Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để đặt lại mật khẩu.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
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
                {loading ? 'Đang xử lý...' : 'Gửi liên kết khôi phục'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Đã gửi liên kết!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến email <b>{email}</b>. Vui lòng kiểm tra cả hộp thư rác (Spam).
            </p>
          </div>
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