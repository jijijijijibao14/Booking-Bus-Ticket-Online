import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bus,
  Clock,
  MapPin,
  Star,
} from 'lucide-react';
import {
  useFieldArray,
  useForm,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';

import { ReviewsDialog } from '../ReviewsDialog';
import {
  getTripSeatLayout,
  holdSeat,
  releaseSeat,
} from '@/api';
import {
  SeatButton,
  type Seat,
} from './SeatButton';
import {
  type BookingPayload,
  searchTrips,
  useBooking,
} from './useBooking';

/*
 * Tạm thời đặt true để test:
 * Một chiều → Checkout → VNPay.
 *
 * Sau khi test VNPay thành công, có thể đổi thành false
 * để khôi phục xử lý vé khứ hồi.
 */
const FORCE_ONE_WAY_FOR_VNPAY_TEST = false;

const busPassengerSchema = z.object({
  seatId: z.number(),
  seatName: z.string(),
});

const busBookingSchema = z.object({
  passengers: z.array(busPassengerSchema),
});

export default function BusBooking() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    searchData,
    results: dbResults,
  } = location.state || {
    searchData: {},
    results: [],
  };

  // State luồng đặt vé
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [isReviewsOpen, setIsReviewsOpen] = useState(false);

  const { isSubmitting } = useBooking();

  // State luồng khứ hồi
  const [bookingStep, setBookingStep] =
    useState<'departure' | 'return'>('departure');

  const [
    departureBookingInfo,
    setDepartureBookingInfo,
  ] = useState<any>(null);

  const [tripResults, setTripResults] = useState<any[]>([]);
  const [
    isLoadingReturnTrips,
    setIsLoadingReturnTrips,
  ] = useState(false);

  const {
    control,
    handleSubmit,
  } = useForm<z.infer<typeof busBookingSchema>>({
    resolver: zodResolver(busBookingSchema),
    defaultValues: {
      passengers: [],
    },
  });

  const {
    fields: passengerFields,
    append,
    remove,
  } = useFieldArray({
    control,
    name: 'passengers',
  });

  /*
   * Chuyển dữ liệu chuyến từ backend
   * sang cấu trúc mà giao diện sử dụng.
   */
  useEffect(() => {
    const formatTrips = (results: any[]) =>
      (results || []).map((trip: any) => {
        const departureDate = new Date(trip.departure_time);
        const arrivalDate = new Date(trip.arrival_time);

        return {
          id: trip.trip_id,

          operator:
            trip.vehicle_name ||
            'Nhà xe đối tác',

          from:
            trip.departure_location ||
            searchData.from,

          to:
            trip.arrival_location ||
            searchData.to,

          departureTime:
            departureDate.toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            }),

          arrivalTime:
            arrivalDate.toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            }),

          duration:
            trip.duration ||
            (
              isNaN(departureDate.getTime())
                ? 'N/A'
                : `${Math.round(
                    (
                      arrivalDate.getTime() -
                      departureDate.getTime()
                    ) / 3600000,
                  )}h`
            ),

          price: Number(trip.base_price || 0),
          busType: 'Giường nằm',
          rating: 5.0,
        };
      });

    setTripResults(formatTrips(dbResults));
  }, [
    dbResults,
    searchData.from,
    searchData.to,
  ]);

  /*
   * Khi người dùng chọn chuyến,
   * tải danh sách ghế của chuyến đó.
   */
  useEffect(() => {
    if (!selectedTrip) {
      return;
    }

    const fetchSeats = async () => {
      setLoadingSeats(true);
      setSeats([]);
      remove();

      try {
        const response =
          await getTripSeatLayout(selectedTrip.id);

        setSeats(response.data.data || []);
      } catch (error: any) {
        console.error(
          'Không thể tải sơ đồ ghế:',
          error,
        );

        toast.error(
          'Không thể tải sơ đồ ghế.',
          {
            description:
              error.response?.data?.message ||
              'Vui lòng thử lại.',
          },
        );
      } finally {
        setLoadingSeats(false);
      }
    };

    void fetchSeats();
  }, [
    selectedTrip,
    remove,
  ]);

  /*
   * Chọn hoặc bỏ chọn ghế.
   */
  const handleSeatClick = async (seat: Seat) => {
    if (
      seat.status === 'booked' ||
      seat.status === 'holding'
    ) {
      return;
    }

    if (!selectedTrip) {
      toast.error('Chưa chọn chuyến xe.');
      return;
    }

    const existingPassengerIndex =
      passengerFields.findIndex(
        (passenger) =>
          passenger.seatId === seat.seatId,
      );

    /*
     * Ghế đã được chọn:
     * nhả ghế trên Redis và xóa khỏi form.
     */
    if (existingPassengerIndex > -1) {
      try {
        await releaseSeat({
          tripId: selectedTrip.id,
          seatId: seat.seatId,
        });

        remove(existingPassengerIndex);

        setSeats((currentSeats) =>
          currentSeats.map((currentSeat) =>
            currentSeat.seatId === seat.seatId
              ? {
                  ...currentSeat,
                  status: 'available',
                }
              : currentSeat,
          ),
        );
      } catch (error) {
        console.error(
          'Lỗi khi nhả ghế:',
          error,
        );

        toast.error(
          'Lỗi khi nhả ghế. Vui lòng thử lại.',
        );
      }

      return;
    }

    /*
     * Ghế chưa được chọn:
     * giữ ghế trên Redis và thêm vào form.
     */
    try {
      await holdSeat({
        tripId: selectedTrip.id,
        seatId: seat.seatId,
      });

      append({
        seatId: seat.seatId,
        seatName: seat.id,
      });

      setSeats((currentSeats) =>
        currentSeats.map((currentSeat) =>
          currentSeat.seatId === seat.seatId
            ? {
                ...currentSeat,
                status: 'selected',
              }
            : currentSeat,
        ),
      );
    } catch (error: any) {
      console.error(
        'Không thể giữ ghế:',
        error,
      );

      toast.error(
        'Không thể chọn ghế.',
        {
          description:
            error.response?.data?.message ||
            'Ghế này có thể đã được người khác giữ.',
        },
      );

      try {
        const response =
          await getTripSeatLayout(selectedTrip.id);

        setSeats(response.data.data || []);
      } catch (refreshError) {
        console.error(
          'Không thể tải lại sơ đồ ghế:',
          refreshError,
        );
      }
    }
  };

  const totalPrice = selectedTrip
    ? passengerFields.length *
      selectedTrip.price
    : 0;

  /*
   * Người dùng bấm "Tiếp Tục Thanh Toán".
   */
  const onFormSubmit = async (
    data: z.infer<typeof busBookingSchema>,
  ) => {
    if (!selectedTrip) {
      toast.error(
        'Không tìm thấy thông tin chuyến đi.',
      );
      return;
    }

    if (data.passengers.length === 0) {
      toast.error(
        'Vui lòng chọn ít nhất một ghế.',
      );
      return;
    }

    const token =
      localStorage.getItem('token');

    if (!token) {
      toast.error(
        'Vui lòng đăng nhập để đặt vé.',
      );

      navigate('/login');
      return;
    }

    /*
     * Lấy thông tin người đặt vé.
     */
    const contactFullName =
      localStorage.getItem('userName');

    const contactEmail =
      localStorage.getItem('userEmail');

    const contactPhone =
      localStorage.getItem('userPhone');

    if (
      !contactFullName ||
      !contactEmail ||
      !contactPhone
    ) {
      toast.error(
        'Lỗi thông tin người dùng. Vui lòng đăng nhập lại.',
      );
      return;
    }

    const bookingPayload: BookingPayload = {
      tripId: selectedTrip.id,
      vehicleType: 'Bus',

      seatIds: data.passengers.map(
        (passenger) => passenger.seatId,
      ),

      contactInfo: {
        fullName: contactFullName,
        email: contactEmail,
        phone: contactPhone,
      },

      passengers: data.passengers.map(
        (passenger) => ({
          name: contactFullName,
          price: selectedTrip.price,
          seatId: passenger.seatId,
        }),
      ),

      totalAmount: totalPrice,
    };

    /*
     * Xác định đây có phải vé khứ hồi hay không.
     *
     * Khi FORCE_ONE_WAY_FOR_VNPAY_TEST = true,
     * kết quả luôn là false để đi thẳng tới Checkout.
     */
    const isRoundTrip =
      !FORCE_ONE_WAY_FOR_VNPAY_TEST &&
      Boolean(searchData?.returnDate);

    /*
     * Chỉ tìm chuyến về khi thực sự là vé khứ hồi.
     */
    if (
      isRoundTrip &&
      bookingStep === 'departure'
    ) {
      toast.info(
        'Đã chọn xong chuyến đi. Vui lòng chọn chuyến về.',
      );

      setDepartureBookingInfo({
        payload: bookingPayload,

        display: {
          trip: selectedTrip,

          seats: data.passengers
            .map(
              (passenger) =>
                passenger.seatName,
            )
            .join(', '),

          vehicleType: 'Bus',
        },
      });

      setBookingStep('return');
      setSelectedTrip(null);
      remove();

      setIsLoadingReturnTrips(true);

      try {
        const response =
          await searchTrips({
            from: searchData.to,
            to: searchData.from,
            departureDate:
              searchData.returnDate,
            type: 'Bus',
          });

        const returnTrips = (
          response.data.data || []
        ).map((trip: any) => {
          const departureDate = new Date(
            trip.departure_time,
          );

          const arrivalDate = new Date(
            trip.arrival_time,
          );

          return {
            id: trip.trip_id,

            operator:
              trip.vehicle_name ||
              'Nhà xe đối tác',

            from:
              trip.departure_location ||
              searchData.to,

            to:
              trip.arrival_location ||
              searchData.from,

            departureTime:
              departureDate.toLocaleTimeString(
                'vi-VN',
                {
                  hour: '2-digit',
                  minute: '2-digit',
                },
              ),

            arrivalTime:
              arrivalDate.toLocaleTimeString(
                'vi-VN',
                {
                  hour: '2-digit',
                  minute: '2-digit',
                },
              ),

            duration:
              trip.duration ||
              (
                isNaN(departureDate.getTime())
                  ? 'N/A'
                  : `${Math.round(
                      (
                        arrivalDate.getTime() -
                        departureDate.getTime()
                      ) / 3600000,
                    )}h`
              ),

            price: Number(
              trip.base_price || 0,
            ),

            busType: 'Giường nằm',
            rating: 5.0,
          };
        });

        setTripResults(returnTrips);

        if (returnTrips.length === 0) {
          toast.warning(
            'Không tìm thấy chuyến về phù hợp.',
          );
        }
      } catch (error) {
        console.error(
          'Lỗi khi tìm chuyến về:',
          error,
        );

        toast.error(
          'Lỗi khi tìm chuyến về.',
        );
      } finally {
        setIsLoadingReturnTrips(false);
      }

      return;
    }

    /*
     * Vé một chiều:
     * bookingPayloads chỉ chứa một booking.
     *
     * Vé khứ hồi:
     * bookingPayloads chứa booking chiều đi và chiều về.
     */
    const finalPayloads =
      bookingStep === 'return'
        ? [
            departureBookingInfo.payload,
            bookingPayload,
          ]
        : [bookingPayload];

    const finalTotalPrice =
      bookingStep === 'return'
        ? departureBookingInfo.payload
            .totalAmount + totalPrice
        : totalPrice;

    const checkoutData = {
      bookingPayloads: finalPayloads,

      successNavigationState: {
        type: 'bus',
        trip: selectedTrip,

        seats: data.passengers.map(
          (passenger) =>
            passenger.seatName,
        ),

        totalPrice: finalTotalPrice,
      },

      displayInfo: {
        depart:
          bookingStep === 'return'
            ? departureBookingInfo.display
            : {
                trip: selectedTrip,

                seats: data.passengers
                  .map(
                    (passenger) =>
                      passenger.seatName,
                  )
                  .join(', '),

                vehicleType: 'Bus',
              },

        ...(
          bookingStep === 'return'
            ? {
                return: {
                  trip: selectedTrip,

                  seats: data.passengers
                    .map(
                      (passenger) =>
                        passenger.seatName,
                    )
                    .join(', '),

                  vehicleType: 'Bus',
                },
              }
            : {}
        ),

        totalPrice: finalTotalPrice,
      },
    };

    /*
     * Chuyển tới màn hình chọn phương thức thanh toán.
     */
    navigate(
      '/checkout',
      {
        state: checkoutData,
      },
    );
  };

  const renderFloor = (
    floorNumber: number,
  ) => {
    const floorSeats = seats.filter(
      (seat) =>
        Number(seat.floor) === floorNumber,
    );

    const rowNumbers = Array.from(
      new Set(
        floorSeats
          .map((seat) => Number(seat.row))
          .filter(
            (row) =>
              Number.isFinite(row) && row >= 0,
          ),
      ),
    ).sort((a, b) => a - b);

    const renderSeatColumn = (
      position: 'left' | 'right',
    ) => {
      if (rowNumbers.length === 0) {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-2">
              {position === 'left'
                ? 'Bên Trái'
                : 'Bên Phải'}
            </p>
            <div className="w-full h-16 rounded-md border border-dashed border-muted-foreground/20" />
          </div>
                );
              }

              return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center mb-2">
            {position === 'left'
              ? 'Bên Trái'
              : 'Bên Phải'}
            </p>

          {rowNumbers.map((rowNumber) => {
            const seat = floorSeats.find(
                  (currentSeat) =>
                Number(currentSeat.row) ===
                  rowNumber &&
                    currentSeat.position ===
                  position,
                );

              if (seat) {
                return (
                  <SeatButton
                    key={seat.seatId}
                    seat={seat}
                  onClick={handleSeatClick}
                  />
                );
              }

              return (
                <div
                key={`placeholder-${position}-${rowNumber}`}
                className="w-full h-16 rounded-md border border-dashed border-muted-foreground/20"
                />
              );
            })}
          </div>
      );
    };

    return (
      <div className="bg-white rounded-xl p-6 border-2 border-border">
        <h3 className="font-semibold mb-4">
          Tầng {floorNumber}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          {renderSeatColumn('left')}
          {renderSeatColumn('right')}
        </div>
      </div>
    );
  };

  if (loadingSeats) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />

        <p className="ml-4 text-muted-foreground">
          Đang tải sơ đồ ghế...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <div className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            type="button"
            onClick={() => {
              if (selectedTrip) {
                setSelectedTrip(null);
                return;
              }

              navigate('/');
            }}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium"
          >
            <ArrowLeft className="w-5 h-5" />

            {selectedTrip
              ? `Quay lại danh sách chuyến ${
                  bookingStep ===
                  'departure'
                    ? 'đi'
                    : 'về'
                }`
              : 'Quay lại trang chủ'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {!selectedTrip
          ? (
              isLoadingReturnTrips
                ? (
                    <div className="text-center p-10">
                      Đang tìm chuyến về...
                    </div>
                  )
                : (
                    <>
                      <div className="mb-6">
                        <h1 className="text-2xl font-bold text-foreground mb-2">
                          {bookingStep ===
                          'departure'
                            ? 'Chọn Chuyến Đi'
                            : 'Chọn Chuyến Về'}
                        </h1>

                        <p className="text-muted-foreground">
                          {bookingStep ===
                          'departure'
                            ? `${searchData.from} → ${searchData.to}`
                            : `${searchData.to} → ${searchData.from}`}
                        </p>
                      </div>

                      <div className="grid gap-6">
                        {tripResults.length >
                        0 ? (
                          tripResults.map(
                            (
                              trip: any,
                            ) => (
                              <div
                                key={`trip-${trip.id}`}
                                className="bg-white rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow"
                              >
                                <div className="flex flex-col md:flex-row md:items-center gap-6">
                                  <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <Bus className="w-8 h-8 text-primary" />
                                  </div>

                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <h3 className="text-xl font-bold text-slate-800">
                                        {
                                          trip.operator
                                        }
                                      </h3>

                                      <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-sm font-medium border border-yellow-200">
                                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />

                                        {
                                          trip.rating
                                        }
                                      </div>

                                      <button
                                        type="button"
                                        onClick={(
                                          event,
                                        ) => {
                                          event.stopPropagation();
                                          setIsReviewsOpen(
                                            true,
                                          );
                                        }}
                                        className="text-sm text-primary hover:underline font-medium"
                                      >
                                        Đánh giá
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-4">
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-1">
                                          Khởi
                                          hành
                                        </p>

                                        <p className="text-lg font-semibold">
                                          {
                                            trip.departureTime
                                          }
                                        </p>

                                        <p className="text-muted-foreground">
                                          {
                                            trip.from
                                          }
                                        </p>
                                      </div>

                                      <div className="text-center">
                                        <p className="text-xs text-muted-foreground mb-1">
                                          Thời
                                          gian đi
                                        </p>

                                        <div className="flex items-center justify-center gap-2">
                                          <div className="h-px w-12 bg-border" />

                                          <Clock className="w-4 h-4 text-muted-foreground" />

                                          <div className="h-px w-12 bg-border" />
                                        </div>

                                        <p className="font-semibold mt-1">
                                          {
                                            trip.duration
                                          }
                                        </p>
                                      </div>

                                      <div className="md:text-right">
                                        <p className="text-xs text-muted-foreground mb-1">
                                          Đến nơi
                                        </p>

                                        <p className="text-lg font-semibold">
                                          {
                                            trip.arrivalTime
                                          }
                                        </p>

                                        <p className="text-muted-foreground">
                                          {
                                            trip.to
                                          }
                                        </p>
                                      </div>
                                    </div>

                                    <div className="mt-4 flex gap-2">
                                      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                                        {
                                          trip.busType
                                        }
                                      </span>
                                    </div>
                                  </div>

                                  <div className="md:w-48 flex flex-col items-end justify-center border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 pl-0 md:pl-6">
                                    <div className="text-2xl font-bold text-primary mb-1">
                                      {trip.price.toLocaleString(
                                        'vi-VN',
                                      )}
                                      ₫
                                    </div>

                                    <p className="text-xs text-muted-foreground mb-4">
                                      / ghế
                                    </p>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedTrip(
                                          trip,
                                        )
                                      }
                                      className="w-full py-3 rounded-lg bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-sm"
                                    >
                                      Chọn chuyến
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ),
                          )
                        ) : (
                          <div className="bg-white rounded-xl border border-border p-12 text-center">
                            <Bus className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />

                            <h3 className="text-xl font-semibold text-foreground mb-2">
                              {bookingStep === 'return'
                                ? 'Không tìm thấy chuyến về'
                                : 'Không tìm thấy chuyến đi'}
                            </h3>

                            <p className="text-muted-foreground mb-6">
                              Rất tiếc, hiện tại không có chuyến xe nào phù hợp
                              với yêu cầu từ{' '}
                              {bookingStep === 'return'
                                ? searchData.to
                                : searchData.from}{' '}
                              đến{' '}
                              {bookingStep === 'return'
                                ? searchData.from
                                : searchData.to}.
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                navigate('/')
                              }
                              className="px-6 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                            >
                              Thử tìm
                              kiếm lại
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )
            )
          : (
              <>
                <div className="mb-6 p-6 bg-white rounded-xl border border-border">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bus className="w-6 h-6 text-primary" />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-semibold">
                          {
                            selectedTrip.operator
                          }
                        </h2>

                        <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-sm font-medium border border-yellow-200">
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />

                          {
                            selectedTrip.rating
                          }
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setIsReviewsOpen(
                              true,
                            )
                          }
                          className="text-sm text-primary hover:underline font-medium"
                        >
                          Xem đánh giá
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />

                          <span>
                            {
                              selectedTrip.from
                            }{' '}
                            →{' '}
                            {
                              selectedTrip.to
                            }
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />

                          <span>
                            {
                              selectedTrip.departureTime
                            }{' '}
                            -{' '}
                            {
                              selectedTrip.arrivalTime
                            }{' '}
                            (
                            {
                              selectedTrip.duration
                            }
                            )
                          </span>
                        </div>

                        <div>
                          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs">
                            {
                              selectedTrip.busType
                            }
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">
                        {selectedTrip.price.toLocaleString(
                          'vi-VN',
                        )}
                        ₫
                      </p>

                      <p className="text-xs text-muted-foreground">
                        / ghế
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-xl p-6 border border-border">
                      <h3 className="text-lg font-semibold mb-4">
                        Chọn Ghế
                        Ngồi
                      </h3>

                      <div className="flex gap-6 mb-6">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded border-2 border-gray-300 bg-[--seat-available]" />
                          <span className="text-sm">
                            Còn trống
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded border-2 border-red-300 bg-[--seat-booked]" />
                          <span className="text-sm">
                            Đã đặt
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded border-2 border-green-500 bg-[--seat-selected]" />
                          <span className="text-sm">
                            Đang chọn
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded border-2 border-orange-300 bg-orange-100" />
                          <span className="text-sm">
                            Đang giữ
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderFloor(1)}
                        {renderFloor(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-6 bg-white rounded-xl border border-border sticky top-4">
                      <h3 className="font-semibold mb-4">
                        Chi Tiết Đặt
                        Vé
                      </h3>

                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Ghế đã
                            chọn:
                          </span>

                          <span className="font-semibold max-w-[150px] text-right truncate">
                            {passengerFields.length >
                            0
                              ? passengerFields
                                  .map(
                                    (
                                      passenger,
                                    ) =>
                                      passenger.seatName,
                                  )
                                  .join(
                                    ', ',
                                  )
                              : 'Chưa chọn'}
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Số lượng:
                          </span>

                          <span className="font-semibold">
                            {
                              passengerFields.length
                            }{' '}
                            ghế
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Đơn giá:
                          </span>

                          <span className="font-semibold">
                            {selectedTrip.price.toLocaleString(
                              'vi-VN',
                            )}
                            ₫
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-border pt-4 mb-6">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">
                            Tổng cộng:
                          </span>

                          <span className="text-2xl font-bold text-primary">
                            {totalPrice.toLocaleString(
                              'vi-VN',
                            )}
                            ₫
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSubmit(
                          onFormSubmit,
                        )}
                        disabled={
                          passengerFields.length ===
                            0 ||
                          isSubmitting
                        }
                        className="w-full py-3 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {isSubmitting
                          ? 'Đang xử lý...'
                          : 'Tiếp Tục Thanh Toán'}
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
        operatorName={
          selectedTrip
            ? selectedTrip.operator
            : 'Nhà xe'
        }
        averageRating={
          selectedTrip
            ? selectedTrip.rating
            : 5.0
        }
        totalReviews={0}
        reviews={[]}
      />
    </div>
  );
}