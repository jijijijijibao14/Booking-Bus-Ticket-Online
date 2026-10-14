import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Train, Clock, MapPin, Timer, Star, ShieldCheck, User } from 'lucide-react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ReviewsDialog, Review } from '../ReviewsDialog';
import { getTripSeatLayout } from '@/api';
import { BookingPayload, PassengerInfo, searchTrips } from './useBooking';
import { toast } from 'sonner';

const passengerSchema = z.object({
  seatId: z.number(),
  seatName: z.string(),
  name: z.string().min(1, 'Họ tên là bắt buộc'),
  idCard: z.string().min(9, 'CCCD/Hộ chiếu là bắt buộc'),
  phone: z.string().regex(/(84|0[3|5|7|8|9])+([0-9]{8})\b/, 'SĐT không hợp lệ'),
  email: z.string().email('Email không hợp lệ'),
});

type SeatStatus = 'available' | 'booked' | 'selected' | 'holding';

interface Seat {
  seatId: number;
  id: string;
  status: SeatStatus;
  carriage: number;
  row: number;
  position: string;
  floor: number;
}

interface Carriage {
  number: number;
  name: string;
  type: 'soft-seat' | 'hard-seat' | 'bed-cabin' | 'vip-cabin';
  priceMultiplier: number;
}

interface TrainTrip {
  id: string;
  name: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  basePrice: number;
  rating: number;
}

const trainBookingSchema = z.object({ passengers: z.array(passengerSchema) });


