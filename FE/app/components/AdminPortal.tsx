import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Settings,
  RefreshCw,
  ChevronLeft,
  Building2,
  Percent,
  Clock,
  MessageCircle,
} from 'lucide-react';
import {
  getMerchantApprovals,
  processMerchantApproval,
  getWaitingRefunds,
  processAdminRefund,
} from '@/api';
import ConversationInbox from './communications/ConversationInbox';

type Tab = 'overview' | 'approvals' | 'commission' | 'refunds' | 'messages';

interface MerchantApproval {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  fleetSize: number;
  routes: string[];
  submittedDate: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface RefundRequest {
  id: string;
  bookingId: string;
  customerName: string;
  route: string;
  amount: number;
  requestDate: string;
  departureDate: string;
  reason: string;
  refundPercentage: number;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AdminPortal() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [merchantApprovals, setMerchantApprovals] = useState<MerchantApproval[]>([]);

  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);

  const [commissionRate, setCommissionRate] = useState(15);

  useEffect(() => {
    // Hàm Format dữ liệu Backend trả về cho khớp với cấu trúc UI
    const fetchApprovals = () => {
      getMerchantApprovals()
        .then((res: any) => {
          if (res.data.success) {
            const formattedData = res.data.data.map((merchant: any) => ({
              ...merchant,
              status: merchant.status === 'Pending Approval'
                ? 'pending'
                : merchant.status === 'Active'
                  ? 'approved'
                  : 'rejected',
              submittedDate: new Date(merchant.submittedDate).toLocaleDateString('vi-VN'),
              fleetSize: 0, // Dữ liệu này chưa có trong DB, sẽ bổ sung sau
              routes: [], // Dữ liệu này chưa có trong DB, sẽ bổ sung sau
            }));
            setMerchantApprovals(formattedData);
          }
        })
        .catch((err: any) => console.error("Lỗi tải danh sách chờ duyệt:", err));
    };
    // Gọi API lấy dữ liệu theo Tab đang được mở

    const formatRefunds = (data: any[]) => data.map((item: any) => ({
      id: item.id,
      bookingId: item.bookingCode,
      customerName: item.customer,
      route: item.route,
      amount: Number(item.totalAmount),
      requestDate: new Date(item.createdAt).toLocaleDateString('vi-VN'),
      departureDate: new Date(item.departureTime).toLocaleDateString('vi-VN'),
      reason: item.reason,
      refundPercentage: Number(item.refundPercent),
      status: item.status === 'WaitRefund' ? 'pending' : item.status.toLowerCase(),
    }));

    if (activeTab === 'approvals') {
      fetchApprovals();
    } else if (activeTab === 'refunds') {
      getWaitingRefunds()
        .then((res: any) => {
          if (res.data.success) {
            setRefundRequests(formatRefunds(res.data.data));
          }
        })
        .catch((err: any) => console.error("Lỗi tải yêu cầu hoàn tiền:", err));
    }
  }, [activeTab]);

  const handleMerchantAction = (id: string, action: 'approve' | 'reject') => {
    processMerchantApproval(id, action).then((res: any) => {
      if (res.data.success) {
        alert(res.data.message);
        // Tải lại danh sách sau khi thực hiện hành động
        setMerchantApprovals(merchantApprovals.filter(m => m.id !== id));
      } else {
        alert(`Lỗi: ${res.data.message}`);
      }
    }).catch((err: any) => {
      console.error("Lỗi xử lý đối tác:", err.response?.data?.message || err.message);
      alert('Đã có lỗi xảy ra phía server.');
    });
  };

  const handleRefundAction = (id: string, action: 'approve' | 'reject') => {
    processAdminRefund(id, action).then((res: any) => {
      if (res.data.success) {
        alert(res.data.message);
        // Tải lại danh sách sau khi thực hiện hành động
        setRefundRequests(refundRequests.filter(r => r.id !== id));
      } else {
        alert(`Lỗi: ${res.data.message}`);
      }
    }).catch((err: any) => {
      console.error("Lỗi xử lý hoàn tiền:", err.response?.data?.message || err.message);
      alert('Đã có lỗi xảy ra phía server.');
    });
  };

