import pool from '../../config/database.js';
import { CustomError } from '../../utils/customError.js';
import { recordSystemFinancialTransaction } from '../../utils/system-financial.util.js';

type AdminFilters = {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  status?: unknown;
  fromDate?: unknown;
  toDate?: unknown;
  direction?: unknown;
};

type PageOptions = {
  page: number;
  pageSize: number;
  offset: number;
};

function getPageOptions(filters: AdminFilters): PageOptions {
  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(filters.pageSize) || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function getSearch(filters: AdminFilters) {
  return typeof filters.search === 'string' ? filters.search.trim() : '';
}

function getDateFilter(filters: AdminFilters) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const rawFromDate = filters.fromDate == null ? '' : filters.fromDate;
  const rawToDate = filters.toDate == null ? '' : filters.toDate;
  if (typeof rawFromDate !== 'string' || typeof rawToDate !== 'string'
    || (rawFromDate && !datePattern.test(rawFromDate))
    || (rawToDate && !datePattern.test(rawToDate))) {
    throw new CustomError('Ngày lọc phải có định dạng YYYY-MM-DD.', 400);
  }
  for (const dateValue of [rawFromDate, rawToDate]) {
    if (!dateValue) continue;
    const [year, month, day] = dateValue.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1
      || parsedDate.getUTCDate() !== day) {
      throw new CustomError('Ngày lọc không tồn tại.', 400);
    }
  }
  const fromDate = rawFromDate;
  const toDate = rawToDate;
  if (fromDate && toDate && fromDate > toDate) {
    throw new CustomError('Ngày bắt đầu không được lớn hơn ngày kết thúc.', 400);
  }
  return { fromDate, toDate };
}

function asNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function pageResult(items: any[], total: unknown, options: PageOptions) {
  return {
    items,
    page: options.page,
    pageSize: options.pageSize,
    total: asNumber(total),
  };
}

