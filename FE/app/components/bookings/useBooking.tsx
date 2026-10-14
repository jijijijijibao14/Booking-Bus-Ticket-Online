import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  confirmSingleBooking,
  searchTrips as apiSearchTrips,
} from '@/api';

/*
 * Thông tin của một hành khách.
 */
export interface PassengerInfo {
  name: string;
  price: number;

  // Xe khách / tàu hỏa
  seatId?: number;

  // Tàu hỏa
  idCard?: string;

  // Tàu hỏa / máy bay
  phone?: string;
  email?: string;

  // Máy bay
  gender?: string;
  dob?: string;
  type?: 'Adult' | 'Child' | 'Infant';
  luggage?: string;
}

/*
 * Payload gửi tới API xác nhận booking.
 */
export interface BookingPayload {
  tripId: number | string;

  vehicleType:
    | 'Bus'
    | 'Train'
    | 'Flight';

  seatIds?: number[];

  /*
   * Dành cho máy bay.
   */
  classId?: number;

  contactInfo: {
    fullName: string;
    email: string;
    phone: string;
  };

  passengers: PassengerInfo[];

  totalAmount: number;
  paymentMethod?: 'Wallet' | 'VNPAY';
}

/*
 * Các tùy chọn khi xác nhận booking.
 */
interface ConfirmBookingOptions {
  /*
   * true:
   * Sau khi booking thành công sẽ chuyển
   * đến trang /booking/success.
   *
   * false:
   * Chỉ tạo booking và trả kết quả về.
   * Dùng cho VNPay hoặc vé khứ hồi.
   */
  navigateOnSuccess?: boolean;

  /*
   * Có hiển thị thông báo thành công hay không.
   * Mặc định theo navigateOnSuccess.
   */
  showSuccessToast?: boolean;

  /*
   * Cho phép thay đổi trang thành công.
   */
  successPath?: string;
}

/*
 * Dữ liệu hiển thị được truyền sang
 * trang BookingSuccess.
 */
type SuccessNavigationState =
  Record<string, unknown>;

/*
 * Hook dùng chung cho các trang booking
 * và checkout.
 */
export function useBooking() {
  const navigate = useNavigate();

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const handleConfirmBooking = async (
    payload: BookingPayload,
    successNavigationState:
      SuccessNavigationState = {},
    options: ConfirmBookingOptions = {},
  ) => {
    const {
      navigateOnSuccess = true,
      showSuccessToast =
        navigateOnSuccess,
      successPath =
        '/booking/success',
    } = options;

    if (isSubmitting) {
      throw new Error(
        'Hệ thống đang xử lý booking. Vui lòng chờ.',
      );
    }

    setIsSubmitting(true);

    try {
      /*
       * API này tạo một booking.
       *
       * Với VNPay:
       * booking được tạo ở trạng thái Pending,
       * sau đó CheckoutPage tiếp tục tạo
       * payment URL.
       */
      const response =
        await confirmSingleBooking(
          payload,
        );

      const responseData =
        response?.data ?? {};

      if (
        responseData.success === false
      ) {
        throw new Error(
          responseData.message ||
            'Không thể xác nhận booking.',
        );
      }

      const bookingCode =
        responseData.bookingCode;

      const firstTicketQr =
        responseData.firstTicketQr;

      if (!bookingCode) {
        throw new Error(
          'Backend không trả về bookingCode.',
        );
      }

      if (showSuccessToast) {
        toast.success(
          responseData.message ||
            'Đặt vé thành công!',
          {
            description:
              `Mã đặt chỗ: ${bookingCode}`,
          },
        );
      }

      /*
       * Chỉ chuyển trang ngay đối với
       * luồng booking thông thường.
       *
       * Luồng VNPay truyền:
       * navigateOnSuccess: false
       */
      if (navigateOnSuccess) {
        navigate(
          successPath,
          {
            state: {
              ...successNavigationState,

              bookingCode,

              qrCode:
                firstTicketQr,

              totalPrice:
                payload.totalAmount,
            },
          },
        );
      }

      /*
       * Trả nguyên Axios response để tương thích
       * với CheckoutPage hiện tại:
       *
       * result.data.bookingCode
       * result.data.firstTicketQr
       */
      return response;
    } catch (error: any) {
      console.error(
        'Confirm booking error:',
        error,
      );

      toast.error(
        'Đặt vé thất bại!',
        {
          description:
            error.response?.data
              ?.message ||
            error.message ||
            'Vui lòng thử lại.',
        },
      );

      /*
       * Ném lỗi lại để CheckoutPage
       * có thể xử lý hoàn tiền hoặc
       * dừng giao dịch VNPay.
       */
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    handleConfirmBooking,
  };
}

/*
 * Export lại searchTrips để các trang
 * BusBooking, TrainBooking và FlightBooking
 * tiếp tục sử dụng như trước.
 */
export const searchTrips =
  apiSearchTrips;