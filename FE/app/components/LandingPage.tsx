import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, Calendar, Users, MapPin, ShieldCheck, Clock, HeadphonesIcon, ThumbsUp, Mail, Phone, Facebook, Twitter, Instagram, User, ChevronDown, LogOut, Building2, LayoutDashboard, CalendarDays, RefreshCw, BarChart3, Star, MessageCircle, History } from 'lucide-react';
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'; 
import { motion } from 'motion/react';
import { getMerchantProfile, searchTrips } from '@/api';
import { toast } from 'sonner';

export default function LandingPage() {
  const navigate = useNavigate();
  const tripSearchRef = useRef<HTMLDivElement>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [partnerName, setPartnerName] = useState('');
  
  // Danh sách địa điểm gợi ý
  const locations = [
    'Hà Nội',
    'TP. Hồ Chí Minh',
    'Sài Gòn',
    'Đà Nẵng',
    'Hải Phòng',
    'Cần Thơ',
    'Quảng Ninh',
    'Lào Cai',
    'Sapa',
    'Đà Lạt',
    'Nha Trang',
    'Huế',
    'Nghệ An',
    'Thanh Hóa',
    'Bình Định',
    'Khánh Hòa',
    'Lâm Đồng',
    'Đắk Lắk',
    'Kiên Giang',
    'Bình Dương',
    'Đồng Nai'
  ];
  const [suggestions, setSuggestions] = useState<{ field: 'from' | 'to', list: string[] } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const name = localStorage.getItem('userName');
    const role = localStorage.getItem('role') || '';
    setIsLoggedIn(!!token);
    setUserRole(role);
    if (name) setUserName(name);
    if (token && role === 'Partner') {
      getMerchantProfile()
        .then((response) => {
          setPartnerName(response.data?.data?.brand_name || name || 'Nhà xe');
        })
        .catch((error) => {
          console.error('Không thể tải tên nhà xe:', error);
          setPartnerName(name || 'Nhà xe');
        });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userPhone');
    localStorage.removeItem('userStatus');
    localStorage.removeItem('rememberedEmail');
    setIsLoggedIn(false);
    setUserRole('');
    navigate('/');
  };

  const openMerchantPage = (tab: string) => {
    navigate(`/merchant/${tab}`);
  };

  const isPartner = isLoggedIn && userRole === 'Partner';

  const [searchData, setSearchData] = useState({
    from: '',
    to: '',
    departureDate: '',
    returnDate: '',
    passengers: 1,
  });

  const popularRoutes = [
    {
      from: 'Hà Nội',
      to: 'Sapa',
      label: 'Hà Nội - Sa Pa',
      image: 'https://images.unsplash.com/photo-1609412058473-c199497c3c5d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHxTYXBhJTIwcmljZSUyMHRlcnJhY2VzfGVufDF8fHx8fDE3ODA0NjcxMDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
      color: 'bg-[#718b91]',
    },
    {
      from: 'TP. Hồ Chí Minh',
      to: 'Cần Thơ',
      label: 'Sài Gòn - Cần Thơ',
      image: 'https://images.unsplash.com/photo-1561461221-959c3f16234b?auto=format&fit=crop&w=1000&q=80',
      color: 'bg-[#5c5277]',
    },
    {
      from: 'TP. Hồ Chí Minh',
      to: 'Đà Lạt',
      label: 'Sài Gòn - Đà Lạt',
      image: 'https://images.unsplash.com/photo-1722863075616-878d8b4bf3c7?auto=format&fit=crop&w=1000&q=80',
      color: 'bg-[#c47e51]',
    },
    {
      from: 'Đà Nẵng',
      to: 'Huế',
      label: 'Đà Nẵng - Huế',
      image: 'https://images.unsplash.com/photo-1559564484-e48b3e040ff4?auto=format&fit=crop&w=1000&q=80',
      color: 'bg-[#9b957e]',
    },
  ];

  const selectPopularRoute = (from: string, to: string) => {
    setSearchData((previous) => ({ ...previous, from, to }));
    tripSearchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const destinations = [
    {
      title: 'Ruộng bậc thang Sa Pa mùa lúa chín',
      image: 'https://images.unsplash.com/photo-1609412058473-c199497c3c5d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxTYXBhJTIwcmljZSUyMHRlcnJhY2VzJTIwVmlldG5hbXxlbnwxfHx8fDE3ODA0NjcxMDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
      location: 'Sa Pa, Lào Cai',
    },
    {
      title: 'Festival Hoa Đà Lạt tháng 11',
      image: 'https://images.unsplash.com/photo-1722863075616-878d8b4bf3c7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxEYSUyMExhdCUyMGZsb3dlciUyMGZlc3RpdmFsJTIwVmlldG5hbXxlbnwxfHx8fDE3ODA0NjcxMDZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
      location: 'Đà Lạt, Lâm Đồng',
    },
    {
      title: 'Trải nghiệm du thuyền Vịnh Hạ Long',
      image: 'https://images.unsplash.com/photo-1643029891412-92f9a81a8c16?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxIYSUyMExvbmclMjBCYXklMjBWaWV0bmFtJTIwc2NlbmljJTIwbGFuZHNjYXBlfGVufDF8fHx8MTc4MDQ2NzEwNHww&ixlib=rb-4.1.0&q=80&w=1080',
      location: 'Hạ Long, Quảng Ninh',
    },
    {
      title: 'Khám phá hang động Phong Nha',
      image: 'https://images.unsplash.com/photo-1593994602837-530142086918?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHw0fHxIYSUyMExvbmclMjBCYXklMjBWaWV0bmFtJTIwc2NlbmljJTIwbGFuZHNjYXBlfGVufDF8fHx8MTc4MDQ2NzEwNHww&ixlib=rb-4.1.0&q=80&w=1080',
      location: 'Phong Nha, Quảng Bình',
    },
    {
      title: 'Phố cổ Hội An & Đêm hội lồng đèn',
      image: 'https://images.unsplash.com/photo-1606801954050-be6b29588460?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxTYXBhJTIwcmljZSUyMHRlcnJhY2VzJTIwVmlldG5hbXxlbnwxfHx8fDE3ODA0NjcxMDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
      location: 'Hội An, Quảng Nam',
    },
    {
      title: 'Du lịch miệt vườn miền Tây',
      image: 'https://images.unsplash.com/photo-1561461221-959c3f16234b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxIYSUyMExvbmclMjBCYXklMjBWaWV0bmFtJTIwc2NlbmljJTIwbGFuZHNjYXBlfGVufDF8fHx8MTc4MDQ2NzEwNHww&ixlib=rb-4.1.0&q=80&w=1080',
      location: 'Đồng bằng sông Cửu Long',
    },
    {
      title: 'Vẻ đẹp cổ kính của Cố đô Huế',
      image: 'https://images.unsplash.com/photo-1559564484-e48b3e040ff4?q=80&w=1080&auto=format&fit=crop',
      location: 'Huế, Thừa Thiên Huế',
    },
    {
      title: 'Cầu rồng, Đà Nẵng',
      image: 'https://img5.thuthuatphanmem.vn/uploads/2022/01/13/hinh-anh-thanh-pho-da-nang-ve-dem-dep_024513140.jpg',
      location: 'Đà Nẵng',
    },
    {
      title: 'Thiên đường nghỉ dưỡng Phú Quốc',
      image: 'https://izitour.com/media/ckeditor/phu-quoc-beaches-sao.webp',
      location: 'Phú Quốc, Kiên Giang',
    },
  ];

  const handleSearch = async () => {
    // --- VALIDATION ---
    if (!searchData.from || !searchData.to || !searchData.departureDate) {
      toast.error('Vui lòng điền đủ thông tin', { description: 'Bạn cần chọn điểm đi, điểm đến và ngày khởi hành.' });
      return;
    }
    // So sánh sau khi đã chuẩn hóa (loại bỏ khoảng trắng và chuyển về chữ thường)
    if (searchData.from.trim().toLowerCase() === searchData.to.trim().toLowerCase()) {
      toast.error('Lỗi tìm kiếm', { description: 'Điểm đi và điểm đến không được trùng nhau.' });
      return;
    }
    // --- END VALIDATION ---

    try {
      // GỌI API TÌM CHUYẾN THẬT TỪ DATABASE
      const response = await searchTrips({
        from: searchData.from,
        to: searchData.to,
        departureDate: searchData.departureDate,
        type: 'Bus',
      });

      const results = response.data.data;
      console.log('Tìm thấy chuyến đi:', results); // In ra log để bạn tiện xem data DB

      // Chuyển trang và đẩy dữ liệu thật sang cho Trang Sơ đồ ghế xử lý tiếp
      navigate('/booking/bus', { state: { searchData, results } });
    } catch (error: any) {
      console.error('❌ API Error Details:', {
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
        params: { from: searchData.from, to: searchData.to, departureDate: searchData.departureDate, type: 'Bus' },
        error: error.response?.data || error.message
      });
      toast.error('Lỗi tìm kiếm', { description: error.response?.data?.message || error.message });
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Bus className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-primary">VIỆTGO</h1>
                <p className="text-xs text-muted-foreground">Một chạm kết nối, vạn dặm hành trình</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isLoggedIn ? (
                <>
                  {userRole === 'Customer' && (
                    <button
                      type="button"
                      onClick={() => navigate('/profile?tab=history')}
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <History className="h-4 w-4" />
                      Đơn hàng của tôi
                    </button>
                  )}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => isPartner ? openMerchantPage('overview') : navigate(userRole === 'Admin' ? '/admin' : '/profile')}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-blue-900 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      aria-haspopup="true"
                    >
                      <User className="h-5 w-5" />
                      <span className="max-w-44 truncate">
                        {isPartner ? partnerName || userName || 'Nhà xe' : userName || 'Customer'}
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {(isPartner || userRole === 'Customer' || userRole === 'Admin') && (
                      <div className="invisible absolute right-0 top-full z-50 mt-2 w-64 translate-y-1 rounded-2xl border border-blue-100 bg-white p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                        {(isPartner
                          ? [
                              { label: 'View Profile', icon: User, action: () => navigate('/merchant/info') },
                              { label: 'Tổng quan', icon: LayoutDashboard, action: () => openMerchantPage('overview') },
                              { label: 'Quản lí các chuyến', icon: Bus, action: () => openMerchantPage('operations') },
                              { label: 'Yêu cầu hoàn tiền', icon: RefreshCw, action: () => openMerchantPage('refunds') },
                              { label: 'Báo cáo doanh thu', icon: BarChart3, action: () => openMerchantPage('analytics') },
                              { label: 'Đánh giá', icon: Star, action: () => openMerchantPage('feedback') },
                              { label: 'Tin nhắn', icon: MessageCircle, action: () => openMerchantPage('messages') },
                            ]
                          : userRole === 'Customer'
                            ? [{ label: 'View Profile', icon: User, action: () => navigate('/profile') }]
                            : [{ label: 'Quản trị', icon: LayoutDashboard, action: () => navigate('/admin') }]
                        ).map(({ label, icon: Icon, action }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={action}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-800"
                          >
                            <Icon className="h-4 w-4" />
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <LogOut className="h-4 w-4" />
                          Đăng xuất
                        </button>
                      </div>
                    )}
                  </div>
                </>
) : (
  <div className="flex items-center gap-3">
    <button
      onClick={() => navigate("/login")}
      className="px-6 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-white transition-all font-medium"
    >
      Đăng nhập
    </button>

    <button
      onClick={() => navigate("/register")}
      className="px-6 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-all font-medium shadow-sm"
    >
      Đăng ký
    </button>
  </div>
)}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section
          className="relative min-h-[600px] flex items-center justify-center bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.6), rgba(15, 23, 42, 0.8)), url('https://images.unsplash.com/photo-1643029891412-92f9a81a8c16?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxIYSUyMExvbmclMjBCYXklMjBWaWV0bmFtJTIwc2NlbmljJTIwbGFuZHNjYXBlfGVufDF8fHx8MTc4MDQ2NzEwNHww&ixlib=rb-4.1.0&q=80&w=1080')`,
          }}
        >
          <div className="max-w-4xl w-full mx-auto px-4">
            {isPartner ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/95 p-8 text-center shadow-2xl backdrop-blur-md md:p-12"
              >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <Building2 className="h-8 w-8" />
                </div>
                <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-700">Cổng đối tác VIỆTGO</p>
                <h2 className="mb-4 text-3xl font-extrabold leading-tight text-slate-900 md:text-4xl">
                  Chào mừng nhà xe {partnerName || userName || 'của bạn'}, hãy tiếp tục nào!
                </h2>
                <p className="mx-auto mb-7 max-w-xl text-slate-600">
                  Quản lý chuyến xe, theo dõi doanh thu và hỗ trợ hành khách trên cùng một nền tảng.
                </p>
                <button
                  type="button"
                  onClick={() => openMerchantPage('overview')}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
                >
                  <LayoutDashboard className="h-5 w-5" />
                  Mở trang quản lý
                </button>
              </motion.div>
            ) : (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-10 text-white"
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">Khám Phá Việt Nam <br /><span className="text-blue-300">Cùng Chúng Tôi</span></h2>
              <p className="text-lg opacity-90 font-light">Đặt vé xe khách dễ dàng, nhanh chóng</p>
            </motion.div>
            )}

            {!isPartner && (
            <motion.div
              ref={tripSearchRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-6 border border-white/20"
            >
              <div className="flex gap-2 mb-6 border-b border-border">
                <div className="flex items-center gap-2 px-6 py-3 border-b-2 border-primary text-primary">
                  <Bus className="w-5 h-5" />
                  <span>Điền thông tin</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="relative">
                  <label className="block text-sm mb-2 text-foreground">Điểm đi</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Hà Nội"
                      value={searchData.from}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchData({ ...searchData, from: val });
                        const filtered = locations.filter(l => l.toLowerCase().includes(val.toLowerCase()) && val !== '');
                        setSuggestions({ field: 'from', list: filtered });
                      }}
                      onBlur={() => setTimeout(() => setSuggestions(null), 200)}
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    />
                    {suggestions?.field === 'from' && suggestions.list.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {suggestions.list.map(loc => (
                          <button
                            key={loc}
                            className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm"
                            onClick={() => {
                              setSearchData({ ...searchData, from: loc });
                              setSuggestions(null);
                            }}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-sm mb-2 text-foreground">Điểm đến</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="TP. Hồ Chí Minh"
                      value={searchData.to}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchData({ ...searchData, to: val });
                        const filtered = locations.filter(l => l.toLowerCase().includes(val.toLowerCase()) && val !== '');
                        setSuggestions({ field: 'to', list: filtered });
                      }}
                      onBlur={() => setTimeout(() => setSuggestions(null), 200)}
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    />
                    {suggestions?.field === 'to' && suggestions.list.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {suggestions.list.map(loc => (
                          <button
                            key={loc}
                            className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm"
                            onClick={() => {
                              setSearchData({ ...searchData, to: loc });
                              setSuggestions(null);
                            }}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-sm mb-2 text-foreground">Ngày đi</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="date"
                      min={today}
                      value={searchData.departureDate}
                      onChange={(e) => setSearchData({ ...searchData, departureDate: e.target.value, returnDate: '' })} // Reset ngày về khi ngày đi thay đổi
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    />
                  </div>
                </div>

                  <div className="relative">
                  <label className="block text-sm mb-2 text-foreground">Ngày về</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <input
                        type="date"
                        min={searchData.departureDate || today}
                        disabled={!searchData.departureDate}
                        value={searchData.returnDate}
                      onChange={(e) => setSearchData({ ...searchData, returnDate: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                <div className="relative">
                  <label className="block text-sm mb-2 text-foreground">Số hành khách</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="number"
                      min="1"
                      value={searchData.passengers}
                      onChange={(e) => setSearchData({ ...searchData, passengers: parseInt(e.target.value) })}
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSearch}
                className="w-full py-4 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity text-lg"
              >
                Tìm Chuyến
              </button>
            </motion.div>
            )}
          </div>
        </section>

        {!isPartner && (
          <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <h2 className="mb-7 text-2xl font-bold text-slate-900">Tuyến đường phổ biến</h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {popularRoutes.map((route) => (
                  <button
                    key={route.label}
                    type="button"
                    onClick={() => selectPopularRoute(route.from, route.to)}
                    className="group overflow-hidden rounded-xl text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    aria-label={`Tìm chuyến từ ${route.from} đến ${route.to}`}
                  >
                    <div className="h-48 overflow-hidden">
                      <img
                        src={route.image}
                        alt={route.label}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className={`${route.color} p-4 text-white`}>
                      <h3 className="text-lg font-bold">{route.label}</h3>
                      <p className="mt-1 text-sm text-white/90">Chọn tuyến để tìm chuyến xe</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Why Choose Us Section */}
        <section className="py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Tại sao nên chọn VIỆTGO?</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                VIỆTGO là nền tảng đặt vé tích hợp tiên phong tại Việt Nam, mang đến giải pháp toàn diện cho mọi chuyến đi của bạn.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {([
                { icon: <ShieldCheck className="w-8 h-8 text-blue-600" />, title: 'An toàn & Bảo mật', desc: 'Hệ thống thanh toán bảo mật tuyệt đối, đảm bảo an toàn.', bg: 'bg-blue-100' },
                { icon: <Clock className="w-8 h-8 text-emerald-600" />, title: 'Nhanh chóng', desc: 'Đặt vé chỉ trong vài phút, xác nhận tức thì qua email và SMS.', bg: 'bg-emerald-100' },
                { icon: <ThumbsUp className="w-8 h-8 text-orange-600" />, title: 'Giá cạnh tranh', desc: 'Cam kết mức giá tốt nhất cùng nhiều ưu đãi hấp dẫn.', bg: 'bg-orange-100' },
                { icon: <HeadphonesIcon className="w-8 h-8 text-purple-600" />, title: 'Hỗ trợ 24/7', desc: 'Đội ngũ CSKH luôn sẵn sàng hỗ trợ bạn bất cứ lúc nào.', bg: 'bg-purple-100' },
              ]).map((feature, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ y: -5 }}
                  className="group text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:border-primary/20 transition-all duration-300 cursor-default"
                >
                  <div className={`w-16 h-16 mx-auto ${feature.bg} rounded-2xl flex items-center justify-center mb-6 transform -rotate-6 group-hover:rotate-0 transition-transform duration-300`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-slate-800">{feature.title}</h3>
                  <p className="text-slate-500">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Destinations Section */}
        <section className="py-20 px-4 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Đồng hành cùng chúng tôi trên mọi miền tổ quốc</h2>
            <p className="text-slate-500 text-lg">Khám phá những danh lam thắng cảnh và địa danh nổi tiếng của Việt Nam</p>
          </div>

         <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 750: 2, 900: 3 }}>
  {/* Bắt buộc phải có thẻ Masonry ở đây để chia cột gạch */}
  <Masonry gutter="24px"> 
    {destinations.map((destination, index) => (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        key={index}
        className="relative group overflow-hidden rounded-2xl shadow-md hover:shadow-2xl transition-all duration-500 cursor-pointer mb-6"
      >
        <img
          src={destination.image}
          alt={destination.title}
          className="w-full h-auto object-cover group-hover:scale-110 transition-transform duration-700 ease-in-out"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent flex flex-col justify-end p-6 opacity-90 group-hover:opacity-100 transition-opacity">
          <h3 className="text-white font-bold text-xl mb-1 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">{destination.title}</h3>
          <p className="text-blue-200 text-sm mb-4 flex items-center gap-1 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75">
            <MapPin className="w-4 h-4" /> {destination.location}
          </p>
          <button
            onClick={handleSearch}
            className="self-start px-6 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors font-medium transform opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 duration-300 delay-100"
          >
            Khám phá ngay
          </button>
        </div>
      </motion.div>
    ))}
  </Masonry>
</ResponsiveMasonry>
        </section>
      </main>

      {/* Footer Section */}
      <footer className="bg-slate-900 text-slate-300 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Bus className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white">VIỆTGO</h3>
              </div>
              <p className="text-sm text-slate-400 mb-6">
                Nền tảng đặt vé xe khách thuận tiện tại Việt Nam. Đồng hành cùng bạn trên mọi nẻo đường.
              </p>
              <div className="flex gap-4">
                <a href="#" className="hover:text-white transition-colors"><Facebook className="w-5 h-5" /></a>
                <a href="#" className="hover:text-white transition-colors"><Twitter className="w-5 h-5" /></a>
                <a href="#" className="hover:text-white transition-colors"><Instagram className="w-5 h-5" /></a>
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Dịch vụ</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Vé xe khách</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Dịch vụ vận chuyển</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Hỗ trợ</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Hướng dẫn đặt vé</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Chính sách hủy/đổi</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Câu hỏi thường gặp</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Điều khoản dịch vụ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Thông tin liên hệ</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-secondary flex-shrink-0" />
                  <span>Tầng 12, Tòa nhà Tech Tower, 123 Đường Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội</span>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-secondary flex-shrink-0" />
                  <span>1900 1234 (Hỗ trợ 24/7)</span>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-secondary flex-shrink-0" />
                  <span>support@vietgo.vn</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-12 pt-8 text-center text-sm text-slate-500">
            <p>&copy; {new Date().getFullYear()} VIỆTGO. Tất cả các quyền được bảo lưu.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
