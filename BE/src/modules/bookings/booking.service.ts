import redisClient from '../../config/redis.js';
import pool from '../../config/database.js';
import { generateQRCode } from '../../utils/qrcode.util.js';
import { CustomError } from '../../utils/customError.js';
import { recordSystemFinancialTransaction } from '../../utils/system-financial.util.js';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';

const LOCK_EXPIRE_MS = 10 * 60 * 1000; // Khóa ghế trong 10 phút

// Định nghĩa kiểu dữ liệu chặt chẽ cho payload và thông tin hành khách
interface PassengerInfo {
    name: string;
    price: number;
    seatId?: number;
    phone?: string;
    email?: string;
    gender?: string;
    dob?: string;
    type?: 'Adult' | 'Child' | 'Infant';
}

interface BookingPayload {
    tripId: number;
    vehicleType: 'Bus';
    seatIds?: number[];
    contactInfo: { fullName: string; email: string; phone: string; };
    passengers: PassengerInfo[];
    totalAmount: number;

    /**
     * Wallet:
     * - trừ tiền trực tiếp từ users.wallet_balance;
     * - booking được tạo ở trạng thái Paid.
     *
     * VNPAY:
     * - không đụng vào ví;
     * - booking được tạo ở trạng thái Pending
     *   để PaymentService xác nhận sau.
     *
     * Không truyền => mặc định Wallet để giữ tương thích
     * với luồng thanh toán ví hiện tại.
     */
    paymentMethod?: 'Wallet' | 'VNPAY';
}

interface SeatDbRow extends RowDataPacket {
  seat_id: number;
  seat_code: string;
}

// Add new interfaces for booking details needed for cancellation
interface BookingDetailsForCancellation extends RowDataPacket {
  booking_id: number;
  user_id: number;
  total_amount: number;
  payment_status: 'Pending' | 'Paid' | 'Refunded' | 'Cancelled';
  departure_time: Date;
  booking_code: string;
  partner_id: number | null;
}

export class BookingService {
  async holdSingleSeat(tripId: number | string, seatId: number, userId: number): Promise<boolean> {
    const lockKey = `lock:trip:${tripId}:seat:${seatId}`;
    const result = await redisClient.set(lockKey, userId.toString(), 'PX', LOCK_EXPIRE_MS, 'NX');
    if (result !== 'OK') {
      throw new Error(`Ghế ID ${seatId} vừa có người khác chọn.`);
    }
    return true;
  }

  async releaseSingleSeat(tripId: number | string, seatId: number, userId: number): Promise<boolean> {
    const lockKey = `lock:trip:${tripId}:seat:${seatId}`;
    // Đảm bảo chỉ người dùng đã khóa ghế mới có thể mở khóa
    const lockedBy = await redisClient.get(lockKey);
    if (lockedBy === userId.toString()) {
      await redisClient.del(lockKey);
      return true;
    }
    return false;
  }

  /**
   * Hàm hỗ trợ: Mở khóa Redis
   */
  async unlockSeats(tripId: number | string, seatIds: number[], userId: number): Promise<void> {
    for (const seatId of seatIds) {
      const lockKey = `lock:trip:${tripId}:seat:${seatId}`;
      const lockedBy = await redisClient.get(lockKey);
      if (lockedBy === userId.toString()) {
        await redisClient.del(lockKey);
      }
    }
  }


  /**
   * Khóa dòng user và trừ tiền ví trong cùng transaction.
   * Nếu bất kỳ bước đặt vé nào phía sau thất bại, transaction rollback
   * sẽ hoàn tác luôn việc trừ tiền.
   */
  private async debitWallet(
    connection: PoolConnection,
    userId: number,
    amount: number,
  ): Promise<{ balanceBefore: number; balanceAfter: number }> {
    const normalizedAmount = Number(amount);

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new CustomError('Số tiền thanh toán không hợp lệ.', 400);
    }

    const [userRows]: any = await connection.query(
      `SELECT user_id, wallet_balance
       FROM users
       WHERE user_id = ?
       FOR UPDATE`,
      [userId],
    );

