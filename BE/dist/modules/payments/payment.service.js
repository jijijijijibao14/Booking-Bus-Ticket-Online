import pool from '../../config/database.js';
import { recordSystemFinancialTransaction } from '../../utils/system-financial.util.js';
import { buildVNPayPaymentUrl, formatVNPayDate, normalizeIpAddress, verifyVNPaySecureHash, } from './vnpay.util.js';
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Thiếu biến môi trường ${name}.`);
    }
    return value;
}
function normalizeBookingCodes(bookingCode, bookingCodes) {
    const rawCodes = Array.isArray(bookingCodes) && bookingCodes.length > 0
        ? bookingCodes
        : bookingCode
            ? [bookingCode]
            : [];
    const normalizedCodes = rawCodes
        .map((code) => String(code).trim())
        .filter(Boolean);
    return [...new Set(normalizedCodes)];
}
function generateOrderCode(userId) {
    const randomPart = Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, '0');
    return `PO${userId}${Date.now()}${randomPart}`;
}
export class PaymentService {
    /**
     * Tạo một URL VNPAY cho:
     * - một booking;
     * - hoặc hai booking chiều đi và chiều về.
     */
    async createVNPayPaymentUrl(input) {
        const { userId, bookingCode, bookingCodes, ipAddress, bankCode, } = input;
        const normalizedBookingCodes = normalizeBookingCodes(bookingCode, bookingCodes);
        if (normalizedBookingCodes.length === 0) {
            throw new Error('Vui lòng cung cấp ít nhất một bookingCode.');
        }
        // Hiện nghiệp vụ chỉ cần một chiều hoặc khứ hồi
        if (normalizedBookingCodes.length > 2) {
            throw new Error('Mỗi đơn thanh toán hiện chỉ hỗ trợ tối đa hai booking.');
        }
        /*
         * Kiểm tra biến môi trường trước khi ghi database,
         * tránh tạo payment order nhưng không sinh được URL.
         */
        const tmnCode = requireEnv('VNP_TMN_CODE');
        const returnUrl = requireEnv('VNP_RETURN_URL');
        requireEnv('VNP_HASH_SECRET');
        requireEnv('VNP_URL');
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const bookingPlaceholders = normalizedBookingCodes
                .map(() => '?')
                .join(', ');
            /*
             * Khóa các booking để tránh hai request thanh toán
             * đồng thời tạo hai order khác nhau.
             */
            const [bookingRows] = await connection.query(`
            SELECT
              booking_id,
              booking_code,
              user_id,
              total_amount,
              payment_status
            FROM bookings
            WHERE user_id = ?
              AND booking_code IN (${bookingPlaceholders})
            FOR UPDATE
          `, [userId, ...normalizedBookingCodes]);
            if (bookingRows.length !== normalizedBookingCodes.length) {
                throw new Error('Không tìm thấy một hoặc nhiều booking, hoặc bạn không có quyền truy cập.');
            }
            /*
             * Sắp xếp lại kết quả theo đúng thứ tự bookingCodes frontend gửi.
             */
            const bookingMap = new Map(bookingRows.map((booking) => [
                booking.booking_code,
                booking,
            ]));
            const orderedBookings = normalizedBookingCodes.map((code) => {
                const booking = bookingMap.get(code);
                if (!booking) {
                    throw new Error(`Không tìm thấy booking ${code}.`);
                }
                return booking;
            });
            for (const booking of orderedBookings) {
                if (booking.payment_status === 'Paid') {
                    throw new Error(`Booking ${booking.booking_code} đã được thanh toán.`);
                }
                if (booking.payment_status === 'Cancelled') {
                    throw new Error(`Booking ${booking.booking_code} đã bị hủy. Vui lòng đặt vé mới.`);
                }
                if (booking.payment_status === 'Refunded') {
                    throw new Error(`Booking ${booking.booking_code} đã được hoàn tiền.`);
                }
            }
            const totalAmount = orderedBookings.reduce((total, booking) => {
                const amount = Number(booking.total_amount);
                if (!Number.isFinite(amount) || amount <= 0) {
                    throw new Error(`Số tiền của booking ${booking.booking_code} không hợp lệ.`);
                }
                return total + amount;
            }, 0);
            const bookingIds = orderedBookings.map((booking) => booking.booking_id);
            const bookingIdPlaceholders = bookingIds
                .map(() => '?')
                .join(', ');
            /*
             * Kiểm tra các booking đã được gắn với payment order hay chưa.
             *
             * Nếu đã có order Failed/Cancelled/Pending thì tái sử dụng order
             * và tạo một lần thử thanh toán VNPAY mới.
             */
            const [existingOrderRows] = await connection.query(`
            SELECT
              po.payment_order_id,
              po.order_code,
              po.user_id,
              po.total_amount,
              po.payment_status,
              poi.booking_id
            FROM payment_order_items poi
            INNER JOIN payment_orders po
              ON po.payment_order_id = poi.payment_order_id
            WHERE poi.booking_id IN (${bookingIdPlaceholders})
            FOR UPDATE
          `, bookingIds);
            let paymentOrderId;
            let orderCode;
            if (existingOrderRows.length > 0) {
                if (existingOrderRows.length !== orderedBookings.length) {
                    throw new Error('Một trong các booking đã thuộc một đơn thanh toán khác.');
                }
                const orderIds = new Set(existingOrderRows.map((row) => row.payment_order_id));
                if (orderIds.size !== 1) {
                    throw new Error('Các booking đang thuộc những đơn thanh toán khác nhau.');
                }
                const existingOrder = existingOrderRows[0];
                if (existingOrder.user_id !== userId) {
                    throw new Error('Bạn không có quyền truy cập đơn thanh toán này.');
                }
                if (existingOrder.payment_status === 'Paid') {
                    throw new Error('Đơn thanh toán này đã được thanh toán.');
                }
                if (existingOrder.payment_status === 'Refunded') {
                    throw new Error('Đơn thanh toán này đã được hoàn tiền.');
                }
                if (Number(existingOrder.total_amount) !== totalAmount) {
                    throw new Error('Tổng tiền booking không khớp với đơn thanh toán đã tồn tại.');
                }
                paymentOrderId =
                    existingOrder.payment_order_id;
                orderCode = existingOrder.order_code;
                await connection.query(`
            UPDATE payment_orders
            SET payment_status = 'Pending',
                total_amount = ?
            WHERE payment_order_id = ?
          `, [totalAmount, paymentOrderId]);
            }
            else {
                orderCode = generateOrderCode(userId);
                const [orderResult] = await connection.query(`
              INSERT INTO payment_orders (
                order_code,
                user_id,
                total_amount,
                payment_status
              )
              VALUES (?, ?, ?, 'Pending')
            `, [orderCode, userId, totalAmount]);
                paymentOrderId = orderResult.insertId;
                const itemValues = orderedBookings
                    .map(() => '(?, ?, ?)')
                    .join(', ');
                const itemParams = orderedBookings.flatMap((booking) => [
                    paymentOrderId,
                    booking.booking_id,
                    Number(booking.total_amount),
                ]);
                await connection.query(`
            INSERT INTO payment_order_items (
              payment_order_id,
              booking_id,
              amount
            )
            VALUES ${itemValues}
          `, itemParams);
            }
            /*
             * Khi retry, hủy các URL Pending cũ của cùng order.
             * Mỗi lần retry sẽ có txnRef mới.
             */
            await connection.query(`
          UPDATE payments
          SET payment_status = 'Cancelled'
          WHERE payment_order_id = ?
            AND payment_status = 'Pending'
        `, [paymentOrderId]);
            const txnRef = `PO${paymentOrderId}${Date.now()}`;
            await connection.query(`
          INSERT INTO payments (
            payment_order_id,
            booking_id,
            provider,
            txn_ref,
            amount,
            payment_status
          )
          VALUES (?, NULL, 'VNPAY', ?, ?, 'Pending')
        `, [paymentOrderId, txnRef, totalAmount]);
            const createDate = new Date();
            const expireDate = new Date(createDate.getTime() + 15 * 60 * 1000);
            const vnpParams = {
                vnp_Version: '2.1.0',
                vnp_Command: 'pay',
                vnp_TmnCode: tmnCode,
                // VNPAY nhận số tiền nhân 100
                vnp_Amount: Math.round(totalAmount * 100),
                vnp_CurrCode: 'VND',
                vnp_TxnRef: txnRef,
                vnp_OrderInfo: normalizedBookingCodes.length === 2
                    ? `Thanh toan ve khu hoi ${orderCode}`
                    : `Thanh toan booking ${normalizedBookingCodes[0]}`,
                vnp_OrderType: 'other',
                vnp_Locale: 'vn',
                vnp_ReturnUrl: returnUrl,
                vnp_IpAddr: normalizeIpAddress(ipAddress),
                vnp_CreateDate: formatVNPayDate(createDate),
                vnp_ExpireDate: formatVNPayDate(expireDate),
                vnp_BankCode: bankCode || undefined,
            };
            const paymentUrl = buildVNPayPaymentUrl(vnpParams);
            await connection.commit();
            return {
                orderCode,
                bookingCodes: normalizedBookingCodes,
                totalAmount,
                txnRef,
                paymentUrl,
            };
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    /**
     * Xử lý IPN VNPAY.
     *
     * Hỗ trợ:
     * - payment mới liên kết với payment_order;
     * - payment cũ liên kết trực tiếp với booking.
     */
    async handleVNPayIpn(rawQuery) {
        if (!verifyVNPaySecureHash(rawQuery)) {
            return {
                RspCode: '97',
                Message: 'Invalid signature',
            };
        }
        const txnRef = String(rawQuery.vnp_TxnRef ?? '');
        const responseCode = String(rawQuery.vnp_ResponseCode ?? '');
        const transactionStatus = String(rawQuery.vnp_TransactionStatus ?? '');
        const transactionNo = String(rawQuery.vnp_TransactionNo ?? '');
        const bankCode = String(rawQuery.vnp_BankCode ?? '');
        const payDate = String(rawQuery.vnp_PayDate ?? '');
        const receivedAmount = Number(rawQuery.vnp_Amount);
        if (!txnRef) {
            return {
                RspCode: '01',
                Message: 'Order not found',
            };
        }
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [paymentRows] = await connection.query(`
            SELECT
              p.payment_id,
              p.payment_order_id,
              p.booking_id,
              p.txn_ref,
              p.amount,
              p.payment_status,

              po.payment_status
                AS order_payment_status,

              b.payment_status
                AS booking_payment_status

            FROM payments p

            LEFT JOIN payment_orders po
              ON po.payment_order_id =
                 p.payment_order_id

            LEFT JOIN bookings b
              ON b.booking_id = p.booking_id

            WHERE p.txn_ref = ?
            LIMIT 1
            FOR UPDATE
          `, [txnRef]);
            if (paymentRows.length === 0) {
                await connection.rollback();
                return {
                    RspCode: '01',
                    Message: 'Order not found',
                };
            }
            const payment = paymentRows[0];
            const expectedAmount = Math.round(Number(payment.amount) * 100);
            if (receivedAmount !== expectedAmount) {
                await connection.rollback();
                return {
                    RspCode: '04',
                    Message: 'Invalid amount',
                };
            }
            /*
             * Chặn xử lý lặp:
             * - Paid: giao dịch đã thành công;
             * - Failed/Cancelled: kết quả thất bại đã được ghi nhận;
             * - Refunded: đơn đã được hoàn tiền;
             * - booking Cancelled: chỗ đã được giải phóng.
             */
            const alreadyConfirmed = ['Paid', 'Failed', 'Cancelled'].includes(String(payment.payment_status ?? '')) ||
                ['Paid', 'Failed', 'Cancelled', 'Refunded'].includes(String(payment.order_payment_status ?? '')) ||
                ['Paid', 'Cancelled', 'Refunded'].includes(String(payment.booking_payment_status ?? ''));
            if (alreadyConfirmed) {
                await connection.rollback();
                return {
                    RspCode: '02',
                    Message: 'Order already confirmed',
                };
            }
            const isSuccessful = responseCode === '00' &&
                transactionStatus === '00';
            if (!isSuccessful) {
                /*
                 * Ghi nhận kết quả thất bại/hủy từ VNPAY.
                 */
                await connection.query(`
            UPDATE payments
            SET transaction_no = ?,
                bank_code = ?,
                response_code = ?,
                transaction_status = ?,
                payment_status = 'Failed'
            WHERE payment_id = ?
          `, [
                    transactionNo || null,
                    bankCode || null,
                    responseCode || null,
                    transactionStatus || null,
                    payment.payment_id,
                ]);
                if (payment.payment_order_id !== null) {
                    const paymentOrderId = payment.payment_order_id;
                    /*
                     * Khóa tất cả booking thuộc payment order để tránh
                     * callback đồng thời cập nhật cùng một đơn.
                     */
                    const [orderBookingRows] = await connection.query(`
                SELECT
                  b.booking_id,
                  b.booking_code,
                  b.total_amount,
                  b.payment_status
                FROM payment_order_items poi
                INNER JOIN bookings b
                  ON b.booking_id = poi.booking_id
                WHERE poi.payment_order_id = ?
                FOR UPDATE
              `, [paymentOrderId]);
                    if (orderBookingRows.length === 0) {
                        await connection.rollback();
                        return {
                            RspCode: '01',
                            Message: 'Order not found',
                        };
                    }
                    /*
                     * Booking đã khóa ghế trước khi thanh toán VNPAY;
                     * khi giao dịch thất bại, phải trả các ghế này về Available.
                     */
                    await connection.query(`
              UPDATE seats s
              INNER JOIN tickets t
                ON t.seat_id = s.seat_id
              INNER JOIN payment_order_items poi
                ON poi.booking_id = t.booking_id
              INNER JOIN bookings b
                ON b.booking_id = t.booking_id
              SET s.status = 'Available'
              WHERE poi.payment_order_id = ?
                AND b.payment_status = 'Pending'
                AND s.status = 'Booked'
            `, [paymentOrderId]);
                    await connection.query(`
              UPDATE bookings b
              INNER JOIN payment_order_items poi
                ON poi.booking_id = b.booking_id
              SET b.payment_status = 'Cancelled'
              WHERE poi.payment_order_id = ?
                AND b.payment_status = 'Pending'
            `, [paymentOrderId]);
                    await connection.query(`
              UPDATE payment_orders
              SET payment_status = 'Failed'
              WHERE payment_order_id = ?
                AND payment_status <> 'Paid'
                AND payment_status <> 'Refunded'
            `, [paymentOrderId]);
                }
                else if (payment.booking_id !== null) {
                    /*
                     * Hỗ trợ luồng payment cũ liên kết trực tiếp với booking.
                     */
                    const bookingId = payment.booking_id;
                    const [bookingRows] = await connection.query(`
                SELECT
                  booking_id,
                  booking_code,
                  user_id,
                  total_amount,
                  payment_status
                FROM bookings
                WHERE booking_id = ?
                LIMIT 1
                FOR UPDATE
              `, [bookingId]);
                    if (bookingRows.length === 0) {
                        await connection.rollback();
                        return {
                            RspCode: '01',
                            Message: 'Order not found',
                        };
                    }
                    if (bookingRows[0].payment_status === 'Pending') {
                        await connection.query(`
                UPDATE seats s
                INNER JOIN tickets t
                  ON t.seat_id = s.seat_id
                SET s.status = 'Available'
                WHERE t.booking_id = ?
                  AND s.status = 'Booked'
              `, [bookingId]);
                        await connection.query(`
                UPDATE bookings
                SET payment_status = 'Cancelled'
                WHERE booking_id = ?
                  AND payment_status = 'Pending'
              `, [bookingId]);
                    }
                }
                else {
                    throw new Error('Payment không liên kết với booking hoặc payment order.');
                }
                await connection.commit();
                return {
                    RspCode: '00',
                    Message: 'Confirm Success',
                };
            }
            /*
             * Khóa toàn bộ booking trong payment order trước khi Paid.
             */
            let orderBookings = [];
            if (payment.payment_order_id !== null) {
                const [rows] = await connection.query(`
              SELECT
                b.booking_id,
                b.booking_code,
                b.total_amount,
                b.payment_status
              FROM payment_order_items poi
              INNER JOIN bookings b
                ON b.booking_id = poi.booking_id
              WHERE poi.payment_order_id = ?
              FOR UPDATE
            `, [payment.payment_order_id]);
                orderBookings = rows;
                if (orderBookings.length === 0) {
                    await connection.rollback();
                    return {
                        RspCode: '01',
                        Message: 'Order not found',
                    };
                }
                const hasNonPendingBooking = orderBookings.some((booking) => booking.payment_status !== 'Pending');
                if (hasNonPendingBooking) {
                    await connection.rollback();
                    return {
                        RspCode: '02',
                        Message: 'Order cannot be confirmed',
                    };
                }
            }
            await connection.query(`
          UPDATE payments
          SET transaction_no = ?,
              bank_code = ?,
              response_code = ?,
              transaction_status = ?,
              payment_status = 'Paid',
              payment_time =
                CASE
                  WHEN ? REGEXP '^[0-9]{14}$'
                  THEN STR_TO_DATE(
                    ?,
                    '%Y%m%d%H%i%s'
                  )
                  ELSE NOW()
                END
          WHERE payment_id = ?
        `, [
                transactionNo || null,
                bankCode || null,
                responseCode,
                transactionStatus,
                payDate,
                payDate,
                payment.payment_id,
            ]);
            if (payment.payment_order_id !== null) {
                /*
                 * Luồng mới: cập nhật payment order và tất cả booking.
                 */
                await connection.query(`
            UPDATE payment_orders
            SET payment_status = 'Paid'
            WHERE payment_order_id = ?
          `, [payment.payment_order_id]);
                await connection.query(`
            UPDATE bookings b
            INNER JOIN payment_order_items poi
              ON poi.booking_id = b.booking_id
            SET b.payment_status = 'Paid'
            WHERE poi.payment_order_id = ?
              AND b.payment_status = 'Pending'
          `, [payment.payment_order_id]);
                for (const booking of orderBookings) {
                    await recordSystemFinancialTransaction(connection, {
                        accountCode: 'SYSTEM_WALLET',
                        transactionType: 'PAYMENT',
                        amount: Number(booking.total_amount),
                        referenceCode: booking.booking_code,
                        description: `Thanh toán booking ${booking.booking_code} qua VNPay`,
                    });
                }
                /*
                 * BƯỚC SAU:
                 * Chỉ tạo ticket và QR cho từng booking ở đây,
                 * sau khi đã thanh toán thành công.
                 */
            }
            else if (payment.booking_id !== null) {
                /*
                 * Luồng cũ: payment liên kết trực tiếp với một booking.
                 */
                await connection.query(`
            UPDATE bookings
            SET payment_status = 'Paid'
            WHERE booking_id = ?
              AND payment_status = 'Pending'
          `, [payment.booking_id]);
                const [bookingRows] = await connection.query('SELECT booking_code, total_amount FROM bookings WHERE booking_id = ?', [payment.booking_id]);
                if (bookingRows.length === 0) {
                    throw new Error('Không tìm thấy booking của giao dịch thanh toán.');
                }
                await recordSystemFinancialTransaction(connection, {
                    accountCode: 'SYSTEM_WALLET',
                    transactionType: 'PAYMENT',
                    amount: Number(bookingRows[0].total_amount),
                    referenceCode: bookingRows[0].booking_code,
                    description: `Thanh toán booking ${bookingRows[0].booking_code} qua VNPay`,
                });
            }
            else {
                throw new Error('Payment không liên kết với booking hoặc payment order.');
            }
            await connection.commit();
            return {
                RspCode: '00',
                Message: 'Confirm Success',
            };
        }
        catch (error) {
            await connection.rollback();
            console.error('VNPay IPN processing error:', error);
            return {
                RspCode: '99',
                Message: 'Unknown error',
            };
        }
        finally {
            connection.release();
        }
    }
    /**
     * Kiểm tra trạng thái payment từ một bookingCode.
     *
     * Hỗ trợ cả payment trực tiếp và payment order.
     */
    async getPaymentStatus(userId, bookingCode) {
        const [rows] = await pool.query(`
          SELECT
            b.booking_code,
            b.payment_status
              AS booking_payment_status,

            po.order_code,
            po.payment_status
              AS order_payment_status,

            p.txn_ref,
            p.transaction_no,
            p.amount,
            p.bank_code,
            p.response_code,
            p.transaction_status,
            p.payment_status,
            p.payment_time,
            p.created_at

          FROM bookings b

          LEFT JOIN payment_order_items poi
            ON poi.booking_id = b.booking_id

          LEFT JOIN payment_orders po
            ON po.payment_order_id =
               poi.payment_order_id

          LEFT JOIN payments p
            ON p.payment_id = (
              SELECT p2.payment_id
              FROM payments p2
              WHERE
                (
                  po.payment_order_id IS NOT NULL
                  AND p2.payment_order_id =
                      po.payment_order_id
                )
                OR
                (
                  po.payment_order_id IS NULL
                  AND p2.booking_id =
                      b.booking_id
                )
              ORDER BY
                p2.created_at DESC,
                p2.payment_id DESC
              LIMIT 1
            )

          WHERE b.booking_code = ?
            AND b.user_id = ?

          LIMIT 1
        `, [bookingCode, userId]);
        if (rows.length === 0) {
            throw new Error('Không tìm thấy booking.');
        }
        return rows[0];
    }
}
export default new PaymentService();
