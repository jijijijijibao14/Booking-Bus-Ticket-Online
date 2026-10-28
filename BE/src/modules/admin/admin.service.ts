import pool from '../../config/database.js';
import {
  getSystemFinancialBalanceForUpdate,
  recordSystemFinancialTransaction,
} from '../../utils/system-financial.util.js';

type PageFilters = {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  status?: unknown;
  fromDate?: unknown;
  toDate?: unknown;
  direction?: unknown;
};

function getPage(filters: PageFilters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function textFilter(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

class AdminService {
  async getCommissionSettings() {
    const [rows]: any = await pool.query(
      'SELECT commission_rate AS commissionRate FROM system_commission_settings WHERE setting_id = 1',
    );
    if (rows.length === 0) throw new Error('Chưa có cấu hình hoa hồng. Hãy chạy migration quản trị.');
    return { commissionRate: Number(rows[0].commissionRate) };
  }

  async updateCommissionRate(commissionRate: number) {
    if (
      !Number.isFinite(commissionRate) ||
      commissionRate < 0 ||
      commissionRate > 100 ||
      Math.abs(commissionRate * 100 - Math.round(commissionRate * 100)) > 1e-8
    ) {
      throw new Error('Tỷ lệ hoa hồng phải từ 0 đến 100 và tối đa 2 chữ số thập phân.');
    }
    await pool.query(
      `INSERT INTO system_commission_settings (setting_id, commission_rate)
       VALUES (1, ?)
       ON DUPLICATE KEY UPDATE commission_rate = VALUES(commission_rate)`,
      [commissionRate],
    );
    return { commissionRate };
  }

  async getOverview(filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const [[summary]]: any = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role IN ('Customer', 'Partner')) AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE role = 'Partner') AS totalPartners,
        (SELECT COUNT(*) FROM tickets) AS totalTickets,
        (SELECT COUNT(*) FROM payments) AS totalTransactions,
        (SELECT COUNT(*) FROM users WHERE role = 'Partner' AND status = 'Active') AS activePartners,
        (SELECT COUNT(*) FROM bookings) AS totalBookings,
        (SELECT COUNT(*) FROM users WHERE role = 'Partner' AND status = 'Pending Approval') AS pendingPartners,
        (SELECT COUNT(*) FROM refund_requests WHERE status = 'WaitRefund') AS pendingRefunds,
        (SELECT current_balance FROM system_financial_accounts
         WHERE account_code = 'SYSTEM_WALLET') AS systemWalletBalance,
        (SELECT current_balance FROM system_financial_accounts
         WHERE account_code = 'COMMISSION_WALLET') AS commissionWalletBalance,
        (SELECT COALESCE(SUM(withdrawable_balance), 0) FROM partner_profiles) AS partnerWithdrawableBalance,
        (SELECT COALESCE(SUM(refund_amount), 0) FROM refund_requests WHERE status = 'Approved') AS approvedRefundTotal,
        (SELECT COALESCE(SUM(b.total_amount), 0)
         FROM bookings b
         WHERE b.payment_status = 'Paid'
           AND EXISTS (
             SELECT 1 FROM tickets tk
             JOIN seats s ON s.seat_id = tk.seat_id
             JOIN trips t ON t.trip_id = s.trip_id
             WHERE tk.booking_id = b.booking_id AND t.status = 'Completed'
           )) AS completedBookingRevenue
    `);

    const [revenueRows]: any = await pool.query(
      `SELECT DATE(b.created_at) AS date, SUM(b.total_amount) AS revenue
       FROM bookings b
       WHERE b.payment_status = 'Paid'
       GROUP BY DATE(b.created_at)
       ORDER BY date DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
    );
    const [[revenueCount]]: any = await pool.query(
      `SELECT COUNT(DISTINCT DATE(created_at)) AS total
       FROM bookings WHERE payment_status = 'Paid'`,
    );

    const activityQuery = `
      SELECT * FROM (
        SELECT 'booking' AS type, b.booking_code AS reference,
               u.full_name AS actor, b.total_amount AS amount,
               b.created_at AS createdAt, b.payment_status AS status
        FROM bookings b JOIN users u ON u.user_id = b.user_id
        UNION ALL
        SELECT 'refund' AS type, b.booking_code AS reference,
               u.full_name AS actor, -r.refund_amount AS amount,
               r.created_at AS createdAt, r.status AS status
        FROM refund_requests r
        JOIN bookings b ON b.booking_id = r.booking_id
        JOIN users u ON u.user_id = b.user_id
        UNION ALL
        SELECT 'payout' AS type, p.reference_code AS reference,
               COALESCE(pp.brand_name, u.full_name) AS actor,
               -p.amount AS amount, p.created_at AS createdAt, p.status AS status
        FROM partner_payouts p
        JOIN users u ON u.user_id = p.partner_id
        LEFT JOIN partner_profiles pp ON pp.partner_id = p.partner_id
        UNION ALL
        SELECT t.transaction_type AS type, t.reference_code AS reference,
               COALESCE(u.full_name, 'VIETGO System') AS actor,
               t.amount AS amount, t.created_at AS createdAt, 'Recorded' AS status
        FROM system_financial_transactions t
        LEFT JOIN users u ON u.user_id = t.admin_user_id
        WHERE t.transaction_type = 'ADJUSTMENT'
           OR (t.account_code = 'COMMISSION_WALLET' AND t.transaction_type = 'COMMISSION')
      ) activity
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `;
    const [activities]: any = await pool.query(activityQuery, [pageSize, offset]);
    const [[activityCount]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM (
        SELECT booking_id AS id FROM bookings
        UNION ALL SELECT refund_id AS id FROM refund_requests
        UNION ALL SELECT payout_id AS id FROM partner_payouts
        UNION ALL SELECT transaction_id AS id FROM system_financial_transactions
          WHERE transaction_type = 'ADJUSTMENT'
             OR (account_code = 'COMMISSION_WALLET' AND transaction_type = 'COMMISSION')
      ) activity`,
    );

    return {
      summary: {
        ...summary,
        totalUsers: Number(summary.totalUsers),
        totalPartners: Number(summary.totalPartners),
        totalTickets: Number(summary.totalTickets),
        totalTransactions: Number(summary.totalTransactions),
        activePartners: Number(summary.activePartners),
        totalBookings: Number(summary.totalBookings),
        pendingPartners: Number(summary.pendingPartners),
        pendingRefunds: Number(summary.pendingRefunds),
        partnerWithdrawableBalance: Number(summary.partnerWithdrawableBalance),
        approvedRefundTotal: Number(summary.approvedRefundTotal),
        completedBookingRevenue: Number(summary.completedBookingRevenue),
        systemWalletBalance: Number(summary.systemWalletBalance),
        commissionWalletBalance: Number(summary.commissionWalletBalance),
      },
      revenue: {
        items: revenueRows.map((row: any) => ({
          date: row.date,
          revenue: Number(row.revenue),
        })),
        page,
        pageSize,
        total: Number(revenueCount.total),
      },
      activities: {
        items: activities,
        page,
        pageSize,
        total: Number(activityCount.total),
      },
    };
  }

  async getUsers(role: 'Customer' | 'Partner', filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const search = textFilter(filters.search);
    const conditions = ['u.role = ?'];
    const params: unknown[] = [role];
    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR CAST(u.user_id AS CHAR) LIKE ?)');
      params.push(...Array(5).fill(`%${search}%`));
    }
    if (filters.status && textFilter(filters.status)) {
      conditions.push('u.status = ?');
      params.push(textFilter(filters.status));
    }
    const where = conditions.join(' AND ');
    const [items]: any = await pool.query(
      `SELECT u.user_id AS id, u.username, u.full_name AS name, u.email, u.phone,
              u.status, u.created_at AS createdAt, u.wallet_balance AS walletBalance,
              p.brand_name AS brandName, p.license_number AS licenseNumber,
              p.withdrawable_balance AS withdrawableBalance,
              COALESCE((SELECT commission_rate FROM system_commission_settings WHERE setting_id = 1), p.commission_rate) AS commissionRate,
              p.is_approved AS isApproved,
              ppa.bank_name AS bankName, ppa.bank_account_name AS bankAccountName,
              ppa.bank_account_number AS bankAccountNumber,
              ppa.branch_name AS bankBranchName
       FROM users u
       LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
       LEFT JOIN partner_payment_accounts ppa ON ppa.partner_id = p.partner_id
       WHERE ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[count]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE ${where}`,
      params,
    );
    return { items, page, pageSize, total: Number(count.total) };
  }

  async updateAccountStatus(userId: number, action: 'suspend' | 'activate' | 'delete') {
    const connection = await pool.getConnection();
    try {
      const status = action === 'suspend' ? 'Suspended' : action === 'delete' ? 'Deleted' : 'Active';
      const [result]: any = await connection.query(
        `UPDATE users SET status = ?
         WHERE user_id = ? AND role IN ('Customer', 'Partner')
           AND (
             (? = 'Suspended' AND status = 'Active')
             OR (? = 'Active' AND status = 'Suspended')
             OR (? = 'Deleted' AND status <> 'Deleted')
           )`,
        [status, userId, status, status, status],
      );
      if (result.affectedRows === 0) {
        const [rows]: any = await connection.query(
          'SELECT role, status FROM users WHERE user_id = ?',
          [userId],
        );
        if (rows.length === 0) return { found: false, message: 'Không tìm thấy tài khoản.' };
        if (rows[0].role === 'Admin') return { found: false, message: 'Không thể thay đổi tài khoản Admin.' };
        if (rows[0].status === 'Deleted') return { found: false, message: 'Tài khoản đã được lưu trữ.' };
        return {
          found: false,
          message: action === 'suspend'
            ? 'Chỉ có thể khóa tài khoản đang hoạt động.'
            : 'Chỉ có thể mở khóa tài khoản đang bị khóa.',
        };
      }
      return { found: result.affectedRows > 0, status };
    } finally {
      connection.release();
    }
  }

  async getPendingMerchants(filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const search = textFilter(filters.search);
    const conditions = ["u.role = 'Partner'", "u.status = 'Pending Approval'"];
    const params: unknown[] = [];
    if (search) {
      conditions.push('(u.user_id LIKE ? OR p.brand_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
      params.push(...Array(5).fill(`%${search}%`));
    }
    const where = conditions.join(' AND ');
    const [items]: any = await pool.query(
      `SELECT u.user_id AS id, COALESCE(p.brand_name, u.full_name) AS companyName,
              u.full_name AS contactPerson, u.email, u.phone,
              p.license_number AS licenseNumber,
              p.withdrawable_balance AS withdrawableBalance,
              ppa.bank_name AS bankName, ppa.bank_account_name AS bankAccountName,
              ppa.bank_account_number AS bankAccountNumber,
              ppa.branch_name AS bankBranchName,
              u.created_at AS submittedDate, u.status
       FROM users u
       LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
       LEFT JOIN partner_payment_accounts ppa ON ppa.partner_id = p.partner_id
       WHERE ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[count]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM users u
       LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
       WHERE ${where}`,
      params,
    );
    return { items, page, pageSize, total: Number(count.total) };
  }

  async handleMerchantAction(merchantId: number, action: 'approve' | 'reject') {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result]: any = await connection.query(
        `UPDATE users SET status = ?
         WHERE user_id = ? AND role = 'Partner' AND status = 'Pending Approval'`,
        [action === 'approve' ? 'Active' : 'Rejected', merchantId],
      );
      if (result.affectedRows === 0) {
        await connection.rollback();
        return false;
      }
      await connection.query(
        'UPDATE partner_profiles SET is_approved = ? WHERE partner_id = ?',
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

  async getRefunds(history: boolean, filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const search = textFilter(filters.search);
    const conditions = [history ? "rr.status IN ('Approved', 'Rejected')" : "rr.status = 'WaitRefund'"];
    const params: unknown[] = [];
    if (search) {
      conditions.push('(b.booking_code LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR rr.reason LIKE ?)');
      params.push(...Array(4).fill(`%${search}%`));
    }
    const where = conditions.join(' AND ');
    const from = `
      FROM refund_requests rr
      JOIN bookings b ON b.booking_id = rr.booking_id
      JOIN users u ON u.user_id = b.user_id
      LEFT JOIN partner_profiles p ON p.partner_id = rr.partner_id
      LEFT JOIN tickets tk ON tk.booking_id = b.booking_id
      LEFT JOIN seats s ON s.seat_id = tk.seat_id
      LEFT JOIN trips t ON t.trip_id = s.trip_id
      LEFT JOIN routes r ON r.route_id = t.route_id
      WHERE ${where}
      GROUP BY rr.refund_id
    `;
    const [items]: any = await pool.query(
      `SELECT rr.refund_id AS id, b.booking_code AS bookingCode,
              u.full_name AS customer, u.email,
              COALESCE(p.brand_name, 'VIETGO System') AS merchant,
              GROUP_CONCAT(DISTINCT CONCAT(r.departure_location, ' - ', r.arrival_location) SEPARATOR ', ') AS route,
              b.total_amount AS totalAmount, rr.refund_amount AS refundAmount,
              rr.reason, rr.status, rr.created_at AS createdAt,
              MIN(t.departure_time) AS departureTime
       ${from}
       ORDER BY rr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[count]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT rr.refund_id ${from}
       ) result`,
      params,
    );
    return { items, page, pageSize, total: Number(count.total) };
  }

  async processAdminRefund(refundId: number, action: 'approve' | 'reject') {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [refundRows]: any = await conn.query(
        `SELECT r.status, r.refund_amount, r.booking_id, b.user_id, b.booking_code
         FROM refund_requests r
         JOIN bookings b ON b.booking_id = r.booking_id
         WHERE r.refund_id = ? FOR UPDATE`,
        [refundId],
      );
      if (refundRows.length === 0) throw new Error('Không tìm thấy yêu cầu hoàn tiền.');
      const refund = refundRows[0];
      if (refund.status !== 'WaitRefund') {
        throw new Error(`Yêu cầu không ở trạng thái chờ duyệt (WaitRefund). Trạng thái hiện tại: ${refund.status}`);
      }
      if (action === 'reject') {
        await conn.query("UPDATE refund_requests SET status = 'Rejected' WHERE refund_id = ?", [refundId]);
        await conn.commit();
        return { affectedRows: 1, message: 'Yêu cầu hoàn tiền đã bị từ chối.' };
      }

      const [existingLedger]: any = await conn.query(
        `SELECT wallet_transaction_id FROM wallet_transactions
         WHERE booking_id = ? AND transaction_type = 'REFUND' LIMIT 1 FOR UPDATE`,
        [refund.booking_id],
      );
      if (existingLedger.length > 0) throw new Error(`Booking ${refund.booking_code} đã được hoàn tiền trước đó.`);
      const [bookingRows]: any = await conn.query(
        'SELECT payment_status FROM bookings WHERE booking_id = ? FOR UPDATE',
        [refund.booking_id],
      );
      if (bookingRows[0]?.payment_status !== 'Paid') {
        throw new Error(`Không thể hoàn tiền: trạng thái booking hiện tại là ${bookingRows[0]?.payment_status ?? 'không xác định'}.`);
      }
      const [userRows]: any = await conn.query(
        'SELECT wallet_balance FROM users WHERE user_id = ? FOR UPDATE',
        [refund.user_id],
      );
      if (userRows.length === 0) throw new Error('Không tìm thấy người dùng.');
      const balanceBefore = Number(userRows[0].wallet_balance || 0);
      const balanceAfter = balanceBefore + Number(refund.refund_amount);
      await conn.query('UPDATE users SET wallet_balance = ? WHERE user_id = ?', [balanceAfter, refund.user_id]);
      await recordSystemFinancialTransaction(conn, {
        accountCode: 'SYSTEM_WALLET',
        transactionType: 'REFUND',
        amount: -Number(refund.refund_amount),
        referenceCode: `REFUND-${refundId}`,
        description: `Hoàn tiền booking ${refund.booking_code}`,
        adminUserId: undefined,
      });
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, booking_id, transaction_type, amount, balance_before, balance_after, reference_code, description)
         VALUES (?, ?, 'REFUND', ?, ?, ?, ?, ?)`,
        [refund.user_id, refund.booking_id, refund.refund_amount, balanceBefore, balanceAfter, refund.booking_code, `Hoàn tiền cho booking ${refund.booking_code}`],
      );
      await conn.query(
        `UPDATE seats s
         JOIN tickets tk ON tk.seat_id = s.seat_id
         SET s.status = 'Available'
         WHERE tk.booking_id = ? AND s.status = 'Booked'`,
        [refund.booking_id],
      );
      await conn.query("UPDATE refund_requests SET status = 'Approved' WHERE refund_id = ?", [refundId]);
      await conn.query("UPDATE bookings SET payment_status = 'Refunded' WHERE booking_id = ?", [refund.booking_id]);
      await conn.commit();
      return { affectedRows: 1, message: 'Yêu cầu hoàn tiền đã được phê duyệt và xử lý thành công.' };
    } catch (error: any) {
      await conn.rollback();
      throw new Error(`Lỗi xử lý yêu cầu hoàn tiền: ${error.message}`);
    } finally {
      conn.release();
    }
  }

  async getTickets(filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const conditions: string[] = [];
    const params: unknown[] = [];
    const search = textFilter(filters.search);
    const status = textFilter(filters.status);
    if (search) {
      conditions.push('(CAST(tk.ticket_id AS CHAR) LIKE ? OR tk.passenger_name LIKE ? OR b.booking_code LIKE ? OR u.full_name LIKE ? OR r.departure_location LIKE ? OR r.arrival_location LIKE ?)');
      params.push(...Array(6).fill(`%${search}%`));
    }
    if (['Paid', 'Pending', 'Refunded'].includes(status)) {
      conditions.push('b.payment_status = ?');
      params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const from = `
      FROM tickets tk
      JOIN bookings b ON b.booking_id = tk.booking_id
      JOIN users u ON u.user_id = b.user_id
      LEFT JOIN seats s ON s.seat_id = tk.seat_id
      LEFT JOIN trips t ON t.trip_id = s.trip_id
      LEFT JOIN routes r ON r.route_id = t.route_id
      ${where}
    `;
    const [items]: any = await pool.query(
      `SELECT tk.ticket_id AS id, tk.passenger_name AS passenger,
              b.booking_code AS bookingCode, u.full_name AS customer,
              CONCAT_WS(' - ', r.departure_location, r.arrival_location) AS route,
              s.seat_code AS seat, tk.ticket_price AS price,
              b.payment_status AS status, t.departure_time AS departureTime
       ${from}
       ORDER BY tk.ticket_id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[count]]: any = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
    return { items, page, pageSize, total: Number(count.total) };
  }

  async getPayments(filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const conditions: string[] = [];
    const params: unknown[] = [];
    const search = textFilter(filters.search);
    const status = textFilter(filters.status);
    const fromDate = textFilter(filters.fromDate);
    const toDate = textFilter(filters.toDate);
    if (search) {
      conditions.push('(p.txn_ref LIKE ? OR p.transaction_no LIKE ? OR po.order_code LIKE ? OR b.booking_code LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(...Array(6).fill(`%${search}%`));
    }
    if (['Pending', 'Paid', 'Failed', 'Cancelled'].includes(status)) {
      conditions.push('p.payment_status = ?');
      params.push(status);
    }
    if (fromDate) {
      conditions.push('DATE(p.created_at) >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('DATE(p.created_at) <= ?');
      params.push(toDate);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const from = `
      FROM payments p
      LEFT JOIN payment_orders po ON po.payment_order_id = p.payment_order_id
      LEFT JOIN payment_order_items poi ON poi.payment_order_id = po.payment_order_id
      LEFT JOIN bookings b ON b.booking_id = COALESCE(p.booking_id, poi.booking_id)
      LEFT JOIN users u ON u.user_id = COALESCE(po.user_id, b.user_id)
      LEFT JOIN refund_requests rr ON rr.booking_id = b.booking_id
      ${where}
    `;
    const [items]: any = await pool.query(
      `SELECT p.payment_id AS id, p.txn_ref AS transactionCode,
              p.transaction_no AS providerReference,
              po.order_code AS orderCode,
              GROUP_CONCAT(DISTINCT b.booking_code SEPARATOR ', ') AS bookingCodes,
              GROUP_CONCAT(DISTINCT u.full_name SEPARATOR ', ') AS customers,
              p.amount, p.payment_status AS status,
              p.created_at AS createdAt, p.payment_time AS paymentTime,
              GROUP_CONCAT(DISTINCT b.payment_status SEPARATOR ',') AS bookingStatuses,
              MAX(rr.status = 'Approved') AS hasApprovedRefund
       ${from}
       GROUP BY p.payment_id
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[count]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM (SELECT p.payment_id ${from} GROUP BY p.payment_id) result`,
      params,
    );
    return {
      items: items.map((item: any) => {
        const bookingStatuses = String(item.bookingStatuses ?? '').split(',').filter(Boolean);
        const consistent = item.status === 'Paid'
          ? bookingStatuses.length > 0 && bookingStatuses.every((value: string) =>
            value === 'Paid' || (value === 'Refunded' && Number(item.hasApprovedRefund) === 1))
          : item.status === 'Pending'
            ? bookingStatuses.length > 0 && bookingStatuses.every((value: string) => value === 'Pending')
            : ['Failed', 'Cancelled'].includes(item.status)
              ? bookingStatuses.length > 0 && bookingStatuses.every((value: string) => value === 'Cancelled')
              : true;
        return { ...item, consistent, bookingStatuses };
      }),
      page,
      pageSize,
      total: Number(count.total),
    };
  }

  async closeFailedPayment(paymentId: number) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT p.payment_status, p.payment_order_id, p.booking_id
         FROM payments p WHERE p.payment_id = ? FOR UPDATE`,
        [paymentId],
      );
      if (rows.length === 0) throw new Error('Không tìm thấy giao dịch.');
      if (rows[0].payment_status !== 'Failed') {
        throw new Error(`Chỉ có thể đóng giao dịch Failed. Trạng thái hiện tại: ${rows[0].payment_status}.`);
      }
      await connection.query(
        "UPDATE payments SET payment_status = 'Cancelled' WHERE payment_id = ? AND payment_status = 'Failed'",
        [paymentId],
      );
      if (rows[0].payment_order_id) {
        await connection.query(
          `UPDATE payment_orders SET payment_status = 'Cancelled'
           WHERE payment_order_id = ? AND payment_status = 'Failed'`,
          [rows[0].payment_order_id],
        );
      }
      await connection.commit();
      return { message: 'Giao dịch Failed đã được đóng.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPartnerPayouts(filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const search = textFilter(filters.search);
    const params: unknown[] = [];
    const where = search
      ? 'WHERE (pp.brand_name LIKE ? OR u.full_name LIKE ? OR p.reference_code LIKE ? OR CAST(p.payout_id AS CHAR) LIKE ?)'
      : '';
    if (search) params.push(...Array(4).fill(`%${search}%`));
    const [items]: any = await pool.query(
      `SELECT p.payout_id AS id, p.partner_id AS partnerId,
              COALESCE(pp.brand_name, u.full_name) AS partner,
              p.amount, p.status, p.reference_code AS referenceCode,
              p.created_at AS createdAt
       FROM partner_payouts p
       JOIN users u ON u.user_id = p.partner_id
       LEFT JOIN partner_profiles pp ON pp.partner_id = p.partner_id
       ${where}
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[count]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM partner_payouts p
       JOIN users u ON u.user_id = p.partner_id
       LEFT JOIN partner_profiles pp ON pp.partner_id = p.partner_id
       ${where}`,
      params,
    );
    return { items, page, pageSize, total: Number(count.total) };
  }

  async createPartnerPayout(partnerId: number, adminId: number, referenceCode: string) {
    if (!referenceCode.trim() || referenceCode.length > 100) {
      throw new Error('Mã tham chiếu chi trả phải có từ 1 đến 100 ký tự.');
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await getSystemFinancialBalanceForUpdate(connection, 'SYSTEM_WALLET');
      const [rows]: any = await connection.query(
        `SELECT pp.withdrawable_balance, u.wallet_balance
         FROM users u JOIN partner_profiles pp ON pp.partner_id = u.user_id
         WHERE u.user_id = ? AND u.role = 'Partner' FOR UPDATE`,
        [partnerId],
      );
      if (rows.length === 0) throw new Error('Không tìm thấy đối tác.');
      const available = Number(rows[0].withdrawable_balance);
      const balanceBefore = Number(rows[0].wallet_balance || 0);
      if (!Number.isFinite(available) || available <= 0) {
        throw new Error('Đối tác hiện không có số dư để chi trả.');
      }
      if (!Number.isFinite(balanceBefore) || balanceBefore < 0) {
        throw new Error('Số dư ví đối tác hiện không hợp lệ.');
      }
      const balanceAfter = balanceBefore + available;
      await connection.query(
        'UPDATE partner_profiles SET withdrawable_balance = 0 WHERE partner_id = ?',
        [partnerId],
      );
      await connection.query(
        'UPDATE users SET wallet_balance = ? WHERE user_id = ? AND role = \'Partner\'',
        [balanceAfter, partnerId],
      );
      await connection.query(
        `INSERT INTO wallet_transactions
         (user_id, transaction_type, amount, balance_before, balance_after, reference_code, description)
         VALUES (?, 'PARTNER_PAYOUT', ?, ?, ?, ?, ?)`,
        [
          partnerId,
          available,
          balanceBefore,
          balanceAfter,
          referenceCode.trim(),
          'Nhận tiền chi trả từ ví hệ thống VIETGO',
        ],
      );
      await recordSystemFinancialTransaction(connection, {
        accountCode: 'SYSTEM_WALLET',
        transactionType: 'PARTNER_PAYOUT',
        amount: -available,
        referenceCode: referenceCode.trim(),
        description: `Chi trả toàn bộ số dư cho đối tác #${partnerId}`,
        adminUserId: adminId,
      });
      const [result]: any = await connection.query(
        `INSERT INTO partner_payouts (partner_id, admin_user_id, amount, status, reference_code)
         VALUES (?, ?, ?, 'Paid', ?)`,
        [partnerId, adminId, available, referenceCode.trim()],
      );
      await connection.commit();
      return {
        id: result.insertId,
        amount: available,
        withdrawableBalanceAfter: 0,
        walletBalanceAfter: balanceAfter,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getFinancialActivity(filters: PageFilters) {
    const { page, pageSize, offset } = getPage(filters);
    const search = textFilter(filters.search);
    const type = textFilter(filters.status);
    const direction = textFilter(filters.direction);
    const fromDate = textFilter(filters.fromDate);
    const toDate = textFilter(filters.toDate);
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (search) {
      conditions.push('(activity.reference LIKE ? OR activity.actor LIKE ? OR activity.description LIKE ? OR activity.type LIKE ?)');
      params.push(...Array(4).fill(`%${search}%`));
    }
    if (type) {
      conditions.push('activity.type = ?');
      params.push(type);
    }
    if (direction === 'in' || direction === 'out') {
      conditions.push(`activity.amount ${direction === 'in' ? '>' : '<'} 0`);
    }
    if (fromDate) {
      conditions.push('DATE(activity.createdAt) >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('DATE(activity.createdAt) <= ?');
      params.push(toDate);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const union = `
      SELECT CONCAT('system-', t.transaction_id) AS id,
             t.transaction_type AS type, t.reference_code AS reference,
             COALESCE(u.full_name, 'VIETGO System') AS actor,
             CONCAT(t.account_code, ': ', COALESCE(t.description, t.transaction_type)) AS description,
             t.amount, t.created_at AS createdAt
      FROM system_financial_transactions t
      LEFT JOIN users u ON u.user_id = t.admin_user_id
    `;
    const [items]: any = await pool.query(
      `SELECT * FROM (${union}) activity ${where}
       ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[count]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM (${union}) activity ${where}`,
      params,
    );
    return {
      items: items.map((item: any) => ({
        ...item,
        amount: Number(item.amount),
        direction: Number(item.amount) >= 0 ? 'in' : 'out',
      })),
      page,
      pageSize,
      total: Number(count.total),
    };
  }
}

export default new AdminService();