    if (userRows.length === 0) {
      throw new CustomError('Không tìm thấy tài khoản người dùng.', 404);
    }

    const balanceBefore = Number(userRows[0].wallet_balance || 0);

    if (balanceBefore < normalizedAmount) {
      throw new CustomError(
        `Số dư ví không đủ. Số dư hiện tại: ${balanceBefore.toLocaleString('vi-VN')}₫.`,
        400,
      );
    }

    const balanceAfter = balanceBefore - normalizedAmount;

    const [updateResult]: any = await connection.query(
      `UPDATE users
       SET wallet_balance = ?
       WHERE user_id = ?`,
      [balanceAfter, userId],
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error('Không thể cập nhật số dư ví.');
    }

    return {
      balanceBefore,
      balanceAfter,
    };
  }

  /**
   * Ghi lịch sử biến động số dư ví trong CÙNG transaction với booking.
   * Nếu transaction rollback thì wallet_transactions cũng rollback.
   *
   * Quy ước:
   * - PAYMENT: amount âm
   * - REFUND: amount dương
   * - ADJUSTMENT: có thể âm hoặc dương
   */
  private async recordWalletTransaction(
    connection: PoolConnection,
    params: {
      userId: number;
      bookingId?: number | null;
      relatedBookingId?: number | null;
      transactionType: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      referenceCode?: string | null;
      description?: string | null;
    },
  ): Promise<number> {
    const {
      userId,
      bookingId = null,
      relatedBookingId = null,
      transactionType,
      amount,
      balanceBefore,
      balanceAfter,
      referenceCode = null,
      description = null,
    } = params;

    const normalizedAmount = Number(amount);
    const normalizedBalanceBefore = Number(balanceBefore);
    const normalizedBalanceAfter = Number(balanceAfter);

    if (
      !Number.isFinite(normalizedAmount) ||
      !Number.isFinite(normalizedBalanceBefore) ||
      !Number.isFinite(normalizedBalanceAfter)
    ) {
      throw new Error('Dữ liệu giao dịch ví không hợp lệ.');
    }

    const [result]: any = await connection.query(
      `INSERT INTO wallet_transactions (
          user_id,
          booking_id,
          related_booking_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          reference_code,
          description
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        bookingId,
        relatedBookingId,
        transactionType,
        normalizedAmount,
        normalizedBalanceBefore,
        normalizedBalanceAfter,
        referenceCode,
        description,
      ],
    );

    if (result.affectedRows !== 1) {
      throw new Error('Không thể ghi lịch sử giao dịch ví.');
    }

    return result.insertId;
  }

  /**
   * Cộng tiền hoàn vào ví + ghi wallet_transactions trong CÙNG transaction.
   * Có kiểm tra ledger REFUND trước khi cộng để chống hoàn tiền hai lần.
   */
  private async creditWalletRefund(
    connection: PoolConnection,
    params: {
      userId: number;
      bookingId: number;
      refundAmount: number;
      bookingCode: string;
      description?: string;
    },
  ): Promise<{ balanceBefore: number; balanceAfter: number }> {
    const {
      userId,
      bookingId,
      refundAmount,
      bookingCode,
      description,
    } = params;

    const normalizedRefundAmount = Number(refundAmount);

    if (
      !Number.isFinite(normalizedRefundAmount) ||
      normalizedRefundAmount <= 0
    ) {
      throw new CustomError('Số tiền hoàn không hợp lệ.', 400);
    }

    // Defense-in-depth: booking chỉ được có 1 REFUND ledger.
    const [existingRefundTransactions]: any = await connection.query(
      `SELECT wallet_transaction_id
       FROM wallet_transactions
       WHERE booking_id = ?
         AND transaction_type = 'REFUND'
       LIMIT 1
       FOR UPDATE`,
      [bookingId],
    );

    if (existingRefundTransactions.length > 0) {
      throw new CustomError(
        `Booking ${bookingCode} đã được hoàn tiền trước đó.`,
        409,
      );
    }

    // Khóa dòng user để cập nhật số dư an toàn khi có request đồng thời.
    const [userRows]: any = await connection.query(
      `SELECT user_id, wallet_balance
       FROM users
       WHERE user_id = ?
       FOR UPDATE`,
      [userId],
    );

    if (userRows.length === 0) {
      throw new CustomError('Không tìm thấy tài khoản người dùng.', 404);
    }

    const balanceBefore = Number(userRows[0].wallet_balance || 0);
    const balanceAfter = balanceBefore + normalizedRefundAmount;

    const [updateResult]: any = await connection.query(
      `UPDATE users
       SET wallet_balance = ?
       WHERE user_id = ?`,
      [balanceAfter, userId],
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error('Không thể cập nhật số dư ví khi hoàn tiền.');
    }

    await this.recordWalletTransaction(
      connection,
      {
        userId,
        bookingId,
        transactionType: 'REFUND',
        amount: normalizedRefundAmount,
        balanceBefore,
        balanceAfter,
        referenceCode: bookingCode,
        description:
          description ||
          `Hoàn tiền booking ${bookingCode} vào Ví ViệtGo`,
      },
    );

    return {
      balanceBefore,
      balanceAfter,
    };
  }

  /**
   * Nhả Redis lock cho một payload xe khách.
   * Dùng sau commit hoặc rollback để không để ghế bị giữ đến hết TTL.
   */
  private async unlockPayloadSeats(
    payload: BookingPayload,
    userId: number,
  ): Promise<void> {
    if (
      payload.vehicleType === 'Bus' &&
      Array.isArray(payload.seatIds) &&
      payload.seatIds.length > 0
    ) {
      await this.unlockSeats(
        payload.tripId,
        payload.seatIds,
        userId,
      );
    }
  }

  /**
   * Hoàn trả tài nguyên ghế/slot của một booking.
   * Hàm này chỉ thay đổi inventory, không cộng tiền ví.
   */
  private async releaseBookingInventory(
    connection: PoolConnection,
    bookingId: number,
  ): Promise<void> {
    const [tickets]: any = await connection.query(
      `SELECT seat_id
       FROM tickets
       WHERE booking_id = ?`,
      [bookingId],
    );

    const seatIdsToRelease = tickets
      .map((ticket: any) => ticket.seat_id)
      .filter(Boolean);

    if (seatIdsToRelease.length > 0) {
      await connection.query(
        `UPDATE seats
         SET status = 'Available'
         WHERE seat_id IN (?)
           AND status = 'Booked'`,
        [seatIdsToRelease],
      );
    }
  }

  /**
   * BƯỚC 2: XÁC NHẬN THANH TOÁN VÀ GHI XUỐNG DATABASE (TRANSACTION)
   */
  private async _executeBookingLeg(
    connection: PoolConnection,
    userId: number,
    payload: BookingPayload,
  ): Promise<{
    bookingId: number;
    bookingCode: string;
    firstTicketQr: string | null;
  }> {
    const { tripId, seatIds, contactInfo, passengers, totalAmount } = payload;

    const paymentMethod = payload.paymentMethod ?? 'Wallet';
    const bookingPaymentStatus = paymentMethod === 'VNPAY' ? 'Pending' : 'Paid';

    if (
      !Number.isInteger(tripId) ||
      !seatIds ||
      seatIds.length === 0 ||
      seatIds.length !== passengers.length ||
      new Set(seatIds).size !== seatIds.length
    ) {
      throw new Error('Yêu cầu đặt vé không hợp lệ: Vui lòng chọn một ghế cho mỗi hành khách.');
    }

    for (const seatId of seatIds) {
      const lockKey = `lock:trip:${tripId}:seat:${seatId}`;
      const lockedBy = await redisClient.get(lockKey);
      if (lockedBy !== userId.toString()) {
        throw new Error(
          `Ghế ID ${seatId} không được bạn giữ hoặc đã hết hạn giữ chỗ. Vui lòng chọn lại.`,
        );
      }
    }

    const [tripRows]: any = await connection.query(
      `SELECT trip_id
       FROM trips
       WHERE trip_id = ?
         AND departure_time > NOW()
         AND status = 'Scheduled'
       FOR UPDATE`,
      [tripId],
    );

    if (tripRows.length === 0) {
      throw new Error('Chuyến xe đã khởi hành hoặc không tồn tại.');
    }

      const bookingCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // 2. Insert vào bảng `bookings`.
      // Wallet => Paid ngay sau khi đã khóa/trừ ví trong transaction.
      // VNPAY  => Pending, PaymentService sẽ cập nhật Paid sau khi xác nhận giao dịch.
      const [bookingResult]: any = await connection.query(
        `INSERT INTO bookings (
            user_id,
            contact_full_name,
            contact_email,
            contact_phone,
            booking_code,
            total_amount,
            payment_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          contactInfo.fullName,
          contactInfo.email,
          contactInfo.phone,
          bookingCode,
          totalAmount,
          bookingPaymentStatus,
        ],
      );
      // Thêm kiểm tra để đảm bảo booking được tạo
      if (bookingResult.affectedRows !== 1) {
        throw new Error('Không thể tạo đơn hàng chính.');
      }
      const bookingId = bookingResult.insertId;

      const [updateResult]: any = await connection.query(
        `UPDATE seats
         SET status = 'Booked'
         WHERE trip_id = ?
           AND seat_id IN (?)
           AND status = 'Available'`,
        [tripId, seatIds],
      );

      if (updateResult.affectedRows !== seatIds.length) {
        throw new Error('Một hoặc nhiều ghế đã có người mua trong lúc bạn thao tác. Vui lòng thử lại.');
      }

      const passengerToSeatId = new Map(
        passengers.map((passenger, index) => [passenger, seatIds[index]]),
      );

      let firstTicketQr: string | null = null;

      // 4. Tạo chi tiết Vé (Tickets) & Mã QR cho từng Hành khách
      for (let i = 0; i < passengers.length; i++) {
        const passenger = passengers[i];
        
        const assignedSeatId = passengerToSeatId.get(passenger);

        const qrData = `PNR:${bookingCode}|TICKET:${i+1}|NAME:${passenger.name}`;
        const qrCodeBase64 = await generateQRCode(qrData);

        if (i === 0) {
          firstTicketQr = qrCodeBase64;
        }

        const [ticketResult]: any = await connection.query(
          `INSERT INTO tickets (
             booking_id, seat_id, passenger_name,
             passenger_email, passenger_phone, ticket_price, qr_code_data
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            bookingId,
            assignedSeatId,
            passenger.name,
            passenger.email || null,
            passenger.phone || null,
            passenger.price,
            qrCodeBase64,
          ]
        );
        // Thêm kiểm tra để đảm bảo vé được tạo
        if (ticketResult.affectedRows !== 1) {
            throw new Error(`Không thể tạo vé cho hành khách ${passenger.name}.`);
        }
      }

      // Redis lock được nhả ở lớp transaction bên ngoài sau commit/rollback.
      return {
        bookingId,
        bookingCode,
        firstTicketQr,
      };
  }

  /**
   * Xác nhận cho vé một chiều (Single Trip).
   *
   * Wallet:
   * - khóa user FOR UPDATE;
   * - kiểm tra số dư;
   * - trừ tiền;
   * - tạo booking Paid + ticket/QR;
   * - commit nguyên tử.
   *
   * VNPAY:
   * - không trừ ví;
   * - tạo booking Pending để PaymentService xử lý tiếp.
   */
  async confirmSingleBooking(userId: number, payload: BookingPayload): Promise<any> {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    const paymentMethod = payload.paymentMethod ?? 'Wallet';

    try {
      let walletInfo: { balanceBefore: number; balanceAfter: number } | null = null;

      if (paymentMethod === 'Wallet') {
        walletInfo = await this.debitWallet(
          connection,
          userId,
          payload.totalAmount,
        );
      }

      const result = await this._executeBookingLeg(
        connection,
        userId,
        {
          ...payload,
          paymentMethod,
        },
      );

      if (paymentMethod === 'Wallet' && walletInfo) {
        await this.recordWalletTransaction(
          connection,
          {
            userId,
            bookingId: result.bookingId,
            transactionType: 'PAYMENT',
            amount: -Number(payload.totalAmount),
            balanceBefore: walletInfo.balanceBefore,
            balanceAfter: walletInfo.balanceAfter,
            referenceCode: result.bookingCode,
            description:
              `Thanh toán vé ${result.bookingCode} bằng Ví ViệtGo`,
          },
        );
        await recordSystemFinancialTransaction(connection, {
          accountCode: 'SYSTEM_WALLET',
          transactionType: 'PAYMENT',
          amount: Number(payload.totalAmount),
          referenceCode: result.bookingCode,
          description: `Thanh toán booking ${result.bookingCode}`,
        });
      }

      await connection.commit();

      // Nhả Redis lock sau khi dữ liệu DB đã commit thành công.
      await this.unlockPayloadSeats(payload, userId);

      return {
        success: true,
        message:
          paymentMethod === 'Wallet'
            ? 'Đặt vé và thanh toán bằng ví thành công!'
            : 'Tạo booking chờ thanh toán VNPAY thành công!',
        ...result,
        paymentMethod,
        paymentStatus: paymentMethod === 'Wallet' ? 'Paid' : 'Pending',
        walletBalance: walletInfo?.balanceAfter,
      };
    } catch (error: any) {
      await connection.rollback();

      // Không để ghế xe khách bị giữ đến hết TTL khi transaction thất bại.
      try {
        await this.unlockPayloadSeats(payload, userId);
      } catch (unlockError) {
        console.error('Không thể nhả Redis lock sau rollback:', unlockError);
      }

      console.error('Lỗi khi xác nhận vé một chiều:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Xác nhận cho vé khứ hồi trong MỘT transaction nguyên tử.
   * Hai chiều phải dùng cùng một phương thức thanh toán.
   */
  async confirmRoundtripBooking(
    userId: number,
    payloads: [BookingPayload, BookingPayload],
  ): Promise<any> {
    if (!payloads || payloads.length !== 2) {
      throw new CustomError('Yêu cầu đặt vé khứ hồi không hợp lệ.', 400);
    }

    const departurePayload = payloads[0];
    const returnPayload = payloads[1];

    const departurePaymentMethod = departurePayload.paymentMethod ?? 'Wallet';
    const returnPaymentMethod = returnPayload.paymentMethod ?? 'Wallet';

    if (departurePaymentMethod !== returnPaymentMethod) {
      throw new CustomError(
        'Hai chiều của vé khứ hồi phải dùng cùng một phương thức thanh toán.',
        400,
      );
    }

    const paymentMethod = departurePaymentMethod;
    const totalRoundtripAmount =
      Number(departurePayload.totalAmount) + Number(returnPayload.totalAmount);

    if (!Number.isFinite(totalRoundtripAmount) || totalRoundtripAmount <= 0) {
      throw new CustomError('Tổng tiền vé khứ hồi không hợp lệ.', 400);
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      let walletInfo: { balanceBefore: number; balanceAfter: number } | null = null;

      // Wallet: khóa và trừ tổng tiền đúng một lần.
      if (paymentMethod === 'Wallet') {
        walletInfo = await this.debitWallet(
          connection,
          userId,
          totalRoundtripAmount,
        );
      }

      const departResult = await this._executeBookingLeg(
        connection,
        userId,
        {
          ...departurePayload,
          paymentMethod,
        },
      );

      const returnResult = await this._executeBookingLeg(
        connection,
        userId,
        {
          ...returnPayload,
          paymentMethod,
        },
      );

      if (paymentMethod === 'Wallet' && walletInfo) {
        await this.recordWalletTransaction(
          connection,
          {
            userId,
            bookingId: departResult.bookingId,
            relatedBookingId: returnResult.bookingId,
            transactionType: 'PAYMENT',
            amount: -totalRoundtripAmount,
            balanceBefore: walletInfo.balanceBefore,
            balanceAfter: walletInfo.balanceAfter,
            referenceCode:
              `${departResult.bookingCode},${returnResult.bookingCode}`,
            description:
              `Thanh toán vé khứ hồi ${departResult.bookingCode} / ${returnResult.bookingCode} bằng Ví ViệtGo`,
          },
        );
        for (const [booking, amount] of [
          [departResult, departurePayload.totalAmount],
          [returnResult, returnPayload.totalAmount],
        ] as const) {
          await recordSystemFinancialTransaction(connection, {
            accountCode: 'SYSTEM_WALLET',
            transactionType: 'PAYMENT',
            amount: Number(amount),
            referenceCode: booking.bookingCode,
            description: `Thanh toán booking ${booking.bookingCode}`,
          });
        }
      }

      // Chỉ commit khi CẢ HAI chiều đều thành công.
      await connection.commit();

      await Promise.all([
        this.unlockPayloadSeats(departurePayload, userId),
        this.unlockPayloadSeats(returnPayload, userId),
      ]);

      return {
        success: true,
        message:
          paymentMethod === 'Wallet'
            ? 'Đặt vé khứ hồi và thanh toán bằng ví thành công!'
            : 'Tạo hai booking khứ hồi chờ thanh toán VNPAY thành công!',
        bookingCode: `${departResult.bookingCode}, ${returnResult.bookingCode}`,
        bookingCodes: [
          departResult.bookingCode,
          returnResult.bookingCode,
        ],
        firstTicketQr: departResult.firstTicketQr,
        totalPrice: totalRoundtripAmount,
        paymentMethod,
        paymentStatus: paymentMethod === 'Wallet' ? 'Paid' : 'Pending',
        walletBalance: walletInfo?.balanceAfter,
      };
    } catch (error: any) {
      await connection.rollback();

      // Rollback DB + nhả Redis lock cả hai chiều.
      await Promise.allSettled([
        this.unlockPayloadSeats(departurePayload, userId),
        this.unlockPayloadSeats(returnPayload, userId),
      ]);

      console.error(
        'Lỗi khi xác nhận vé khứ hồi (đã rollback toàn bộ):',
        error,
      );

      throw error;
    } finally {
      connection.release();
    }
  }
  
  /**
   * BƯỚC 3: LẤY LỊCH SỬ ĐẶT VÉ CỦA NGƯỜI DÙNG
   */
  async getBookingHistory(userId: number): Promise<any[]> {
    const connection = await pool.getConnection();
    try {
      // Lấy tất cả các booking của user
      const [bookings]: any = await connection.query(
        `SELECT
            b.booking_id,
            b.booking_code,
            b.total_amount,
            b.payment_status,
            b.created_at,
            b.refund_status,
            CASE
                WHEN b.refund_status = 'Approved' THEN 'Cancelled' -- Đã hủy và hoàn tiền thành công
                WHEN b.refund_status = 'Rejected' THEN 'CancellationRejected' -- Bị từ chối, cũng coi như đã hủy/thất bại
                WHEN b.payment_status IN ('Refunded', 'Cancelled') THEN 'Cancelled'
                WHEN b.refund_status = 'Pending' THEN 'CancellationPending' -- Chờ nhà xe xử lý
                WHEN b.refund_status = 'WaitRefund' THEN 'RefundPending' -- Chờ admin hoàn tiền
                WHEN b.payment_status = 'Pending' THEN 'PaymentPending'
                ELSE 'Active'
            END as display_status
         FROM (
            SELECT 
                b.booking_id, 
                b.booking_code, 
                b.total_amount, 
                b.payment_status, 
                b.created_at,
                COALESCE((SELECT status FROM refund_requests rr WHERE rr.booking_id = b.booking_id ORDER BY rr.created_at DESC LIMIT 1), 'No Request') as refund_status
            FROM bookings b
            WHERE b.user_id = ?
         ) b
         ORDER BY b.created_at DESC`,
        [userId]
      );

      if (bookings.length === 0) {
        return [];
      }

      const bookingIds = bookings.map((b: any) => b.booking_id);

      // Lấy tất cả các ticket liên quan đến các booking trên
      const [tickets]: any = await connection.query(
        `SELECT t.ticket_id, t.booking_id, t.passenger_name, t.ticket_price,
                tr.departure_time, tr.arrival_time,
                r.departure_location, r.arrival_location,
                v.vehicle_name, v.vehicle_type,
                f.feedback_id, f.rating_seats, f.rating_service, f.comment,
                f.partner_reply, f.partner_replied_at
         FROM tickets t
         JOIN seats s ON t.seat_id = s.seat_id
         JOIN trips tr ON tr.trip_id = s.trip_id
         JOIN routes r ON tr.route_id = r.route_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         LEFT JOIN feedbacks f ON f.ticket_id = t.ticket_id
         WHERE t.booking_id IN (?)`,
        [bookingIds]
      );

      // Gộp tickets vào đúng booking của nó
      return bookings.map((booking: any) => ({
        ...booking,
        tickets: tickets.filter((ticket: any) => ticket.booking_id === booking.booking_id),
      }));
    } finally {
      connection.release();
    }
  }

  /**
   * HỦY BOOKING PENDING VÀ GIẢI PHÓNG CHỖ.
   *
   * Hàm này dành cho booking chưa thanh toán (ví dụ VNPAY thất bại).
   * Vì booking Pending CHƯA trừ tiền ví nên TUYỆT ĐỐI không cộng tiền vào ví.
   *
   * Với booking Paid, người dùng phải đi qua requestCancellationAndRefund()
   * để áp dụng đúng chính sách hoàn tiền.
   */
  async cancelAndRefundBooking(bookingCode: string, reason: string): Promise<any> {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [bookingRows]: any = await connection.query(
        `SELECT 
            b.booking_id,
            b.user_id,
            b.total_amount,
            b.payment_status
         FROM bookings b
         WHERE b.booking_code = ?
         FOR UPDATE`,
        [bookingCode],
      );

      if (bookingRows.length === 0) {
        throw new CustomError(
          `Không tìm thấy đơn hàng với mã ${bookingCode}.`,
          404,
        );
      }

      const bookingInfo = bookingRows[0];

      if (
        bookingInfo.payment_status === 'Refunded' ||
        bookingInfo.payment_status === 'Cancelled'
      ) {
        await connection.rollback();

        return {
          success: true,
          message: `Đơn hàng ${bookingCode} đã được xử lý trước đó.`,
        };
      }

      if (bookingInfo.payment_status !== 'Pending') {
        throw new CustomError(
          'Booking đã thanh toán không được hủy bằng luồng tự động này. Vui lòng dùng chức năng yêu cầu hủy vé.',
          400,
          );
        }

      // Booking Pending chưa phát sinh thanh toán => chỉ giải phóng inventory.
      await this.releaseBookingInventory(
        connection,
        bookingInfo.booking_id,
      );

      await connection.query(
        `UPDATE bookings
         SET payment_status = 'Cancelled'
         WHERE booking_id = ?
           AND payment_status = 'Pending'`,
        [bookingInfo.booking_id],
      );

      // Ghi nhận yêu cầu với refund_amount = 0 vì chưa hề trừ tiền.
      await connection.query(
        `INSERT INTO refund_requests (
            booking_id,
            reason,
            refund_amount,
            status
         ) VALUES (?, ?, 0, 'Approved')`,
        [bookingInfo.booking_id, reason],
      );

      await connection.commit();

      return {
        success: true,
        message:
          `Đã hủy booking Pending ${bookingCode} và giải phóng chỗ. ` +
          'Không cộng tiền vào ví vì giao dịch chưa thanh toán.',
        refundAmount: 0,
      };
    } catch (error: any) {
      await connection.rollback();

      console.error(
        'Lỗi trong lúc hủy booking Pending:',
        error,
      );

      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError(
        `Giao dịch hủy vé thất bại: ${error.message}`,
        500,
      );
    } finally {
      connection.release();
    }
  }

  /**
   * Yêu cầu hủy vé xe khách và hoàn tiền theo chính sách.
   * @param userId ID của người dùng yêu cầu hủy.
   * @param bookingCode Mã đặt chỗ cần hủy.
   * @param reason Lý do hủy.
   */
  async requestCancellationAndRefund(userId: number, bookingCode: string, reason: string): Promise<any> {
    const connection = await pool.getConnection(); // Assuming pool is defined
    await connection.beginTransaction(); // Start transaction

    try {
      // 1. Lấy thông tin booking và chuyến đi liên quan
      const [bookingDetailsRows] = await connection.query<BookingDetailsForCancellation[]>(
        `SELECT
            b.booking_id,
            b.user_id,
            b.total_amount,
            b.payment_status,
            t.departure_time,
            b.booking_code,
            v.partner_id
         FROM bookings b
         JOIN tickets tk ON b.booking_id = tk.booking_id
         JOIN seats s ON tk.seat_id = s.seat_id
         JOIN trips t ON t.trip_id = s.trip_id
         JOIN vehicles v ON t.vehicle_id = v.vehicle_id
         WHERE b.booking_code = ? AND b.user_id = ?
         GROUP BY b.booking_id, t.departure_time, v.partner_id
         FOR UPDATE`, // Lock the booking row
        [bookingCode, userId]
      );

      if (bookingDetailsRows.length === 0) {
        throw new CustomError('Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập.', 404);
      }

      const bookingInfo = bookingDetailsRows[0];

      if (bookingInfo.payment_status !== 'Paid') {
        throw new CustomError('Chỉ có thể hủy các đơn hàng đã thanh toán.', 400);
      }

      // Chống tạo nhiều yêu cầu refund cho cùng một booking.
      // Nếu đã Pending hoặc Approved thì không tạo thêm request mới.
      const [existingRefundRequest]: any = await connection.query(
        `SELECT refund_id, status
         FROM refund_requests
         WHERE booking_id = ?
           AND status IN ('Pending', 'Approved')
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [bookingInfo.booking_id],
      );

      if (existingRefundRequest.length > 0) {
        if (existingRefundRequest[0].status === 'Pending') {
          throw new CustomError(
            'Đơn hàng này đã có yêu cầu hoàn tiền đang chờ xử lý.',
            409,
          );
        }

        throw new CustomError(
          'Đơn hàng này đã được hoàn tiền trước đó.',
          409,
        );
      }

      // Kiểm tra thêm ledger để chống double-refund ngay cả khi refund_requests
      // bị thiếu hoặc dữ liệu cũ không đồng bộ.
      const [existingRefundLedger]: any = await connection.query(
        `SELECT wallet_transaction_id
         FROM wallet_transactions
         WHERE booking_id = ?
           AND transaction_type = 'REFUND'
         LIMIT 1
         FOR UPDATE`,
        [bookingInfo.booking_id],
      );

      if (existingRefundLedger.length > 0) {
        throw new CustomError(
          'Đơn hàng này đã được hoàn tiền trước đó.',
          409,
        );
      }

      const now = new Date();
      const departureTime = new Date(bookingInfo.departure_time);
      const timeDiffMs = departureTime.getTime() - now.getTime();
      const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

      let refundPercentage = 0;
      let message = '';

      if (timeDiffHours >= 48) { // >= 2 ngày
        refundPercentage = 100;
      } else if (timeDiffHours >= 24) { // 1 đến 2 ngày
        refundPercentage = 80;
      } else {
        throw new CustomError('Không thể hủy vé do đã quá gần giờ khởi hành.', 400);
      }

      const refundAmount = bookingInfo.total_amount * (refundPercentage / 100);

      await connection.query(
        `INSERT INTO refund_requests (booking_id, reason, refund_amount, status, partner_id)
         VALUES (?, ?, ?, 'Pending', ?)`,
        [
          bookingInfo.booking_id,
          reason,
          refundAmount,
          bookingInfo.partner_id,
        ],
      );
      message = 'Yêu cầu hủy vé của bạn đã được gửi đến nhà xe để phê duyệt.';

      await connection.commit();

      return {
        success: true,
        message,
        refundAmount,
        bookingCode: bookingInfo.booking_code,
      };

    } catch (error: any) {
      await connection.rollback();
      console.error("Lỗi trong lúc yêu cầu hủy vé:", error);
      throw new CustomError(error.message || 'Yêu cầu hủy vé thất bại.', error.statusCode || 500);
    } finally {
      connection.release();
    }
  }
}

export default new BookingService();
