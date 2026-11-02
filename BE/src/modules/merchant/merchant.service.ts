import pool from '../../config/database.js';
import { normalizeLocation } from '../../utils/normalize.util.js';
import { addHoursLocal, addMinutesLocal } from '../../utils/time.util.js';
import { generateBusSeats } from '../../utils/seats.util.js';
import { recordSystemFinancialTransaction } from '../../utils/system-financial.util.js';
import {
  assertPhoneAvailable,
  normalizeVietnameseLicensePlate,
  normalizeVietnamesePhone,
} from '../../utils/contact-validation.util.js';
import type { PoolConnection } from 'mysql2/promise';

function validateSecondaryDriverIds(value: number[] | undefined, primaryDriverId?: number): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((driverId) => !Number.isSafeInteger(driverId) || driverId <= 0)) {
    throw new Error('Danh sách tài xế phụ không hợp lệ.');
  }
  if (new Set(value).size !== value.length) {
    throw new Error('Tài xế phụ không được chọn trùng nhau.');
  }
  if (primaryDriverId != null && value.includes(primaryDriverId)) {
    throw new Error('Tài xế chính không thể đồng thời là tài xế phụ.');
  }
  return value;
}

function parseStoredDriverIds(value: unknown): number[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',')
    .map((driverId) => Number(driverId))
    .filter((driverId) => Number.isSafeInteger(driverId) && driverId > 0);
}

