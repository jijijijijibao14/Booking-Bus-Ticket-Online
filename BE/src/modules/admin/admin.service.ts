import pool from '../../config/database.js';

class AdminService {
  async getAdminSchedules() {
    const [rows] = await pool.query(`
      SELECT t.trip_id, t.departure_time, t.arrival_time, t.base_price,
             v.vehicle_name, v.vehicle_type,
             r.departure_location, r.arrival_location
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.vehicle_id
      JOIN routes r ON t.route_id = r.route_id
      WHERE v.vehicle_type = 'Bus'
      ORDER BY t.departure_time ASC
    `);
    return rows;
  }

  async getAdminFleet() {
    const [rows] = await pool.query(`
      SELECT * FROM vehicles WHERE vehicle_type = 'Bus'
    `);
    return rows;
  }

  async getPendingMerchants() {
    const [rows] = await pool.query(`
      SELECT 
        u.user_id as id,
        COALESCE(p.brand_name, u.full_name) as companyName,
        u.full_name as contactPerson,
        u.email,
        u.phone,
        u.created_at as submittedDate,
        u.status
      FROM users u
      LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
      WHERE u.role = 'Partner' AND u.status = 'Pending Approval'
      ORDER BY u.created_at DESC
    `);
    return rows;
  }

  async handleMerchantAction(merchantId: number, action: 'approve' | 'reject') {
    const newStatus = action === 'approve' ? 'Active' : 'Rejected';
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [result]: any = await connection.query(
        `UPDATE users
         SET status = ?
         WHERE user_id = ? AND role = 'Partner'`,
        [newStatus, merchantId],
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return false;
      }

      await connection.query(
        `UPDATE partner_profiles
         SET is_approved = ?
         WHERE partner_id = ?`,
        [action === 'approve', merchantId],
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getWaitingRefunds() {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT
           r.refund_id as id,
           ANY_VALUE(b.booking_code) as bookingCode,
           ANY_VALUE(u.full_name) as customer,
           ANY_VALUE(COALESCE(p.brand_name, 'VIETGO System')) as merchant,
           ANY_VALUE(CONCAT(rt.departure_location, ' - ', rt.arrival_location)) as route,
           ANY_VALUE(b.total_amount) as totalAmount,
           ANY_VALUE(r.refund_amount) as refundAmount,
           ROUND((ANY_VALUE(r.refund_amount) / NULLIF(ANY_VALUE(b.total_amount), 0)) * 100, 0) as refundPercent,
           ANY_VALUE(r.reason) as reason,
           ANY_VALUE(r.status) as status,
           ANY_VALUE(r.created_at) as createdAt,
           ANY_VALUE(tr.departure_time) as departureTime
         FROM refund_requests r
         JOIN bookings b ON r.booking_id = b.booking_id
         JOIN users u ON b.user_id = u.user_id
         LEFT JOIN partner_profiles p ON r.partner_id = p.partner_id
         LEFT JOIN tickets tk ON b.booking_id = tk.booking_id
         LEFT JOIN seats s ON tk.seat_id = s.seat_id
         JOIN trips tr ON tr.trip_id = s.trip_id
         JOIN routes rt ON tr.route_id = rt.route_id
         WHERE r.status = 'WaitRefund'
         GROUP BY r.refund_id
         ORDER BY ANY_VALUE(r.created_at) DESC`
      );
      return rows;
    } catch (err: any) {
      throw new Error(`Lỗi lấy danh sách chờ hoàn tiền: ${err.message}`);
    } finally {
      conn.release();
    }
  }

  async processAdminRefund(refundId: number, action: 'approve' | 'reject') {
    const conn = await pool.getConnection();
    await conn.beginTransaction(); // Sử dụng transaction để đảm bảo tính toàn vẹn

    try {
      // Bước 1: Lấy thông tin và khóa các dòng liên quan
      const [refundRows]: any = await conn.query(
        `SELECT 
            r.status, r.refund_amount, r.booking_id,
            b.user_id, b.booking_code
         FROM refund_requests r
         JOIN bookings b ON r.booking_id = b.booking_id
         WHERE r.refund_id = ?
         FOR UPDATE`,
        [refundId]
      );

      if (refundRows.length === 0) {
        throw new Error('Không tìm thấy yêu cầu hoàn tiền.');
      }
      const refundInfo = refundRows[0];

      if (refundInfo.status !== 'WaitRefund') {
        throw new Error(`Yêu cầu không ở trạng thái chờ duyệt (WaitRefund). Trạng thái hiện tại: ${refundRows[0].status}`);
      }

      // Xử lý khi admin từ chối
      if (action === 'reject') {
        await conn.query(`UPDATE refund_requests SET status = 'Rejected' WHERE refund_id = ?`, [refundId]);
        await conn.commit();
        return { affectedRows: 1, message: 'Yêu cầu hoàn tiền đã bị từ chối.' };
      }

      // Xử lý khi admin phê duyệt
      // Bước 2: Kiểm tra chống hoàn tiền 2 lần
      const [existingLedger]: any = await conn.query(`SELECT wallet_transaction_id FROM wallet_transactions WHERE booking_id = ? AND transaction_type = 'REFUND' LIMIT 1 FOR UPDATE`, [refundInfo.booking_id]);
      if (existingLedger.length > 0) {
        throw new Error(`Booking ${refundInfo.booking_code} đã được hoàn tiền trước đó.`);
      }

      // Bước 3: Cộng tiền vào ví người dùng
      const [userRows]: any = await conn.query(`SELECT wallet_balance FROM users WHERE user_id = ? FOR UPDATE`, [refundInfo.user_id]);
      if (userRows.length === 0) throw new Error('Không tìm thấy người dùng.');
      const balanceBefore = Number(userRows[0].wallet_balance || 0);
      const balanceAfter = balanceBefore + Number(refundInfo.refund_amount);
      await conn.query(`UPDATE users SET wallet_balance = ? WHERE user_id = ?`, [balanceAfter, refundInfo.user_id]);

      // Bước 4: Ghi lịch sử giao dịch ví
      await conn.query(`INSERT INTO wallet_transactions (user_id, booking_id, transaction_type, amount, balance_before, balance_after, reference_code, description) VALUES (?, ?, 'REFUND', ?, ?, ?, ?, ?)`, [refundInfo.user_id, refundInfo.booking_id, refundInfo.refund_amount, balanceBefore, balanceAfter, refundInfo.booking_code, `Hoàn tiền cho booking ${refundInfo.booking_code}`]);

      // Bước 5: Giải phóng ghế/slot
      const [tickets]: any = await conn.query(
        `SELECT seat_id FROM tickets WHERE booking_id = ?`,
        [refundInfo.booking_id],
      );
      const seatIds = tickets.map((ticket: any) => ticket.seat_id).filter(Boolean);
      if (seatIds.length > 0) {
        await conn.query(
          `UPDATE seats
           SET status = 'Available'
           WHERE seat_id IN (?) AND status = 'Booked'`,
          [seatIds],
        );
      }

      // Bước 6: Cập nhật trạng thái yêu cầu và booking
      const [result]: any = await conn.query(`UPDATE refund_requests SET status = 'Approved' WHERE refund_id = ?`, [refundId]);
      await conn.query(`UPDATE bookings SET payment_status = 'Refunded' WHERE booking_id = ?`, [refundInfo.booking_id]);

      await conn.commit();
      return { affectedRows: result.affectedRows, message: 'Yêu cầu hoàn tiền đã được phê duyệt và xử lý thành công.' };
    } catch (err: any) {
      await conn.rollback();
      throw new Error(`Lỗi xử lý yêu cầu hoàn tiền: ${err.message}`);
    } finally {
      conn.release();
    }
  }
}

export default new AdminService();
