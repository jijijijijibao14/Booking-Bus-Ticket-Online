import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plane, Clock, ShoppingBag, Star, Info, User, ShieldCheck, Timer } from 'lucide-react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ReviewsDialog, Review } from '../ReviewsDialog';
import { BookingPayload, PassengerInfo, searchTrips } from './useBooking';
import { toast } from 'sonner';

const passengerSchema = z.object({
  name: z.string().min(1, 'Họ tên là bắt buộc'),
  gender: z.string(),
  dob: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email({ message: "Email không hợp lệ" }).optional(),
  luggage: z.string(),
});

const flightBookingSchema = z.object({
  adultPassengers: z.array(passengerSchema.extend({ phone: z.string().min(1, 'SĐT là bắt buộc'), email: z.string().email("Email không hợp lệ") })),
  childPassengers: z.array(passengerSchema.extend({ dob: z.string().min(1, 'Ngày sinh là bắt buộc') })),
  infantPassengers: z.array(passengerSchema.extend({ dob: z.string().min(1, 'Ngày sinh là bắt buộc') })),
});


interface FlightOption {
  id: string;
  airline: string;
  flightCode: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  class: 'economy' | 'business';
  price: number;
  baggage: string;
  features: string[];
  rating: number;
}

type FlightBookingFormValues = z.infer<typeof flightBookingSchema>;

const defaultPassengerValues = {
  adult: { gender: 'Nam', name: '', luggage: '0kg', dob: '', phone: '', email: '' },
  child: { gender: 'Trẻ em trai', name: '', luggage: '0kg', dob: '' },
  infant: { gender: 'Em bé trai', name: '', luggage: '0kg', dob: '' },
};