class AdminService {
  async getAdminOverview(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const [summaryRows]: any = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'Customer') AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE role = 'Partner') AS totalPartners,
        (SELECT COUNT(*) FROM tickets) AS totalTickets,
        ((SELECT COUNT(*) FROM payments) +
         (SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type = 'PAYMENT')) AS totalTransactions,
        (SELECT COUNT(*) FROM bookings) AS totalBookings,
        (SELECT COUNT(*) FROM users WHERE role = 'Partner' AND status = 'Active') AS activePartners,
        (SELECT COUNT(*) FROM users WHERE role = 'Partner' AND status = 'Pending Approval') AS pendingPartners,
        (SELECT COUNT(*) FROM refund_requests WHERE status = 'WaitRefund') AS pendingRefunds,
        (SELECT COALESCE(SUM(withdrawable_balance), 0) FROM partner_profiles) AS partnerWithdrawableBalance,
        (SELECT COALESCE(SUM(current_balance), 0) FROM system_financial_accounts WHERE account_code = 'SYSTEM_WALLET') AS systemWalletBalance,
        (SELECT COALESCE(SUM(current_balance), 0) FROM system_financial_accounts WHERE account_code = 'COMMISSION_WALLET') AS commissionWalletBalance,
        (SELECT COALESCE(SUM(total_amount), 0) FROM bookings WHERE payment_status = 'Paid') AS collectedBookingAmount,
        (SELECT COALESCE(SUM(gross_amount), 0) FROM partner_trip_settlements) AS settledTripGrossAmount,
        (SELECT COALESCE(SUM(commission_amount), 0) FROM partner_trip_settlements) AS adminCommissionRevenue,
        (SELECT COALESCE(SUM(partner_amount), 0) FROM partner_trip_settlements) AS partnerSettlementAmount,
        (SELECT COALESCE(SUM(refund_amount), 0) FROM refund_requests WHERE status = 'Approved') AS approvedRefundTotal
    `);

    const [revenueCountRows]: any = await pool.query(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT DATE(created_at) AS revenueDate
        FROM partner_trip_settlements
        GROUP BY DATE(created_at)
      ) daily_revenue
    `);
    const [revenueRows]: any = await pool.query(
      `SELECT DATE(created_at) AS date, SUM(commission_amount) AS revenue
       FROM partner_trip_settlements
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT ? OFFSET ?`,
      [options.pageSize, options.offset],
    );

    const activitySource = this.getActivitySourceQuery();
    const [activityCountRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM (${activitySource}) AS activity_rows`,
    );
    const [activityRows]: any = await pool.query(
      `SELECT * FROM (${activitySource}) AS activity_rows
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [options.pageSize, options.offset],
    );

    return {
      summary: Object.fromEntries(
        Object.entries(summaryRows[0] ?? {}).map(([key, value]) => [key, asNumber(value)]),
      ),
      revenue: pageResult(revenueRows, revenueCountRows[0]?.total, options),
      activities: pageResult(activityRows, activityCountRows[0]?.total, options),
    };
  }

  async getAdminAnalytics() {
    const [summaryRows]: any = await pool.query(`
      SELECT
        COALESCE(SUM(CASE
          WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
          THEN commission_amount ELSE 0 END), 0) AS currentMonthRevenue,
        COALESCE(SUM(CASE
          WHEN created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
            AND created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')
          THEN commission_amount ELSE 0 END), 0) AS previousMonthRevenue,
        COUNT(CASE
          WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
          THEN 1 END) AS currentMonthCompletedTrips,
        COALESCE(SUM(commission_amount), 0) AS totalCommissionRevenue,
        COUNT(*) AS totalCompletedTrips
      FROM partner_trip_settlements
    `);
    const [monthlyRows]: any = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, SUM(commission_amount) AS revenue
      FROM partner_trip_settlements
      WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
        AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month
    `);
    const summary = summaryRows[0] ?? {};
    const monthlyRevenueByMonth = new Map(
      monthlyRows.map((row: any) => [String(row.month), asNumber(row.revenue)]),
    );
    const now = new Date();
    const monthlyRevenue = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      return { month, revenue: monthlyRevenueByMonth.get(month) ?? 0 };
    });
    const currentMonthRevenue = asNumber(summary.currentMonthRevenue);
    const previousMonthRevenue = asNumber(summary.previousMonthRevenue);

    return {
      currentMonthRevenue,
      previousMonthRevenue,
      revenueChangePercent: previousMonthRevenue > 0
        ? Number((((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100).toFixed(2))
        : null,
      currentMonthCompletedTrips: asNumber(summary.currentMonthCompletedTrips),
      totalCommissionRevenue: asNumber(summary.totalCommissionRevenue),
      totalCompletedTrips: asNumber(summary.totalCompletedTrips),
      monthlyRevenue,
    };
  }

  async getCommissionSettings() {
    const [rows]: any = await pool.query(
      'SELECT commission_rate AS commissionRate, updated_at AS updatedAt FROM system_commission_settings WHERE setting_id = 1',
    );
    if (rows.length === 0) {
      throw new CustomError('Chưa có cấu hình hoa hồng. Hãy chạy schema cơ sở dữ liệu.', 500);
    }
    return {
      commissionRate: asNumber(rows[0].commissionRate),
      updatedAt: rows[0].updatedAt,
    };
  }

  async updateCommissionSettings(commissionRate: number) {
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100
      || Math.round(commissionRate * 100) !== commissionRate * 100) {
      throw new CustomError('Tỷ lệ hoa hồng phải từ 0% đến 100%, tối đa 2 chữ số thập phân.', 400);
    }
    await pool.query(
      `UPDATE system_commission_settings
       SET commission_rate = ?
       WHERE setting_id = 1`,
      [commissionRate],
    );
    return this.getCommissionSettings();
  }

  async getCustomers(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const search = getSearch(filters);
    const params: any[] = [];
    let where = `WHERE u.role = 'Customer'`;
    if (search) {
      where += ` AND (u.full_name LIKE ? OR CAST(u.user_id AS CHAR) LIKE ? OR u.username LIKE ?
        OR u.email LIKE ? OR u.phone LIKE ?)`;
      params.push(...Array(5).fill(`%${search}%`));
    }
    if (typeof filters.status === 'string' && filters.status) {
      where += ' AND u.status = ?';
      params.push(filters.status);
    }
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params,
    );
    const [rows]: any = await pool.query(
      `SELECT u.user_id AS id, u.user_id AS accountId, u.username, u.full_name AS name,
              u.email, u.phone, u.wallet_balance AS walletBalance, u.status, u.created_at AS createdAt
       FROM users u ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    return pageResult(rows, countRows[0]?.total, options);
  }

  async getPartners(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const params: any[] = [];
    let where = `WHERE u.role = 'Partner'`;
    const search = getSearch(filters);
    if (search) {
      where += ` AND (COALESCE(p.brand_name, u.full_name) LIKE ? OR CAST(u.user_id AS CHAR) LIKE ?
        OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR p.license_number LIKE ?)`;
      params.push(...Array(6).fill(`%${search}%`));
    }
    if (typeof filters.status === 'string' && filters.status) {
      where += ' AND u.status = ?';
      params.push(filters.status);
    }
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM users u LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
       ${where}`,
      params,
    );
    const [rows]: any = await pool.query(
      `SELECT u.user_id AS id, u.user_id AS accountId, u.username, u.full_name AS contactPerson,
              COALESCE(p.brand_name, u.full_name) AS brandName, u.email, u.phone,
              p.license_number AS licenseNumber, p.is_approved AS isApproved,
              p.withdrawable_balance AS withdrawableBalance, u.wallet_balance AS walletBalance,
              u.status, u.created_at AS createdAt,
              a.bank_name AS bankName, a.bank_account_name AS bankAccountName,
              a.bank_account_number AS bankAccountNumber, a.branch_name AS bankBranchName
       FROM users u
       LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
       LEFT JOIN partner_payment_accounts a ON a.partner_id = u.user_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    return pageResult(rows, countRows[0]?.total, options);
  }

  async getPendingPartners(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const search = getSearch(filters);
    const params: any[] = [];
    let where = `WHERE u.role = 'Partner' AND u.status = 'Pending Approval'`;
    if (search) {
      where += ` AND (COALESCE(p.brand_name, u.full_name) LIKE ? OR CAST(u.user_id AS CHAR) LIKE ?
        OR u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR p.license_number LIKE ?)`;
      params.push(...Array(6).fill(`%${search}%`));
    }
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM users u LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
       ${where}`,
      params,
    );
    const [rows]: any = await pool.query(
      `SELECT u.user_id AS id, u.username, COALESCE(p.brand_name, u.full_name) AS companyName,
              u.full_name AS contactPerson, u.email, u.phone, p.license_number AS licenseNumber,
              p.is_approved AS isApproved, u.created_at AS submittedDate, u.status
       FROM users u
       LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    return pageResult(rows, countRows[0]?.total, options);
  }

  async updateAccountStatus(userId: number, action: 'activate' | 'suspend' | 'delete') {
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new CustomError('Mã tài khoản không hợp lệ.', 400);
    }
    const status = action === 'activate' ? 'Active' : action === 'suspend' ? 'Suspended' : 'Deleted';
    const allowedPreviousStatus = action === 'activate'
      ? "status = 'Suspended'"
      : action === 'suspend'
        ? "status = 'Active'"
        : "status <> 'Deleted'";
    const [result]: any = await pool.query(
      `UPDATE users
       SET status = ?
       WHERE user_id = ? AND role IN ('Customer', 'Partner') AND ${allowedPreviousStatus}`,
      [status, userId],
    );
    if (result.affectedRows === 0) {
      throw new CustomError('Không tìm thấy tài khoản hoặc tài khoản không thể thay đổi trạng thái.', 404);
    }
    return { status };
  }

  async handleMerchantAction(merchantId: number, action: 'approve' | 'reject') {
    if (!Number.isSafeInteger(merchantId) || merchantId < 1) {
      throw new CustomError('Mã đối tác không hợp lệ.', 400);
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT u.user_id, p.partner_id
         FROM users u
         LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
         WHERE u.user_id = ? AND u.role = 'Partner' AND u.status = 'Pending Approval'
         FOR UPDATE`,
        [merchantId],
      );
      if (rows.length === 0) {
        throw new CustomError('Không tìm thấy hồ sơ đối tác đang chờ duyệt.', 404);
      }
      if (rows[0].partner_id == null) {
        throw new CustomError('Hồ sơ đăng ký đối tác chưa có thông tin doanh nghiệp.', 409);
      }
      const nextStatus = action === 'approve' ? 'Active' : 'Rejected';
      await connection.query('UPDATE users SET status = ? WHERE user_id = ?', [nextStatus, merchantId]);
      await connection.query(
        'UPDATE partner_profiles SET is_approved = ? WHERE partner_id = ?',
        [action === 'approve', merchantId],
      );
      await connection.commit();
      return { status: nextStatus };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getTickets(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const params: any[] = [];
    let where = 'WHERE 1 = 1';
    const search = getSearch(filters);
    if (search) {
      where += ` AND (CAST(tk.ticket_id AS CHAR) LIKE ? OR tk.passenger_name LIKE ?
        OR b.booking_code LIKE ? OR u.full_name LIKE ? OR r.departure_location LIKE ? OR r.arrival_location LIKE ?)`;
      params.push(...Array(6).fill(`%${search}%`));
    }
    if (typeof filters.status === 'string' && filters.status) {
      where += ' AND b.payment_status = ?';
      params.push(filters.status);
    }
    const from = `FROM tickets tk
      JOIN bookings b ON b.booking_id = tk.booking_id
      JOIN users u ON u.user_id = b.user_id
      LEFT JOIN seats s ON s.seat_id = tk.seat_id
      LEFT JOIN trips tr ON tr.trip_id = s.trip_id
      LEFT JOIN routes r ON r.route_id = tr.route_id`;
    const [countRows]: any = await pool.query(`SELECT COUNT(*) AS total ${from} ${where}`, params);
    const [rows]: any = await pool.query(
      `SELECT tk.ticket_id AS id, tk.ticket_id AS ticketId, tk.passenger_name AS passenger,
              tk.passenger_email AS passengerEmail, tk.passenger_phone AS passengerPhone,
              b.booking_id AS bookingId, b.booking_code AS bookingCode, u.user_id AS customerId,
              u.full_name AS customer, u.email AS customerEmail,
              CONCAT(r.departure_location, ' - ', r.arrival_location) AS route,
              s.seat_code AS seat, tk.ticket_price AS price, b.payment_status AS status,
              tr.departure_time AS departureTime, b.created_at AS bookingCreatedAt
       ${from} ${where}
       ORDER BY b.created_at DESC, tk.ticket_id DESC
       LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    return pageResult(rows, countRows[0]?.total, options);
  }

  private getPaymentSourceQuery() {
    return `
      SELECT p.payment_id AS id, p.txn_ref AS transactionCode,
             COALESCE(po.order_code, b.booking_code, p.txn_ref) AS orderCode,
             p.provider AS provider, p.amount AS amount, p.payment_status AS status,
             p.payment_time AS paymentTime, p.created_at AS createdAt,
             COALESCE(po.user_id, b.user_id) AS customerId,
             COALESCE(order_bookings.bookingCodes, b.booking_code) AS bookingCodes,
             COALESCE(order_bookings.customers, u.full_name) AS customers,
             COALESCE(order_bookings.customerEmails, u.email) AS customerEmails,
             COALESCE(order_bookings.bookingStatuses, b.payment_status) AS bookingStatuses,
             CASE
               WHEN p.payment_status = 'Paid'
                 THEN COALESCE(order_bookings.bookingStatuses, b.payment_status) REGEXP '^(Paid|Refunded)(,(Paid|Refunded))*$'
               WHEN p.payment_status = 'Failed'
                 THEN COALESCE(order_bookings.bookingStatuses, b.payment_status) REGEXP '^(Cancelled)(,Cancelled)*$'
               WHEN p.payment_status = 'Cancelled'
                 THEN COALESCE(order_bookings.bookingStatuses, b.payment_status) REGEXP '^(Cancelled)(,Cancelled)*$'
               ELSE COALESCE(order_bookings.bookingStatuses, b.payment_status) REGEXP '^(Pending)(,Pending)*$'
             END AS consistent
      FROM payments p
      LEFT JOIN payment_orders po ON po.payment_order_id = p.payment_order_id
      LEFT JOIN bookings b ON b.booking_id = p.booking_id
      LEFT JOIN users u ON u.user_id = COALESCE(po.user_id, b.user_id)
      LEFT JOIN (
        SELECT poi.payment_order_id,
               GROUP_CONCAT(DISTINCT bo.booking_code ORDER BY bo.booking_code SEPARATOR ', ') AS bookingCodes,
               GROUP_CONCAT(DISTINCT bo.payment_status ORDER BY bo.payment_status SEPARATOR ',') AS bookingStatuses,
               GROUP_CONCAT(DISTINCT cu.full_name ORDER BY cu.full_name SEPARATOR ', ') AS customers,
               GROUP_CONCAT(DISTINCT cu.email ORDER BY cu.email SEPARATOR ', ') AS customerEmails
        FROM payment_order_items poi
        JOIN bookings bo ON bo.booking_id = poi.booking_id
        JOIN users cu ON cu.user_id = bo.user_id
        GROUP BY poi.payment_order_id
      ) order_bookings ON order_bookings.payment_order_id = p.payment_order_id
      UNION ALL
      SELECT CONCAT('wallet-', wt.wallet_transaction_id) AS id,
             COALESCE(wt.reference_code, CONCAT('WALLET-', wt.wallet_transaction_id)) AS transactionCode,
             b.booking_code AS orderCode, 'VietGo Wallet' AS provider,
             ABS(wt.amount) AS amount, 'Paid' AS status,
             wt.created_at AS paymentTime, wt.created_at AS createdAt,
             wt.user_id AS customerId,
             CONCAT_WS(', ', b.booking_code, related_booking.booking_code) AS bookingCodes,
             u.full_name AS customers, u.email AS customerEmails,
             CONCAT_WS(',', b.payment_status, related_booking.payment_status) AS bookingStatuses,
             (b.payment_status IN ('Paid', 'Refunded')
               AND (related_booking.payment_status IS NULL OR related_booking.payment_status IN ('Paid', 'Refunded'))) AS consistent
      FROM wallet_transactions wt
      JOIN users u ON u.user_id = wt.user_id
      LEFT JOIN bookings b ON b.booking_id = wt.booking_id
      LEFT JOIN bookings related_booking ON related_booking.booking_id = wt.related_booking_id
      WHERE wt.transaction_type = 'PAYMENT'
    `;
  }

  async getPayments(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const search = getSearch(filters);
    const { fromDate, toDate } = getDateFilter(filters);
    const conditions: string[] = [];
    const params: any[] = [];
    if (search) {
      conditions.push(`(transactionCode LIKE ? OR orderCode LIKE ? OR bookingCodes LIKE ?
        OR customers LIKE ? OR customerEmails LIKE ? OR provider LIKE ?)`);
      params.push(...Array(6).fill(`%${search}%`));
    }
    if (typeof filters.status === 'string' && filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (fromDate) {
      conditions.push('COALESCE(paymentTime, createdAt) >= ?');
      params.push(`${fromDate} 00:00:00`);
    }
    if (toDate) {
      conditions.push('COALESCE(paymentTime, createdAt) < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(toDate);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const source = this.getPaymentSourceQuery();
    const [statsRows]: any = await pool.query(
      `SELECT COUNT(*) AS totalTransactions,
              SUM(status = 'Paid') AS paidTransactions,
              SUM(status = 'Pending') AS pendingTransactions,
              SUM(status = 'Failed') AS failedTransactions,
              SUM(status = 'Cancelled') AS cancelledTransactions,
              COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0) AS totalCollected
       FROM (${source}) AS payment_rows ${where}`,
      params,
    );
    const [rows]: any = await pool.query(
      `SELECT * FROM (${source}) AS payment_rows ${where}
       ORDER BY COALESCE(paymentTime, createdAt) DESC
       LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM (${source}) AS payment_rows ${where}`,
      params,
    );
    const [customerRows]: any = await pool.query(
      `SELECT customerId, MAX(customers) AS customer, MAX(customerEmails) AS email,
              COUNT(*) AS totalTransactions, SUM(status = 'Paid') AS paidTransactions,
              SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END) AS totalPaidAmount
       FROM (${source}) AS payment_rows ${where}
       GROUP BY customerId
       HAVING SUM(status = 'Paid') > 0
       ORDER BY totalPaidAmount DESC
       LIMIT 10`,
      params,
    );
    return {
      ...pageResult(rows, countRows[0]?.total, options),
      statistics: Object.fromEntries(
        Object.entries(statsRows[0] ?? {}).map(([key, value]) => [key, asNumber(value)]),
      ),
      topCustomers: customerRows,
    };
  }

  async closeFailedPayment(paymentId: number) {
    if (!Number.isSafeInteger(paymentId) || paymentId < 1) {
      throw new CustomError('Mã giao dịch không hợp lệ.', 400);
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows]: any = await connection.query(
        `SELECT payment_id, payment_order_id, payment_status
         FROM payments WHERE payment_id = ? FOR UPDATE`,
        [paymentId],
      );
      if (rows.length === 0) throw new CustomError('Không tìm thấy giao dịch.', 404);
      if (rows[0].payment_status !== 'Failed') {
        throw new CustomError('Chỉ có thể đóng giao dịch đang ở trạng thái Failed.', 409);
      }
      await connection.query(
        `UPDATE payments SET payment_status = 'Cancelled'
         WHERE payment_id = ? AND payment_status = 'Failed'`,
        [paymentId],
      );
      if (rows[0].payment_order_id !== null) {
        await connection.query(
          `UPDATE payment_orders SET payment_status = 'Cancelled'
           WHERE payment_order_id = ? AND payment_status = 'Failed'`,
          [rows[0].payment_order_id],
        );
      }
      await connection.commit();
      return { status: 'Cancelled' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private getRefundSourceQuery(statusClause: string) {
    return `
      SELECT r.refund_id AS id, r.booking_id AS bookingId, b.booking_code AS bookingCode,
             b.user_id AS customerId, u.full_name AS customer, u.email, u.phone,
             GROUP_CONCAT(DISTINCT CONCAT(rt.departure_location, ' - ', rt.arrival_location)
               SEPARATOR '; ') AS route,
             MIN(tr.departure_time) AS departureTime, r.refund_amount AS refundAmount,
             b.total_amount AS totalAmount, r.reason, r.status, r.created_at AS createdAt
      FROM refund_requests r
      JOIN bookings b ON b.booking_id = r.booking_id
      JOIN users u ON u.user_id = b.user_id
      LEFT JOIN tickets tk ON tk.booking_id = b.booking_id
      LEFT JOIN seats s ON s.seat_id = tk.seat_id
      LEFT JOIN trips tr ON tr.trip_id = s.trip_id
      LEFT JOIN routes rt ON rt.route_id = tr.route_id
      WHERE r.status ${statusClause}
      GROUP BY r.refund_id, r.booking_id, b.booking_code, b.user_id, u.full_name, u.email,
               u.phone, r.refund_amount, b.total_amount, r.reason, r.status, r.created_at
    `;
  }

  async getRefunds(filters: AdminFilters = {}, history = false) {
    const options = getPageOptions(filters);
    const search = getSearch(filters);
    const params: any[] = [];
    const statusClause = history ? "IN ('Approved', 'Rejected')" : "= 'WaitRefund'";
    let source = this.getRefundSourceQuery(statusClause);
    if (search) {
      source = `SELECT * FROM (${source}) AS refund_rows
        WHERE bookingCode LIKE ? OR customer LIKE ? OR email LIKE ? OR reason LIKE ?`;
      params.push(...Array(4).fill(`%${search}%`));
    } else {
      source = `SELECT * FROM (${source}) AS refund_rows`;
    }
    const [countRows]: any = await pool.query(`SELECT COUNT(*) AS total FROM (${source}) AS filtered_refunds`, params);
    const [rows]: any = await pool.query(
      `SELECT * FROM (${source}) AS filtered_refunds
       ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    return pageResult(rows, countRows[0]?.total, options);
  }

  async processRefund(refundId: number, action: 'approve' | 'reject', adminUserId: number) {
    if (!Number.isSafeInteger(refundId) || refundId < 1) {
      throw new CustomError('Mã yêu cầu hoàn tiền không hợp lệ.', 400);
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [refundRows]: any = await connection.query(
        `SELECT r.refund_id, r.booking_id, r.refund_amount, r.status,
                b.user_id, b.booking_code, b.total_amount, b.payment_status
         FROM refund_requests r
         JOIN bookings b ON b.booking_id = r.booking_id
         WHERE r.refund_id = ?
         FOR UPDATE`,
        [refundId],
      );
      if (refundRows.length === 0) throw new CustomError('Không tìm thấy yêu cầu hoàn tiền.', 404);
      const refund = refundRows[0];
      if (refund.status !== 'WaitRefund') {
        throw new CustomError('Yêu cầu hoàn tiền không còn ở trạng thái WaitRefund.', 409);
      }

      if (action === 'reject') {
        await connection.query(
          `UPDATE refund_requests SET status = 'Rejected'
           WHERE refund_id = ? AND status = 'WaitRefund'`,
          [refundId],
        );
        await connection.commit();
        return { status: 'Rejected', message: 'Yêu cầu hoàn tiền đã bị từ chối.' };
      }

      if (refund.payment_status !== 'Paid') {
        throw new CustomError('Chỉ được hoàn tiền cho booking đang thanh toán Paid.', 409);
      }
      const refundAmount = asNumber(refund.refund_amount);
      if (refundAmount <= 0 || refundAmount > asNumber(refund.total_amount)) {
        throw new CustomError('Số tiền hoàn không hợp lệ so với booking.', 409);
      }
      const [existingRefunds]: any = await connection.query(
        `SELECT wallet_transaction_id FROM wallet_transactions
         WHERE booking_id = ? AND transaction_type = 'REFUND'
         LIMIT 1 FOR UPDATE`,
        [refund.booking_id],
      );
      if (existingRefunds.length > 0) {
        throw new CustomError(`Booking ${refund.booking_code} đã được hoàn tiền trước đó.`, 409);
      }
      const [users]: any = await connection.query(
        'SELECT wallet_balance FROM users WHERE user_id = ? FOR UPDATE',
        [refund.user_id],
      );
      if (users.length === 0) throw new CustomError('Không tìm thấy khách hàng.', 404);
      const balanceBefore = asNumber(users[0].wallet_balance);
      const balanceAfter = balanceBefore + refundAmount;
      await connection.query('UPDATE users SET wallet_balance = ? WHERE user_id = ?', [balanceAfter, refund.user_id]);
      await connection.query(
        `INSERT INTO wallet_transactions
         (user_id, booking_id, transaction_type, amount, balance_before, balance_after, reference_code, description)
         VALUES (?, ?, 'REFUND', ?, ?, ?, ?, ?)`,
        [
          refund.user_id,
          refund.booking_id,
          refundAmount,
          balanceBefore,
          balanceAfter,
          refund.booking_code,
          `Hoàn tiền cho booking ${refund.booking_code}`,
        ],
      );
      await recordSystemFinancialTransaction(connection, {
        accountCode: 'SYSTEM_WALLET',
        adminUserId,
        transactionType: 'REFUND',
        amount: -refundAmount,
        referenceCode: refund.booking_code,
        description: `Hoàn tiền booking ${refund.booking_code} vào ví khách hàng`,
      });
      await connection.query(
        `UPDATE seats s
         JOIN tickets tk ON tk.seat_id = s.seat_id
         SET s.status = 'Available'
         WHERE tk.booking_id = ? AND s.status = 'Booked'`,
        [refund.booking_id],
      );
      await connection.query(
        `UPDATE refund_requests SET status = 'Approved'
         WHERE refund_id = ? AND status = 'WaitRefund'`,
        [refundId],
      );
      await connection.query(
        `UPDATE bookings SET payment_status = 'Refunded'
         WHERE booking_id = ? AND payment_status = 'Paid'`,
        [refund.booking_id],
      );
      await connection.commit();
      return { status: 'Approved', message: 'Đã hoàn tiền vào ví khách hàng.' };
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') {
        throw new CustomError('Booking đã được hoàn tiền trước đó.', 409);
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPayouts(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const params: any[] = [];
    let where = 'WHERE 1 = 1';
    const search = getSearch(filters);
    if (search) {
      where += ` AND (CAST(pp.payout_id AS CHAR) LIKE ? OR pp.reference_code LIKE ?
        OR p.brand_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)`;
      params.push(...Array(5).fill(`%${search}%`));
    }
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM partner_payouts pp
       JOIN partner_profiles p ON p.partner_id = pp.partner_id
       JOIN users u ON u.user_id = p.partner_id
       ${where}`,
      params,
    );
    const [rows]: any = await pool.query(
      `SELECT pp.payout_id AS id, pp.partner_id AS partnerId,
              COALESCE(p.brand_name, u.full_name) AS partner, pp.amount, pp.status,
              pp.reference_code AS referenceCode, pp.created_at AS createdAt
       FROM partner_payouts pp
       JOIN partner_profiles p ON p.partner_id = pp.partner_id
       JOIN users u ON u.user_id = p.partner_id
       ${where}
       ORDER BY pp.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    return pageResult(rows, countRows[0]?.total, options);
  }

  async createPartnerPayout(partnerId: number, adminUserId: number, referenceCode: string) {
    if (!Number.isSafeInteger(partnerId) || partnerId < 1) {
      throw new CustomError('Mã đối tác không hợp lệ.', 400);
    }
    const reference = referenceCode.trim();
    if (!reference || reference.length > 100) {
      throw new CustomError('Mã tham chiếu không được rỗng và tối đa 100 ký tự.', 400);
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [partners]: any = await connection.query(
        `SELECT p.partner_id, p.withdrawable_balance, u.status
         FROM partner_profiles p
         JOIN users u ON u.user_id = p.partner_id
         WHERE p.partner_id = ? AND u.role = 'Partner'
         FOR UPDATE`,
        [partnerId],
      );
      if (partners.length === 0) throw new CustomError('Không tìm thấy đối tác.', 404);
      if (partners[0].status !== 'Active') {
        throw new CustomError('Chỉ có thể chi trả cho đối tác đang hoạt động.', 409);
      }
      const amount = asNumber(partners[0].withdrawable_balance);
      if (amount <= 0) throw new CustomError('Đối tác hiện không có số dư có thể chi trả.', 409);

      const [duplicateRows]: any = await connection.query(
        'SELECT payout_id FROM partner_payouts WHERE reference_code = ? LIMIT 1',
        [reference],
      );
      if (duplicateRows.length > 0) throw new CustomError('Mã tham chiếu chi trả đã được sử dụng.', 409);

      const [walletRows]: any = await connection.query(
        'SELECT wallet_balance FROM users WHERE user_id = ? FOR UPDATE',
        [partnerId],
      );
      const walletBefore = asNumber(walletRows[0]?.wallet_balance);
      const walletAfter = walletBefore + amount;
      await connection.query(
        `UPDATE partner_profiles SET withdrawable_balance = 0
         WHERE partner_id = ?`,
        [partnerId],
      );
      await connection.query('UPDATE users SET wallet_balance = ? WHERE user_id = ?', [walletAfter, partnerId]);
      await connection.query(
        `INSERT INTO wallet_transactions
         (user_id, transaction_type, amount, balance_before, balance_after, reference_code, description)
         VALUES (?, 'PARTNER_PAYOUT', ?, ?, ?, ?, ?)`,
        [
          partnerId,
          amount,
          walletBefore,
          walletAfter,
          reference,
          `Ghi nhận chi trả đối tác theo tham chiếu ${reference}`,
        ],
      );
      await recordSystemFinancialTransaction(connection, {
        accountCode: 'SYSTEM_WALLET',
        adminUserId,
        transactionType: 'PARTNER_PAYOUT',
        amount: -amount,
        referenceCode: reference,
        description: `Chi trả toàn bộ số dư cho đối tác #${partnerId}`,
      });
      const [payoutResult]: any = await connection.query(
        `INSERT INTO partner_payouts (partner_id, admin_user_id, amount, status, reference_code)
         VALUES (?, ?, ?, 'Paid', ?)`,
        [partnerId, adminUserId, amount, reference],
      );
      await connection.commit();
      return { id: payoutResult.insertId, amount, status: 'Paid', referenceCode: reference };
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') {
        throw new CustomError('Mã tham chiếu chi trả đã được sử dụng.', 409);
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async getFinancialActivity(filters: AdminFilters = {}) {
    const options = getPageOptions(filters);
    const search = getSearch(filters);
    const { fromDate, toDate } = getDateFilter(filters);
    const conditions: string[] = [];
    const params: any[] = [];
    if (typeof filters.status === 'string' && filters.status) {
      conditions.push('transactionType = ?');
      params.push(filters.status);
    }
    if (filters.direction === 'in') conditions.push('amount > 0');
    if (filters.direction === 'out') conditions.push('amount < 0');
    if (fromDate) {
      conditions.push('createdAt >= ?');
      params.push(`${fromDate} 00:00:00`);
    }
    if (toDate) {
      conditions.push('createdAt < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(toDate);
    }
    if (search) {
      conditions.push('(referenceCode LIKE ? OR description LIKE ? OR actor LIKE ? OR accountCode LIKE ?)');
      params.push(...Array(4).fill(`%${search}%`));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const source = `
      SELECT t.transaction_id AS id, t.transaction_type AS type, t.transaction_type AS transactionType,
             t.reference_code AS reference, t.reference_code AS referenceCode,
             COALESCE(u.full_name, 'VIETGO System') AS actor,
             t.description, t.amount, IF(t.amount >= 0, 'in', 'out') AS direction,
             t.account_code AS accountCode, t.created_at AS createdAt
      FROM system_financial_transactions t
      LEFT JOIN users u ON u.user_id = t.admin_user_id
    `;
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM (${source}) AS financial_rows ${where}`,
      params,
    );
    const [rows]: any = await pool.query(
      `SELECT * FROM (${source}) AS financial_rows ${where}
       ORDER BY createdAt DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, options.pageSize, options.offset],
    );
    return pageResult(rows, countRows[0]?.total, options);
  }

  private getActivitySourceQuery() {
    return `
      SELECT 'booking' AS type, b.booking_code AS reference, u.full_name AS actor,
             b.total_amount AS amount, b.payment_status AS status, b.created_at AS createdAt
      FROM bookings b JOIN users u ON u.user_id = b.user_id
      UNION ALL
      SELECT 'refund' AS type, b.booking_code AS reference, u.full_name AS actor,
             -r.refund_amount AS amount, r.status, r.created_at AS createdAt
      FROM refund_requests r
      JOIN bookings b ON b.booking_id = r.booking_id
      JOIN users u ON u.user_id = b.user_id
      UNION ALL
      SELECT 'payout' AS type, pp.reference_code AS reference,
             COALESCE(p.brand_name, u.full_name) AS actor, -pp.amount AS amount,
             pp.status, pp.created_at AS createdAt
      FROM partner_payouts pp
      JOIN users u ON u.user_id = pp.partner_id
      LEFT JOIN partner_profiles p ON p.partner_id = pp.partner_id
      UNION ALL
      SELECT t.transaction_type AS type, t.reference_code AS reference,
             COALESCE(u.full_name, 'VIETGO System') AS actor, t.amount,
             'Recorded' AS status, t.created_at AS createdAt
      FROM system_financial_transactions t
      LEFT JOIN users u ON u.user_id = t.admin_user_id
    `;
  }
}

export default new AdminService();