class MerchantService {
  private async settleCompletedTrips(connection: PoolConnection, partnerId: number) {
    const [trips]: any = await connection.query(
      `SELECT tr.trip_id, v.partner_id
       FROM trips tr
       JOIN vehicles v ON v.vehicle_id = tr.vehicle_id
       WHERE v.partner_id = ? AND tr.status = 'Completed'
         AND NOT EXISTS (
           SELECT 1 FROM partner_trip_settlements pts WHERE pts.trip_id = tr.trip_id
         )
       ORDER BY tr.trip_id
       FOR UPDATE`,
      [partnerId],
    );
    if (trips.length === 0) return;

    const [settings]: any = await connection.query(
      `SELECT commission_rate
       FROM system_commission_settings
       WHERE setting_id = 1
       FOR UPDATE`,
    );
    if (settings.length === 0) {
      throw new Error('Chưa có cấu hình hoa hồng hệ thống.');
    }
    const commissionRate = Number(settings[0].commission_rate);

    for (const trip of trips) {
      const [revenueRows]: any = await connection.query(
        `SELECT COALESCE(SUM(tk.ticket_price), 0) AS grossAmount
         FROM tickets tk
         JOIN bookings b ON b.booking_id = tk.booking_id
         JOIN seats s ON s.seat_id = tk.seat_id
         WHERE s.trip_id = ? AND b.payment_status = 'Paid'`,
        [trip.trip_id],
      );
      const grossAmount = Number(Number(revenueRows[0]?.grossAmount ?? 0).toFixed(2));
      const commissionAmount = Number((grossAmount * commissionRate / 100).toFixed(2));
      const partnerAmount = Number((grossAmount - commissionAmount).toFixed(2));

      await connection.query(
        `INSERT INTO partner_trip_settlements
         (trip_id, partner_id, gross_amount, commission_rate, commission_amount, partner_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [trip.trip_id, trip.partner_id, grossAmount, commissionRate, commissionAmount, partnerAmount],
      );
      if (partnerAmount > 0) {
        await connection.query(
          `UPDATE partner_profiles
           SET withdrawable_balance = withdrawable_balance + ?
           WHERE partner_id = ?`,
          [partnerAmount, trip.partner_id],
        );
      }
      if (commissionAmount > 0) {
        await recordSystemFinancialTransaction(connection, {
          accountCode: 'SYSTEM_WALLET',
          transactionType: 'COMMISSION',
          amount: -commissionAmount,
          referenceCode: `TRIP-${trip.trip_id}`,
          description: `Chuyển hoa hồng ${commissionRate}% từ chuyến #${trip.trip_id}`,
        });
        await recordSystemFinancialTransaction(connection, {
          accountCode: 'COMMISSION_WALLET',
          transactionType: 'COMMISSION',
          amount: commissionAmount,
          referenceCode: `TRIP-${trip.trip_id}`,
          description: `Hoa hồng ${commissionRate}% từ chuyến #${trip.trip_id}`,
        });
      }
    }
  }

  private async assertSecondaryDriversAvailable(
    connection: PoolConnection,
    partnerId: number,
    driverIds: number[],
  ) {
    if (driverIds.length === 0) return;
    const [driverRows] = await connection.query(
      `SELECT driver_id, status
       FROM drivers
       WHERE driver_id IN (?) AND partner_id = ?
       FOR UPDATE`,
      [driverIds, partnerId],
    );
    const rows = driverRows as Array<{ driver_id: number; status: string }>;
    if (
      rows.length !== driverIds.length ||
      rows.some((driver) => driver.status !== 'available')
    ) {
      throw new Error('Một hoặc nhiều tài xế phụ không tồn tại, không thuộc nhà xe hoặc không khả dụng.');
    }
  }

  private async assertDriversNotReservedByTrips(
    connection: PoolConnection,
    partnerId: number,
    driverIds: number[],
    startDate: string,
    endDate: string,
    excludedTripId?: number | null,
  ) {
    if (driverIds.length === 0) return;
    const excludedTripClause = excludedTripId
      ? 'AND tr.trip_id <> ?'
      : '';
    const [rows] = await connection.query(
      `SELECT tr.trip_id
       FROM trips tr
       JOIN vehicles v ON v.vehicle_id = tr.vehicle_id
       WHERE v.partner_id = ?
         AND tr.status <> 'Cancelled'
         AND DATE(tr.departure_time) <= ?
         AND DATE(tr.arrival_time) >= ?
         AND (
           tr.driver_id IN (?)
           OR EXISTS (
             SELECT 1
             FROM trip_secondary_drivers tsd
             WHERE tsd.trip_id = tr.trip_id
               AND tsd.driver_id IN (?)
           )
         )
         ${excludedTripClause}
       LIMIT 1
       FOR UPDATE`,
      [
        partnerId,
        endDate,
        startDate,
        driverIds,
        driverIds,
        ...(excludedTripId ? [excludedTripId] : []),
      ],
    );
    if ((rows as any[]).length > 0) {
      throw new Error('Một hoặc nhiều tài xế đã được phân công cho lịch chạy trong khoảng ngày đã chọn.');
    }
  }

  private async refreshPartnerTripStatuses(connection: PoolConnection, partnerId: number) {
    await connection.beginTransaction();
    try {
      await connection.query(
        `UPDATE trips tr
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET tr.status = 'Departed'
         WHERE tr.departure_time <= NOW()
           AND tr.status = 'Scheduled'
           AND v.partner_id = ?`,
        [partnerId],
      );

      await connection.query(
        `UPDATE trips tr
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET tr.status = 'Completed',
             tr.completed_at = COALESCE(tr.completed_at, NOW())
         WHERE tr.arrival_time <= NOW()
           AND tr.status = 'Departed'
           AND v.partner_id = ?`,
        [partnerId],
      );

      await connection.query(
        `UPDATE drivers dr
         JOIN trips tr ON dr.driver_id = tr.driver_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET dr.status = 'on-trip'
         WHERE tr.departure_time <= NOW()
           AND tr.arrival_time > NOW()
           AND tr.status = 'Departed'
           AND v.partner_id = ?
           AND dr.status <> 'on-trip'`,
        [partnerId],
      );

      await connection.query(
        `UPDATE drivers dr
         JOIN trip_secondary_drivers tsd ON tsd.driver_id = dr.driver_id
         JOIN trips tr ON tr.trip_id = tsd.trip_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET dr.status = 'on-trip'
         WHERE tr.departure_time <= NOW()
           AND tr.arrival_time > NOW()
           AND tr.status = 'Departed'
           AND v.partner_id = ?
           AND dr.status <> 'on-trip'`,
        [partnerId],
      );

      await connection.query(
        `UPDATE drivers dr
         JOIN (
           SELECT tr.trip_id, tr.driver_id
           FROM trips tr
           WHERE tr.driver_id IS NOT NULL
           UNION
           SELECT tsd.trip_id, tsd.driver_id
           FROM trip_secondary_drivers tsd
         ) assigned ON assigned.driver_id = dr.driver_id
         JOIN trips tr ON tr.trip_id = assigned.trip_id
         JOIN vehicles v ON tr.vehicle_id = v.vehicle_id
         SET dr.status = 'available'
         WHERE tr.status = 'Completed'
           AND v.partner_id = ?
           AND dr.status = 'on-trip'
           AND NOT EXISTS (
             SELECT 1 FROM trips t2
             WHERE t2.status = 'Departed'
               AND t2.arrival_time > NOW()
               AND (
                 t2.driver_id = dr.driver_id
                 OR EXISTS (
                   SELECT 1 FROM trip_secondary_drivers tsd2
                   WHERE tsd2.trip_id = t2.trip_id
                     AND tsd2.driver_id = dr.driver_id
                 )
               )
           )`,
        [partnerId],
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    await connection.beginTransaction();
    try {
      await this.settleCompletedTrips(connection, partnerId);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error(`Could not settle completed trips for partner ${partnerId}:`, error);
    }
  }

  async refreshAllTripStatuses() {
    const [partners] = await pool.query(
      `SELECT DISTINCT partner_id
       FROM vehicles
       WHERE partner_id IS NOT NULL`,
    );

    for (const { partner_id: partnerId } of partners as Array<{ partner_id: number }>) {
      const connection = await pool.getConnection();
      try {
        await this.refreshPartnerTripStatuses(connection, Number(partnerId));
      } catch (error) {
        console.error(`Could not refresh trip statuses for partner ${partnerId}:`, error);
      } finally {
        connection.release();
      }
    }
  }

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
    const conn = await pool.getConnection();
    try {
      const phone = payload.phone ? normalizeVietnamesePhone(payload.phone) : null;
      if (phone) await assertPhoneAvailable(conn, phone, { userId: partnerId });
      const [result] = await conn.query(
        `UPDATE users u
         LEFT JOIN partner_profiles p ON p.partner_id = u.user_id
         SET u.full_name = COALESCE(?, u.full_name),
             u.email = COALESCE(?, u.email),
             u.phone = COALESCE(?, u.phone),
             p.brand_name = COALESCE(?, p.brand_name)
         WHERE u.user_id = ?`,
        [payload.full_name || null, payload.email || null, phone, payload.brand_name || null, partnerId]
      );
      return { updated: (result as any).affectedRows };
    } catch (err) {
      if (err instanceof Error && (
        err.message.includes('Số điện thoại') ||
        err.message.includes('không hợp lệ')
      )) throw err;
      throw new Error(`Lỗi cập nhật hồ sơ đối tác: ${err}`);
    } finally {
      conn.release();
    }
  }

  // Thống kê cơ bản cho dashboard
  async getMerchantStats(partnerId: number) {
    try {
      const conn = await pool.getConnection();

      const [chartRows] = await conn.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COALESCE(SUM(partner_amount) / 1000000, 0) as revenue
         FROM partner_trip_settlements
         WHERE partner_id = ?
           AND created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
           AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
         ORDER BY DATE_FORMAT(created_at, '%Y-%m') ASC`,
        [partnerId]
      );

      const [revenueRows] = await conn.query(
        `SELECT
           COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) THEN partner_amount ELSE 0 END), 0) as currentMonthRevenue,
           COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND YEAR(created_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)) THEN partner_amount ELSE 0 END), 0) as previousMonthRevenue
         FROM partner_trip_settlements
         WHERE partner_id = ? AND (
           (MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())) OR
           (MONTH(created_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND YEAR(created_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)))
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
         WHERE p.partner_id = ? AND b.payment_status = 'Paid'
           AND MONTH(tr.departure_time) = MONTH(NOW()) AND YEAR(tr.departure_time) = YEAR(NOW())`,
        [partnerId]
      );

      const [occupancyRow] = await conn.query(
        `SELECT
           ROUND((SUM(COALESCE(sold.count, 0)) / NULLIF(SUM(v.total_seats), 0)) * 100, 1) as occupancyRate
         FROM vehicles v
         LEFT JOIN (
           SELECT tr.vehicle_id, COUNT(*) as count
           FROM tickets tk
           JOIN bookings b2 ON b2.booking_id = tk.booking_id AND b2.payment_status = 'Paid'
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
                dr.driver_name as driver,
                (SELECT GROUP_CONCAT(sd.driver_name ORDER BY sd.driver_name SEPARATOR ', ')
                 FROM trip_secondary_drivers tsd
                 JOIN drivers sd ON sd.driver_id = tsd.driver_id
                 WHERE tsd.trip_id = tr.trip_id) as secondaryDriverNames,
                COALESCE(COUNT(tk.ticket_id), 0) as seats, tr.base_price as price
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
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT v.vehicle_id as id, v.license_plate as plateNumber, v.vehicle_type as type, v.total_seats as seats,
                v.status as status, v.vehicle_name as name,
                CONCAT('/api/trips/vehicles/', v.vehicle_id, '/image') as imageUrl
         FROM vehicles v
         WHERE v.partner_id = ?
         ORDER BY v.vehicle_id`,
        [partnerId]
      );
      return rows;
    } catch (err) {
      throw new Error(`Lỗi lấy danh sách xe: ${err}`);
    } finally {
      conn.release();
    }
  }

  async createMerchantVehicle(partnerId: number, payload: { vehicle_name: string; license_plate: string; vehicle_type: string; total_seats: number; status?: string }) {
    const conn = await pool.getConnection();
    try {
      const licensePlate = normalizeVietnameseLicensePlate(payload.license_plate);
      const [existing] = await conn.query(
        `SELECT vehicle_id FROM vehicles WHERE license_plate_normalized = ? LIMIT 1`,
        [licensePlate],
      );
      if ((existing as any[]).length > 0) {
        throw new Error('Biển số xe đã tồn tại trong hệ thống.');
      }
      const [result] = await conn.query(
        `INSERT INTO vehicles (partner_id, vehicle_name, license_plate, vehicle_type, total_seats, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [partnerId, payload.vehicle_name, licensePlate, payload.vehicle_type, payload.total_seats, payload.status || 'active']
      );
      return { insertId: (result as any).insertId };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new Error('Biển số xe đã tồn tại trong hệ thống.');
      }
      if (err instanceof Error && (err.message.includes('Biển số'))) throw err;
      throw new Error(`Lỗi tạo xe: ${err}`);
    } finally {
      conn.release();
    }
  }

  async updateMerchantVehicle(partnerId: number, vehicleId: number, payload: { vehicle_name?: string; license_plate?: string; vehicle_type?: string; total_seats?: number; status?: string }) {
    const conn = await pool.getConnection();
    try {
      const [vehicles] = await conn.query(
        `SELECT vehicle_id FROM vehicles WHERE vehicle_id = ? AND partner_id = ?`,
        [vehicleId, partnerId],
      );
      if ((vehicles as any[]).length === 0) {
        return { affectedRows: 0, vehicleId, exists: false };
      }

      const licensePlate = payload.license_plate
        ? normalizeVietnameseLicensePlate(payload.license_plate)
        : null;
      if (licensePlate) {
        const [existing] = await conn.query(
         `SELECT vehicle_id
          FROM vehicles
          WHERE license_plate_normalized = ? AND vehicle_id <> ?
          LIMIT 1`,
         [licensePlate, vehicleId],
        );
        if ((existing as any[]).length > 0) {
         throw new Error('Biển số xe đã tồn tại trong hệ thống.');
        }
      }
      const [result] = await conn.query(
        `UPDATE vehicles SET vehicle_name = COALESCE(?, vehicle_name), license_plate = COALESCE(?, license_plate), vehicle_type = COALESCE(?, vehicle_type), total_seats = COALESCE(?, total_seats), status = COALESCE(?, status)
         WHERE vehicle_id = ? AND partner_id = ?`,
        [payload.vehicle_name || null, licensePlate, payload.vehicle_type || null, payload.total_seats || null, payload.status || null, vehicleId, partnerId]
      );
      return { affectedRows: (result as any).affectedRows, vehicleId, exists: true };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new Error('Biển số xe đã tồn tại trong hệ thống.');
      }
      if (err instanceof Error && (
        err.message.includes('Biển số') ||
        err.message.includes('không hợp lệ')
      )) throw err;
      throw new Error(`Lỗi cập nhật xe: ${err}`);
    } finally {
      conn.release();
    }
  }

  async deleteMerchantVehicle(partnerId: number, vehicleId: number) {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `DELETE FROM vehicles WHERE vehicle_id = ? AND partner_id = ?`,
        [vehicleId, partnerId]
      );
      return {
        affectedRows: (result as any).affectedRows,
        vehicleId: (result as any).affectedRows ? vehicleId : null,
      };
    } catch (err) {
      throw new Error(`Lỗi xóa xe: ${err}`);
    } finally {
      conn.release();
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
    const conn = await pool.getConnection();
    try {
      const phone = normalizeVietnamesePhone(payload.driver_phone);
      await assertPhoneAvailable(conn, phone);

      const [result] = await conn.query(
        `INSERT INTO drivers (driver_name, driver_phone, experience, status, partner_id) VALUES (?, ?, ?, ?, ?)`,
        [payload.driver_name, phone, payload.experience, payload.status, partnerId]
      );
      return { id: (result as any).insertId };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new Error('Số điện thoại đã được sử dụng trong hệ thống.');
      }
      throw new Error(err.message || err);
    } finally {
      conn.release();
    }
  }

  async updateMerchantDriver(partnerId: number, driverId: number, payload: { driver_name?: string; driver_phone?: string; experience?: number; status?: string }) {
    const conn = await pool.getConnection();
    try {
      const phone = payload.driver_phone
        ? normalizeVietnamesePhone(payload.driver_phone)
        : null;
      if (phone) await assertPhoneAvailable(conn, phone, { driverId });

      const [result] = await conn.query(
        `UPDATE drivers SET driver_name = COALESCE(?, driver_name), driver_phone = COALESCE(?, driver_phone), experience = COALESCE(?, experience), status = COALESCE(?, status) WHERE driver_id = ? AND partner_id = ?`,
        [payload.driver_name || null, phone, payload.experience || null, payload.status || null, driverId, partnerId]
      );
      return { affectedRows: (result as any).affectedRows };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new Error('Số điện thoại đã được sử dụng trong hệ thống.');
      }
      throw new Error(err.message || err);
    } finally {
      conn.release();
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


  async getMerchantSchedules(partnerId: number) {
    const conn = await pool.getConnection();
    try {
      await this.refreshPartnerTripStatuses(conn, partnerId);

      const [rows] = await conn.query(
        `SELECT tr.trip_id as id, tr.status as status, r.route_id as routeId, r.departure_location as departureLocation, r.arrival_location as arrivalLocation,
                CONCAT(r.departure_location,' - ', r.arrival_location) as route, v.vehicle_id as vehicleId, v.vehicle_name as bus,
                tr.driver_id as driverId, dr.driver_name as driver, dr.status as driverStatus,
                (SELECT GROUP_CONCAT(tsd.driver_id ORDER BY tsd.driver_id)
                 FROM trip_secondary_drivers tsd WHERE tsd.trip_id = tr.trip_id) as secondaryDriverIds,
                (SELECT GROUP_CONCAT(sd.driver_name ORDER BY sd.driver_name SEPARATOR ', ')
                 FROM trip_secondary_drivers tsd
                 JOIN drivers sd ON sd.driver_id = tsd.driver_id
                 WHERE tsd.trip_id = tr.trip_id) as secondaryDriverNames,
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

  async createMerchantSchedule(partnerId: number, payload: {
    departure_location: string;
    arrival_location: string;
    vehicle_id: number;
    driver_id?: number;
    secondary_driver_ids?: number[];
    departure_time: string;
    arrival_time?: string;
    estimated_duration_minutes?: number;
    base_price: number;
  }) {
    const secondaryDriverIds = validateSecondaryDriverIds(payload.secondary_driver_ids, payload.driver_id);
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
      await this.assertSecondaryDriversAvailable(conn, partnerId, secondaryDriverIds);

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
      const assignedDriverIds = [
        ...(payload.driver_id ? [payload.driver_id] : []),
        ...secondaryDriverIds,
      ];
      if (assignedDriverIds.length > 0) {
        const tripDate = departureTime.slice(0, 10);
        await this.assertDriversNotReservedByTrips(
          conn,
          partnerId,
          assignedDriverIds,
          tripDate,
          tripDate,
        );
        const [conflictRows] = await conn.query(
          `SELECT tr.trip_id
           FROM trips tr
           WHERE tr.status <> 'Cancelled'
             AND tr.departure_time < ?
             AND tr.arrival_time > ?
             AND (
               tr.driver_id IN (?)
               OR EXISTS (
                 SELECT 1 FROM trip_secondary_drivers tsd
                 WHERE tsd.trip_id = tr.trip_id AND tsd.driver_id IN (?)
               )
             )
           LIMIT 1`,
          [arrivalTime, departureTime, assignedDriverIds, assignedDriverIds],
        );
        if ((conflictRows as any).length > 0) {
          throw new Error('Một hoặc nhiều tài xế đã được phân công cho chuyến khác trong cùng khung giờ.');
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
      if (secondaryDriverIds.length > 0) {
        await conn.query(
          `INSERT INTO trip_secondary_drivers (trip_id, driver_id) VALUES ?`,
          [secondaryDriverIds.map((driverId) => [tripId, driverId])],
        );
      }

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

  async updateMerchantSchedule(partnerId: number, tripId: number, payload: {
    departure_location?: string;
    arrival_location?: string;
    vehicle_id?: number;
    driver_id?: number;
    secondary_driver_ids?: number[];
    departure_time?: string;
    arrival_time?: string;
    estimated_duration_minutes?: number;
    base_price?: number;
    status?: string;
  }) {
    const conn = await pool.getConnection();
    let transactionStarted = false;
    try {
      await conn.beginTransaction();
      transactionStarted = true;
      const [existingRows] = await conn.query(
        `SELECT tr.trip_id, tr.route_id, tr.vehicle_id, tr.driver_id,
                tr.schedule_template_id,
                tr.departure_time, tr.arrival_time, tr.estimated_duration_minutes,
                tr.status, tr.actual_departure_time, v.vehicle_type,
                (SELECT GROUP_CONCAT(tsd.driver_id ORDER BY tsd.driver_id)
                 FROM trip_secondary_drivers tsd WHERE tsd.trip_id = tr.trip_id) AS secondaryDriverIds,
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
      const currentSecondaryDriverIds = parseStoredDriverIds(existing.secondaryDriverIds);
      const secondaryDriverIds = validateSecondaryDriverIds(
        payload.secondary_driver_ids ?? currentSecondaryDriverIds,
        payload.driver_id ?? existing.driver_id ?? undefined,
      );
      const sortedCurrentSecondaryIds = [...currentSecondaryDriverIds].sort((a, b) => a - b);
      const sortedRequestedSecondaryIds = [...secondaryDriverIds].sort((a, b) => a - b);
      const changesDriverAssignment = (
        payload.driver_id !== undefined &&
        payload.driver_id !== existing.driver_id
      ) || (
        payload.secondary_driver_ids !== undefined &&
        sortedRequestedSecondaryIds.some((driverId, index) => driverId !== sortedCurrentSecondaryIds[index])
      ) || (
        payload.secondary_driver_ids !== undefined &&
        sortedRequestedSecondaryIds.length !== sortedCurrentSecondaryIds.length
      );
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
      if (Boolean(existing.hasStarted) && changesDriverAssignment) {
        throw new Error('Chuyến đã bắt đầu; không thể thay đổi tài xế được phân công.');
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
      if (payload.secondary_driver_ids !== undefined) {
        await this.assertSecondaryDriversAvailable(conn, partnerId, secondaryDriverIds);
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
      const assignedDriverIds = [
        ...(driverToCheck ? [Number(driverToCheck)] : []),
        ...secondaryDriverIds,
      ];
      if (assignedDriverIds.length > 0) {
        const tripDate = String(effectiveDepartureTime).slice(0, 10);
        await this.assertDriversNotReservedByTrips(
          conn,
          partnerId,
          assignedDriverIds,
          tripDate,
          tripDate,
          tripId,
        );
        const [conflictRows] = await conn.query(
          `SELECT tr.trip_id
           FROM trips tr
           WHERE tr.status <> 'Cancelled'
             AND tr.departure_time < ?
             AND tr.arrival_time > ?
             AND tr.trip_id <> ?
             AND (
               tr.driver_id IN (?)
               OR EXISTS (
                 SELECT 1 FROM trip_secondary_drivers tsd
                 WHERE tsd.trip_id = tr.trip_id AND tsd.driver_id IN (?)
               )
             )
           LIMIT 1`,
          [
            effectiveArrivalTime,
            effectiveDepartureTime,
            tripId,
            assignedDriverIds,
            assignedDriverIds,
          ],
        );
        if ((conflictRows as any).length > 0) {
          throw new Error('Một hoặc nhiều tài xế đã được phân công cho chuyến khác trong cùng khung giờ.');
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
      if (payload.secondary_driver_ids !== undefined) {
        await conn.query(
          `DELETE FROM trip_secondary_drivers WHERE trip_id = ?`,
          [tripId],
        );
        if (secondaryDriverIds.length > 0) {
          await conn.query(
            `INSERT INTO trip_secondary_drivers (trip_id, driver_id) VALUES ?`,
            [secondaryDriverIds.map((driverId) => [tripId, driverId])],
          );
        }
      }
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
           ANY_VALUE(r.created_at) as createdAt,
           ANY_VALUE(DATE_FORMAT(tr.departure_time, '%Y-%m-%dT%H:%i:%s')) as departureTime
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
