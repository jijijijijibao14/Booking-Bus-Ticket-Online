import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../../api';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token'); 
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) return toast.error('Đường liên kết không hợp lệ!');
    if (newPassword.length < 6) return toast.error('Mật khẩu mới phải từ 6 ký tự trở lên!');
    if (newPassword !== confirmPassword) return toast.error('Xác nhận mật khẩu không khớp!');

    setLoading(true);
    try {
      await resetPassword({ token, newPassword });
      toast.success('Đổi mật khẩu thành công! Chuyển hướng đến đăng nhập...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Liên kết đã hết hạn hoặc không hợp lệ!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-100">
        <h2 className="text-2xl font-bold text-center text-[#ea580c] mb-2">Tạo Mật Khẩu Mới</h2>
        <p className="text-center text-gray-500 mb-6 text-sm">
          Vui lòng thiết lập mật khẩu mới cho tài khoản của bạn.
        </p>

        {!token ? (
           <div className="text-center text-red-500 bg-red-50 p-4 rounded-md border border-red-200">
             Liên kết khôi phục bị thiếu mã bảo mật. Vui lòng bấm trực tiếp vào nút khôi phục trong email của bạn.
           </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ea580c] outline-none"
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
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ea580c] outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#ea580c] text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition disabled:bg-gray-400 mt-4"
            >
              {loading ? 'Đang cập nhật...' : 'Xác Nhận Thay Đổi'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center border-t pt-4">
          <Link to="/login" className="text-sm text-gray-500 hover:text-[#1e3a8a] hover:underline">
            Quay lại Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}