  const calculateRefund = (amount: number, percentage: number) => {
    return (amount * percentage) / 100;
  };

  const menuItems = [
    { id: 'overview' as Tab, label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'approvals' as Tab, label: 'Duyệt Đối Tác', icon: Building2 },
    { id: 'commission' as Tab, label: 'Cấu Hình Hoa Hồng', icon: Percent },
    { id: 'refunds' as Tab, label: 'Hoàn Tiền', icon: RefreshCw },
    { id: 'messages' as Tab, label: 'Tin Nhắn', icon: MessageCircle },
  ];

  const pendingMerchants = merchantApprovals.filter((m) => m.status === 'pending').length;
  const pendingRefunds = refundRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-muted flex">
      <aside
        className={`${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col border-r border-sidebar-border`}
      >
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          {!sidebarCollapsed && (
            <div>
              <h1 className="font-semibold text-lg">VIỆTGO Admin</h1>
              <p className="text-xs text-sidebar-foreground/70">Platform Management</p>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 hover:bg-sidebar-accent rounded-lg">
            <ChevronLeft className={`w-5 h-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors relative ${
                    activeTab === item.id
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'hover:bg-sidebar-accent text-sidebar-foreground/80'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                  {!sidebarCollapsed && item.id === 'approvals' && pendingMerchants > 0 && (
                    <span className="ml-auto w-6 h-6 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center">
                      {pendingMerchants}
                    </span>
                  )}
                  {!sidebarCollapsed && item.id === 'refunds' && pendingRefunds > 0 && (
                    <span className="ml-auto w-6 h-6 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center">
                      {pendingRefunds}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <button
            onClick={() => navigate('/login')}
            className="w-full px-4 py-2 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground text-sm"
          >
            {!sidebarCollapsed ? 'Đăng Xuất' : '↩'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {activeTab === 'overview' && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">Tổng Quan Hệ Thống</h2>
                <p className="text-muted-foreground">Dashboard quản trị nền tảng VIỆTGO</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-xl p-6 border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <h3 className="text-muted-foreground text-sm mb-1">Đối Tác Hoạt Động</h3>
                  <p className="text-3xl font-bold text-foreground">47</p>
                  <p className="text-xs text-muted-foreground mt-2">+3 trong tháng này</p>
                </div>

                <div className="bg-white rounded-xl p-6 border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                  <h3 className="text-muted-foreground text-sm mb-1">Đơn Đặt Vé Hôm Nay</h3>
                  <p className="text-3xl font-bold text-foreground">1,284</p>
                  <p className="text-xs text-green-600 mt-2">+12.3% so với hôm qua</p>
                </div>

                <div className="bg-white rounded-xl p-6 border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                  <h3 className="text-muted-foreground text-sm mb-1">Chờ Duyệt</h3>
                  <p className="text-3xl font-bold text-foreground">{pendingMerchants}</p>
                  <p className="text-xs text-muted-foreground mt-2">Đối tác mới</p>
                </div>

                <div className="bg-white rounded-xl p-6 border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                      <RefreshCw className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                  <h3 className="text-muted-foreground text-sm mb-1">Yêu Cầu Hoàn Tiền</h3>
                  <p className="text-3xl font-bold text-foreground">{pendingRefunds}</p>
                  <p className="text-xs text-muted-foreground mt-2">Cần xử lý</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-6 border border-border">
                  <h3 className="font-semibold mb-4">Hoạt Động Gần Đây</h3>
                  <div className="space-y-3">
                    <div className="flex gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold">Đối tác mới được duyệt</p>
                        <p className="text-muted-foreground text-xs">Mai Linh Express - 25 xe</p>
                      </div>
                    </div>
                    <div className="flex gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <RefreshCw className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold">Hoàn tiền đã xử lý</p>
                        <p className="text-muted-foreground text-xs">RFD-045 - 450,000₫</p>
                      </div>
                    </div>
                    <div className="flex gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                      <Settings className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold">Cập nhật hoa hồng</p>
                        <p className="text-muted-foreground text-xs">Tăng từ 12% lên 15%</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-border">
                  <h3 className="font-semibold mb-4">Cấu Hình Hệ Thống</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 rounded-lg border border-border">
                      <div>
                        <p className="font-semibold text-sm">Hoa hồng nền tảng</p>
                        <p className="text-xs text-muted-foreground">Tỷ lệ thu từ đối tác</p>
                      </div>
                      <p className="text-2xl font-bold text-primary">{commissionRate}%</p>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-lg border border-border">
                      <div>
                        <p className="font-semibold text-sm">Chính sách hoàn tiền</p>
                        <p className="text-xs text-muted-foreground">Tự động theo thời gian</p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs">Kích hoạt</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'approvals' && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">Duyệt Đối Tác Mới</h2>
                <p className="text-muted-foreground">Xem xét và phê duyệt đối tác đăng ký</p>
              </div>

              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="text-left p-4 font-semibold text-sm">Công Ty</th>
                      <th className="text-left p-4 font-semibold text-sm">Người Liên Hệ</th>
                      <th className="text-left p-4 font-semibold text-sm">Liên Hệ</th>
                      <th className="text-left p-4 font-semibold text-sm">Số Xe</th>
                      <th className="text-left p-4 font-semibold text-sm">Tuyến Đường</th>
                      <th className="text-left p-4 font-semibold text-sm">Ngày Gửi</th>
                      <th className="text-left p-4 font-semibold text-sm">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantApprovals.map((merchant) => (
                      <tr key={merchant.id} className="border-b border-border hover:bg-muted/50">
                        <td className="p-4">
                          <div>
                            <p className="font-semibold">{merchant.companyName}</p>
                            <p className="text-xs text-muted-foreground">{merchant.id}</p>
                          </div>
                        </td>
                        <td className="p-4">{merchant.contactPerson}</td>
                        <td className="p-4">
                          <div className="text-sm">
                            <p>{merchant.email}</p>
                            <p className="text-muted-foreground">{merchant.phone}</p>
                          </div>
                        </td>
                        <td className="p-4 font-semibold">{merchant.fleetSize}</td>
                        <td className="p-4">
                          <div className="space-y-1">
                            {merchant.routes.map((route, idx) => (
                              <span key={idx} className="block text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                                {route}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{merchant.submittedDate}</td>
                        <td className="p-4">
                          {merchant.status === 'pending' ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleMerchantAction(merchant.id, 'approve')}
                                className="p-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                                title="Duyệt"
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleMerchantAction(merchant.id, 'reject')}
                                className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                title="Từ chối"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`px-3 py-1 rounded-full text-xs ${
                                merchant.status === 'approved'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {merchant.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'commission' && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">Cấu Hình Hoa Hồng</h2>
                <p className="text-muted-foreground">Quản lý tỷ lệ hoa hồng nền tảng</p>
              </div>

              <div className="max-w-2xl">
                <div className="bg-white rounded-xl p-6 border border-border mb-6">
                  <h3 className="font-semibold mb-4">Tỷ Lệ Hoa Hồng Hiện Tại</h3>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1">
                      <input
                        type="range"
                        min="5"
                        max="30"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(parseInt(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>5%</span>
                        <span>15%</span>
                        <span>30%</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-4xl font-bold text-primary">{commissionRate}%</p>
                      <p className="text-xs text-muted-foreground">Hoa hồng</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 mb-4">
                    <p className="text-sm text-blue-900">
                      💡 Tỷ lệ hoa hồng áp dụng cho mọi giao dịch thành công trên nền tảng
                    </p>
                  </div>

                  <button className="w-full py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                    Cập Nhật Hoa Hồng
                  </button>
                </div>

                <div className="bg-white rounded-xl p-6 border border-border">
                  <h3 className="font-semibold mb-4">Ví Dụ Tính Hoa Hồng</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between p-3 rounded-lg bg-muted">
                      <span className="text-sm">Giá vé khách hàng trả:</span>
                      <span className="font-semibold">450,000₫</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg bg-muted">
                      <span className="text-sm">Hoa hồng nền tảng ({commissionRate}%):</span>
                      <span className="font-semibold text-primary">
                        {(450000 * commissionRate / 100).toLocaleString()}₫
                      </span>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg bg-primary/10 border border-primary">
                      <span className="text-sm font-semibold">Đối tác nhận được:</span>
                      <span className="font-bold text-primary">
                        {(450000 * (100 - commissionRate) / 100).toLocaleString()}₫
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'refunds' && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">Xử Lý Hoàn Tiền</h2>
                <p className="text-muted-foreground">Quản lý yêu cầu hoàn tiền từ khách hàng</p>
              </div>

              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="text-left p-4 font-semibold text-sm">Mã Đặt Vé</th>
                      <th className="text-left p-4 font-semibold text-sm">Khách Hàng</th>
                      <th className="text-left p-4 font-semibold text-sm">Tuyến</th>
                      <th className="text-left p-4 font-semibold text-sm">Số Tiền</th>
                      <th className="text-left p-4 font-semibold text-sm">Tỷ Lệ Hoàn</th>
                      <th className="text-left p-4 font-semibold text-sm">Hoàn Lại</th>
                      <th className="text-left p-4 font-semibold text-sm">Lý Do</th>
                      <th className="text-left p-4 font-semibold text-sm">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundRequests.map((refund) => (
                      <tr key={refund.id} className="border-b border-border hover:bg-muted/50">
                        <td className="p-4">
                          <div>
                            <p className="font-mono font-semibold text-sm">{refund.bookingId}</p>
                            <p className="text-xs text-muted-foreground">{refund.id}</p>
                          </div>
                        </td>
                        <td className="p-4">{refund.customerName}</td>
                        <td className="p-4 text-sm">{refund.route}</td>
                        <td className="p-4 font-semibold">{refund.amount.toLocaleString()}₫</td>
                        <td className="p-4">
                          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                            {refund.refundPercentage}%
                          </span>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-primary">
                            {calculateRefund(refund.amount, refund.refundPercentage).toLocaleString()}₫
                          </p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm max-w-xs">{refund.reason}</p>
                          <p className="text-xs text-muted-foreground mt-1">Khởi hành: {refund.departureDate}</p>
                        </td>
                        <td className="p-4">
                          {refund.status === 'pending' ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRefundAction(refund.id, 'approve')}
                                className="px-4 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors text-xs font-semibold whitespace-nowrap"
                              >
                                Xác Nhận Hoàn
                              </button>
                              <button
                                onClick={() => handleRefundAction(refund.id, 'reject')}
                                className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                title="Từ chối"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`px-3 py-1 rounded-full text-xs ${
                                refund.status === 'approved'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {refund.status === 'approved' ? 'Đã hoàn tiền' : 'Đã từ chối'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 border border-border">
                  <p className="text-sm text-muted-foreground mb-1">Chính Sách Hoàn Tiền</p>
                  <div className="space-y-2 mt-3">
                    <div className="flex justify-between text-xs">
                      <span>&gt; 7 ngày trước:</span>
                      <span className="font-semibold text-green-600">100%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>3-7 ngày trước:</span>
                      <span className="font-semibold text-blue-600">70%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>1-3 ngày trước:</span>
                      <span className="font-semibold text-orange-600">50%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>&lt; 24h:</span>
                      <span className="font-semibold text-red-600">0%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-border">
                  <p className="text-sm text-muted-foreground mb-1">Tổng Hoàn Tiền Hôm Nay</p>
                  <p className="text-2xl font-bold text-primary mt-2">2,450,000₫</p>
                </div>

                <div className="bg-white rounded-xl p-4 border border-border">
                  <p className="text-sm text-muted-foreground mb-1">Yêu Cầu Đang Chờ</p>
                  <p className="text-2xl font-bold text-orange-600 mt-2">{pendingRefunds}</p>
                </div>
              </div>
            </>
          )}

          {activeTab === 'messages' && <ConversationInbox role="Admin" />}

        </div>
      </main>
    </div>
  );
}
