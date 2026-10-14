import { Request, Response } from 'express';
import paymentService from './payment.service.js';

class PaymentController {
  async createVNPayPayment(req: Request, res: Response) {
  try {
    // @ts-ignore - req.user được gắn từ verifyToken
    const userId = req.user.user_id;

    const {
      bookingCode,
      bookingCodes,
      bankCode,
    } = req.body ?? {};

    /*
     * Hỗ trợ cả hai định dạng:
     *
     * Một chiều:
     * { bookingCode: "ABC123" }
     *
     * Khứ hồi:
     * { bookingCodes: ["ABC123", "XYZ789"] }
     */
    const normalizedBookingCodes: string[] = Array.isArray(
      bookingCodes,
    )
      ? bookingCodes
          .map((code: unknown) => String(code).trim())
          .filter(Boolean)
      : typeof bookingCode === 'string' &&
          bookingCode.trim()
        ? [bookingCode.trim()]
        : [];

    const uniqueBookingCodes = [
      ...new Set(normalizedBookingCodes),
    ];

    if (uniqueBookingCodes.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Thiếu bookingCode hoặc bookingCodes.',
      });
    }

    if (uniqueBookingCodes.length > 2) {
      return res.status(400).json({
        success: false,
        message:
          'Mỗi giao dịch hiện chỉ hỗ trợ tối đa hai booking.',
      });
    }

    if (
      normalizedBookingCodes.length !==
      uniqueBookingCodes.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Danh sách bookingCodes có mã booking bị trùng.',
      });
    }

    const forwardedIp =
      req.headers['x-forwarded-for'];

    const ipAddress =
      typeof forwardedIp === 'string'
        ? forwardedIp.split(',')[0].trim()
        : Array.isArray(forwardedIp)
          ? forwardedIp[0]
          : req.socket.remoteAddress;

    const result =
      await paymentService.createVNPayPaymentUrl({
        userId,
        bookingCodes: uniqueBookingCodes,
        bankCode:
          typeof bankCode === 'string' &&
          bankCode.trim()
            ? bankCode.trim()
            : undefined,
        ipAddress,
      });

    return res.status(201).json({
      success: true,
      message:
        uniqueBookingCodes.length === 2
          ? 'Tạo URL thanh toán khứ hồi thành công.'
          : 'Tạo URL thanh toán thành công.',
      data: result,
    });
  } catch (error: any) {
    console.error(
      'Create VNPAY payment error:',
      error,
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        'Không thể tạo giao dịch VNPAY.',
    });
  }
}
/**
 * VNPay chuyển trình duyệt người dùng về endpoint này.
 *
 * Luồng chuẩn:
 * - IPN cập nhật database.
 *
 * Luồng dự phòng cho Sandbox/demo:
 * - Return URL cũng xác minh chữ ký.
 * - Nếu IPN chưa chạy, cập nhật database bằng cùng logic IPN.
 */
async vnpayReturn(req: Request, res: Response) {
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      'http://localhost:5173';

    const txnRef = String(
      req.query.vnp_TxnRef ?? '',
    );

    const responseCode = String(
      req.query.vnp_ResponseCode ?? '',
    );

    /*
     * Dùng lại toàn bộ logic:
     * - kiểm tra SecureHash
     * - kiểm tra giao dịch
     * - kiểm tra số tiền
     * - cập nhật Payment, Payment Order và Booking
     */
    const processingResult =
      await paymentService.handleVNPayIpn(
        req.query as Record<string, unknown>,
      );

    console.log(
      'VNPAY Return processing result:',
      processingResult,
    );

    /*
     * RspCode 00:
     * vừa cập nhật giao dịch thành công.
     *
     * RspCode 02:
     * IPN đã cập nhật trước đó, giao dịch đã được xác nhận.
     */
    const paymentConfirmed =
      responseCode === '00' &&
      (
        processingResult.RspCode === '00' ||
        processingResult.RspCode === '02'
      );

    const status = paymentConfirmed
      ? 'success'
      : 'failed';

    const redirectUrl = new URL(
      '/payment-result',
      frontendUrl,
    );

    redirectUrl.searchParams.set(
      'status',
      status,
    );

    redirectUrl.searchParams.set(
      'txnRef',
      txnRef,
    );

    redirectUrl.searchParams.set(
      'responseCode',
      responseCode,
    );

    redirectUrl.searchParams.set(
      'rspCode',
      processingResult.RspCode,
    );

    return res.redirect(
      redirectUrl.toString(),
    );
  } catch (error) {
    console.error(
      'VNPAY return error:',
      error,
    );

    const frontendUrl =
      process.env.FRONTEND_URL ||
      'http://localhost:5173';

    const redirectUrl = new URL(
      '/payment-result',
      frontendUrl,
    );

    redirectUrl.searchParams.set(
      'status',
      'failed',
    );

    redirectUrl.searchParams.set(
      'responseCode',
      '99',
    );

    return res.redirect(
      redirectUrl.toString(),
    );
  }
}

  /**
   * VNPAY gọi endpoint này để thông báo kết quả giao dịch.
   * Không gắn verifyToken vì đây là request server-to-server từ VNPAY.
   */
  async vnpayIpn(req: Request, res: Response) {
    const result = await paymentService.handleVNPayIpn(
      req.query as Record<string, unknown>,
    );

    return res.status(200).json(result);
  }

  async getPaymentStatus(req: Request, res: Response) {
    try {
      // @ts-ignore
      const userId = req.user.user_id;

      const bookingCode = String(req.params.bookingCode ?? ''); 
      if (!bookingCode) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu bookingCode.',
        });
      }

      const result = await paymentService.getPaymentStatus(
        userId,
        bookingCode,
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
  }
}

export default new PaymentController();