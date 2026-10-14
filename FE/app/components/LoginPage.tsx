import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, User, Briefcase, Shield } from 'lucide-react';
import { login } from '@/api';
import { GoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner'; // Dùng luôn sonner để thông báo cho đồng bộ
export default function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail, rememberMe: true }));
    }
  }, []);

  
const processLoginResponse = (data: any, route?: string) => {
  const { token, user } = data;

  // Kiểm tra backend có trả JWT và thông tin user không
  if (
    typeof token !== 'string' ||
    !token ||
    token === 'undefined' ||
    !user
  ) {
    toast.error('Đăng nhập thất bại: Backend không trả về token hợp lệ.');
    return;
  }

  // Lưu JWT và thông tin người dùng
  localStorage.setItem('token', token);
  localStorage.setItem('role', user.role);
  localStorage.setItem('userName', user.full_name);
  localStorage.setItem('userEmail', user.email);
  localStorage.setItem('userPhone', user.phone ?? '');
  localStorage.setItem('userStatus', user.status ?? 'Active');

  // Xử lý Remember Me
  if (formData.rememberMe) {
    localStorage.setItem('rememberedEmail', formData.email);
  } else {
    localStorage.removeItem('rememberedEmail');
  }

  // Điều hướng theo vai trò
  const targetRoute =
    route ||
    (user.role === 'Customer'
      ? '/'
      : user.role === 'Partner'
        ? '/merchant'
        : '/admin');

  navigate(targetRoute);
};

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      if (!credentialResponse.credential) {
        toast.error("❌ Không nhận được phản hồi hợp lệ từ Google.");
        return;
      }

      // 1. Hiển thị trạng thái đang xử lý
      toast.loading("⏳ Đang xác thực tài khoản Google với hệ thống...");

      // 2. Gửi token nhận từ Google xuống endpoint Backend của bạn
      const res = await axios.post('http://localhost:3001/api/auth/google', {
        token: credentialResponse.credential
      });

      // 3. Nếu Backend xử lý và trả về thành công
      if (res.data.success) {
        toast.dismiss(); // Tắt dòng chữ loading "Đang xác thực..." đi
        toast.success("🎉 Đăng nhập thành công bằng Gmail!");

        // 4. Chuyền data về hàm xử lý login chung của bạn để lưu localStorage/Token và chuyển trang
        processLoginResponse(res.data);
      }
    } catch (error: any) {
      toast.dismiss(); // Tắt dòng chữ loading
      console.error("Lỗi Đăng nhập Google Frontend:", error);
      const errorMsg = error.response?.data?.message || "Xác thực với hệ thống thất bại.";
      toast.error(`❌ ${errorMsg}`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await login({ email: formData.email, password: formData.password });

      if (response.data.success) {
        processLoginResponse(response.data);
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại!';
      alert(message);
    }
  };

  const handleDemoLogin = async (email: string, password: string, route: string) => {
    setFormData({ email, password, rememberMe: false });
    try {
      const response = await login({ email, password });
      if (response.data.success) {
        processLoginResponse(response.data, route);
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Đăng nhập demo thất bại. Vui lòng kiểm tra backend và seed data.';
      alert(message);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-blue-900 items-center justify-center p-12">
        <div className="max-w-md text-white">
          <div className="mb-8">
            <h1 className="text-5xl font-bold mb-4">VIỆTGO</h1>
            <p className="text-xl opacity-90">Một chạm kết nối, vạn dặm hành trình</p>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🚌</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Xe Khách Liên Tỉnh</h3>
                <p className="text-sm opacity-80">Đặt vé xe khách nhanh chóng, an toàn</p>
              </div>
            </div>

            {/* <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🚂</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Tàu Hỏa</h3>
                <p className="text-sm opacity-80">Hành trình êm ái xuyên suốt Việt Nam</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">✈️</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Máy Bay</h3>
                <p className="text-sm opacity-80">Bay nội địa với giá tốt nhất</p>
              </div>
            </div> */}
          </div>

          <div className="mt-12 p-6 rounded-xl bg-white/10 backdrop-blur-sm">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTctONQKdqz9fDyXxnAT5EkdmGiShSbnLZmrT9mVvjAog&s=10"
              alt="Vietnam Travel"
              className="w-full h-48 object-cover rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="max-w-md w-full">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">Chào Mừng Trở Lại</h2>
            <p className="text-muted-foreground">Đăng nhập để tiếp tục hành trình của bạn</p>
          </div>
          <div className="relative flex py-3 items-center my-2">
            <div className="flex-grow border-t border-gray-300"></div>

            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm mb-2 text-foreground">Email / Tên đăng nhập</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your.email@example.com"
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-foreground">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground">Ghi nhớ đăng nhập</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                Quên mật khẩu?
              </Link>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Đăng Nhập
            </button>
          </form>
          <div className="relative flex py-3 items-center my-2">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-xs uppercase">Hoặc</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <div className="flex justify-center w-full">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => {
                toast.error('Đăng nhập bằng Google thất bại');
              }}
              useOneTap
            />
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Chưa có tài khoản?{' '}
            <button onClick={() => navigate('/register')} className="text-primary hover:underline">
              Đăng ký ngay
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}