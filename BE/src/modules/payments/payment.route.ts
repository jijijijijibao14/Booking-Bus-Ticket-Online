import { Router } from 'express';
import { verifyToken } from '../../middlewares/auth.middleware.js';
import paymentController from './payment.controller.js';

const router = Router();

/**
 * User đã đăng nhập tạo URL thanh toán.
 */
router.post(
  '/vnpay/create',
  verifyToken,
  paymentController.createVNPayPayment,
);

/**
 * Trình duyệt người dùng được VNPAY redirect về đây.
 */
router.get('/vnpay-return', paymentController.vnpayReturn);

/**
 * VNPAY server gọi IPN.
 * Không dùng verifyToken.
 */
router.get('/vnpay-ipn', paymentController.vnpayIpn);

/**
 * Frontend kiểm tra kết quả thanh toán.
 */
router.get(
  '/:bookingCode/status',
  verifyToken,
  paymentController.getPaymentStatus,
);

export default router;