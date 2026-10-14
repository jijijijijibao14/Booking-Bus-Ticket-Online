import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bus,
  Plane,
  QrCode,
  Timer,
  Train,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

import { confirmRoundtripBooking } from '@/api';
import { type BookingPayload, useBooking } from './useBooking';

type VehicleType = 'Bus' | 'Train' | 'Flight';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    bookingPayloads,
    successNavigationState,
    displayInfo,
  } = location.state || {};

  const [paymentMethod, setPaymentMethod] =
    useState<'wallet' | 'qr'>('wallet');

  const [timeLeft, setTimeLeft] = useState(600);
  const [isPaymentSubmitting, setIsPaymentSubmitting] =
    useState(false);

  const {
    isSubmitting: isBookingSubmitting,
    handleConfirmBooking,
  } = useBooking();

  const isSubmitting =
    isPaymentSubmitting || isBookingSubmitting;

  useEffect(() => {
    if (
      !Array.isArray(bookingPayloads) ||
      bookingPayloads.length === 0
    ) {
      toast.error('Lỗi', {
        description:
          'Không có thông tin đặt vé. Đang điều hướng về trang chủ.',
      });

      navigate('/');
    }
  }, [bookingPayloads, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((previousTime) => {
        if (previousTime <= 1) {
          window.clearInterval(timer);

          toast.error('Hết thời gian', {
            description:
              'Thời gian giữ chỗ đã hết. Vui lòng thực hiện lại.',
          });

          navigate(-1);
          return 0;
        }

        return previousTime - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [navigate]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(
      remainingSeconds,
    ).padStart(2, '0')}`;
  };

  const handleFinalConfirm = async () => {
    if (isSubmitting) {
      return;
    }

    setIsPaymentSubmitting(true);

    try {
      if (
        !Array.isArray(bookingPayloads) ||
        bookingPayloads.length === 0
      ) {
        toast.error('Không có thông tin đặt vé.');
        return;
      }

      if (bookingPayloads.length > 2) {
        toast.error(
          'Mỗi giao dịch chỉ hỗ trợ tối đa hai booking.',
        );
        return;
      }

      /*
       * ==========================
       * THANH TOÁN QUA VNPAY
       * ==========================
       * - Không trừ wallet_balance.
       * - Booking được tạo Pending.
       * - Một chiều: confirmSingleBooking.
       * - Khứ hồi: confirmRoundtripBooking để hai booking
       *   được tạo trong cùng một DB transaction.
       * - Sau đó tạo một Payment Order VNPay cho 1 hoặc 2 booking.
       */
      if (paymentMethod === 'qr') {
        const token = localStorage.getItem('token');

        if (!token) {
          toast.error('Phiên đăng nhập không hợp lệ.');
          navigate('/login');
          return;
        }

        const createdBookingCodes: string[] = [];

        toast.info(
          bookingPayloads.length === 2
            ? 'Đang tạo booking khứ hồi chờ thanh toán VNPay...'
            : 'Đang tạo booking chờ thanh toán VNPay...',
          {
            description:
              'Vui lòng không đóng hoặc tải lại trang.',
          },
        );

        if (bookingPayloads.length === 1) {
          const vnpayPayload: BookingPayload = {
            ...bookingPayloads[0],
            paymentMethod: 'VNPAY',
          };

          const bookingResult: any =
            await handleConfirmBooking(
              vnpayPayload,
              successNavigationState,
              {
                navigateOnSuccess: false,
                showSuccessToast: false,
              },
            );

          const bookingCode =
            bookingResult?.data?.bookingCode ||
            bookingResult?.bookingCode;

          if (!bookingCode) {
            throw new Error(
              'Không lấy được bookingCode từ API booking.',
            );
          }

          createdBookingCodes.push(String(bookingCode));
        } else {
          const vnpayRoundtripPayloads: [
            BookingPayload,
            BookingPayload,
          ] = [
            {
              ...bookingPayloads[0],
              paymentMethod: 'VNPAY',
            },
            {
              ...bookingPayloads[1],
              paymentMethod: 'VNPAY',
            },
          ];

          const roundtripResponse: any =
            await confirmRoundtripBooking(
              vnpayRoundtripPayloads,
            );

          const roundtripData =
            roundtripResponse?.data ?? roundtripResponse;

          const returnedBookingCodes =
            Array.isArray(roundtripData?.bookingCodes)
              ? roundtripData.bookingCodes
              : String(roundtripData?.bookingCode ?? '')
                  .split(',')
                  .map((code) => code.trim())
                  .filter(Boolean);

          if (returnedBookingCodes.length !== 2) {
            throw new Error(
              'Backend không trả về đủ hai bookingCode cho vé khứ hồi.',
            );
          }

          createdBookingCodes.push(
            ...returnedBookingCodes.map(String),
          );
        }

        const paymentRequestBody =
          createdBookingCodes.length === 1
            ? {
                bookingCode: createdBookingCodes[0],
              }
            : {
                bookingCodes: createdBookingCodes,
              };

        const paymentResponse = await axios.post(
          '/api/payments/vnpay/create',
          paymentRequestBody,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const paymentUrl =
          paymentResponse.data?.data?.paymentUrl;

        const orderCode =
          paymentResponse.data?.data?.orderCode;

        const totalAmount =
          paymentResponse.data?.data?.totalAmount;

        if (!paymentUrl) {
          throw new Error(
            'Backend không trả về paymentUrl.',
          );
        }

        sessionStorage.setItem(
          'pendingBookingCode',
          createdBookingCodes[0],
        );

        sessionStorage.setItem(
          'pendingBookingCodes',
          JSON.stringify(createdBookingCodes),
        );

        sessionStorage.setItem(
          'pendingPaymentOrderCode',
          String(orderCode ?? ''),
        );

        sessionStorage.setItem(
          'bookingSuccessState',
          JSON.stringify({
            ...successNavigationState,
            bookingCode: createdBookingCodes.join(', '),
            bookingCodes: createdBookingCodes,
            orderCode,
            totalPrice:
              totalAmount ?? displayInfo.totalPrice,
          }),
        );

        toast.success(
          createdBookingCodes.length === 2
            ? 'Đã tạo một giao dịch VNPay cho hai chiều.'
            : 'Đã tạo giao dịch VNPay.',
          {
            description:
              createdBookingCodes.length === 2
                ? `Tổng thanh toán: ${Number(
                    totalAmount ?? displayInfo.totalPrice,
                  ).toLocaleString('vi-VN')}₫`
                : 'Đang chuyển đến VNPay.',
          },
        );

        window.location.assign(paymentUrl);
        return;
      }

      /*
       * ==========================
       * THANH TOÁN BẰNG VÍ VIETGO
       * ==========================
       * Backend sẽ:
       * - khóa user FOR UPDATE;
       * - kiểm tra số dư;
       * - trừ ví;
       * - tạo booking Paid;
       * - tạo ticket/QR;
       * - rollback toàn bộ nếu có lỗi.
       */
      if (bookingPayloads.length === 1) {
        const walletPayload: BookingPayload = {
          ...bookingPayloads[0],
          paymentMethod: 'Wallet',
        };

        await handleConfirmBooking(
          walletPayload,
          successNavigationState,
        );

        return;
      }

      /*
       * Vé khứ hồi bằng Ví:
       * gọi API roundtrip MỘT LẦN để backend xử lý
       * cả hai chiều trong cùng một transaction.
       */
      const walletRoundtripPayloads: [
        BookingPayload,
        BookingPayload,
      ] = [
        {
          ...bookingPayloads[0],
          paymentMethod: 'Wallet',
        },
        {
          ...bookingPayloads[1],
          paymentMethod: 'Wallet',
        },
      ];

      toast.info(
        'Đang thanh toán vé khứ hồi bằng ví...',
        {
          description:
            'Hệ thống đang xử lý cả hai chiều trong một giao dịch.',
        },
      );

      const walletRoundtripResponse: any =
        await confirmRoundtripBooking(
          walletRoundtripPayloads,
        );

      const walletRoundtripData =
        walletRoundtripResponse?.data ??
        walletRoundtripResponse;

      if (walletRoundtripData?.success === false) {
        throw new Error(
          walletRoundtripData?.message ||
            'Thanh toán vé khứ hồi bằng ví thất bại.',
        );
      }

      toast.success(
        walletRoundtripData?.message ||
          'Đặt vé khứ hồi và thanh toán bằng ví thành công!',
        {
          description:
            walletRoundtripData?.walletBalance !== undefined
              ? `Số dư ví còn lại: ${Number(
                  walletRoundtripData.walletBalance,
                ).toLocaleString('vi-VN')}₫`
              : undefined,
        },
      );

      navigate('/booking/success', {
        state: {
          ...successNavigationState,
          bookingCode:
            walletRoundtripData?.bookingCode ||
            walletRoundtripData?.bookingCodes?.join(', '),
          bookingCodes:
            walletRoundtripData?.bookingCodes,
          qrCode:
            walletRoundtripData?.firstTicketQr,
          totalPrice:
            walletRoundtripData?.totalPrice ??
            displayInfo.totalPrice,
          walletBalance:
            walletRoundtripData?.walletBalance,
        },
      });
    } catch (error: any) {
      console.error(
        'Checkout payment error:',
        error,
      );

      toast.error(
        paymentMethod === 'wallet'
          ? 'Thanh toán bằng ví thất bại'
          : 'Không thể khởi tạo thanh toán VNPay',
        {
          description:
            error.response?.data?.message ||
            error.message ||
            'Vui lòng thử lại.',
        },
      );
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handleCancel = () => {
    toast.warning('Đã hủy thanh toán', {
      description:
        'Bạn đã hủy giao dịch. Vui lòng đặt lại nếu muốn.',
    });

    navigate(-1);
  };

  if (!displayInfo || !bookingPayloads) {
    return null;
  }

  const getVehicleIcon = (
    vehicleType: VehicleType,
  ) => {
    switch (vehicleType) {
      case 'Bus':
        return <Bus className="w-6 h-6 text-primary" />;

      case 'Train':
        return <Train className="w-6 h-6 text-primary" />;

      case 'Flight':
        return <Plane className="w-6 h-6 text-primary" />;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-border">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold text-center text-foreground">
            Xác Nhận Thanh Toán
          </h1>

          <p className="text-center text-muted-foreground">
            Vui lòng kiểm tra thông tin và hoàn tất đặt vé
          </p>
        </div>

        <div className="p-8 space-y-6">
          <div className="p-4 rounded-xl bg-orange-50 border-2 border-orange-200">
            <div className="flex items-center gap-3 mb-3">
              <Timer className="w-6 h-6 text-orange-600" />

              <h3 className="font-bold text-orange-800">
                Thời gian còn lại
              </h3>
            </div>

            <div className="text-center bg-white rounded-lg py-3 border border-orange-100 shadow-sm">
              <div className="text-5xl font-black text-orange-600 font-mono tracking-wider">
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">
              Tóm tắt đặt vé
            </h3>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  Chuyến đi:
                </span>

                <div className="flex items-center gap-2 font-semibold">
                  {displayInfo.depart &&
                    getVehicleIcon(
                      displayInfo.depart.vehicleType,
                    )}

                  <span>
                    {displayInfo.depart?.trip.from} →{' '}
                    {displayInfo.depart?.trip.to}
                  </span>
                </div>
              </div>

              {displayInfo.return && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    Chuyến về:
                  </span>

                  <div className="flex items-center gap-2 font-semibold">
                    {getVehicleIcon(
                      displayInfo.return.vehicleType,
                    )}

                    <span>
                      {displayInfo.return.trip.from} →{' '}
                      {displayInfo.return.trip.to}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  Chi tiết:
                </span>

                <span className="font-semibold text-right max-w-[250px] truncate">
                  {displayInfo.depart?.seats ||
                    `${displayInfo.depart?.passengers} khách`}

                  {displayInfo.return &&
                    ` | ${
                      displayInfo.return?.seats ||
                      `${displayInfo.return?.passengers} khách`
                    }`}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
              <span className="text-lg font-bold">
                TỔNG CỘNG
              </span>

              <span className="text-3xl font-black text-primary">
                {Number(
                  displayInfo.totalPrice || 0,
                ).toLocaleString('vi-VN')}
                ₫
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">
              Phương thức thanh toán
            </h3>

            <div className="space-y-3">
              <label className="flex items-center gap-4 p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <Wallet className="w-8 h-8 text-primary" />

                <div className="flex-1">
                  <p className="font-semibold">
                    Thanh toán bằng ví ViệtGo
                  </p>

                  <p className="text-sm text-muted-foreground">
                    Sử dụng số dư trong tài khoản của bạn.
                  </p>
                </div>

                <input
                  type="radio"
                  name="paymentMethod"
                  value="wallet"
                  checked={paymentMethod === 'wallet'}
                  onChange={() => setPaymentMethod('wallet')}
                  className="w-5 h-5 text-primary focus:ring-primary focus:ring-offset-0"
                />
              </label>

              <label className="flex items-center gap-4 p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <QrCode className="w-8 h-8 text-primary" />

                <div className="flex-1">
                  <p className="font-semibold">
                    Thanh toán bằng mã QR
                  </p>

                  <p className="text-sm text-muted-foreground">
                    Quét mã để thanh toán một chiều hoặc khứ hồi qua VNPay.
                  </p>
                </div>

                <input
                  type="radio"
                  name="paymentMethod"
                  value="qr"
                  checked={paymentMethod === 'qr'}
                  onChange={() => setPaymentMethod('qr')}
                  className="w-5 h-5 text-primary focus:ring-primary focus:ring-offset-0"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-border rounded-b-2xl flex gap-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hủy
          </button>

          <button
            type="button"
            onClick={handleFinalConfirm}
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting
              ? 'Đang xử lý...'
              : 'Thanh Toán Ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}