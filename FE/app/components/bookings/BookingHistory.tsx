import { useState, useEffect, useCallback } from 'react';
import { Bus, Ticket, ChevronDown, Loader2, ServerCrash, User, CheckCircle, Archive, XCircle, Clock, Send, Star } from 'lucide-react';
import { getBookingHistory, requestCancellation, submitTripFeedback } from '@/api';
import { toast } from 'sonner';

const vehicleIcons = {
  Bus: Bus,
};

const vehicleColors = {
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
  const [feedbackForm, setFeedbackForm] = useState<{
    ticketId: number;
    ratingSeats: number;
    ratingService: number;
    comment: string;
  } | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

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
    const isPast = firstTicket && new Date(firstTicket.arrival_time) < new Date();

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

  const handleSubmitFeedback = async () => {
    if (!feedbackForm) return;
    setSavingFeedback(true);
    try {
      await submitTripFeedback(feedbackForm.ticketId, {
        ratingSeats: feedbackForm.ratingSeats,
        ratingService: feedbackForm.ratingService,
        comment: feedbackForm.comment,
      });
      toast.success('Cảm ơn bạn đã đánh giá chuyến đi.');
      setFeedbackForm(null);
      await fetchHistory();
    } catch (err: any) {
      toast.error('Gửi đánh giá thất bại', { description: err.response?.data?.message || err.message });
    } finally {
      setSavingFeedback(false);
    }
  };

  const filteredBookings = bookings.filter(booking => {
    const { display_status, created_at } = booking;
    const firstTicket = booking.tickets?.[0];
    if (!firstTicket) return false;

    const isPastTrip = new Date(firstTicket.arrival_time) < new Date();
    
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
                        <div className="flex items-center gap-3">
                          <p className="font-bold text-primary">{Number(ticket.ticket_price).toLocaleString('vi-VN')}₫</p>
                          {activeTab === 'completed' && new Date(ticket.arrival_time) <= new Date() && (
                            ticket.feedback_id ? (
                              <span className="inline-flex items-center gap-1 text-sm text-amber-600" title="Đã đánh giá">
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {ticket.rating_seats}/5
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setFeedbackForm({
                                  ticketId: ticket.ticket_id,
                                  ratingSeats: 5,
                                  ratingService: 5,
                                  comment: '',
                                })}
                                className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                              >
                                Đánh giá
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                    {booking.tickets.some((ticket: any) => ticket.partner_reply) && (
                      <div className="space-y-2 px-2">
                        {booking.tickets.filter((ticket: any) => ticket.partner_reply).map((ticket: any) => (
                          <div key={`reply-${ticket.ticket_id}`} className="rounded-lg bg-blue-50 p-3 text-sm">
                            <p className="font-semibold text-blue-800">Phản hồi từ nhà xe</p>
                            <p className="mt-1 whitespace-pre-wrap text-slate-700">{ticket.partner_reply}</p>
                          </div>
                        ))}
                      </div>
                    )}
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
      {feedbackForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setFeedbackForm(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 id="feedback-title" className="text-xl font-bold text-slate-900">Đánh giá chuyến đi</h3>
            <p className="mt-1 text-sm text-slate-500">Chia sẻ trải nghiệm để nhà xe phục vụ tốt hơn.</p>
            <div className="my-5 space-y-4">
              {([
                { key: 'ratingSeats', label: 'Chất lượng ghế' },
                { key: 'ratingService', label: 'Chất lượng dịch vụ' },
              ] as const).map(({ key, label }) => (
                <div key={key}>
                  <p className="mb-2 text-center text-sm font-semibold text-slate-700">{label}</p>
                  <div className="flex justify-center gap-2" role="radiogroup" aria-label={`${label}: chọn số sao`}>
                    {Array.from({ length: 5 }, (_, index) => {
                      const rating = index + 1;
                      return (
                        <button
                          key={rating}
                          type="button"
                          role="radio"
                          aria-checked={feedbackForm[key] === rating}
                          aria-label={`${rating} sao`}
                          onClick={() => setFeedbackForm((previous) => previous ? { ...previous, [key]: rating } : previous)}
                        >
                          <Star className={`h-7 w-7 ${feedbackForm[key] >= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <textarea value={feedbackForm.comment} onChange={(event) => setFeedbackForm((previous) => previous ? { ...previous, comment: event.target.value } : previous)} maxLength={2000} rows={4} placeholder="Nhận xét của bạn..." className="w-full rounded-xl border border-blue-100 p-3 text-sm outline-none focus:border-blue-500" />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setFeedbackForm(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Để sau</button>
              <button type="button" onClick={handleSubmitFeedback} disabled={savingFeedback} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {savingFeedback ? 'Đang gửi...' : 'Gửi đánh giá'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}