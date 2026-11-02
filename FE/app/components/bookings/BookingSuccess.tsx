import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, Download, Share2, Bus, Calendar, Clock, MapPin, User, CreditCard } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { toPng } from 'html-to-image';

interface JourneyDetails {
  trip?: {
    from?: string;
    to?: string;
    travelDate?: string;
    departureDate?: string;
    departureTime?: string;
    operator?: string;
    busType?: string;
  };
  seats?: string[] | string;
}

export default function BookingSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const bookingData = location.state || {};

  const passengerEmail = bookingData.email || localStorage.getItem('userEmail') || ''; 

  const ticketRef = useRef<HTMLDivElement>(null);
  const [hasSentEmail, setHasSentEmail] = useState(false);

  const qrCode = bookingData.qrCode; 
  const bookingId = bookingData.bookingCode || `DL${Date.now().toString().slice(-8)}`;
  const bookingDate = new Date().toLocaleDateString('vi-VN');
  const departInfo =
    bookingData.depart ||
    bookingData.displayInfo?.depart || {
    trip: bookingData.trip,
    seats: bookingData.seats,
  };
  const returnInfo =
    bookingData.return ||
    bookingData.displayInfo?.return;

  const renderJourneyDetails = (
    title: string,
    journey: JourneyDetails,
  ) => {
    const trip = journey.trip;
    const seats = Array.isArray(journey?.seats)
      ? journey.seats.join(', ')
      : journey?.seats || 'N/A';

    return (
      <section
        key={title}
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <h3 className="mb-3 font-semibold text-slate-900">
          {title}
        </h3>
        <p className="mb-4 flex items-center gap-2 text-lg font-bold text-primary">
          <MapPin className="h-5 w-5 shrink-0" />
          {trip?.from || 'N/A'} → {trip?.to || 'N/A'}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Ngày khởi hành</span>
            </div>
            <p className="font-medium">
              {trip?.travelDate || trip?.departureDate || 'N/A'}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Thời gian xuất phát</span>
            </div>
            <p className="font-medium">
              {trip?.departureTime || 'N/A'}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="text-sm">Ghế ngồi</span>
            </div>
            <p className="font-medium">{seats}</p>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Bus className="h-4 w-4" />
              <span className="text-sm">Nhà xe</span>
            </div>
            <p className="font-medium">
              {trip?.operator || 'N/A'}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Bus className="h-4 w-4" />
              <span className="text-sm">Hạng xe</span>
            </div>
            <p className="font-medium">
              {trip?.busType || 'N/A'}
            </p>
          </div>
        </div>
      </section>
    );
  };

  const getIcon = () => {
    return <Bus className="w-8 h-8" />;
  };

  const getTitle = () => {
    return 'Vé Xe Khách';
  };

  useEffect(() => {
    
      if (!passengerEmail || hasSentEmail || !ticketRef.current) return;

      const timeoutId = window.setTimeout(() => {
      const sendAutomaticEmail = async () => {
        if (!ticketRef.current) return;

        try {
          const base64Image = await toPng(ticketRef.current, {
            pixelRatio: 1,
            cacheBust: true,
            skipFonts: true,
          });

          const response = await fetch('http://localhost:3001/api/bookings/send-ticket-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: passengerEmail, ticketImage: base64Image })
          });

          if (!response.ok) {
            throw new Error(`Gửi email thất bại: HTTP ${response.status}`);
          }

          setHasSentEmail(true);
          console.log(`✅ Đã gửi vé tự động đến: ${passengerEmail}`);
        } catch (error) {
          console.error('❌ Lỗi tự động gửi vé:', error);
        }
      };

      void sendAutomaticEmail();
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [passengerEmail, hasSentEmail]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Đặt Vé Thành Công!</h1>
          <p className="text-muted-foreground">Vé điện tử của bạn đã sẵn sàng</p>
        </div>

        {/* ================= KHUNG CHỨA VÉ (CHỈ CHỤP PHẦN NÀY GỬI QUA EMAIL) ================= */}
        <div ref={ticketRef} className="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-primary/10">
          <div className="bg-gradient-to-r from-primary to-blue-700 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {getIcon()}
                <div>
                  <h2 className="text-xl font-semibold">{getTitle()}</h2>
                  <p className="text-sm opacity-90">VIỆTGO - E-Ticket</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-75">Mã đặt vé</p>
                <p className="font-mono font-semibold text-lg">{bookingId}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 rounded-xl border border-primary/15 bg-primary/5 p-4">
              <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">Ngày đặt vé</span>
              </div>
              <p className="font-semibold">{bookingDate}</p>
            </div>

            <div className="mb-6 space-y-4">
              {renderJourneyDetails('Chuyến đi', departInfo)}
              {returnInfo &&
                renderJourneyDetails('Chuyến về', returnInfo)}
            </div>

            <div className="mb-6 flex items-center justify-between border-t border-slate-200 pt-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CreditCard className="h-5 w-5" />
                <span className="font-medium">Tổng tiền</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                {Number(bookingData.totalPrice || 0).toLocaleString('vi-VN')}₫
              </p>
            </div>

            <div className="border-t border-dashed border-border pt-6">
              <div className="flex flex-col items-center">
                <div className="mb-2">
                  <p className="text-center text-sm text-muted-foreground mb-3">Mã QR của bạn để check-in</p>
                  <div className="w-48 h-48 bg-white border-4 border-primary/20 rounded-xl flex items-center justify-center p-2">
                    {qrCode ? (
                      <img src={qrCode} alt="Booking QR Code" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center text-xs text-muted-foreground p-4">
                        Không thể tải mã QR.
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">Booking ID: {bookingId}</p>
              </div>
            </div>
          </div>
        </div>
        {/* ================= HẾT KHUNG VÉ ================= */}

        {/* CÁC NÚT ĐIỀU HƯỚNG NẰM NGOÀI KHUNG CHỤP (SẼ KHÔNG BỊ DÍNH VÀO EMAIL) */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border-2 border-border hover:bg-muted transition-colors bg-white">
            <Download className="w-5 h-5" />
            <span>Tải xuống</span>
          </button>
          <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border-2 border-border hover:bg-muted transition-colors bg-white">
            <Share2 className="w-5 h-5" />
            <span>Chia sẻ</span>
          </button>
        </div>

        <button
          onClick={() => navigate('/')}
          className="w-full mt-4 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
        >
          Về Trang Chủ
        </button>

        {/* HIỂN THỊ TRẠNG THÁI GỬI EMAIL */}
        {passengerEmail ? (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900 text-center font-medium">
              {hasSentEmail 
                ? <>📧 Vé điện tử đã được tự động gửi thành công đến email: <span className="font-bold">{passengerEmail}</span></>
                : <>⏳ Đang xử lý tạo vé và gửi tự động đến email: <span className="font-bold">{passengerEmail}</span>...</>
              }
            </p>
          </div>
        ) : (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 text-center font-medium">
              ⚠️ Không tìm thấy email hành khách để gửi tự động.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}