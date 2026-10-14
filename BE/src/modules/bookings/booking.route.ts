import { Router } from 'express';
import bookingController from './booking.controller.js';
import { verifyToken } from '../../middlewares/auth.middleware.js';

const router = Router();

// Endpoint để xác nhận và thanh toán một booking (vé một chiều)
router.post('/confirm-single', verifyToken, bookingController.confirmSingleBooking);

// Endpoint mới cho giao dịch nguyên tử của vé khứ hồi
router.post('/confirm-roundtrip', verifyToken, bookingController.confirmRoundtripBooking);

// Endpoint mới để lấy lịch sử đặt vé của người dùng
router.get('/history', verifyToken, bookingController.getHistory);

// Endpoint để hủy vé và hoàn tiền (dùng cho luồng đặt vé khứ hồi thất bại)
router.post('/:bookingCode/cancel', verifyToken, bookingController.cancelAndRefund);

// Endpoint mới để yêu cầu hủy vé theo chính sách hoàn tiền
router.post('/:bookingCode/request-cancellation', verifyToken, bookingController.requestCancellation);

// Endpoints để giữ/nhả ghế tạm thời
router.post('/hold-seat', verifyToken, bookingController.holdSeat);
router.post('/release-seat', verifyToken, bookingController.releaseSeat);

router.post('/send-ticket-email', bookingController.sendTicketEmail);
export default router; 