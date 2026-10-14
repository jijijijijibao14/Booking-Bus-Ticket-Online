import { sendTicketEmailUtil } from '../../utils/email.util.js';
import bookingService from './booking.service.js';
import { CustomError } from '../../utils/customError.js';
class BookingController {
    /**
     * Xác nhận đặt vé một chiều.
     */
    async confirmSingleBooking(req, res) {
        try {
            // req.user được gắn từ middleware verifyToken
            // @ts-ignore
            const userId = req.user.user_id;
            const result = await bookingService.confirmSingleBooking(userId, req.body);
            return res.status(201).json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            console.error('Controller Error: confirmSingleBooking failed.', error);
            return res.status(500).json({
                success: false,
                message: error.message ||
                    'Không thể xác nhận đặt vé.',
            });
        }
    }
    /**
     * Xác nhận đặt vé khứ hồi.
     */
    async confirmRoundtripBooking(req, res) {
        try {
            // req.user được gắn từ middleware verifyToken
            // @ts-ignore
            const userId = req.user.user_id;
            const bookingPayloads = req.body?.bookingPayloads;
            if (!Array.isArray(bookingPayloads) ||
                bookingPayloads.length !== 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Đặt vé khứ hồi cần đúng hai booking payload.',
                });
            }
            /*
             * Sau khi kiểm tra length = 2,
             * chuyển mảng thành đúng kiểu tuple mà service yêu cầu.
             */
            const roundtripPayloads = [
                bookingPayloads[0],
                bookingPayloads[1],
            ];
            const result = await bookingService.confirmRoundtripBooking(userId, roundtripPayloads);
            return res.status(201).json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            console.error('Controller Error: confirmRoundtripBooking failed.', error);
            return res.status(500).json({
                success: false,
                message: error.message ||
                    'Không thể xác nhận đặt vé khứ hồi.',
            });
        }
    }
    /**
     * Lấy lịch sử đặt vé của người dùng.
     */
    async getHistory(req, res) {
        try {
            // @ts-ignore
            const userId = req.user.user_id;
            const history = await bookingService.getBookingHistory(userId);
            return res.status(200).json({
                success: true,
                data: history,
            });
        }
        catch (error) {
            console.error('Controller Error: getHistory failed.', error);
            return res.status(500).json({
                success: false,
                message: error.message ||
                    'Không thể lấy lịch sử đặt vé.',
            });
        }
    }
    /**
     * Tự động hủy booking và hoàn tiền.
     *
     * API này được dùng trong các luồng nội bộ,
     * ví dụ một chiều của booking khứ hồi bị lỗi.
     */
    async cancelAndRefund(req, res) {
        try {
            /*
             * Express có thể suy luận param là
             * string | string[], nên cần chuẩn hóa
             * rõ ràng về string.
             */
            const bookingCode = String(req.params.bookingCode ?? '').trim();
            const reason = String(req.body?.reason ?? '').trim();
            if (!bookingCode || !reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu mã đặt chỗ hoặc lý do hủy.',
                });
            }
            const result = await bookingService.cancelAndRefundBooking(bookingCode, reason);
            return res.status(200).json(result);
        }
        catch (error) {
            console.error('Controller Error: cancelAndRefund failed.', error);
            return res.status(500).json({
                success: false,
                message: error.message ||
                    'Không thể hủy và hoàn tiền.',
            });
        }
    }
    /**
     * Giữ một ghế trên Redis.
     */
    async holdSeat(req, res) {
        try {
            // @ts-ignore
            const userId = req.user.user_id;
            const { tripId, seatId, } = req.body ?? {};
            if (tripId === undefined ||
                tripId === null ||
                seatId === undefined ||
                seatId === null) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu tripId hoặc seatId.',
                });
            }
            await bookingService.holdSingleSeat(tripId, seatId, userId);
            return res.status(200).json({
                success: true,
                message: 'Giữ ghế thành công.',
            });
        }
        catch (error) {
            console.error('Controller Error: holdSeat failed.', error);
            return res.status(400).json({
                success: false,
                message: error.message ||
                    'Không thể giữ ghế.',
            });
        }
    }
    /**
     * Nhả một ghế đang được giữ trên Redis.
     */
    async releaseSeat(req, res) {
        try {
            // @ts-ignore
            const userId = req.user.user_id;
            const { tripId, seatId, } = req.body ?? {};
            if (tripId === undefined ||
                tripId === null ||
                seatId === undefined ||
                seatId === null) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu tripId hoặc seatId.',
                });
            }
            await bookingService.releaseSingleSeat(tripId, seatId, userId);
            return res.status(200).json({
                success: true,
                message: 'Nhả ghế thành công.',
            });
        }
        catch (error) {
            console.error('Controller Error: releaseSeat failed.', error);
            return res.status(400).json({
                success: false,
                message: error.message ||
                    'Không thể nhả ghế.',
            });
        }
    }
    /**
     * Người dùng gửi yêu cầu hủy và hoàn tiền.
     */
    async requestCancellation(req, res) {
        try {
            // @ts-ignore
            const userId = req.user.user_id;
            /*
             * Chuẩn hóa bookingCode thành string
             * để tránh lỗi string | string[].
             */
            const bookingCode = String(req.params.bookingCode ?? '').trim();
            const reason = String(req.body?.reason ?? '').trim();
            if (!bookingCode || !reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu mã đặt chỗ hoặc lý do hủy.',
                });
            }
            const result = await bookingService
                .requestCancellationAndRefund(userId, bookingCode, reason);
            return res.status(200).json(result);
        }
        catch (error) {
            console.error('Controller Error: requestCancellation failed.', error);
            const statusCode = error instanceof CustomError
                ? error.statusCode
                : 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message ||
                    'Không thể gửi yêu cầu hủy vé.',
            });
        }
    }
    async sendTicketEmail(req, res) {
        try {
            const { email, ticketImage } = req.body;
            if (!email || !ticketImage) {
                return res.status(400).json({ success: false, message: 'Thiếu thông tin email hoặc ảnh vé.' });
            }
            // Gọi Nodemailer gửi
            await sendTicketEmailUtil(email, ticketImage);
            res.status(200).json({ success: true, message: 'Đã gửi email thành công.' });
        }
        catch (error) {
            console.error('Controller Error: sendTicketEmail failed.', error);
            res.status(500).json({ success: false, message: 'Không thể gửi email. Lỗi hệ thống!' });
        }
    }
}
export default new BookingController();
