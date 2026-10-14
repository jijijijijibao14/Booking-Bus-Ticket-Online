import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bus, Users, Calendar, DollarSign, ChevronLeft, Plus, TrendingUp, AlertCircle, MapPin, MessageSquare } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMerchantProfile, getMerchantStats, getMerchantFleet, getMerchantDrivers, getMerchantSchedules, createMerchantSchedule, updateMerchantSchedule, deleteMerchantSchedule, createMerchantBus, updateMerchantBus, deleteMerchantBus, createMerchantDriver, updateMerchantDriver, deleteMerchantDriver, getMerchantRefunds, approveMerchantRefund, rejectMerchantRefund, } from '@/api';
import MerchantOverview from './MerchantOverview';
import MerchantVehicle from './MerchantVehicle';
import MerchantDriver from './MerchantDriver';
import MerchantSchedule from './MerchantSchedule';
import MerchantRefund from './MerchantRefund';

type Tab = 'overview' | 'fleet' | 'drivers' | 'schedule' |'refunds'| 'analytics'|'feedback';
type Resource = 'bus' | 'driver' | 'schedule';

const provinceOptions = [
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

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State cho dữ liệu thật
  const [stats, setStats] = useState<any>({});
  const [merchantProfile, setMerchantProfile] = useState<any>(null);
  const [buses, setBuses] = useState<any[]>([]);
  const [showBusModal, setShowBusModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isEditingBus, setIsEditingBus] = useState(false);
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);

  const [busForm, setBusForm] = useState({
    id: "",
    plateNumber: "",
    type: "Bus",
    seats: "",
    status: "",
    name: "",
  });

  const [driverForm, setDriverForm] = useState({
    id: "",
    driver_name: "",
    driver_phone: "",
    experience: "",
    status: "",
  });

  const [scheduleForm, setScheduleForm] = useState({
    id: "",
    departureLocation: "",
    arrivalLocation: "",
    vehicleId: "",
    driverId: "",
    departureTime: "",
    price: "",
    status: "scheduled",
  });
  const [showDepartureSuggestions, setShowDepartureSuggestions] = useState(false);
  const [showArrivalSuggestions, setShowArrivalSuggestions] = useState(false);

  const filteredDepartureOptions = provinceOptions.filter((name) =>
    name.toLowerCase().includes(scheduleForm.departureLocation.toLowerCase()) && scheduleForm.departureLocation.trim().length >= 1
  );

  const filteredArrivalOptions = provinceOptions.filter((name) =>
    name.toLowerCase().includes(scheduleForm.arrivalLocation.toLowerCase()) && scheduleForm.arrivalLocation.trim().length >= 1
  );

  const getMinDepartureDateTime = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16);
  };

  const sortSchedulesByRecency = (items: any[] = []) => {
    return [...items].sort((a, b) => {
      const getSortValue = (item: any) => {
        const rawTimestamp = item.createdAt || item.created_at || item.created || item.updatedAt || item.updated_at || item.updated;
        if (rawTimestamp) {
          const parsedTime = new Date(rawTimestamp).getTime();
          if (!Number.isNaN(parsedTime)) {
            return parsedTime;
          }
        }

        const numericId = Number(item.id);
        return Number.isFinite(numericId) ? numericId : 0;
      };

      return getSortValue(b) - getSortValue(a);
    });
  };

  // Các công cụ hỗ trợ thí nghiệm: chuẩn hóa và xác thực
  const normalizePlate = (s: string) => (s || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const isValidPlate = (p: string) => {
    // After normalization expect formats like 51A-123.45 (2 digits + letter + 5 digits)
    return /^[0-9]{2}[A-Z][0-9]{5}$/.test(p);
  };

  const [busFormError, setBusFormError] = useState<string>('');
  const [driverFormError, setDriverFormError] = useState<string>('');
  const [scheduleFormError, setScheduleFormError] = useState<string>('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ resource: Resource; item: any } | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profileRes = await getMerchantProfile();
        setMerchantProfile(profileRes.data.data);
      } catch (err) {
        console.error('Không thể tải profile nhà xe:', err);
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === 'overview' || activeTab === 'analytics') {
          const statsRes = await getMerchantStats();
          setStats(statsRes.data.data);
          setRevenueData(statsRes.data.data.revenueChart);
        } else if (activeTab === 'fleet') {
          const fleetRes = await getMerchantFleet();
          setBuses(fleetRes.data.data);
        } else if (activeTab === 'drivers') {
          const driversRes = await getMerchantDrivers();
          setDrivers(driversRes.data.data);
        } else if (activeTab === 'schedule') {
          const [schedulesRes, fleetRes, driversRes] = await Promise.all([
            getMerchantSchedules(),
            getMerchantFleet(),
            getMerchantDrivers(),
          ]);
          setSchedules(sortSchedulesByRecency(schedulesRes.data.data || []));
          setBuses(fleetRes.data.data);
          setDrivers(driversRes.data.data);
        } else if (activeTab === 'refunds') {
          const refundsRes = await getMerchantRefunds();
          setRefunds(refundsRes.data.data);
        }
      } catch (err) {
        setError('Không thể tải dữ liệu. Vui lòng thử lại.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab]);

  const menuItems = [
    { id: 'overview' as Tab, label: 'Tổng Quan', icon: LayoutDashboard },
    { id: 'fleet' as Tab, label: 'Quản Lý Xe', icon: Bus },
    { id: 'drivers' as Tab, label: 'Tài Xế', icon: Users },
    { id: 'schedule' as Tab, label: 'Lịch Trình', icon: Calendar },
    { id: 'refunds' as Tab, label: 'Hoàn Tiền', icon: AlertCircle },
    { id: 'analytics' as Tab, label: 'Báo Cáo', icon: DollarSign },
    { id: 'feedback' as Tab, label: 'Đánh Giá', icon: MessageSquare },
  ];

  // Helper để hiển thị loading/error
  const renderContent = (content: React.ReactNode) => {
    if (loading) return <div className="text-center p-10">Đang tải dữ liệu...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    return content;
  };

  const handleAdd = (resource: Resource) => {
    if (resource === 'bus') {
      setIsEditingBus(false);
      setBusForm({
        id: "",
        plateNumber: "",
        type: "Bus",
        seats: "",
        status: "",
        name: "",
      });
      setBusFormError('');
      setShowBusModal(true);
    } else if (resource === 'driver') {
      setIsEditingDriver(false);
      setDriverForm({
        id: "",
        driver_name: "",
        driver_phone: "",
        experience: "",
        status: "",
      });
      setDriverFormError('');
      setShowDriverModal(true);
    } else {
      setIsEditingSchedule(false);
      setScheduleForm({
        id: "",
        departureLocation: "",
        arrivalLocation: "",
        vehicleId: "",
        driverId: "",
        departureTime: "",
        price: "",
        status: "scheduled",
      });
      setShowDepartureSuggestions(false);
      setShowArrivalSuggestions(false);
      setScheduleFormError('');
      setShowScheduleModal(true);
    }
  };

  const handleEdit = (resource: Resource, item: any) => {
    if (resource === 'bus') {
      setIsEditingBus(true);
      setBusForm({
        id: item.id,
        plateNumber: item.plate_number || item.plateNumber,
        type: item.type || 'Bus',
        seats: item.seats,
        status: item.status || 'active',
        name: item.name,
      });
      setBusFormError('');
      setShowBusModal(true);
    } else if (resource === 'driver') {
      setIsEditingDriver(true);
      setDriverForm({
        id: item.id,
        driver_name: item.driver_name || item.name,
        driver_phone: item.driver_phone || item.phone,
        experience: item.experience || '',
        status: item.status || 'available',
      });
      setDriverFormError('');
      setShowDriverModal(true);
    } else {
      setIsEditingSchedule(true);
      setScheduleForm({
        id: item.id,
        departureLocation: item.departureLocation || '',
        arrivalLocation: item.arrivalLocation || '',
        vehicleId: item.vehicleId?.toString() || '',
        driverId: item.driverId?.toString() || '',
        departureTime: item.departureTime || '',
        price: item.price?.toString() || '',
        status: item.status || 'scheduled',
      });
      setShowDepartureSuggestions(false);
      setShowArrivalSuggestions(false);
      setScheduleFormError('');
      setShowScheduleModal(true);
    }
  };

  const handleDelete = (resource: Resource, item: any) => {
    setDeleteTarget({ resource, item });
    setShowDeleteModal(true);
  };

  const handleApproveRefund = async (refund: any) => {
    setLoading(true);
    setError(null);
    try {
      await approveMerchantRefund(refund.id);
      const refundsRes = await getMerchantRefunds();
      setRefunds(refundsRes.data.data);
    } catch (err: any) {
      console.error('Lỗi duyệt hoàn tiền:', err);
      setError(err.response?.data?.message || err.message || 'Duyệt hoàn tiền thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRefund = async (refund: any) => {
    setLoading(true);
    setError(null);
    try {
      await rejectMerchantRefund(refund.id);
      const refundsRes = await getMerchantRefunds();
      setRefunds(refundsRes.data.data);
    } catch (err: any) {
      console.error('Lỗi từ chối hoàn tiền:', err);
      setError(err.response?.data?.message || err.message || 'Từ chối hoàn tiền thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (resource: Resource, field: string, value: any) => {
    if (resource === 'bus') {
      setBusForm((prev) => ({ ...prev, [field]: value }));
    } else if (resource === 'driver') {
      setDriverForm((prev) => ({ ...prev, [field]: value }));
    } else {
      setScheduleForm((prev) => ({ ...prev, [field]: value }));
      if (field === 'departureLocation') {
        setShowDepartureSuggestions(value.length >= 1);
      }
      if (field === 'arrivalLocation') {
        setShowArrivalSuggestions(value.length >= 1);
      }
    }
  };

  const handleSave = async (resource: Resource) => {
    if (resource === 'bus') {
      try {
        const trimmedPlateNumber = busForm.plateNumber.trim();
        const trimmedName = busForm.name.trim();
        const seatsNumber = Number(busForm.seats);

        if (!trimmedName || !trimmedPlateNumber || !busForm.type || !busForm.status) {
          setBusFormError('Vui lòng điền đầy đủ thông tin.');
          return;
        }

        const normalizedPlate = normalizePlate(trimmedPlateNumber);
        if (!isValidPlate(normalizedPlate)) {
          setBusFormError('Biển số không hợp lệ. Ví dụ hợp lệ: 51A-123.45');
          return;
        }
        setBusFormError('');

        if (!busForm.seats || Number.isNaN(seatsNumber) || seatsNumber < 1) {
          setBusFormError('Số ghế phải lớn hơn hoặc bằng 1.');
          return;
        }
        setBusFormError('');
        const payload = {
          vehicle_name: trimmedName,
          license_plate: trimmedPlateNumber,
          vehicle_type: busForm.type,
          total_seats: seatsNumber,
          status: (busForm.status || 'active').toString().toLowerCase(),
        };

        if (isEditingBus && busForm.id) {
          await updateMerchantBus(busForm.id, payload);
        } else {
          await createMerchantBus(payload);
        }

        const fleetRes = await getMerchantFleet();
        setBuses(fleetRes.data.data);
        setShowBusModal(false);
      } catch (err: any) {
        console.error('Lỗi lưu xe:', err);
        const serverMessage = err.response?.data?.message || err.message || 'Lỗi khi lưu dữ liệu xe.';
        setBusFormError(serverMessage);
      }
    } else if (resource === 'driver') {
      try {
        const trimmedName = driverForm.driver_name.trim();
        const rawPhone = (driverForm.driver_phone || '').trim();
        const experienceNumber = Number(driverForm.experience);

        if (!trimmedName || !rawPhone || !driverForm.status) {
          setDriverFormError('Vui lòng điền đầy đủ thông tin tài xế.');
          return;
        }

        if (driverForm.experience && (Number.isNaN(experienceNumber) || experienceNumber < 1)) {
          setDriverFormError('Kinh nghiệm ít nhất là 1 năm.');
          return;
        }
        const normalized = rawPhone.replace(/[\s\-()]/g, '');
        const isValidPhone = /^0\d{9}$/.test(normalized);
        if (!isValidPhone) {
          setDriverFormError('Số điện thoại phải có 10 số và bắt đầu bằng 0.');
          return;
        }
        setDriverFormError('');

        const payload = {
          driver_name: trimmedName,
          driver_phone: normalized,
          experience: Number.isNaN(experienceNumber) ? undefined : experienceNumber,
          status: driverForm.status || 'available',
        };

        if (isEditingDriver && driverForm.id) {
          await updateMerchantDriver(driverForm.id, payload);
        } else {
          await createMerchantDriver(payload);
        }

        const driversRes = await getMerchantDrivers();
        setDrivers(driversRes.data.data);
        setShowDriverModal(false);
      } catch (err: any) {
        console.error('Lỗi lưu tài xế:', err);
        const serverMessage = err.response?.data?.message || err.message || 'Lỗi khi lưu dữ liệu tài xế.';
        setDriverFormError(serverMessage);
      }
    } else {
      try {
        const departureLocation = scheduleForm.departureLocation.trim();
        const arrivalLocation = scheduleForm.arrivalLocation.trim();
        const vehicleId = Number(scheduleForm.vehicleId);
        const driverId = Number(scheduleForm.driverId);
        const departureTime = scheduleForm.departureTime.trim();
        const basePrice = Number(scheduleForm.price);

        if (!departureLocation || !arrivalLocation || !vehicleId || !driverId || !departureTime || !scheduleForm.price) {
          setScheduleFormError('Vui lòng điền đầy đủ thông tin lịch trình.');
          return;
        }

        // Valid chọn biển số xe hợp lệ
        const selectedVehicle = buses.find((b) => Number(b.id) === vehicleId);
        const vehiclePlateRaw = selectedVehicle ? (selectedVehicle.plate_number || selectedVehicle.plateNumber || '') : '';
        const normalizedVehiclePlate = normalizePlate(vehiclePlateRaw);
        if (!isValidPlate(normalizedVehiclePlate)) {
          setScheduleFormError('Xe được chọn có biển số không hợp lệ. Vui lòng kiểm tra thông tin xe.');
          return;
        }

        if (departureLocation === arrivalLocation) {
          setScheduleFormError('Điểm đi và điểm đến phải khác nhau.');
          return;
        }

        const departureDate = new Date(departureTime);
        if (Number.isNaN(departureDate.getTime())) {
          setScheduleFormError('Thời gian đi không hợp lệ.');
          return;
        }

        const now = new Date();
        if (departureDate.getTime() <= now.getTime()) {
          setScheduleFormError('Thời gian đi phải là hiện tại hoặc trong tương lai.');
          return;
        }

        if (Number.isNaN(basePrice) || basePrice <= 0) {
          setScheduleFormError('Giá vé phải là một số lớn hơn 0.');
          return;
        }

        const arrivalDate = new Date(departureDate.getTime() + 24 * 60 * 60 * 1000); // 24 giờ mới cho phép trùng tài xế
        const hasVehicleConflict = schedules.some((s) => {
          if (isEditingSchedule && Number(s.id) === Number(scheduleForm.id)) {
            return false;
          }
          const sVehicleId = Number(s.vehicleId || s.vehicle_id || s.vehicle?.id || 0);
          if (sVehicleId && sVehicleId === vehicleId) {
            const sDep = new Date(s.departureTime);
            const sArr = s.arrivalTime ? new Date(s.arrivalTime) : new Date(sDep.getTime() + 24 * 60 * 60 * 1000);
            return !(arrivalDate <= sDep || departureDate >= sArr);
          }
          return false;
        });

        const hasDriverConflict = schedules.some((s) => {
          if (isEditingSchedule && Number(s.id) === Number(scheduleForm.id)) {
            return false;
          }
          if (s.driverId && Number(s.driverId) === driverId) {
            const sDep = new Date(s.departureTime);
            const sArr = s.arrivalTime ? new Date(s.arrivalTime) : new Date(sDep.getTime() + 24 * 60 * 60 * 1000);
            return !(arrivalDate <= sDep || departureDate >= sArr);
          }
          return false;
        });

        if (hasDriverConflict) {
          setScheduleFormError('Tài xế đã được phân công cho chuyến khác trong cùng khung giờ.');
          return;
        }

        if (hasVehicleConflict) {
          setScheduleFormError('Xe đã được phân công cho chuyến khác trong cùng khung giờ.');
          return;
        }
        
        setScheduleFormError('');

        const payload: any = {
          departure_location: departureLocation,
          arrival_location: arrivalLocation,
          vehicle_id: vehicleId,
          driver_id: driverId,
          departure_time: departureTime,
          base_price: basePrice,
          status: scheduleForm.status || undefined,
        };

        if (isEditingSchedule && scheduleForm.id) {
          await updateMerchantSchedule(scheduleForm.id, payload);
        } else {
          await createMerchantSchedule(payload);
        }

        const schedulesRes = await getMerchantSchedules();
        setSchedules(sortSchedulesByRecency(schedulesRes.data.data || []));
        setShowScheduleModal(false);
      } catch (err: any) {
        console.error('Lỗi lưu lịch trình:', err);
        const serverMessage = err.response?.data?.message || err.message || 'Lỗi khi lưu dữ liệu lịch trình.';
        setScheduleFormError(serverMessage);
      }
    }
  };

  return (
    <div className="min-h-screen bg-muted flex">
      <aside
        className={`${sidebarCollapsed ? 'w-20' : 'w-64'
          } bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col border-r border-sidebar-border`}
      >
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => navigate('/merchant/info')}
              className="text-left"
            >
              <h1 className="font-semibold text-lg text-white hover:text-blue-500 transition-colors">
                {merchantProfile?.fullname || 'Merchant Portal'}
              </h1>
              <p className="text-xs text-sidebar-foreground/70">Merchant Portal</p>
            </button>
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === item.id
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'hover:bg-sidebar-accent text-sidebar-foreground/80'
                    }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
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
            <MerchantOverview
              stats={stats}
              schedules={schedules}
              loading={loading}
              error={error}
            />
          )}

          {activeTab === 'fleet' && (
            <MerchantVehicle
              buses={buses}
              loading={loading}
              error={error}
              onAdd={() => handleAdd('bus')}
              onEdit={(item: any) => handleEdit('bus', item)}
              onDelete={(item: any) => handleDelete('bus', item)}
            />
          )}

          {activeTab === 'drivers' && (
            <MerchantDriver
              drivers={drivers}
              loading={loading}
              error={error}
              onAdd={() => handleAdd('driver')}
              onEdit={(item: any) => handleEdit('driver', item)}
              onDelete={(item: any) => handleDelete('driver', item)}
            />
          )}

          {activeTab === 'schedule' && (
            <MerchantSchedule
              schedules={schedules}
              buses={buses}
              drivers={drivers}
              loading={loading}
              error={error}
              onAdd={() => handleAdd('schedule')}
              onEdit={(item: any) => handleEdit('schedule', item)}
              onDelete={(item: any) => handleDelete('schedule', item)}
            />
          )}

          {activeTab === 'refunds' && (
            <MerchantRefund
              refunds={refunds}
              loading={loading}
              error={error}
              onApprove={handleApproveRefund}
              onReject={handleRejectRefund}
            />
          )}

          {activeTab === 'analytics' && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">Báo Cáo & Phân Tích</h2>
                <p className="text-muted-foreground">Thống kê doanh thu và hiệu suất</p>
              </div>

              {renderContent(<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-6 border border-border">
                  <h3 className="font-semibold mb-4">Doanh Thu 6 Tháng Gần Nhất</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `${value}M`} />
                      <Tooltip formatter={(value) => `${value}M₫`} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#1e3a8a" strokeWidth={3} name="Doanh thu (triệu)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>)}
            </>
          )}
        </div>

        {showBusModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="w-full max-w-md bg-white rounded-lg p-6 border border-border">
              <h3 className="text-lg font-semibold mb-4">{isEditingBus ? 'Chỉnh sửa xe' : 'Thêm xe mới'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm mb-1">Tên hạng xe</label>
                  <input value={busForm.name} onChange={(e) => handleChange('bus', 'name', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Biển số</label>
                  <input value={busForm.plateNumber} onChange={(e) => handleChange('bus', 'plateNumber', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-1">Loại</label>
                    <input value={busForm.type} className="w-full px-3 py-2 border border-border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Số ghế</label>
                    <input value={busForm.seats} onChange={(e) => handleChange('bus', 'seats', e.target.value)} type="number" className="w-full px-3 py-2 border border-border rounded-lg" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm mb-1">Trạng thái</label>
                  <select value={busForm.status} onChange={(e) => handleChange('bus', 'status', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg">
                    <option value="" style={{ color: "#65676a" }}>--Chọn trạng thái--</option>
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                {busFormError && (
                  <div className="text-sm text-red-600 mt-1">{busFormError}</div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowBusModal(false)} className="px-4 py-2 rounded-lg border">Hủy</button>
                  <button onClick={() => handleSave('bus')} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground">Lưu</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDriverModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="w-full max-w-md bg-white rounded-lg p-6 border border-border">
              <h3 className="text-lg font-semibold mb-4">{isEditingDriver ? 'Chỉnh sửa tài xế' : 'Thêm tài xế mới'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm mb-1">Tên tài xế</label>
                  <input value={driverForm.driver_name} onChange={(e) => handleChange('driver', 'driver_name', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Số điện thoại</label>
                  <input value={driverForm.driver_phone} onChange={(e) => handleChange('driver', 'driver_phone', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-1">Kinh nghiệm(năm)</label>
                    <input value={driverForm.experience} onChange={(e) => handleChange('driver', 'experience', e.target.value)} type="number" className="w-full px-3 py-2 border border-border rounded-lg" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm mb-1">Trạng thái</label>
                  <select value={driverForm.status} onChange={(e) => handleChange('driver', 'status', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg">
                    <option value="" style={{ color: "#65676a" }}>--Chọn trạng thái--</option>
                    <option value="available">Sẵn Sàng</option>
                    <option value="on-trip">Đang chạy</option>
                    <option value="off-duty">Nghỉ</option>
                  </select>
                </div>
                {driverFormError && (
                  <div className="text-sm text-red-600 mt-1">{driverFormError}</div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowDriverModal(false)} className="px-4 py-2 rounded-lg border">Hủy</button>
                  <button onClick={() => handleSave('driver')} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground">Lưu</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showScheduleModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="w-full max-w-xl bg-white rounded-lg p-6 border border-border">
              <h3 className="text-lg font-semibold mb-4">{isEditingSchedule ? 'Chỉnh sửa lịch trình' : 'Thêm lịch trình mới'}</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="relative">
                  <label className="block text-sm mb-1 flex items-center gap-2 text-foreground">
                    <MapPin className="w-4 h-4" /> Điểm Khởi Hành
                  </label>
                  <input
                    value={scheduleForm.departureLocation}
                    onChange={(e) => handleChange('schedule', 'departureLocation', e.target.value)}
                    onFocus={() => setShowDepartureSuggestions(scheduleForm.departureLocation.trim().length >= 1)}
                    onBlur={() => setTimeout(() => setShowDepartureSuggestions(false), 150)}
                    placeholder="Nhập tỉnh/TP"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-white text-black"
                  />
                  {showDepartureSuggestions && filteredDepartureOptions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-border bg-white text-black shadow-lg">
                      {filteredDepartureOptions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onMouseDown={() => {
                            setScheduleForm((prev) => ({ ...prev, departureLocation: name }));
                            setShowDepartureSuggestions(false);
                          }}
                          className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-sm mb-1 flex items-center gap-2 text-foreground">
                    <MapPin className="w-4 h-4" /> Điểm Đến
                  </label>
                  <input
                    value={scheduleForm.arrivalLocation}
                    onChange={(e) => handleChange('schedule', 'arrivalLocation', e.target.value)}
                    onFocus={() => setShowArrivalSuggestions(scheduleForm.arrivalLocation.trim().length >= 1)}
                    onBlur={() => setTimeout(() => setShowArrivalSuggestions(false), 150)}
                    placeholder="Nhập tỉnh/TP"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-white text-black"
                  />
                  {showArrivalSuggestions && filteredArrivalOptions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-border bg-white text-black shadow-lg">
                      {filteredArrivalOptions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onMouseDown={() => {
                            setScheduleForm((prev) => ({ ...prev, arrivalLocation: name }));
                            setShowArrivalSuggestions(false);
                          }}
                          className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm mb-1">Chọn Xe</label>
                  <select
                    value={scheduleForm.vehicleId}
                    onChange={(e) => handleChange('schedule', 'vehicleId', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg"
                  >
                    <option value="">-- Chọn xe --</option>
                    {buses.filter((b) => (b.status || '').toString().toLowerCase() === 'active').map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.plateNumber || bus.plate_number} - {bus.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Chọn Tài Xế</label>
                  <select
                    value={scheduleForm.driverId}
                    onChange={(e) => handleChange('schedule', 'driverId', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg"
                  >
                    <option value="">-- Chọn tài xế --</option>
                    {drivers.filter((d) =>
                      (d.status || '').toString().toLowerCase() === 'available' ||
                      Number(d.id) === Number(scheduleForm.driverId)
                    ).map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name} ({driver.phone})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Thời gian đi</label>
                  <input
                    type="datetime-local"
                    value={scheduleForm.departureTime}
                    min={getMinDepartureDateTime()}
                    onChange={(e) => handleChange('schedule', 'departureTime', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-white text-black"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Trạng Thái</label>
                  <select value={scheduleForm.status} onChange={(e) => handleChange('schedule', 'status', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg">
                    <option value="" style={{ color: "#65676a" }}>--- Chọn trạng thái---</option>
                    <option value="Scheduled">Đã Lên Lịch</option>
                    <option value="Departed">Đang Chạy</option>
                    <option value="Completed">Đã Hoàn Thành</option>
                    <option value="Cancelled">Đã Hủy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Giá vé (₫)</label>
                  <input
                    type="number"
                    value={scheduleForm.price}
                    onChange={(e) => handleChange('schedule', 'price', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg"
                    placeholder="450000"
                  />
                </div>
                {scheduleFormError && (
                  <div className="text-sm text-red-600">{scheduleFormError}</div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowScheduleModal(false)} className="px-4 py-2 rounded-lg border">
                    Hủy
                  </button>
                  <button onClick={() => handleSave('schedule')} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                    Lưu
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteModal && deleteTarget && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="w-full max-w-md bg-white rounded-lg p-6 border border-border">
              <h3 className="text-lg font-semibold mb-4">Xác nhận xóa</h3>
              <p>Bạn có chắc chắn muốn xóa <strong>{deleteTarget.resource === 'bus' ? deleteTarget.item.name : deleteTarget.resource === 'driver' ? deleteTarget.item.driver_name || deleteTarget.item.name : deleteTarget.item.route}</strong> không?</p>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }} className="px-4 py-2 rounded-lg border">Hủy</button>
                  <button onClick={async () => {
                  try {
                    if (deleteTarget.resource === 'bus') {
                      await deleteMerchantBus(deleteTarget.item.id);
                      const fleetRes = await getMerchantFleet();
                      setBuses(fleetRes.data.data);
                    } else if (deleteTarget.resource === 'driver') {
                      await deleteMerchantDriver(deleteTarget.item.id);
                      const driversRes = await getMerchantDrivers();
                      setDrivers(driversRes.data.data);
                    } else {
                      await deleteMerchantSchedule(deleteTarget.item.id);
                      const schedulesRes = await getMerchantSchedules();
                      setSchedules(schedulesRes.data.data);
                    }
                    setShowDeleteModal(false);
                    setDeleteTarget(null);
                  } catch (err: any) {
                    console.error('Lỗi xóa dữ liệu:', err);
                    const serverMessage = err?.response?.data?.message || err?.message || 'Xóa thất bại. Vui lòng thử lại.';
                    alert(serverMessage);
                  }
                }} className="px-4 py-2 rounded-lg bg-red-600 text-white">Xóa</button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
