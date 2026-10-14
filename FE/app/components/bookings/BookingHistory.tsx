import { useState, useEffect, useCallback } from 'react';
import { Bus, Train, Plane, Ticket, ChevronDown, Loader2, ServerCrash, User, CheckCircle, Archive, XCircle, Clock, Send } from 'lucide-react';
import { getBookingHistory, requestCancellation } from '@/api'; // Đảm bảo requestCancellation đã được import
import { toast } from 'sonner';

const vehicleIcons = {
  Flight: Plane,
  Train: Train,
  Bus: Bus,
};

const vehicleColors = {
  Flight: 'bg-blue-100 text-blue-600',
  Train: 'bg-orange-100 text-orange-600',
  Bus: 'bg-emerald-100 text-emerald-600',
};

export default function BookingHistory() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBooking, setExpandedBooking] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'completed' | 'cancelled'>('current');
  const [cancellationModal, setCancellationModal] = useState<{ isOpen: boolean; bookingCode: string | null }>({ isOpen: false, bookingCode: null });
  const [cancellationReason, setCancellationReason] = useState('');

  const fetchHistory = useCallback(async () => {
      try {
        setLoading(true);
        const response: any = await getBookingHistory();
        if (response.data.success) {
          setBookings(response.data.data);
        } else {
          throw new Error(response.data.message || 'Không thể tải lịch sử đặt vé.');
        }
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Không thể tải lịch sử đặt vé.');
        toast.error('Lỗi tải lịch sử đặt vé', { description: err.response?.data?.message || err.message });
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const toggleBooking = (bookingId: number) => {
    setExpandedBooking(expandedBooking === bookingId ? null : bookingId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStatusDisplay = (booking: any) => {
    const { display_status, created_at } = booking;
    const firstTicket = booking.tickets?.[0];
    const isPast = firstTicket && new Date(firstTicket.departure_time) < new Date();

    const PAYMENT_WINDOW_MS = 10 * 60 * 1000;
    const isExpiredPending = display_status === 'PaymentPending' && (new Date().getTime() - new Date(created_at).getTime() > PAYMENT_WINDOW_MS);

    if (isExpiredPending) {
      return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Thanh toán thất bại</span>;
    }

    switch (display_status) {
      case 'Active':
        if (isPast) {
          return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">Đã Hoàn Thành</span>;
        }
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-50 text-green-600">Sắp Đi</span>;
      case 'PaymentPending':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-50 text-yellow-600">Chờ Thanh Toán</span>;
      case 'CancellationPending':
        return <div className="flex items-center gap-1.5 text-xs text-yellow-600 font-medium"><Clock className="w-3.5 h-3.5" /> Chờ xử lý</div>;
      case 'RefundPending':
        return <div className="flex items-center gap-1.5 text-xs text-orange-600 font-medium"><Clock className="w-3.5 h-3.5" /> Chờ hoàn tiền</div>;
      case 'CancellationRejected':
        return <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium"><XCircle className="w-3.5 h-3.5" /> Từ chối hoàn tiền</div>;
      case 'Cancelled':
        return <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium"><CheckCircle className="w-3.5 h-3.5" /> Đã hủy</div>;
      default:
        return null;
    }
  };

  const canCancel = (booking: any) => {
    const firstTicket = booking.tickets?.[0];

    if (
      !firstTicket ||
      booking.payment_status !== 'Paid' ||
      ['Pending', 'WaitRefund', 'Approved', 'Rejected'].includes(booking.refund_status)
    ) {
      return false;
    }

    const now = new Date();
    const departureTime = new Date(firstTicket.departure_time);

    // Frontend chỉ kiểm tra chuyến vẫn chưa khởi hành.
    // Chính sách refund 100% / 80% / từ chối <24h
    // để backend quyết định khi user gửi yêu cầu.
    return departureTime.getTime() > now.getTime();
  };

  const openCancellationModal = (bookingCode: string) => {
    setCancellationModal({ isOpen: true, bookingCode });
    setCancellationReason('');
  };

  const handleRequestCancellation = async () => {
    if (!cancellationModal.bookingCode || !cancellationReason.trim()) {
      toast.error('Vui lòng nhập lý do hủy vé.');
      return;
    }

    try {
      const result: any = await requestCancellation(cancellationModal.bookingCode, cancellationReason);
      toast.success('Gửi yêu cầu thành công', { description: result.data.message });
      fetchHistory(); // Tải lại lịch sử đặt vé để cập nhật trạng thái
    } catch (err: any) {
      toast.error('Yêu cầu hủy vé thất bại', { description: err.response?.data?.message || err.message });
    } finally {
      setCancellationModal({ isOpen: false, bookingCode: null });
    }
  };

  const filteredBookings = bookings.filter(booking => {
    const { display_status, created_at } = booking;
    const firstTicket = booking.tickets?.[0];
    if (!firstTicket) return false;

    const isPastTrip = new Date(firstTicket.departure_time) < new Date();
    
    const PAYMENT_WINDOW_MS = 10 * 60 * 1000; 
    const isExpiredPending = display_status === 'PaymentPending' && (new Date().getTime() - new Date(created_at).getTime() > PAYMENT_WINDOW_MS);

    switch (activeTab) {
      case 'current':
        if (isPastTrip) return false; // Vé đã qua ngày khởi hành không phải là vé hiện tại
        if (display_status === 'PaymentPending' && isExpiredPending) return false; // Vé thanh toán thất bại không phải là vé hiện tại
        // Vé hiện tại bao gồm: Sắp đi, Chờ thanh toán, Chờ xử lý hủy, Chờ hoàn tiền
        return ['Active', 'PaymentPending', 'CancellationPending', 'RefundPending'].includes(display_status);
      case 'completed':
        return display_status === 'Active' && isPastTrip;
      case 'cancelled':
        return ['Cancelled', 'CancellationRejected'].includes(display_status) || isExpiredPending;
      default:
        return false;
    }
  });

  const emptyMessages = {
    current: 'Bạn không có vé nào sắp đi hoặc đang chờ thanh toán.',
    completed: 'Bạn chưa hoàn thành chuyến đi nào.',
    cancelled: 'Bạn không có vé nào đã hủy hoặc thanh toán thất bại.',
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 bg-white rounded-xl shadow-sm border border-border">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Đang tải lịch sử chuyến đi...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-64 bg-white rounded-xl shadow-sm border border-border text-center p-4">
        <ServerCrash className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="font-bold text-red-600">Đã xảy ra lỗi</h3>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border">
      <div className="p-6 border-b border-border">
        <h2 className="text-xl font-bold text-foreground">Lịch sử đặt vé</h2>
        <p className="text-muted-foreground mt-1">Theo dõi và quản lý tất cả các chuyến đi của bạn.</p>
      </div>
      <div className="px-6 border-b border-border">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('current')}
            className={`py-4 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'current'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCircle className="w-4 h-4" /> Vé Hiện Tại
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`py-4 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'completed'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Archive className="w-4 h-4" /> Vé Đã Hoàn Thành
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            className={`py-4 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'cancelled'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <XCircle className="w-4 h-4" /> Vé Đã Hủy / Thất Bại
          </button>
        </div>
      </div>
      <div className="p-4 md:p-6 space-y-4">
        {filteredBookings.length === 0 ? (
          <div className="text-center py-12">
            <Ticket className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground">{emptyMessages[activeTab]}</p>
          </div>
        ) : (
          filteredBookings.map((booking) => {
            const firstTicket = booking.tickets?.[0];
            if (!firstTicket) return null;
            const VehicleIcon = vehicleIcons[firstTicket.vehicle_type as keyof typeof vehicleIcons] || Ticket;

            return (
              <div key={booking.booking_id} className="border border-border rounded-xl overflow-hidden">
                <div onClick={() => toggleBooking(booking.booking_id)} className="w-full p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors text-left cursor-pointer">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${vehicleColors[firstTicket.vehicle_type as keyof typeof vehicleColors]}`}>
                    <VehicleIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
                    <div>
                      <p className="font-bold text-foreground truncate">{firstTicket.departure_location} → {firstTicket.arrival_location}</p>
                      <p className="text-sm text-muted-foreground">Mã: <span className="font-mono font-semibold">{booking.booking_code}</span></p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{formatDate(firstTicket.departure_time)}</p>
                      <p className="text-sm text-muted-foreground">Ngày đi</p>
                    </div>
                    <div className="hidden md:block">
                      <p className="font-semibold text-foreground">{booking.total_amount.toLocaleString('vi-VN')}₫</p>
                      <p className="text-sm text-muted-foreground">Tổng tiền</p>
                    </div>
                    <div className="hidden md:block">
                      {getStatusDisplay(booking)}
                    </div>
                    <div className="hidden md:flex justify-end">
                      {canCancel(booking) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openCancellationModal(booking.booking_code); }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                        >
                          Hủy vé
                        </button>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedBooking === booking.booking_id ? 'rotate-180' : ''}`} />
                </div>
                {expandedBooking === booking.booking_id && (
                  <div className="bg-muted/50 p-4 border-t border-border space-y-3">
                    <h4 className="font-semibold text-sm text-foreground px-2">Chi tiết vé:</h4>
                    {booking.tickets.map((ticket: any) => (
                      <div key={ticket.ticket_id} className="p-3 bg-white rounded-lg border border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <p className="font-medium text-foreground">{ticket.passenger_name}</p>
                        </div>
                        <p className="font-bold text-primary">{ticket.ticket_price.toLocaleString('vi-VN')}₫</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {cancellationModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setCancellationModal({ isOpen: false, bookingCode: null })}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Yêu cầu hủy vé</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Bạn đang gửi yêu cầu hủy vé cho đơn hàng <strong className="font-mono">{cancellationModal.bookingCode}</strong>.
              Hệ thống sẽ kiểm tra thời gian còn lại trước giờ khởi hành và áp dụng chính sách hoàn tiền tương ứng.
            </p>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Vui lòng cho biết lý do hủy vé..."
              className="w-full p-2 border rounded-md min-h-[100px] mb-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setCancellationModal({ isOpen: false, bookingCode: null })} className="px-4 py-2 rounded-lg border font-semibold hover:bg-muted">
                Không
              </button>
              <button onClick={handleRequestCancellation} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-2 hover:bg-primary/90">
                <Send className="w-4 h-4" /> Gửi yêu cầu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}