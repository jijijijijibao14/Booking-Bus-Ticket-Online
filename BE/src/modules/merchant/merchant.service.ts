import pool from '../../config/database.js';
import type { PoolConnection } from 'mysql2/promise';
import { normalizeLocation } from '../../utils/normalize.util.js';
import { addHoursLocal, addMinutesLocal } from '../../utils/time.util.js';
import { generateBusSeats } from '../../utils/seats.util.js';
import { recordSystemFinancialTransaction } from '../../utils/system-financial.util.js';

class MerchantService {
  // Lấy hồ sơ đối tác (user + partner_profiles)
  async getMerchantProfile(partnerId: number) {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.query(
        `SELECT u.user_id as id, u.full_name as fullname, u.email, u.phone, p.brand_name
         FROM users u
         LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
         WHERE u.user_id = ? LIMIT 1`,
        [partnerId]
      );
      conn.release();
      return (rows as any)[0] || null;
    } catch (err) {
      throw new Error(`Lỗi lấy hồ sơ đối tác: ${err}`);
    }
  }

  async updateMerchantProfile(partnerId: number, payload: { full_name?: string; email?: string; phone?: string; brand_name?: string }) {
    try {
      const conn = await pool.getConnection();
      const [result] = await conn.query(
        `UPDATE users u
         LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
         SET u.full_name = COALESCE(?, u.full_name),
             u.email = COALESCE(?, u.email),
             u.phone = COALESCE(?, u.phone),
             p.brand_name = COALESCE(?, p.brand_name)
         WHERE u.user_id = ?`,
        [payload.full_name || null, payload.email || null, payload.phone || null, payload.brand_name || null, partnerId]
      );
      conn.release();
      return { updated: (result as any).affectedRows };
    } catch (err) {
      throw new Error(`Lỗi cập nhật hồ sơ đối tác: ${err}`);
    }
  }

  // Thống kê cơ bản cho dashboard
  async getMerchantStats(partnerId: number) {
    try {
      const conn = await pool.getConnection();

      const [chartRows] = await conn.query(
        `SELECT DATE_FORMAT(b.created_at, '%Y-%m') as month, COALESCE(SUM(tk.ticket_price) / 1000000, 0) as revenue
         FROM tickets tk
         JOIN bookings b ON tk.booking_id = b.booking_id
         LEFT JOIN seats s ON tk.seat_id = s.seat_id
         LEFT JOIN trips tr ON s.trip_id = tr.trip_id
         LEFT JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         LEFT JOIN partner_profiles p ON v.partner_id = p.partner_id
         WHERE p.partner_id = ? AND b.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
         GROUP BY DATE_FORMAT(b.created_at, '%Y-%m')
         ORDER BY DATE_FORMAT(b.created_at, '%Y-%m') ASC`,
        [partnerId]
      );

      const [revenueRows] = await conn.query(
        `SELECT
           COALESCE(SUM(CASE WHEN MONTH(b.created_at) = MONTH(NOW()) AND YEAR(b.created_at) = YEAR(NOW()) THEN tk.ticket_price ELSE 0 END), 0) as currentMonthRevenue,
           COALESCE(SUM(CASE WHEN MONTH(b.created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND YEAR(b.created_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)) THEN tk.ticket_price ELSE 0 END), 0) as previousMonthRevenue
         FROM tickets tk
         JOIN bookings b ON tk.booking_id = b.booking_id
         LEFT JOIN seats s ON tk.seat_id = s.seat_id
         LEFT JOIN trips tr ON s.trip_id = tr.trip_id
         LEFT JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         LEFT JOIN partner_profiles p ON v.partner_id = p.partner_id
         WHERE p.partner_id = ? AND (
           (MONTH(b.created_at) = MONTH(NOW()) AND YEAR(b.created_at) = YEAR(NOW())) OR
           (MONTH(b.created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND YEAR(b.created_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)))
         )`,
        [partnerId]
      );

      const [ticketsRow] = await conn.query(
        `SELECT COUNT(*) as ticketsSold
         FROM tickets tk
         JOIN bookings b ON tk.booking_id = b.booking_id
         LEFT JOIN seats s ON tk.seat_id = s.seat_id
         LEFT JOIN trips tr ON s.trip_id = tr.trip_id
         LEFT JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         LEFT JOIN partner_profiles p ON v.partner_id = p.partner_id
         WHERE p.partner_id = ? AND MONTH(b.created_at) = MONTH(NOW()) AND YEAR(b.created_at) = YEAR(NOW())`,
        [partnerId]
      );

      const [occupancyRow] = await conn.query(
        `SELECT
           ROUND((SUM(COALESCE(sold.count, 0)) / NULLIF(SUM(v.total_seats), 0)) * 100, 1) as occupancyRate
         FROM vehicles v
         LEFT JOIN (
           SELECT tr.vehicle_id, COUNT(*) as count
           FROM tickets tk
           LEFT JOIN seats s ON tk.seat_id = s.seat_id
           LEFT JOIN trips tr ON s.trip_id = tr.trip_id
           LEFT JOIN vehicles v2 ON tr.vehicle_id = v2.vehicle_id
           LEFT JOIN partner_profiles p2 ON v2.partner_id = p2.partner_id
           WHERE p2.partner_id = ?
           GROUP BY tr.vehicle_id
         ) sold ON sold.vehicle_id = v.vehicle_id
         LEFT JOIN partner_profiles p ON v.partner_id = p.partner_id
         WHERE p.partner_id = ?`,
        [partnerId, partnerId]
      );

      const [driverRows] = await conn.query(
        `SELECT
           COUNT(*) as totalDrivers,
           SUM(CASE WHEN status IN ('available', 'on-trip') THEN 1 ELSE 0 END) as activeDrivers
         FROM drivers
         WHERE partner_id = ?`,
        [partnerId]
      );

      const [todaySchedules] = await conn.query(
        `SELECT tr.trip_id as id, CONCAT(r.departure_location,' - ', r.arrival_location) as route,
                DATE_FORMAT(tr.departure_time, '%H:%i') as departure, v.vehicle_name as bus,
                dr.driver_name as driver, COALESCE(COUNT(tk.ticket_id), 0) as seats, tr.base_price as price
         FROM trips tr
         JOIN routes r ON tr.route_id = r.route_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         LEFT JOIN drivers dr ON tr.driver_id = dr.driver_id
         LEFT JOIN seats s ON s.trip_id = tr.trip_id
         LEFT JOIN tickets tk ON tk.seat_id = s.seat_id
         LEFT JOIN partner_profiles p ON v.partner_id = p.partner_id
         WHERE p.partner_id = ? AND DATE(tr.departure_time) = CURDATE()
         GROUP BY tr.trip_id
         LIMIT 3`,
        [partnerId]
      );

      const currentMonthRevenue = Number((revenueRows as any)[0]?.currentMonthRevenue || 0);
      const previousMonthRevenue = Number((revenueRows as any)[0]?.previousMonthRevenue || 0);
      const revenueGrowth = previousMonthRevenue === 0 ? 0 : Number((((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100).toFixed(1));
      const ticketsSold = Number((ticketsRow as any)[0]?.ticketsSold || 0);
      const occupancyRate = Number((occupancyRow as any)[0]?.occupancyRate || 0);
      const activeDrivers = Number((driverRows as any)[0]?.activeDrivers || 0);
      const totalDrivers = Number((driverRows as any)[0]?.totalDrivers || 0);

      const revenueChart = Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (5 - index));
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const existing = (chartRows as any[]).find((item: any) => item.month === monthKey);
        return {
          month: monthKey,
          revenue: Number(existing?.revenue || 0)
        };
      });

      const notifications = [
        {
          type: 'info',
          title: 'Hệ thống',
          message: `Đã có ${ticketsSold} vé bán trong tháng này.`
        },
        ...(occupancyRate < 50
          ? [{ type: 'warning', title: 'Cảnh báo', message: 'Tỷ lệ lấp đầy đang thấp, hãy xem lại lịch chạy để tối ưu doanh thu.' }]
          : [])
      ];

      conn.release();

      return {
        currentMonthRevenue,
        revenueGrowth,
        ticketsSold,
        occupancyRate,
        activeDrivers,
        totalDrivers,
        todaySchedules,
        notifications,
        revenueChart
      };
    } catch (err) {
      throw new Error(`Lỗi lấy thống kê: ${err}`);
    }
  }

  async getMerchantFleet(partnerId: number) {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.query(
        `SELECT v.vehicle_id as id, v.license_plate as plateNumber, v.vehicle_type as type, v.total_seats as seats,
                v.status as status, v.vehicle_name as name
         FROM vehicles v
         WHERE v.partner_id = ?
         ORDER BY v.vehicle_id`,
        [partnerId]
      );
      conn.release();
      return rows;
    } catch (err) {
      throw new Error(`Lỗi lấy danh sách xe: ${err}`);
    }
  }

  async createMerchantVehicle(partnerId: number, payload: { vehicle_name: string; license_plate: string; vehicle_type: string; total_seats: number; status?: string }) {
    try {
      const conn = await pool.getConnection();
      const [result] = await conn.query(
        `INSERT INTO vehicles (partner_id, vehicle_name, license_plate, vehicle_type, total_seats, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [partnerId, payload.vehicle_name, payload.license_plate, payload.vehicle_type, payload.total_seats, payload.status || 'active']
      );
      conn.release();
      return { insertId: (result as any).insertId };
    } catch (err) {
      throw new Error(`Lỗi tạo xe: ${err}`);
    }
  }

  async updateMerchantVehicle(partnerId: number, vehicleId: number, payload: { vehicle_name?: string; license_plate?: string; vehicle_type?: string; total_seats?: number; status?: string }) {
    try {
      const conn = await pool.getConnection();
      const [result] = await conn.query(
        `UPDATE vehicles SET vehicle_name = COALESCE(?, vehicle_name), license_plate = COALESCE(?, license_plate), vehicle_type = COALESCE(?, vehicle_type), total_seats = COALESCE(?, total_seats), status = COALESCE(?, status)
         WHERE vehicle_id = ? AND partner_id = ?`,
        [payload.vehicle_name || null, payload.license_plate || null, payload.vehicle_type || null, payload.total_seats || null, payload.status || null, vehicleId, partnerId]
      );
      conn.release();
      return { affectedRows: (result as any).affectedRows };
    } catch (err) {
      throw new Error(`Lỗi cập nhật xe: ${err}`);
    }
  }

  async deleteMerchantVehicle(partnerId: number, vehicleId: number) {
    try {
      const conn = await pool.getConnection();
      const [result] = await conn.query(
        `DELETE FROM vehicles WHERE vehicle_id = ? AND partner_id = ?`,
        [vehicleId, partnerId]
      );
      conn.release();
      return { affectedRows: (result as any).affectedRows };
    } catch (err) {
      throw new Error(`Lỗi xóa xe: ${err}`);
    }
  }

  async getMerchantDrivers(partnerId: number) {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.query(
        `SELECT dr.driver_id as id, dr.driver_name as name, dr.driver_phone as phone,
                dr.experience as experience, dr.status as status, 4.5 as rating
         FROM drivers dr
         WHERE dr.partner_id = ?
         ORDER BY dr.driver_id`,
        [partnerId]
      );
      conn.release();
      return rows;
    } catch (err) {
      throw new Error(`Lỗi lấy danh sách tài xế: ${err}`);
    }
  }

  async createMerchantDriver(partnerId: number, payload: { driver_name: string; driver_phone: string; experience?: number; status?: string }) {
    try {
      const conn = await pool.getConnection();

      // Kiểm tra trùng số điện thoại tài xế
      const [existingPhone] = await conn.query(
        `SELECT driver_id FROM drivers WHERE driver_phone = ?`,
        [payload.driver_phone]
      );
      if ((existingPhone as any).length > 0) {
        conn.release();
        throw new Error('Số điện thoại tài xế đã tồn tại trong hệ thống.');
      }

      const [result] = await conn.query(
        `INSERT INTO drivers (driver_name, driver_phone, experience, status, partner_id) VALUES (?, ?, ?, ?, ?)`,
        [payload.driver_name, payload.driver_phone, payload.experience, payload.status, partnerId]
      );
      conn.release();
      return { id: (result as any).insertId };
    } catch (err: any) {
      throw new Error(err.message || err);
    }
  }

  async updateMerchantDriver(partnerId: number, driverId: number, payload: { driver_name?: string; driver_phone?: string; experience?: number; status?: string }) {
    try {
      const conn = await pool.getConnection();

      // Kiểm tra trùng số điện thoại tài xế khi cập nhật
      if (payload.driver_phone) {
        const [existingPhone] = await conn.query(
          `SELECT driver_id FROM drivers WHERE driver_phone = ? AND driver_id != ?`,
          [payload.driver_phone, driverId]
        );
        if ((existingPhone as any).length > 0) {
          conn.release();
          throw new Error('Số điện thoại tài xế đã tồn tại trong hệ thống.');
        }
      }

      const [result] = await conn.query(
        `UPDATE drivers SET driver_name = COALESCE(?, driver_name), driver_phone = COALESCE(?, driver_phone), experience = COALESCE(?, experience), status = COALESCE(?, status) WHERE driver_id = ? AND partner_id = ?`,
        [payload.driver_name || null, payload.driver_phone || null, payload.experience || null, payload.status || null, driverId, partnerId]
      );
      conn.release();
      return { affectedRows: (result as any).affectedRows };
    } catch (err: any) {
      throw new Error(err.message || err);
    }
  }

  async deleteMerchantDriver(partnerId: number, driverId: number) {
    try {
      const conn = await pool.getConnection();
      const [result] = await conn.query(
        `DELETE FROM drivers WHERE driver_id = ? AND partner_id = ?`,
        [driverId, partnerId]
      );
      conn.release();
      return { affectedRows: (result as any).affectedRows };
    } catch (err) {
      throw new Error(`Lỗi xóa tài xế: ${err}`);
    }
  }


  private async settleCompletedTrip(connection: PoolConnection, tripId: number, partnerId: number) {
    await connection.beginTransaction();
    try {
      const [tripRows]: any = await connection.query(
        `SELECT tr.status, v.partner_id AS partnerId
         FROM trips tr
         JOIN vehicles v ON v.vehicle_id = tr.vehicle_id
         WHERE tr.trip_id = ?
         FOR UPDATE`,
        [tripId],
      );
      if (tripRows.length === 0 || tripRows[0].status !== 'Completed' || Number(tripRows[0].partnerId) !== partnerId) {
        await connection.rollback();
        return;
      }

      const [pendingRefundRows]: any = await connection.query(
        `SELECT rr.refund_id
         FROM refund_requests rr
         JOIN bookings b ON b.booking_id = rr.booking_id
         JOIN tickets tk ON tk.booking_id = b.booking_id
         JOIN seats s ON s.seat_id = tk.seat_id
         WHERE s.trip_id = ?
           AND b.payment_status = 'Paid'
           AND rr.status IN ('Pending', 'WaitRefund')
         LIMIT 1`,
        [tripId],
      );
      if (pendingRefundRows.length > 0) {
        await connection.commit();
        return;
      }

      const [settlementRows]: any = await connection.query(
        'SELECT trip_id FROM partner_trip_settlements WHERE trip_id = ?',
        [tripId],
      );
      if (settlementRows.length > 0) {
        await connection.commit();
        return;
      }

      const [settingsRows]: any = await connection.query(
        'SELECT commission_rate FROM system_commission_settings WHERE setting_id = 1 FOR UPDATE',
      );
      if (settingsRows.length === 0) throw new Error('Chưa có cấu hình hoa hồng hệ thống.');
      const commissionRate = Number(settingsRows[0].commission_rate);

      const [grossRows]: any = await connection.query(
        `SELECT COALESCE(SUM(tk.ticket_price), 0) AS grossAmount
         FROM tickets tk
         JOIN bookings b ON b.booking_id = tk.booking_id
         JOIN seats s ON s.seat_id = tk.seat_id
         WHERE s.trip_id = ? AND b.payment_status = 'Paid'`,
        [tripId],
      );
      const grossAmount = Math.round(Number(grossRows[0].grossAmount) * 100) / 100;
      const commissionAmount = Math.round((grossAmount * commissionRate / 100 + Number.EPSILON) * 100) / 100;
      const partnerAmount = Math.round((grossAmount - commissionAmount) * 100) / 100;

      await connection.query(
        `INSERT INTO partner_trip_settlements
         (trip_id, partner_id, gross_amount, commission_rate, commission_amount, partner_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tripId, partnerId, grossAmount, commissionRate, commissionAmount, partnerAmount],
      );
      if (commissionAmount > 0) {
        await recordSystemFinancialTransaction(connection, {
          accountCode: 'SYSTEM_WALLET',
          transactionType: 'COMMISSION',
          amount: -commissionAmount,
          referenceCode: `TRIP-${tripId}`,
          description: `Chuyển hoa hồng ${commissionRate}% từ chuyến #${tripId}`,
        });
        await recordSystemFinancialTransaction(connection, {
          accountCode: 'COMMISSION_WALLET',
          transactionType: 'COMMISSION',
          amount: commissionAmount,
          referenceCode: `TRIP-${tripId}`,
          description: `Hoa hồng ${commissionRate}% từ chuyến #${tripId}`,
        });
      }
      if (partnerAmount > 0) {
        await connection.query(
          'UPDATE partner_profiles SET withdrawable_balance = withdrawable_balance + ? WHERE partner_id = ?',
          [partnerAmount, partnerId],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  async processCompletedTrips(partnerId?: number) {
    const conn = await pool.getConnection();
    try {
      const partnerFilter = partnerId ? ' AND v.partner_id = ?' : '';
      const partnerParams = partnerId ? [partnerId] : [];
      await conn.query(
        `UPDATE trips tr
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET tr.status = 'Departed'
         WHERE tr.departure_time <= NOW()
           AND tr.status = 'Scheduled'
           ${partnerFilter}`,
        partnerParams
      );

      await conn.query(
        `UPDATE trips tr
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET tr.status = 'Completed', tr.completed_at = COALESCE(tr.completed_at, NOW())
         WHERE tr.arrival_time <= NOW()
           AND tr.status = 'Departed'
           ${partnerFilter}`,
        partnerParams
      );

      await conn.query(
        `UPDATE trips tr
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET tr.completed_at = COALESCE(tr.actual_arrival_time, tr.arrival_time, NOW())
         WHERE tr.status = 'Completed'
           AND tr.completed_at IS NULL
           ${partnerFilter}`,
        partnerParams
      );

      const [unsettledTrips]: any = await conn.query(
        `SELECT tr.trip_id AS tripId, v.partner_id AS partnerId
         FROM trips tr
         JOIN vehicles v ON v.vehicle_id = tr.vehicle_id
         LEFT JOIN partner_trip_settlements pts ON pts.trip_id = tr.trip_id
         WHERE tr.status = 'Completed' AND pts.trip_id IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM refund_requests rr
             JOIN bookings b ON b.booking_id = rr.booking_id
             JOIN tickets tk ON tk.booking_id = b.booking_id
             JOIN seats s ON s.seat_id = tk.seat_id
             WHERE s.trip_id = tr.trip_id
               AND b.payment_status = 'Paid'
               AND rr.status IN ('Pending', 'WaitRefund')
           )${partnerFilter}`,
        partnerParams,
      );
      for (const trip of unsettledTrips) {
        await this.settleCompletedTrip(conn, Number(trip.tripId), partnerId ?? Number(trip.partnerId));
      }
      return unsettledTrips.length;
    } catch (err) {
      throw new Error(`Lỗi quyết toán chuyến hoàn thành: ${err}`);
    } finally {
      conn.release();
    }
  }

  async getMerchantSchedules(partnerId: number) {
    await this.processCompletedTrips(partnerId);
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE drivers dr
         JOIN trips tr ON dr.driver_id = tr.driver_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET dr.status = 'on-trip'
         WHERE tr.departure_time <= NOW()
           AND tr.arrival_time > NOW()
           AND tr.status = 'Departed'
           AND v.partner_id = ?
           AND dr.status <> 'on-trip'`,
        [partnerId]
      );

      await conn.query(
        `UPDATE drivers dr
         JOIN trips tr ON dr.driver_id = tr.driver_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET dr.status = 'available'
         WHERE tr.status = 'Completed'
           AND v.partner_id = ?
           AND dr.status = 'on-trip'
           AND NOT EXISTS (
             SELECT 1 FROM trips t2
             WHERE t2.driver_id = dr.driver_id
               AND t2.status = 'Departed'
               AND t2.arrival_time > NOW()
           )`,
        [partnerId]
      );

      const [rows] = await conn.query(
        `SELECT tr.trip_id as id, tr.status as status, r.route_id as routeId, r.departure_location as departureLocation, r.arrival_location as arrivalLocation,
                CONCAT(r.departure_location,' - ', r.arrival_location) as route, v.vehicle_id as vehicleId, v.vehicle_name as bus,
                tr.driver_id as driverId, dr.driver_name as driver, dr.status as driverStatus,
                DATE_FORMAT(tr.departure_time, '%Y-%m-%dT%H:%i') as departureTime,
                DATE_FORMAT(tr.arrival_time, '%Y-%m-%dT%H:%i') as arrivalTime,
                tr.estimated_duration_minutes as estimatedDurationMinutes,
                tr.minimum_turnaround_minutes as minimumTurnaroundMinutes,
                tr.actual_departure_time as actualDepartureTime,
                tr.actual_arrival_time as actualArrivalTime,
                DATE_FORMAT(tr.departure_time, '%H:%i') as departure, COALESCE(COUNT(tk.ticket_id),0) as seats, tr.base_price as price
         FROM trips tr
         JOIN routes r ON tr.route_id = r.route_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         LEFT JOIN drivers dr ON tr.driver_id = dr.driver_id
         LEFT JOIN seats s ON s.trip_id = tr.trip_id
         LEFT JOIN tickets tk ON tk.seat_id = s.seat_id
         LEFT JOIN partner_profiles p ON v.partner_id = p.partner_id
        WHERE p.partner_id = ? AND tr.status != 'Cancelled'
         GROUP BY tr.trip_id
         ORDER BY tr.departure_time ASC
         LIMIT 50`,
        [partnerId]
      );
      return rows;
    } catch (err) {
      throw new Error(`Lỗi lấy lịch trình: ${err}`);
    } finally {
      conn.release();
    }
  }

  async createMerchantSchedule(partnerId: number, payload: { departure_location: string; arrival_location: string; vehicle_id: number; driver_id?: number; departure_time: string; arrival_time?: string; estimated_duration_minutes?: number; base_price: number }) {
    const conn = await pool.getConnection();
    let transactionStarted = false;
    try {
      await conn.beginTransaction();
      transactionStarted = true;
      const [vehicleRows] = await conn.query(
        `SELECT vehicle_type, total_seats, status
         FROM vehicles
         WHERE vehicle_id = ? AND partner_id = ?
         FOR UPDATE`,
        [payload.vehicle_id, partnerId]
      );
      if ((vehicleRows as any).length === 0) {
        throw new Error('Xe không tồn tại hoặc không thuộc đối tác.');
      }
      const { vehicle_type: vehicleType, total_seats: totalSeats } = (vehicleRows as any)[0];
      if (String((vehicleRows as any)[0].status).toLowerCase() !== 'active') {
        throw new Error('Xe đang không hoạt động.');
      }

      if (payload.driver_id) {
        const [driverRows] = await conn.query(
          `SELECT driver_id
           FROM drivers
           WHERE driver_id = ? AND partner_id = ? AND status = 'available'
           FOR UPDATE`,
          [payload.driver_id, partnerId]
        );
        if ((driverRows as any).length === 0) {
          throw new Error('Tài xế không tồn tại hoặc không khả dụng.');
        }
      }

      const departureTime = payload.departure_time;
      const estimatedDurationMinutes = payload.estimated_duration_minutes ?? null;
      if (!Number.isFinite(new Date(departureTime).getTime())) {
        throw new Error('Thời gian khởi hành không hợp lệ.');
      }
      if (!Number.isFinite(payload.base_price) || payload.base_price < 0) {
        throw new Error('Giá vé phải là số không âm.');
      }
      const arrivalTime = estimatedDurationMinutes
        ? addMinutesLocal(departureTime, estimatedDurationMinutes)
        : payload.arrival_time || addHoursLocal(departureTime, 24);
      if (new Date(arrivalTime).getTime() <= new Date(departureTime).getTime()) {
        throw new Error('Thời gian đến phải sau thời gian khởi hành.');
      }
      const [vehicleConflictRows] = await conn.query(
        `SELECT trip_id
         FROM trips
         WHERE vehicle_id = ?
           AND status <> 'Cancelled'
           AND departure_time < DATE_ADD(?, INTERVAL 60 MINUTE)
           AND arrival_time > DATE_SUB(?, INTERVAL 60 MINUTE)
         LIMIT 1`,
        [payload.vehicle_id, arrivalTime, departureTime],
      );
      if ((vehicleConflictRows as any).length > 0) {
        throw new Error('Xe đang có chuyến trùng giờ hoặc chưa đủ 60 phút nghỉ/quay đầu.');
      }
      if (payload.driver_id) {
        const [conflictRows] = await conn.query(
          `SELECT trip_id FROM trips
           WHERE driver_id = ?
             AND status != 'Cancelled'
             AND NOT (arrival_time <= ? OR departure_time >= ?)`,
          [payload.driver_id, departureTime, arrivalTime]
        );
        if ((conflictRows as any).length > 0) {
          throw new Error('Tài xế đã được phân công cho chuyến khác.');
        }
      }

      const normalizedFrom = normalizeLocation(payload.departure_location);
      const normalizedTo = normalizeLocation(payload.arrival_location);

      const [routeRows] = await conn.query(
        `SELECT route_id FROM routes WHERE departure_location = ? AND arrival_location = ? AND vehicle_type = ?`,
        [normalizedFrom, normalizedTo, vehicleType]
      );
      let routeId;
      if ((routeRows as any).length > 0) {
        routeId = (routeRows as any)[0].route_id;
      } else {
        const [routeResult] = await conn.query(
          `INSERT INTO routes (departure_location, arrival_location, vehicle_type) VALUES (?, ?, ?)`,
          [normalizedFrom, normalizedTo, vehicleType]
        );
        routeId = (routeResult as any).insertId;
      }

      const [result] = await conn.query(
        `INSERT INTO trips (
           route_id, vehicle_id, driver_id, departure_time, arrival_time,
           estimated_duration_minutes, minimum_turnaround_minutes, base_price, status
         ) VALUES (?, ?, ?, ?, ?, ?, 60, ?, 'Scheduled')`,
        [routeId, payload.vehicle_id, payload.driver_id || null, departureTime, arrivalTime, estimatedDurationMinutes, payload.base_price]
      );
      const tripId = (result as any).insertId;

      if (vehicleType === 'Bus') {
        const seats = generateBusSeats(tripId, totalSeats);
        const values = seats.map(s => [s.trip_id, s.seat_code, s.floor, s.row, s.position, s.status]);
        await conn.query(
          `INSERT INTO seats (trip_id, seat_code, floor, \`row\`, position, status) VALUES ?`,
          [values]
        );
      }

      await conn.commit();
      transactionStarted = false;
      return { id: tripId };
    } catch (err: any) {
      if (transactionStarted) await conn.rollback();
      throw new Error(`Lỗi tạo lịch trình: ${err.message}`);
    } finally {
      conn.release();
    }
  }

  async updateMerchantSchedule(partnerId: number, tripId: number, payload: { departure_location?: string; arrival_location?: string; vehicle_id?: number; driver_id?: number; departure_time?: string; arrival_time?: string; estimated_duration_minutes?: number; base_price?: number; status?: string }) {
    const conn = await pool.getConnection();
    let transactionStarted = false;
    try {
      await conn.beginTransaction();
      transactionStarted = true;
      const [existingRows] = await conn.query(
        `SELECT tr.trip_id, tr.route_id, tr.vehicle_id, tr.driver_id,
                tr.departure_time, tr.arrival_time, tr.estimated_duration_minutes,
                tr.status, tr.actual_departure_time, v.vehicle_type,
                (tr.departure_time <= CURRENT_TIMESTAMP OR tr.actual_departure_time IS NOT NULL) AS hasStarted
         FROM trips tr
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         WHERE tr.trip_id = ? AND v.partner_id = ?
         FOR UPDATE`,
        [tripId, partnerId]
      );
      if ((existingRows as any).length === 0) {
        throw new Error('Lịch trình không tồn tại hoặc không thuộc đối tác.');
      }
      const existing = (existingRows as any)[0];
      const changesSchedule = payload.departure_location !== undefined
        || payload.arrival_location !== undefined
        || payload.vehicle_id !== undefined
        || payload.departure_time !== undefined
        || payload.arrival_time !== undefined
        || payload.estimated_duration_minutes !== undefined
        || payload.base_price !== undefined;
      const [ticketRows] = await conn.query(
        `SELECT COUNT(*) AS ticketCount
         FROM tickets tk
         JOIN seats s ON s.seat_id = tk.seat_id
         WHERE s.trip_id = ?`,
        [tripId],
      );
      const ticketCount = Number((ticketRows as any)[0]?.ticketCount || 0);
      if (ticketCount > 0 && (changesSchedule || payload.status === 'Cancelled')) {
        throw new Error('Chuyến đã có vé; không thể thay đổi giờ, xe, tuyến, giá hoặc hủy chuyến trực tiếp.');
      }
      if (Boolean(existing.hasStarted) && changesSchedule) {
        throw new Error('Chuyến đã bắt đầu; không thể thay đổi thông tin vận hành.');
      }
      if (
        existing.status !== 'Scheduled' &&
        payload.status === 'Scheduled'
      ) {
        throw new Error('Không thể đưa chuyến đã bắt đầu hoặc hoàn tất về trạng thái đã lên lịch.');
      }
      let routeId = existing.route_id;
      let vehicleType = existing.vehicle_type;
      let vehicleId = existing.vehicle_id;

      if (payload.vehicle_id && payload.vehicle_id !== existing.vehicle_id) {
        const [vehicleRows] = await conn.query(
          `SELECT vehicle_type, status FROM vehicles WHERE vehicle_id = ? AND partner_id = ?`,
          [payload.vehicle_id, partnerId]
        );
        if ((vehicleRows as any).length === 0) {
          throw new Error('Xe không tồn tại hoặc không thuộc đối tác.');
        }
        if (String((vehicleRows as any)[0].status).toLowerCase() !== 'active') {
          throw new Error('Xe mới đang không hoạt động.');
        }
        vehicleType = (vehicleRows as any)[0].vehicle_type;
        vehicleId = payload.vehicle_id;
      }

      if (payload.driver_id && payload.driver_id !== existing.driver_id) {
        const [driverRows] = await conn.query(
          `SELECT driver_id FROM drivers WHERE driver_id = ? AND partner_id = ? AND status = 'available'`,
          [payload.driver_id, partnerId]
        );
        if ((driverRows as any).length === 0) {
          throw new Error('Tài xế không tồn tại hoặc không khả dụng.');
        }
      }

      const effectiveDepartureTime = payload.departure_time || existing.departure_time;
      const effectiveEstimatedDuration = payload.estimated_duration_minutes
        ?? (existing.estimated_duration_minutes == null ? null : Number(existing.estimated_duration_minutes));
      const effectiveArrivalTime = payload.arrival_time
        || (payload.departure_time && effectiveEstimatedDuration
          ? addMinutesLocal(effectiveDepartureTime, effectiveEstimatedDuration)
          : payload.departure_time
            ? addHoursLocal(payload.departure_time, 24)
            : existing.arrival_time);
      const driverToCheck = payload.driver_id !== undefined ? payload.driver_id : existing.driver_id;
      const [vehicleConflictRows] = await conn.query(
        `SELECT trip_id
         FROM trips
         WHERE vehicle_id = ?
           AND status <> 'Cancelled'
           AND trip_id <> ?
           AND departure_time < DATE_ADD(?, INTERVAL 60 MINUTE)
           AND arrival_time > DATE_SUB(?, INTERVAL 60 MINUTE)
         LIMIT 1`,
        [vehicleId, tripId, effectiveArrivalTime, effectiveDepartureTime],
      );
      if ((vehicleConflictRows as any).length > 0) {
        throw new Error('Xe đang có chuyến trùng giờ hoặc chưa đủ 60 phút nghỉ/quay đầu.');
      }
      if (driverToCheck) {
        const [conflictRows] = await conn.query(
          `SELECT trip_id FROM trips
           WHERE driver_id = ?
             AND status != 'Cancelled'
             AND NOT (arrival_time <= ? OR departure_time >= ?)
             AND trip_id != ?`,
          [driverToCheck, effectiveDepartureTime, effectiveArrivalTime, tripId]
        );
        if ((conflictRows as any).length > 0) {
          throw new Error('Tài xế đã được phân công cho chuyến khác trong cùng khung giờ.');
        }
      }

      if (payload.departure_location && payload.arrival_location) {
        const normalizedFrom = normalizeLocation(payload.departure_location);
        const normalizedTo = normalizeLocation(payload.arrival_location);
        const [routeRows] = await conn.query(
          `SELECT route_id FROM routes WHERE departure_location = ? AND arrival_location = ? AND vehicle_type = ?`,
          [normalizedFrom, normalizedTo, vehicleType]
        );
        if ((routeRows as any).length > 0) {
          routeId = (routeRows as any)[0].route_id;
        } else {
          const [routeResult] = await conn.query(
            `INSERT INTO routes (departure_location, arrival_location, vehicle_type) VALUES (?, ?, ?)`,
            [normalizedFrom, normalizedTo, vehicleType]
          );
          routeId = (routeResult as any).insertId;
        }
      }

      const [result] = await conn.query(
        `UPDATE trips SET route_id = ?, vehicle_id = ?, driver_id = COALESCE(?, driver_id),
          departure_time = COALESCE(?, departure_time), arrival_time = COALESCE(?, arrival_time),
          estimated_duration_minutes = COALESCE(?, estimated_duration_minutes),
          base_price = COALESCE(?, base_price), status = COALESCE(?, status)
         WHERE trip_id = ?`,
        [
          routeId,
          vehicleId,
          payload.driver_id ?? null,
          payload.departure_time || null,
          effectiveArrivalTime || null,
          effectiveEstimatedDuration,
          payload.base_price ?? null,
          payload.status || null,
          tripId,
        ]
      );
      await conn.commit();
      transactionStarted = false;
      return { affectedRows: (result as any).affectedRows };
    } catch (err: any) {
      if (transactionStarted) await conn.rollback();
      throw new Error(`Lỗi cập nhật lịch trình: ${err.message}`);
    } finally {
      conn.release();
    }
  }

  async deleteMerchantSchedule(partnerId: number, tripId: number) {
    try {
      const conn = await pool.getConnection();

      //Kiểm tra xem lịch trình có tồn tại và thuộc đối tác hay không
      const [existingRows] = await conn.query(
        `SELECT tr.trip_id FROM trips tr 
        JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
        WHERE tr.trip_id = ? AND v.partner_id = ?`,
        [tripId, partnerId]
      );
      if ((existingRows as any).length === 0) {
        conn.release();
        return { affectedRows: 0 }; // Lịch trình không tồn tại hoặc không thuộc đối tác
      }

      //Kiểm tra đã có vé bán cho chuyến hay chưa, nếu có thì không cho xóa
      const [ticketCountRows] = await conn.query(
        `SELECT COUNT(*) as cnt
        FROM tickets tk
        JOIN seats s ON tk.seat_id = s.seat_id
        WHERE s.trip_id = ?`,
        [tripId]
      );
      const soldCount = Number((ticketCountRows as any)[0]?.cnt || 0);
      if (soldCount > 0) {
        conn.release();
        throw new Error('Không thể xóa lịch trình đã có vé bán.');
      }

      // Nếu không có vé bán, xóa ghê trước r xóa chuyến
      await conn.beginTransaction();
      try{
        await conn.query(`DELETE FROM seats WHERE trip_id = ?`, [tripId]);
      const [result] = await conn.query(
        `DELETE tr FROM trips tr
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         WHERE tr.trip_id = ? AND v.partner_id = ?`,
        [tripId, partnerId]
      );
        await conn.commit();
        conn.release();
        return { affectedRows: (result as any).affectedRows };
      }catch(txErr){
        await conn.rollback();
        conn.release();
        throw txErr;
      }
    } catch (err: any) {
      throw new Error(`Lỗi xóa lịch trình: ${err?.message || err}`);
    }
  }

  async getMerchantRefunds(partnerId: number) {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.query(
        `SELECT
           r.refund_id as id,
           ANY_VALUE(b.booking_code) as bookingCode,
           ANY_VALUE(u.full_name) as customer,
           ANY_VALUE(CONCAT(rt.departure_location, ' - ', rt.arrival_location)) as route,
           ANY_VALUE(b.total_amount) as totalAmount,
           ANY_VALUE(r.refund_amount) as refundAmount,
           ROUND((ANY_VALUE(r.refund_amount) / NULLIF(ANY_VALUE(b.total_amount), 0)) * 100, 0) as refundPercent,
           ANY_VALUE(r.reason) as reason,
           ANY_VALUE(r.status) as status,
           ANY_VALUE(r.created_at) as createdAt
         FROM refund_requests r
         JOIN bookings b ON r.booking_id = b.booking_id
         JOIN users u ON b.user_id = u.user_id
         LEFT JOIN tickets tk ON b.booking_id = tk.booking_id
         LEFT JOIN seats s ON tk.seat_id = s.seat_id
         JOIN trips tr ON tr.trip_id = s.trip_id
         JOIN routes rt ON tr.route_id = rt.route_id
         WHERE r.partner_id = ?
         GROUP BY r.refund_id
         ORDER BY ANY_VALUE(r.created_at) DESC`,
        [partnerId]
      );
      conn.release();
      return rows;
    } catch (err: any) {
      throw new Error(`Lỗi lấy thông tin hoàn tiền: ${err.message}`);
    }
  }

  async approveMerchantRefund(partnerId: number, refundId: number) {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const [rows]: any = await conn.query(
        `SELECT status
         FROM refund_requests
         WHERE refund_id = ? AND partner_id = ?
         LIMIT 1`,
        [refundId, partnerId]
      );

      if ((rows as any).length === 0) {
        throw new Error('Không tìm thấy yêu cầu hoàn tiền hoặc không thuộc quyền của bạn.');
      }

      const refund = (rows as any)[0];
      if (refund.status !== 'Pending') {
        throw new Error('Yêu cầu hoàn tiền này không ở trạng thái Pending.');
      }

      await conn.query(`UPDATE refund_requests SET status = 'WaitRefund' WHERE refund_id = ?`, [refundId]);

      await conn.commit();
      conn.release();
      return { success: true, message: 'Yêu cầu hoàn tiền đã được duyệt. Trạng thái hiện tại là đang chờ hoàn tiền.' };
    } catch (err: any) {
      await conn.rollback();
      conn.release();
      throw new Error(`Lỗi duyệt hoàn tiền: ${err.message}`);
    }
  }

  async rejectMerchantRefund(partnerId: number, refundId: number) {
    try {
      const conn = await pool.getConnection();
      const [result]: any = await conn.query(
        `UPDATE refund_requests
         SET status = 'Rejected'
         WHERE refund_id = ? AND partner_id = ? AND status = 'Pending'`,
        [refundId, partnerId]
      );

      conn.release();
      if (result.affectedRows === 0) {
        throw new Error('Không tìm thấy yêu cầu hoàn tiền Pending hoặc không thuộc quyền của bạn.');
      }

      return { success: true, message: 'Yêu cầu hoàn tiền đã bị từ chối.' };
    } catch (err: any) {
      throw new Error(`Lỗi từ chối hoàn tiền: ${err.message}`);
    }
  }

  async getMerchantWallet(partnerId: number) {
    try {
      const conn = await pool.getConnection();
      const [wallet]: any = await conn.query(
        `SELECT wallet_balance FROM users WHERE role = 'Partner' AND user_id = ?`,
        [partnerId]
      );
      conn.release();
      return wallet[0];
    } catch (err: any) {
      throw new Error(`Lỗi khi lấy thông tin ví nhà xe: ${err.message}`);
    }
  }
}

export default new MerchantService();