export default function TrainBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  // Lấy dữ liệu từ LandingPage: searchData chứa tiêu chí tìm, results chứa kết quả API trả về
  const { searchData, results: trainsFromApi } = location.state || { searchData: {}, results: [] };

  // --- State cho luồng đặt vé ---
  const [selectedTrip, setSelectedTrip] = useState<TrainTrip | null>(null);
  const [selectedCarriage, setSelectedCarriage] = useState(1);
  const [carriages, setCarriages] = useState<Carriage[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [isReviewsOpen, setIsReviewsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- State cho luồng khứ hồi ---
  const [bookingStep, setBookingStep] = useState<'departure' | 'return'>('departure');
  const [departureBookingInfo, setDepartureBookingInfo] = useState<any>(null);
  const [tripResults, setTripResults] = useState<TrainTrip[]>([]);
  const [isLoadingReturnTrips, setIsLoadingReturnTrips] = useState(false);

  // --- Form Hooks ---
  const { control, handleSubmit, formState: { errors } } = useForm<z.infer<typeof trainBookingSchema>>({
    resolver: zodResolver(trainBookingSchema),
    defaultValues: {
      passengers: [],
    },
  });

  const { fields: passengerFields, append, remove } = useFieldArray({
    control, name: 'passengers',
  });

  // --- Effects ---
  useEffect(() => {
    const initialTrips: TrainTrip[] = (trainsFromApi || []).map((trip: any) => ({
      id: trip.trip_id,
      name: `${trip.vehicle_name} - ${trip.trip_id.split('|')[2]}`,
      from: trip.departure_location,
      to: trip.arrival_location,
      departureTime: new Date(trip.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      arrivalTime: new Date(trip.arrival_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      duration: trip.duration || '12h 00m',
      basePrice: Number(trip.base_price),
      rating: Number((4.2 + (Math.random() * 0.7)).toFixed(1)),
    }));
    setTripResults(initialTrips);
  }, [trainsFromApi]);

  useEffect(() => {
    if (selectedTrip) {
      const fetchLayout = async () => {
        setLoadingSeats(true);
        try {
          const response = await getTripSeatLayout(selectedTrip.id);
          setCarriages(response.data.carriages);
          setSeats(response.data.seats);
          setSelectedCarriage(response.data.carriages[0]?.number || 1);
        } catch (error) {
          console.error("Failed to fetch seat layout", error);
        } finally {
          setLoadingSeats(false);
        }
      };
      fetchLayout();
    }
  }, [selectedTrip, remove]);

  useEffect(() => {
    // Khi đổi toa, xóa hết các hành khách đã chọn
    remove();
  }, [selectedCarriage, remove]);

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === 'booked' || seat.status === 'holding') return;

    const existingPassengerIndex = passengerFields.findIndex(p => p.seatId === seat.seatId);

    if (existingPassengerIndex > -1) {
      // Bỏ chọn ghế
      remove(existingPassengerIndex);
      setSeats(seats.map((s) => (s.seatId === seat.seatId ? { ...s, status: 'available' } : s)));
    } else {
      // Chọn ghế mới
      append({ seatId: seat.seatId, seatName: seat.id, name: '', idCard: '', phone: '', email: '' });
      setSeats(seats.map((s) => (s.seatId === seat.seatId ? { ...s, status: 'selected' } : s)));
    }
  };

  const currentCarriage = carriages.find((c) => c.number === selectedCarriage);
  const seatPrice = selectedTrip && currentCarriage ? selectedTrip.basePrice * currentCarriage.priceMultiplier : 0;
  const totalPrice = selectedTrip ? passengerFields.length * seatPrice : 0;

  const onFormSubmit = async (data: z.infer<typeof trainBookingSchema>) => {
    if (data.passengers.length === 0) {
      toast.error("Vui lòng chọn ít nhất một ghế.");
      return;
    }
    setIsSubmitting(true);
    // Thêm kiểm tra để đảm bảo selectedTrip không phải là null
    if (!selectedTrip) {
      toast.error("Lỗi hệ thống: Chuyến đi chưa được chọn.");
      setIsSubmitting(false);
      return;
    }

    const firstPassenger = data.passengers[0];

    const bookingPayload: BookingPayload = {
      tripId: selectedTrip.id,
      vehicleType: 'Train',
      seatIds: data.passengers.map(p => p.seatId),
      contactInfo: { fullName: firstPassenger.name, email: firstPassenger.email, phone: firstPassenger.phone },
      passengers: data.passengers.map((p): PassengerInfo => ({
        name: p.name,
        idCard: p.idCard,
        phone: p.phone,
        email: p.email,
        price: seatPrice,
        seatId: p.seatId
      })),
      totalAmount: totalPrice,
    };

    // --- LOGIC XỬ LÝ KHỨ HỒI ---
    if (searchData.returnDate && bookingStep === 'departure') {
      toast.info('Đã chọn xong chuyến đi. Vui lòng chọn chuyến về.');
      setDepartureBookingInfo({
        payload: bookingPayload,
        display: { trip: selectedTrip, seats: data.passengers.map(p => p.seatName).join(', '), vehicleType: 'Train' }
      });
      setBookingStep('return');
      setSelectedTrip(null);
      setCarriages([]);
      setSeats([]);
      remove();

      setIsLoadingReturnTrips(true);
      try {
        const response = await searchTrips({ from: searchData.to, to: searchData.from, departureDate: searchData.returnDate, type: 'Train' });
        const returnTrips = (response.data.data || []).map((trip: any) => ({
          id: trip.trip_id, name: `${trip.vehicle_name} - ${trip.trip_id.split('|')[2]}`, from: trip.departure_location, to: trip.arrival_location,
          departureTime: new Date(trip.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          arrivalTime: new Date(trip.arrival_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          duration: trip.duration || '12h 00m', basePrice: Number(trip.base_price), rating: Number((4.2 + (Math.random() * 0.7)).toFixed(1)),
        }));
        setTripResults(returnTrips);
        if (returnTrips.length === 0) toast.warning("Không tìm thấy chuyến về phù hợp.");
      } catch (error) {
        toast.error("Lỗi khi tìm chuyến về.");
      } finally {
        setIsLoadingReturnTrips(false);
        setIsSubmitting(false);
      }
      return;
    }

    // --- XỬ LÝ VÉ MỘT CHIỀU HOẶC BƯỚC CUỐI CỦA VÉ KHỨ HỒI ---
    const finalPayloads = bookingStep === 'return' ? [departureBookingInfo.payload, bookingPayload] : [bookingPayload];
    const finalTotalPrice = bookingStep === 'return' ? departureBookingInfo.payload.totalAmount + totalPrice : totalPrice;

    const checkoutData = {
      bookingPayloads: finalPayloads,
      successNavigationState: {
        type: 'train', 
        trip: { ...selectedTrip, carriage: currentCarriage?.name },
        seats: data.passengers.map(p => p.seatName), 
        totalPrice: finalTotalPrice,
        email: firstPassenger.email // Đã thêm email ở đây
      },
      displayInfo: {
        depart: bookingStep === 'return' ? departureBookingInfo.display : {
          trip: selectedTrip, seats: data.passengers.map(p => p.seatName).join(', '), vehicleType: 'Train',
        },
        ...(bookingStep === 'return' && {
          return: {
            trip: selectedTrip, seats: data.passengers.map(p => p.seatName).join(', '), vehicleType: 'Train',
          }
        }),
        totalPrice: finalTotalPrice,
      }
    };
    navigate('/checkout', { state: checkoutData });
    setIsSubmitting(false);
  };

  const renderSeatButton = (seat: Seat, isBed: boolean = false) => {
    const isVip = currentCarriage?.type === 'vip-cabin';
    return (
      <button
        key={seat.seatId}
        onClick={() => handleSeatClick(seat)}
        disabled={seat.status === 'booked' || seat.status === 'holding'}
        className={`relative flex flex-col items-center justify-center transition-all group ${
          isBed ? 'w-12 h-16 rounded-md shadow-sm' : 'w-10 h-10 rounded-t-lg rounded-b-sm shadow-sm'
        } border-2 ${
          seat.status === 'available'
            ? isVip
              ? 'border-yellow-400 bg-white hover:border-yellow-600 cursor-pointer'
              : 'border-slate-300 bg-white hover:border-primary cursor-pointer'
            : seat.status === 'booked' || seat.status === 'holding'
            ? `border-slate-200 bg-slate-200 cursor-not-allowed text-slate-400 ${seat.status === 'holding' ? 'animate-pulse' : ''}` // Đã đặt hoặc đang giữ
            : 'border-green-500 bg-green-50 text-green-700 shadow-md'
        }`}
        title={isBed ? `Giường số ${seat.id}` : `Ghế số ${seat.id}`}
      >
        {isVip && seat.status === 'available' && <Star className="absolute top-1 right-1 w-3 h-3 text-yellow-400 opacity-70" />}
        <span className={`font-mono font-bold ${isBed ? 'text-[11px]' : 'text-xs'}`}>{seat.id}</span>
        {isBed && (
          <span className="text-[8px] opacity-70 mt-1 uppercase">Tầng {seat.floor}</span>
        )}
      </button>
    );
  };

  const renderCarriageLayout = () => {
    if (currentCarriage?.type === 'soft-seat') {
      const rows = Array.from({ length: 12 }, (_, i) => i + 1);
      return (
        <div className="flex flex-col gap-2 p-6 bg-slate-100 rounded-xl max-h-[600px] overflow-y-auto w-full items-center">
          <div className="w-full max-w-[300px] bg-slate-300 text-center py-2 rounded-lg text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wider">Đầu Tàu</div>
          {rows.map(row => {
            const rowSeats = seats.filter(s => s.row === row);
            return (
              <div key={row} className="flex justify-center items-center gap-6 w-full max-w-[300px]">
                <div className="flex gap-2">
                  {rowSeats.filter(s => s.position === 'A' || s.position === 'B').map(s => renderSeatButton(s, false))}
                </div>
                <div className="w-8 text-center text-xs font-medium text-slate-400">
                  {row}
                </div>
                <div className="flex gap-2">
                  {rowSeats.filter(s => s.position === 'C' || s.position === 'D').map(s => renderSeatButton(s, false))}
                </div>
              </div>
            );
          })}
          <div className="w-full max-w-[300px] bg-slate-200 text-center py-2 rounded-lg text-xs font-semibold mt-4 text-slate-500 uppercase tracking-wider">Cuối Tàu</div>
        </div>
      );
    } else {
      const isVip = currentCarriage?.type === 'vip-cabin';
      // Đồng bộ layout: Tất cả các loại khoang giường nằm đều có 7 phòng
      const cabins = Array.from({ length: 7 }, (_, i) => i + 1);

      return (
        <div className="flex gap-6 p-6 bg-slate-100 rounded-xl overflow-x-auto w-full items-center h-[350px]">
          <div className="flex-shrink-0 flex items-center justify-center w-16 h-full bg-slate-300 rounded-lg text-sm font-semibold text-slate-700 uppercase" style={{ writingMode: 'vertical-rl' }}>
            Đầu Tàu
          </div>
          {cabins.map(cabin => {
            const cabinSeats = seats.filter(s => s.row === cabin);
            const leftBeds = cabinSeats.filter((_, idx) => idx % 2 === 0);
            const rightBeds = cabinSeats.filter((_, idx) => idx % 2 !== 0);

            return (
              <div key={cabin} className={`w-44 flex-shrink-0 flex flex-col border-2 rounded-xl overflow-hidden h-full shadow-sm transition-all
                ${isVip ? 'border-yellow-400 bg-yellow-50 shadow-lg' : 'border-slate-300 bg-white'}
              `}>
                <div className={`text-center py-2 text-xs font-bold uppercase tracking-wider
                  ${isVip ? 'bg-yellow-200 text-yellow-800' : 'bg-slate-200 text-slate-700'}
                `}>
                  {isVip && <Star className="w-3 h-3 inline-block mr-1 mb-0.5" />}
                  Khoang {cabin}
                  {isVip && <Star className="w-3 h-3 inline-block ml-1 mb-0.5" />}
                </div>
                <div className="p-3 flex justify-between gap-4 h-full">
                  <div className="flex flex-col justify-end gap-3 h-full">
                    {[...leftBeds].reverse().map(seat => renderSeatButton(seat, true))}
                  </div>
                  <div className={`w-2 rounded-full h-full flex flex-col items-center justify-center ${isVip ? 'bg-yellow-100' : 'bg-slate-100'}`}>
                    <div className={`h-full w-px ${isVip ? 'bg-yellow-300' : 'bg-slate-300'}`}></div>
                  </div>
                  <div className="flex flex-col justify-end gap-3 h-full">
                    {[...rightBeds].reverse().map(seat => renderSeatButton(seat, true))}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex-shrink-0 flex items-center justify-center w-12 h-full bg-slate-200 rounded-lg text-xs font-semibold text-slate-500 uppercase" style={{ writingMode: 'vertical-rl' }}>
            Cuối Tàu
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => {
              if (selectedTrip) setSelectedTrip(null);
              else if (bookingStep === 'return') {
                setBookingStep('departure');
                // TODO: Cần có cách để tải lại danh sách chuyến đi ban đầu
              }
              else navigate('/');
            }}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            {selectedTrip ? `Quay lại danh sách chuyến ${bookingStep === 'departure' ? 'đi' : 'về'}` : 'Quay lại trang chủ'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {!selectedTrip ? (isLoadingReturnTrips ? (
          <div className="text-center p-10">Đang tìm chuyến về...</div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground mb-2">{bookingStep === 'departure' ? 'Chọn Chuyến Đi' : 'Chọn Chuyến Về'}</h1>
              <p className="text-muted-foreground">
                {bookingStep === 'departure' ? `${searchData.from} → ${searchData.to}` : `${searchData.to} → ${searchData.from}`}
              </p>
            </div>
            
            <div className="grid gap-6">
              {tripResults.map((trip: TrainTrip, index: number) => (
                <div key={`${trip.id}-${index}`} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Train className="w-8 h-8 text-primary" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-slate-800">{trip.name}</h3>
                        <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-sm font-medium border border-yellow-200">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                          {trip.rating.toFixed(1)}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIsReviewsOpen(true); }}
                          className="text-sm text-primary hover:underline font-medium"
                        >
                          Đánh giá
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-4">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Khởi hành</p>
                          <p className="text-lg font-semibold">{trip.departureTime}</p>
                          <p className="text-slate-500">{trip.from}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500 mb-1">Thời gian đi</p>
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-px w-12 bg-slate-200"></div>
                            <Clock className="w-4 h-4 text-slate-400" />
                            <div className="h-px w-12 bg-slate-200"></div>
                          </div>
                          <p className="font-semibold mt-1 text-slate-700">{trip.duration}</p>
                        </div>
                        <div className="md:text-right">
                          <p className="text-xs text-slate-500 mb-1">Đến nơi</p>
                          <p className="text-lg font-semibold">{trip.arrivalTime}</p>
                          <p className="text-slate-500">{trip.to}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="md:w-48 flex flex-col items-end justify-center border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 pl-0 md:pl-6">
                      <div className="text-2xl font-bold text-primary mb-1">{trip.basePrice.toLocaleString('vi-VN')}₫</div>
                      <p className="text-xs text-slate-500 mb-4">/ vé</p>
                      <button 
                        onClick={() => setSelectedTrip(trip)}
                        className="w-full py-3 rounded-lg bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-sm"
                      >
                        Chọn chuyến
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )) : (
          <>
        <div className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Train className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <h2 className="text-2xl font-bold text-slate-800">{selectedTrip.name}</h2>
                <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2.5 py-1 rounded-md text-sm font-bold border border-yellow-200">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  {selectedTrip.rating.toFixed(1)}
                </div>
                <button 
                  onClick={() => setIsReviewsOpen(true)}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Xem đánh giá
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-medium text-slate-600 bg-slate-50 p-4 rounded-lg">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  <span>
                    {selectedTrip.from} <span className="mx-2 text-slate-400">→</span> {selectedTrip.to}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <span>
                    {selectedTrip.departureTime} - {selectedTrip.arrivalTime} <span className="text-slate-400 ml-1">({selectedTrip.duration})</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Chọn Loại Toa</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin min-h-[88px]">
            {carriages.map((carriage) => (
              <button
                key={carriage.number}
                onClick={() => setSelectedCarriage(carriage.number)}
                className={`flex-shrink-0 px-6 py-4 rounded-xl border-2 transition-all text-left ${
                  selectedCarriage === carriage.number
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-slate-200 hover:border-primary/30 bg-white'
                }`}
              >
                <div className={`text-sm font-bold mb-1 ${selectedCarriage === carriage.number ? 'text-primary' : 'text-slate-700'}`}>
                  {carriage.name}
                </div>
                <div className="text-sm font-medium text-slate-500">
                  Giá từ: <span className={selectedCarriage === carriage.number ? 'text-primary' : 'text-slate-900'}>{(selectedTrip.basePrice * (carriage.priceMultiplier || 1)).toLocaleString('vi-VN')}₫</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h3 className="text-xl font-bold text-slate-800">Sơ Đồ Chọn Chỗ</h3>
                <div className="flex gap-4 bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md border-2 border-slate-300 bg-white"></div>
                    <span className="text-slate-600">Trống</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md border-2 border-slate-200 bg-slate-200"></div>
                    <span className="text-slate-600">Đã đặt</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md border-2 border-green-500 bg-green-50"></div>
                    <span className="text-slate-600">Đang chọn</span>
                  </div>
                </div>
              </div>

              {/* Tàu layout */}
              <div className="w-full bg-slate-100 p-4 rounded-xl border border-slate-200 overflow-hidden min-h-[350px]">
                {loadingSeats ? (
                  <div className="flex items-center justify-center h-full">Đang tải sơ đồ toa...</div>
                ) : (
                  renderCarriageLayout()
                )}
              </div>
            </div>

            {/* THÔNG TIN HÀNH KHÁCH */}
            {passengerFields.length > 0 && (
              <form onSubmit={handleSubmit(onFormSubmit)} className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6" id="passenger-info">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-slate-800">THÔNG TIN HÀNH KHÁCH</h3>
                </div>
                
                <div className="p-6 space-y-6">
                  {passengerFields.map((field, index) => (
                    <div key={field.id} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                      <h4 className="font-semibold text-primary mb-3">
                        {currentCarriage?.type === 'soft-seat' ? 'Ghế' : 'Giường'} {field.seatName}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Họ và tên <span className="text-red-500">*</span></label>
                          <Controller
                            name={`passengers.${index}.name`}
                            control={control}
                            render={({ field }) => <input {...field} type="text" placeholder="NGUYEN VAN A" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary uppercase ${errors.passengers?.[index]?.name ? 'border-red-500' : 'border-slate-200'}`} />}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">CMND / CCCD / Hộ chiếu <span className="text-red-500">*</span></label>
                          <Controller
                            name={`passengers.${index}.idCard`}
                            control={control}
                            render={({ field }) => <input {...field} type="text" placeholder="Số giấy tờ tùy thân" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary ${errors.passengers?.[index]?.idCard ? 'border-red-500' : 'border-slate-200'}`} />}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                          <Controller
                            name={`passengers.${index}.phone`}
                            control={control}
                            render={({ field }) => <input {...field} type="tel" placeholder="Số điện thoại" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary ${errors.passengers?.[index]?.phone ? 'border-red-500' : 'border-slate-200'}`} />}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Email <span className="text-red-500">*</span></label>
                          <Controller
                            name={`passengers.${index}.email`}
                            control={control}
                            render={({ field }) => <input {...field} type="email" placeholder="Địa chỉ Email" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary ${errors.passengers?.[index]?.email ? 'border-red-500' : 'border-slate-200'}`} />}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </form>
            )}
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg text-slate-800 mb-6">Chi Tiết Đặt Vé</h3>
              
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-500 font-medium">Toa xe:</span>
                  <span className="font-bold text-slate-800">{currentCarriage?.name.split(':')[0]}</span>
                </div>
                <div className="flex justify-between items-start text-sm p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-500 font-medium mt-1">Chỗ đã chọn:</span>
                  <div className="text-right">
                    {passengerFields.length > 0 ? (
                      <div className="flex flex-wrap gap-1 justify-end max-w-[150px]">
                        {passengerFields.map(p => (
                          <span key={p.id} className="bg-primary/10 text-primary px-2 py-1 rounded font-bold text-xs">
                            {p.seatName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="font-medium text-slate-400">Chưa chọn</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-500 font-medium">Đơn giá:</span>
                  <span className="font-bold text-slate-800">{seatPrice.toLocaleString('vi-VN')}₫</span>
                </div>
              </div>
              
              <div className="border-t-2 border-dashed border-slate-200 pt-6 mb-6">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Tổng tiền thanh toán</span>
                    <div className="text-xs text-slate-400 font-medium mt-1">({passengerFields.length} chỗ)</div>
                  </div>
                  <span className="text-3xl font-black text-primary">{totalPrice.toLocaleString('vi-VN')}₫</span>
                </div>
              </div>
              
              <button
                onClick={handleSubmit(onFormSubmit)}
                disabled={passengerFields.length === 0 || isSubmitting}
                className="w-full py-4 rounded-xl bg-orange-500 text-white font-bold text-lg shadow-md hover:bg-orange-600 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-orange-500 disabled:hover:shadow-md disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isSubmitting ? 'Đang xử lý...' : 'Tiếp Tục Thanh Toán'}
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      <ReviewsDialog 
        isOpen={isReviewsOpen}
        onOpenChange={setIsReviewsOpen}
        operatorName={selectedTrip ? selectedTrip.name : ''}
        averageRating={selectedTrip ? selectedTrip.rating : 0}
        totalReviews={0} // Sẽ lấy từ API sau
        reviews={[]} // Sẽ lấy từ API sau
      />
    </div>
  );
}