export default function FlightBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  // Lấy dữ liệu từ LandingPage: searchData chứa tiêu chí tìm, results chứa kết quả API trả về
  const { searchData, results: flightsFromApi } = location.state || { searchData: {}, results: [] };

  const [step, setStep] = useState(1);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [isReviewsOpen, setIsReviewsOpen] = useState(false);
  const [reviewContext, setReviewContext] = useState({ operatorName: '', rating: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- State cho luồng khứ hồi ---
  const [bookingStep, setBookingStep] = useState<'departure' | 'return'>('departure');
  const [departureBookingInfo, setDepartureBookingInfo] = useState<any>(null);
  const [tripResults, setTripResults] = useState<FlightOption[]>([]);
  const [isLoadingReturnTrips, setIsLoadingReturnTrips] = useState(false);

  const handleOpenReviews = (e: React.MouseEvent, airline: string, rating: number) => {
    e.stopPropagation();
    setReviewContext({ operatorName: airline, rating });
    setIsReviewsOpen(true);
  };

  const { control, handleSubmit, watch, formState: { errors } } = useForm<FlightBookingFormValues>({
    resolver: zodResolver(flightBookingSchema),
    defaultValues: {
      // Khởi tạo với số lượng người lớn từ searchData
      adultPassengers: Array(searchData.passengers > 0 ? searchData.passengers : 1).fill(defaultPassengerValues.adult),
      childPassengers: [],
      infantPassengers: [],
    }
  });

  const { fields: adultFields, replace: replaceAdults } = useFieldArray({ control, name: 'adultPassengers' });
  const { fields: childFields, replace: replaceChildren } = useFieldArray({ control, name: 'childPassengers' });
  const { fields: infantFields, replace: replaceInfants } = useFieldArray({ control, name: 'infantPassengers' });

  const adults = watch('adultPassengers')?.length || 0;
  const children = watch('childPassengers')?.length || 0;
  const infants = watch('infantPassengers')?.length || 0;

  useEffect(() => {
    const formatFlights = (results: any[]): FlightOption[] => (results || []).map((flight: any) => ({
      id: flight.trip_id,
      airline: flight.vehicle_name,
      flightCode: flight.trip_id.split('|')[2],
      from: flight.departure_location,
      to: flight.arrival_location,
      departureTime: new Date(flight.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      arrivalTime: new Date(flight.arrival_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      duration: flight.duration || '2h 15m',
      class: 'economy',
      price: Number(flight.base_price),
      baggage: '23kg',
      features: ['Wifi miễn phí', 'Điều chỉnh ghế'],
      rating: Number(flight.rating) || 4.5,
    }));
    setTripResults(formatFlights(flightsFromApi));
  }, [flightsFromApi]);

  useEffect(() => {
    if (step === 1) setSelectedFlightId(null);
  }, [step]);

  const handlePassengerCountChange = (type: 'adults' | 'children' | 'infants', value: number) => {
    if (type === 'adults') {
      replaceAdults(Array(value).fill(defaultPassengerValues.adult));
    } else if (type === 'children') {
      replaceChildren(Array(value).fill(defaultPassengerValues.child));
    } else if (type === 'infants') {
      replaceInfants(Array(value).fill(defaultPassengerValues.infant));
    }
  }

  const selectedFlightData = tripResults.find((f) => f.id === selectedFlightId);
  const basePrice = selectedFlightData ? selectedFlightData.price : 0;
  const totalPrice = selectedFlightData ? (adults * basePrice + children * basePrice) : 0;
  const taxes = selectedFlightData ? 1834000 : 0;
  const finalPrice = totalPrice > 0 ? totalPrice + taxes : 0;

  const handleNextStep = () => {
    if (!selectedFlightId) {
      toast.warning('Vui lòng chọn một chuyến bay để tiếp tục.');
      return;
    }
    setStep(2);
  };

  const onFormSubmit = async (data: FlightBookingFormValues) => {
    setIsSubmitting(true);
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Vui lòng đăng nhập để đặt vé.');
      setIsSubmitting(false);
      navigate('/login');
      return;
    }

    const allPassengers: PassengerInfo[] = [
      ...data.adultPassengers.map(p => ({ ...p, type: 'Adult' as const, price: basePrice })),
      ...data.childPassengers.map(p => ({ ...p, type: 'Child' as const, price: basePrice })),
      ...data.infantPassengers.map(p => ({ ...p, type: 'Infant' as const, price: 0 })),
    ];

    const bookingPayload: BookingPayload = {
      tripId: selectedFlightData!.id,
      vehicleType: 'Flight',
      contactInfo: { fullName: data.adultPassengers[0].name, email: data.adultPassengers[0].email, phone: data.adultPassengers[0].phone },
      passengers: allPassengers,
      totalAmount: finalPrice,
    };

    // --- LOGIC XỬ LÝ KHỨ HỒI ---
    if (searchData.returnDate && bookingStep === 'departure') {
      toast.info('Đã chọn xong chuyến đi. Vui lòng chọn chuyến về.');
      setDepartureBookingInfo({
        payload: bookingPayload,
        display: { trip: selectedFlightData, passengers: `${adults + children + infants}`, vehicleType: 'Flight' }
      });
      setBookingStep('return');
      setStep(1); // Quay lại màn hình chọn chuyến

      setIsLoadingReturnTrips(true);
      try {
        const response = await searchTrips({ from: searchData.to, to: searchData.from, departureDate: searchData.returnDate, type: 'Flight' });
        const returnTrips = (response.data.data || []).map((flight: any) => ({
          id: flight.trip_id, airline: flight.vehicle_name, flightCode: flight.trip_id.split('|')[2], from: flight.departure_location, to: flight.arrival_location,
          departureTime: new Date(flight.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          arrivalTime: new Date(flight.arrival_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          duration: flight.duration || '2h 15m', class: 'economy', price: Number(flight.base_price), baggage: '23kg', features: ['Wifi miễn phí'], rating: Number(flight.rating) || 4.5,
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
    const finalTotalPrice = bookingStep === 'return' ? departureBookingInfo.payload.totalAmount + finalPrice : finalPrice;

    const checkoutData = {
      bookingPayloads: finalPayloads,
      successNavigationState: {
        type: 'flight', trip: selectedFlightData,
        passengers: adults + children + infants, totalPrice: finalTotalPrice,
        email: data.adultPassengers[0].email,
      },
      displayInfo: {
        depart: bookingStep === 'return' ? departureBookingInfo.display : {
          trip: selectedFlightData, passengers: `${adults + children + infants}`, vehicleType: 'Flight',
        },
        ...(bookingStep === 'return' && {
          return: {
            trip: selectedFlightData, passengers: `${adults + children + infants}`, vehicleType: 'Flight',
          }
        }),
        totalPrice: finalTotalPrice,
      }
    };
    navigate('/checkout', { state: checkoutData });
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-muted pb-12">
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => step === 2 ? setStep(1) : (bookingStep === 'return' ? setBookingStep('departure') : navigate('/'))}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            {step === 2 ? 'Chọn lại chuyến bay' : 'Quay lại'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {step === 1 && (isLoadingReturnTrips ? (
          <div className="text-center p-10">Đang tìm chuyến về...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-border mb-6">
                <h2 className="text-xl font-bold mb-4 text-slate-800">
                  {bookingStep === 'departure' ? 'CHỌN CHUYẾN ĐI' : 'CHỌN CHUYẾN VỀ'}
                </h2>
                <div className="flex items-center gap-4 text-slate-600 font-medium mb-4">
                  <div className="flex-1 px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 flex items-center gap-2">
                    <Plane className="w-5 h-5 text-primary" />
                    <span>{bookingStep === 'departure' ? searchData.from : searchData.to}</span>
                  </div>
                  <ArrowLeft className="w-5 h-5 rotate-180 text-slate-400" />
                  <div className="flex-1 px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 flex items-center gap-2">
                    <Plane className="w-5 h-5 text-primary" />
                    <span>{bookingStep === 'departure' ? searchData.to : searchData.from}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Người lớn (&ge; 12 tuổi)</label>
                    <select
                      value={adults} onChange={(e) => handlePassengerCountChange('adults', Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-primary"
                    >
                      {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Trẻ em (2-12 tuổi)</label>
                    <select
                      value={children} onChange={(e) => handlePassengerCountChange('children', Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-primary"
                    >
                      {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Em bé (&lt; 2 tuổi)</label>
                    <select
                      value={infants} onChange={(e) => handlePassengerCountChange('infants', Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-primary"
                    >
                      {[0, 1, 2].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {tripResults.map((flight) => (
                <div
                  key={flight.id}
                  onClick={() => setSelectedFlightId(flight.id)}
                  className={`p-6 bg-white rounded-xl border-2 cursor-pointer transition-all ${selectedFlightId === flight.id ? 'border-primary shadow-md' : 'border-border hover:border-primary/50'
                    }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Plane className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg text-slate-800">{flight.airline}</h3>
                          <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold border border-yellow-200">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            {flight.rating.toFixed(1)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm text-slate-500">{flight.flightCode}</p>
                          <span className="text-slate-300">•</span>
                          <button
                            onClick={(e) => handleOpenReviews(e, flight.airline, flight.rating)}
                            className="text-sm text-primary hover:underline font-medium"
                          >
                            Xem đánh giá
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">{flight.price.toLocaleString('vi-VN')}₫</div>
                      <p className="text-xs text-slate-500">/ vé người lớn</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Khởi hành</p>
                      <p className="text-xl font-bold text-slate-800">{flight.departureTime}</p>
                      <p className="text-sm text-slate-500">{flight.from.split('(')[0].trim()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-1">Thời gian bay</p>
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-px flex-1 bg-slate-200"></div>
                        <Clock className="w-4 h-4 text-slate-400" />
                        <div className="h-px flex-1 bg-slate-200"></div>
                      </div>
                      <p className="text-sm font-semibold mt-1 text-slate-700">{flight.duration}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-1">Hạ cánh</p>
                      <p className="text-xl font-bold text-slate-800">{flight.arrivalTime}</p>
                      <p className="text-sm text-slate-500">{flight.to.split('(')[0].trim()}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-slate-600">
                      <ShoppingBag className="w-4 h-4" />
                      <span className="text-sm">Hành lý: {flight.baggage}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="p-6 bg-white rounded-xl shadow-sm border border-border sticky top-24">
                <h3 className="text-lg font-bold mb-4 text-slate-800">Chi Tiết Đặt Vé</h3>

                {selectedFlightData ? (
                  <>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Chuyến bay:</span>
                        <span className="font-semibold text-slate-800">{selectedFlightData.flightCode}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Hạng vé:</span>
                        <span className="font-semibold capitalize text-slate-800">{selectedFlightData.class === 'business' ? 'Business' : 'Economy'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Hành khách:</span>
                        <span className="font-semibold text-slate-800">{adults + children + infants} người</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Vé người lớn ({adults}):</span>
                        <span className="font-semibold text-slate-800">{(adults * basePrice).toLocaleString('vi-VN')}₫</span>
                      </div>
                      {children > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Vé trẻ em ({children}):</span>
                          <span className="font-semibold text-slate-800">{(children * basePrice).toLocaleString('vi-VN')}₫</span>
                        </div>
                      )}
                      {infants > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Vé em bé ({infants}):</span>
                          <span className="font-semibold text-slate-800">0₫</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                        <span className="text-slate-500">Thuế & Phí (Tạm tính):</span>
                        <span className="font-semibold text-slate-800">{taxes.toLocaleString('vi-VN')}₫</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4 mb-6 bg-slate-50 -mx-6 px-6 pb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-800">Tổng giá vé:</span>
                        <span className="text-2xl font-black text-primary">{finalPrice.toLocaleString('vi-VN')}₫</span>
                      </div>
                      <p className="text-xs text-right text-slate-500">Đã bao gồm thuế, phí</p>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-slate-400">
                    <Plane className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Vui lòng chọn chuyến bay</p>
                  </div>
                )}

                <button
                  onClick={handleNextStep}
                  disabled={!selectedFlightId}
                  className="w-full py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Tiếp tục
                </button>
              </div>
            </div>
          </div>
        ))}

        {step === 2 && (
          <form onSubmit={handleSubmit(onFormSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

              {/* THÔNG TIN HÀNH KHÁCH */}
              <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-slate-800">THÔNG TIN HÀNH KHÁCH</h3>
                </div>

                <div className="p-6 space-y-8">
                  {adultFields.map((field, idx) => (
                    <div key={`adult-${idx}`} className="space-y-4">
                      <h4 className="font-semibold text-slate-800 pb-2 border-b border-slate-100">Hành khách {idx + 1} (Người lớn)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex gap-4">
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Giới tính <span className="text-red-500">*</span></label>
                            <Controller
                              control={control}
                              name={`adultPassengers.${idx}.gender`}
                              render={({ field }) => (
                                <select {...field} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary bg-white">
                                  <option>Nam</option>
                                  <option>Nữ</option>
                                </select>
                              )}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Họ và tên <span className="text-red-500">*</span></label>
                            <Controller
                              control={control}
                              name={`adultPassengers.${idx}.name`}
                              render={({ field }) => <input {...field} type="text" placeholder="VÍ DỤ: NGUYEN VAN A" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary uppercase ${errors.adultPassengers?.[idx]?.name ? 'border-red-500' : 'border-slate-200'}`} />}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Hành lý ký gửi</label>
                          <Controller
                            control={control}
                            name={`adultPassengers.${idx}.luggage`}
                            render={({ field }) => (
                              <select {...field} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary bg-white">
                                <option value="0kg">Không mua hành lý ký gửi</option>
                                <option value="15kg">15kg - 250,000₫</option>
                                <option value="20kg">20kg - 300,000₫</option>
                              </select>
                            )}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                          <Controller
                            control={control}
                            name={`adultPassengers.${idx}.phone`}
                            render={({ field }) => <input {...field} type="tel" placeholder="Số điện thoại" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary ${errors.adultPassengers?.[idx]?.phone ? 'border-red-500' : 'border-slate-200'}`} />}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Email <span className="text-red-500">*</span></label>
                          <Controller
                            control={control}
                            name={`adultPassengers.${idx}.email`}
                            render={({ field }) => <input {...field} type="email" placeholder="Địa chỉ Email" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary ${errors.adultPassengers?.[idx]?.email ? 'border-red-500' : 'border-slate-200'}`} />}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {childFields.map((field, idx) => (
                    <div key={`child-${idx}`} className="space-y-4">
                      <h4 className="font-semibold text-slate-800 pb-2 border-b border-slate-100">Hành khách {adults + idx + 1} (Trẻ em)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex gap-4">
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Giới tính <span className="text-red-500">*</span></label>
                            <Controller
                              control={control} name={`childPassengers.${idx}.gender`}
                              render={({ field }) => (
                                <select {...field} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary bg-white">
                                  <option>Trẻ em trai</option>
                                  <option>Trẻ em gái</option>
                                </select>
                              )}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Họ và tên <span className="text-red-500">*</span></label>
                            <Controller control={control} name={`childPassengers.${idx}.name`} render={({ field }) => <input {...field} type="text" placeholder="Họ và tên Trẻ em" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary uppercase ${errors.childPassengers?.[idx]?.name ? 'border-red-500' : 'border-slate-200'}`} />} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Ngày sinh <span className="text-red-500">*</span></label>
                          <Controller control={control} name={`childPassengers.${idx}.dob`} render={({ field }) => <input {...field} type="date" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary ${errors.childPassengers?.[idx]?.dob ? 'border-red-500' : 'border-slate-200'}`} />} />
                        </div>
                      </div>
                    </div>
                  ))}

                  {infantFields.map((field, idx) => (
                    <div key={`infant-${idx}`} className="space-y-4">
                      <h4 className="font-semibold text-slate-800 pb-2 border-b border-slate-100">Hành khách {adults + children + idx + 1} (Em bé)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex gap-4">
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Giới tính <span className="text-red-500">*</span></label>
                            <Controller control={control} name={`infantPassengers.${idx}.gender`} render={({ field }) => (
                              <select {...field} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:border-primary bg-white">
                                <option>Em bé trai</option>
                                <option>Em bé gái</option>
                              </select>
                            )} />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Họ và tên <span className="text-red-500">*</span></label>
                            <Controller control={control} name={`infantPassengers.${idx}.name`} render={({ field }) => <input {...field} type="text" placeholder="Họ và tên Em bé" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary uppercase ${errors.infantPassengers?.[idx]?.name ? 'border-red-500' : 'border-slate-200'}`} />} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Ngày sinh <span className="text-red-500">*</span></label>
                          <Controller control={control} name={`infantPassengers.${idx}.dob`} render={({ field }) => <input {...field} type="date" className={`w-full px-3 py-2.5 border rounded-lg outline-none focus:border-primary ${errors.infantPassengers?.[idx]?.dob ? 'border-red-500' : 'border-slate-200'}`} />} />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="bg-blue-50 p-4 rounded-lg flex gap-3 text-blue-800 mt-6 border border-blue-100">
                    <Info className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">Mỗi hành khách được mang 01 kiện hành lý xách tay chính (tối đa 7kg, kích thước 56x36x23cm).</p>
                  </div>
                </div>
              </div>

            </div>

            <div className="space-y-4">
              <div className="p-6 bg-white rounded-xl shadow-sm border border-border sticky top-24">
                <h3 className="text-lg font-bold mb-4 text-slate-800">Tóm Tắt Chuyến Bay</h3>

                {selectedFlightData && (
                  <>
                    <div className="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-slate-800">{(selectedFlightData.from.split('(')[1]?.replace(')', '') || selectedFlightData.from)} ➔ {(selectedFlightData.to.split('(')[1]?.replace(')', '') || selectedFlightData.to)}</span>
                        <span className="font-bold text-primary">{selectedFlightData.flightCode}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm text-slate-600 mb-2">
                        <span>{selectedFlightData.departureTime}</span>
                        <Plane className="w-4 h-4" />
                        <span>{selectedFlightData.arrivalTime}</span>
                      </div>
                      <div className="text-xs font-medium text-slate-500 text-center">{selectedFlightData.airline} - {selectedFlightData.class === 'business' ? 'Business' : 'Economy'}</div>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Người lớn x {adults}</span>
                        <span className="font-semibold text-slate-800">{(adults * basePrice).toLocaleString('vi-VN')}₫</span>
                      </div>
                      {children > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Trẻ em x {children}</span>
                          <span className="font-semibold text-slate-800">{(children * basePrice).toLocaleString('vi-VN')}₫</span>
                        </div>
                      )}
                      {infants > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Em bé x {infants}</span>
                          <span className="font-semibold text-slate-800">0₫</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                        <span className="text-slate-500">Tổng thuế + phí</span>
                        <span className="font-semibold text-slate-800">{taxes.toLocaleString('vi-VN')}₫</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4 mb-6">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-800">Tổng giá vé:</span>
                        <span className="text-2xl font-black text-primary">{finalPrice.toLocaleString('vi-VN')}₫</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || !selectedFlightData}
                      className="w-full py-3.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center disabled:opacity-50"
                    >
                      {isSubmitting ? 'Đang xử lý...' : 'Tiếp Tục Thanh Toán'}
                    </button>

                    <div className="mt-6 pt-6 border-t border-slate-100 space-y-4 text-xs text-slate-600">
                      <h4 className="font-bold text-slate-800">ĐIỀU KIỆN VÉ & LƯU Ý</h4>
                      <ul className="space-y-2 list-disc pl-4">
                        <li><strong>Giấy tờ tùy thân:</strong> Cần CMND/CCCD/Hộ chiếu hoặc Giấy khai sinh (dưới 14 tuổi).</li>
                        <li><strong>Thời gian thủ tục:</strong> Có mặt trước 120 phút so với giờ khởi hành.</li>
                        <li>Hành lý xách tay: 01 kiện chính tối đa 7kg.</li>
                        <li>Đổi tên / Đổi chuyến: Áp dụng phí theo quy định hãng bay.</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          </form>
        )}

      </div>

      <ReviewsDialog
        isOpen={isReviewsOpen}
        onOpenChange={setIsReviewsOpen}
        operatorName={reviewContext.operatorName}
        averageRating={reviewContext.rating}
        totalReviews={0} // Sẽ lấy từ API sau
        reviews={[]} // Sẽ lấy từ API sau
      />
    </div>
  );
}
