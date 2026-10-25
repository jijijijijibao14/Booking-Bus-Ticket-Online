import pool from '../../config/database.js';
import redisClient from '../../config/redis.js';

import {
  normalizeLocation,
} from '../../utils/normalize.util.js';

export class TripService {
  /**
   * Tìm kiếm chuyến đi theo:
   * - Điểm đi
   * - Điểm đến
   * - Ngày đi
   * - Loại phương tiện xe khách
   */
  async searchTrips(
    from: string,
    to: string,
    departureDate: string,
  ): Promise<any[]> {
    const normalizedFrom = normalizeLocation(from);
    const normalizedTo = normalizeLocation(to);
    const startDate = `${departureDate} 00:00:00`;
    const endDate = `${departureDate} 23:59:59`;

    const [results] = await pool.query(
      `SELECT
         t.trip_id,
         t.departure_time,
         t.arrival_time,
         t.base_price,
         r.departure_location,
         r.arrival_location,
         v.vehicle_name,
         v.vehicle_type
       FROM trips t
       INNER JOIN routes r ON t.route_id = r.route_id
       INNER JOIN vehicles v ON t.vehicle_id = v.vehicle_id
       WHERE r.departure_location = ?
         AND r.arrival_location = ?
         AND r.vehicle_type = 'Bus'
         AND v.vehicle_type = 'Bus'
         AND t.departure_time BETWEEN ? AND ?
         AND t.status = 'Scheduled'
         AND t.departure_time > NOW()
       ORDER BY t.departure_time ASC`,
      [normalizedFrom, normalizedTo, startDate, endDate],
    );

    return results as any[];
  }

  async getSeatLayout(tripId: string | number): Promise<any> {
    const realTripId = Number(tripId);
    if (!Number.isSafeInteger(realTripId) || realTripId <= 0) {
      throw new Error('Ma chuyen xe khong hop le.');
    }

    const [dbSeats]: any = await pool.query(
      `SELECT
         seat_id AS seatId,
         trip_id AS tripId,
         seat_code AS id,
         seat_code AS seatNumber,
         status,
         floor,
         \`row\`,
         position
       FROM seats
       WHERE trip_id = ?
       ORDER BY seat_id ASC`,
      [realTripId],
    );

    if (dbSeats.length === 0) {
      return { success: true, data: [] };
    }

    const seatKeys = dbSeats.map(
      (seat: any) => `lock:trip:${realTripId}:seat:${seat.seatId}`,
    );
    const lockStatuses = await redisClient.mget(seatKeys);

    const seatsWithLockStatus = dbSeats.map((seat: any, index: number) => {
      const seatCode = String(seat.id || seat.seatNumber || '').trim().toUpperCase();
      const prefix = seatCode.charAt(0);
      const rowFromCode = Number.parseInt(seatCode.slice(1), 10);
      const derivedFloor = ['A', 'B'].includes(prefix)
        ? 1
        : ['C', 'D'].includes(prefix)
          ? 2
          : null;
      const derivedPosition = ['A', 'C'].includes(prefix)
        ? 'left'
        : ['B', 'D'].includes(prefix)
          ? 'right'
          : null;
      const databaseStatus = String(seat.status).toLowerCase();
      const status = databaseStatus === 'available' && lockStatuses[index] !== null
        ? 'holding'
        : databaseStatus;

      return {
        ...seat,
        floor: seat.floor != null ? Number(seat.floor) : derivedFloor,
        row: seat.row != null
          ? Number(seat.row)
          : Number.isNaN(rowFromCode) ? null : rowFromCode,
        position: seat.position || derivedPosition,
        status,
      };
    });

    return { success: true, data: seatsWithLockStatus };
  }

  async createBusTripWithSeats(
    tripData: any,
  ): Promise<any> {
    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [tripResult]: any =
        await connection.query(
          'INSERT INTO trips SET ?',
          [tripData],
        );

      const tripId =
        tripResult.insertId;

      /*
       * TODO:
       * Sinh sơ đồ ghế cho chuyến xe mới.
       */

      await connection.commit();

      return {
        success: true,
        tripId,
      };
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new TripService();