import { createHash } from 'node:crypto';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database.js';
import { generateBusSeats } from '../../utils/seats.util.js';
import { normalizeLocation } from '../../utils/normalize.util.js';
import {
  createOccurrences,
  detectOccurrenceConflicts,
  isFutureVietnamDateTime,
  propagateCycleConflicts,
  RecurringScheduleInput,
  ScheduledOccurrence,
  validateRecurringInput,
} from './recurring-schedule.util.js';

type CreationMode = 'all_or_nothing' | 'valid_only';

interface DurationResolution {
  durationMinutes: number;
  durationSource: 'partner' | 'google_routes';
  distanceKm: number | null;
  warning: string | null;
}

interface ExistingTrip extends RowDataPacket {
  departureTime: string;
  arrivalTime: string;
  vehicleId: number;
  driverId: number | null;
  secondaryDriverIds: string | null;
  minimumTurnaroundMinutes: number;
  transferDurationMinutes: number;
}

class RecurringScheduleService {
  private getRouteHash(origin: string, destination: string): string {
    return createHash('sha256')
      .update(`${normalizeLocation(origin).toLocaleLowerCase()}|${normalizeLocation(destination).toLocaleLowerCase()}`)
      .digest('hex');
  }

  private async resolveDuration(
    input: RecurringScheduleInput,
  ): Promise<DurationResolution> {
    const origin = normalizeLocation(input.departureLocation);
    const destination = normalizeLocation(input.arrivalLocation);
    const routeHash = this.getRouteHash(origin, destination);
    const [cachedRows] = await pool.query<RowDataPacket[]>(
      `SELECT duration_minutes AS durationMinutes, distance_km AS distanceKm
       FROM route_duration_cache
       WHERE route_hash = ? AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [routeHash],
    );
    if (cachedRows.length > 0) {
      return {
        durationMinutes: Number(cachedRows[0].durationMinutes),
        durationSource: 'google_routes',
        distanceKm: cachedRows[0].distanceKm == null ? null : Number(cachedRows[0].distanceKm),
        warning: null,
      };
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return {
        durationMinutes: input.drivingDurationMinutes,
        durationSource: 'partner',
        distanceKm: null,
        warning: 'Chưa cấu hình GOOGLE_MAPS_API_KEY; đang dùng thời lượng di chuyển do nhà xe cung cấp.',
      };
    }

    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { address: origin },
          destination: { address: destination },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
          units: 'METRIC',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Google Routes API trả về HTTP ${response.status}.`);
      }
      const body = await response.json() as {
        routes?: Array<{ duration?: string; distanceMeters?: number }>;
      };
      const route = body.routes?.[0];
      const seconds = Number(route?.duration?.replace(/s$/, ''));
      if (!route || !Number.isFinite(seconds) || seconds <= 0) {
        throw new Error('Google Routes API không có thời lượng tuyến hợp lệ.');
      }

      const durationMinutes = Math.ceil(seconds / 60);
      const distanceKm = Number.isFinite(route.distanceMeters)
        ? Number((route.distanceMeters! / 1000).toFixed(2))
        : null;
      await pool.execute(
        `INSERT INTO route_duration_cache
          (route_hash, origin, destination, duration_minutes, distance_km, expires_at)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY))
         ON DUPLICATE KEY UPDATE
          origin = VALUES(origin),
          destination = VALUES(destination),
          duration_minutes = VALUES(duration_minutes),
          distance_km = VALUES(distance_km),
          fetched_at = CURRENT_TIMESTAMP,
          expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)`,
        [routeHash, origin, destination, durationMinutes, distanceKm],
      );
      return {
        durationMinutes,
        durationSource: 'google_routes',
        distanceKm,
        warning: 'Google Routes API cung cấp ước tính tuyến ô tô, không phải thời gian vận hành xe khách; thời gian dừng, nghỉ và dự phòng được cộng riêng.',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Lỗi không xác định.';
      console.error('Google Routes lookup failed; using partner-provided duration:', reason);
      return {
        durationMinutes: input.drivingDurationMinutes,
        durationSource: 'partner',
        distanceKm: null,
        warning: `Không lấy được dữ liệu Google Routes (${reason}); đang dùng thời lượng do nhà xe cung cấp.`,
      };
    }
  }

  private async validateOwnership(
    partnerId: number,
    input: RecurringScheduleInput,
    connection?: PoolConnection,
  ): Promise<{ vehicle: RowDataPacket; driver: RowDataPacket | null; secondaryDrivers: RowDataPacket[] }> {
    const runner = connection || pool;
    const [vehicleRows] = await runner.query<RowDataPacket[]>(
      `SELECT vehicle_id, vehicle_type, total_seats, status
       FROM vehicles
       WHERE vehicle_id = ? AND partner_id = ?
       LIMIT 1${connection ? ' FOR UPDATE' : ''}`,
      [input.vehicleId, partnerId],
    );
    const vehicle = vehicleRows[0];
    if (!vehicle || String(vehicle.status).toLowerCase() !== 'active') {
      throw new Error('Xe không tồn tại, không thuộc nhà xe hoặc đang không hoạt động.');
    }

    let driver: RowDataPacket | null = null;
    if (input.driverId != null) {
      const [driverRows] = await runner.query<RowDataPacket[]>(
        `SELECT driver_id, status
         FROM drivers
         WHERE driver_id = ? AND partner_id = ?
         LIMIT 1${connection ? ' FOR UPDATE' : ''}`,
        [input.driverId, partnerId],
      );
      driver = driverRows[0] || null;
      if (!driver || String(driver.status) !== 'available') {
        throw new Error('Tài xế không tồn tại, không thuộc nhà xe hoặc không khả dụng.');
      }
    }
    const secondaryDriverIds = input.secondaryDriverIds ?? [];
    const secondaryDrivers = secondaryDriverIds.length > 0
      ? (await runner.query<RowDataPacket[]>(
        `SELECT driver_id, status
         FROM drivers
         WHERE driver_id IN (?) AND partner_id = ?
         ORDER BY driver_id${connection ? ' FOR UPDATE' : ''}`,
        [secondaryDriverIds, partnerId],
      ))[0]
      : [];
    if (
      secondaryDrivers.length !== secondaryDriverIds.length ||
      secondaryDrivers.some((secondaryDriver) => String(secondaryDriver.status) !== 'available')
    ) {
      throw new Error('Một hoặc nhiều tài xế phụ không tồn tại, không thuộc nhà xe hoặc không khả dụng.');
    }
    return { vehicle, driver, secondaryDrivers };
  }

  private async findExistingTrips(
    vehicleId: number,
    driverIds: number[],
    occurrences: ScheduledOccurrence[],
    connection: PoolConnection | typeof pool,
  ): Promise<ExistingTrip[]> {
    const firstDeparture = occurrences[0].departureTime;
    const lastDeparture = occurrences[occurrences.length - 1].departureTime;
    const driverIdsForQuery = driverIds.length > 0 ? driverIds : [0];
    const [rows] = await connection.query<ExistingTrip[]>(
      `SELECT
         DATE_FORMAT(tr.departure_time, '%Y-%m-%d %H:%i:%s') AS departureTime,
         DATE_FORMAT(tr.arrival_time, '%Y-%m-%d %H:%i:%s') AS arrivalTime,
         tr.vehicle_id AS vehicleId,
         tr.driver_id AS driverId,
         (SELECT GROUP_CONCAT(tsd.driver_id ORDER BY tsd.driver_id)
          FROM trip_secondary_drivers tsd
          WHERE tsd.trip_id = tr.trip_id) AS secondaryDriverIds,
         tr.minimum_turnaround_minutes AS minimumTurnaroundMinutes,
         tr.transfer_duration_minutes AS transferDurationMinutes
       FROM trips tr
       WHERE tr.status <> 'Cancelled'
         AND (tr.vehicle_id = ? OR (
           ? = 1 AND (
             tr.driver_id IN (?)
             OR EXISTS (
               SELECT 1 FROM trip_secondary_drivers tsd
               WHERE tsd.trip_id = tr.trip_id AND tsd.driver_id IN (?)
             )
           )
         ))
         AND tr.arrival_time >= DATE_SUB(?, INTERVAL 3 DAY)
         AND tr.departure_time <= DATE_ADD(?, INTERVAL 3 DAY)
       ORDER BY tr.departure_time`,
      [
        vehicleId,
        driverIds.length > 0 ? 1 : 0,
        driverIdsForQuery,
        driverIdsForQuery,
        firstDeparture,
        lastDeparture,
      ],
    );
    return rows;
  }

  private async assertDriversNotReservedByTrips(
    connection: PoolConnection | typeof pool,
    partnerId: number,
    driverIds: number[],
    startDate: string,
    endDate: string,
    lockRows = false,
  ) {
    if (driverIds.length === 0) return;
    const [rows] = await connection.query<RowDataPacket[]>(
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
       LIMIT 1
       ${lockRows ? 'FOR UPDATE' : ''}`,
      [partnerId, endDate, startDate, driverIds, driverIds],
    );
    if (rows.length > 0) {
      throw new Error('Một hoặc nhiều tài xế đã được phân công cho lịch chạy trong khoảng ngày đã chọn.');
    }
  }

  private async getRouteId(
    connection: PoolConnection,
    input: RecurringScheduleInput,
    vehicleType: string,
    departureLocation: string,
    arrivalLocation: string,
  ): Promise<number> {
    const origin = normalizeLocation(departureLocation);
    const destination = normalizeLocation(arrivalLocation);
    const [routeRows] = await connection.query<RowDataPacket[]>(
      `SELECT route_id
       FROM routes
       WHERE departure_location = ? AND arrival_location = ? AND vehicle_type = ?
       LIMIT 1`,
      [origin, destination, vehicleType],
    );
    if (routeRows.length > 0) return Number(routeRows[0].route_id);
    const [result] = await connection.execute(
      `INSERT INTO routes (departure_location, arrival_location, vehicle_type)
       VALUES (?, ?, ?)`,
      [origin, destination, vehicleType],
    );
    return Number((result as { insertId: number }).insertId);
  }

  async preview(partnerId: number, input: RecurringScheduleInput) {
    validateRecurringInput(input);
    await this.validateOwnership(partnerId, input);
    const duration = await this.resolveDuration(input);
    const occurrences = createOccurrences(input, duration.durationMinutes);
    const driverIds = [
      ...(input.driverId == null ? [] : [input.driverId]),
      ...(input.secondaryDriverIds ?? []),
    ];
    await this.assertDriversNotReservedByTrips(
      pool,
      partnerId,
      driverIds,
      input.startDate,
      input.endDate,
    );
    const existingTrips = await this.findExistingTrips(
      input.vehicleId,
      driverIds,
      occurrences,
      pool,
    );
    detectOccurrenceConflicts(
      occurrences,
      existingTrips,
      input.vehicleId,
      input.driverId ?? null,
      input.secondaryDriverIds ?? [],
    );
    for (const occurrence of occurrences) {
      if (!isFutureVietnamDateTime(occurrence.departureTime)) {
        occurrence.conflicts.push('Giờ khởi hành phải ở tương lai theo múi giờ Asia/Ho_Chi_Minh.');
      }
      occurrence.conflicts = [...new Set(occurrence.conflicts)];
    }
    propagateCycleConflicts(occurrences);
    const validCount = occurrences.filter((item) => item.conflicts.length === 0).length;
    return {
      durationSource: duration.durationSource,
      drivingDurationMinutes: duration.durationMinutes,
      estimatedDurationMinutes: occurrences[0].estimatedDurationMinutes,
      distanceKm: duration.distanceKm,
      warning: duration.warning,
      validCount,
      invalidCount: occurrences.length - validCount,
      occurrences,
    };
  }

  async create(
    partnerId: number,
    input: RecurringScheduleInput,
    mode: CreationMode,
  ) {
    validateRecurringInput(input);
    const duration = await this.resolveDuration(input);
    const occurrences = createOccurrences(input, duration.durationMinutes);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existingTemplateRows] = await connection.query<RowDataPacket[]>(
        `SELECT schedule_template_id AS scheduleTemplateId, request_hash AS requestHash
         FROM schedule_templates
         WHERE partner_id = ? AND idempotency_key = ?
         LIMIT 1`,
        [partnerId, input.idempotencyKey],
      );
      const requestHash = createHash('sha256').update(JSON.stringify({
        ...input,
        weekdays: [...input.weekdays].sort((a, b) => a - b),
        departureTimes: [...input.departureTimes].sort(),
        secondaryDriverIds: [...(input.secondaryDriverIds ?? [])].sort((a, b) => a - b),
      })).digest('hex');
      if (existingTemplateRows.length > 0) {
        if (existingTemplateRows[0].requestHash !== requestHash) {
          throw new Error('Mã chống tạo trùng đã được sử dụng với cấu hình khác.');
        }
        const templateId = Number(existingTemplateRows[0].scheduleTemplateId);
        const [counts] = await connection.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS createdCount
           FROM trips
           WHERE schedule_template_id = ?`,
          [templateId],
        );
        await connection.commit();
        return {
          scheduleTemplateId: templateId,
          createdCount: Number(counts[0].createdCount),
          skipped: [],
          idempotentReplay: true,
          blocked: false,
          warning: duration.warning,
        };
      }

      const { vehicle } = await this.validateOwnership(partnerId, input, connection);
      await this.assertDriversNotReservedByTrips(
        connection,
        partnerId,
        [
          ...(input.driverId == null ? [] : [input.driverId]),
          ...(input.secondaryDriverIds ?? []),
        ],
        input.startDate,
        input.endDate,
        true,
      );
      const [concurrentTemplateRows] = await connection.query<RowDataPacket[]>(
        `SELECT schedule_template_id AS scheduleTemplateId, request_hash AS requestHash
         FROM schedule_templates
         WHERE partner_id = ? AND idempotency_key = ?
         LIMIT 1
         FOR UPDATE`,
        [partnerId, input.idempotencyKey],
      );
      if (concurrentTemplateRows.length > 0) {
        if (concurrentTemplateRows[0].requestHash !== requestHash) {
          throw new Error('Mã chống tạo trùng đã được sử dụng với cấu hình khác.');
        }
        const templateId = Number(concurrentTemplateRows[0].scheduleTemplateId);
        const [counts] = await connection.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS createdCount
           FROM trips
           WHERE schedule_template_id = ?`,
          [templateId],
        );
        await connection.commit();
        return {
          scheduleTemplateId: templateId,
          createdCount: Number(counts[0].createdCount),
          skipped: [],
          idempotentReplay: true,
          blocked: false,
          warning: duration.warning,
        };
      }
      const existingTrips = await this.findExistingTrips(
        input.vehicleId,
        [
          ...(input.driverId == null ? [] : [input.driverId]),
          ...(input.secondaryDriverIds ?? []),
        ],
        occurrences,
        connection,
      );
      detectOccurrenceConflicts(
        occurrences,
        existingTrips,
        input.vehicleId,
        input.driverId ?? null,
        input.secondaryDriverIds ?? [],
      );
      for (const occurrence of occurrences) {
        if (!isFutureVietnamDateTime(occurrence.departureTime)) {
          occurrence.conflicts.push('Giờ khởi hành phải ở tương lai theo múi giờ Asia/Ho_Chi_Minh.');
        }
        occurrence.conflicts = [...new Set(occurrence.conflicts)];
      }
      propagateCycleConflicts(occurrences);

      const invalidOccurrences = occurrences.filter((item) => item.conflicts.length > 0);
      if (mode === 'all_or_nothing' && invalidOccurrences.length > 0) {
        await connection.rollback();
        return {
          scheduleTemplateId: null,
          createdCount: 0,
          skipped: invalidOccurrences,
          idempotentReplay: false,
          blocked: true,
          durationSource: duration.durationSource,
          drivingDurationMinutes: duration.durationMinutes,
          estimatedDurationMinutes: occurrences[0].estimatedDurationMinutes,
          distanceKm: duration.distanceKm,
          validCount: occurrences.length - invalidOccurrences.length,
          invalidCount: invalidOccurrences.length,
          occurrences,
          warning: duration.warning,
        };
      }
      const candidates = occurrences.filter((item) => item.conflicts.length === 0);
      if (candidates.length === 0) {
        await connection.rollback();
        return {
          scheduleTemplateId: null,
          createdCount: 0,
          skipped: invalidOccurrences,
          idempotentReplay: false,
          blocked: true,
          durationSource: duration.durationSource,
          drivingDurationMinutes: duration.durationMinutes,
          estimatedDurationMinutes: occurrences[0].estimatedDurationMinutes,
          distanceKm: duration.distanceKm,
          validCount: 0,
          invalidCount: invalidOccurrences.length,
          occurrences,
          warning: duration.warning,
        };
      }

      const routeId = await this.getRouteId(
        connection,
        input,
        String(vehicle.vehicle_type),
        input.departureLocation,
        input.arrivalLocation,
      );
      const routeIds = new Map<string, number>([
        [`${normalizeLocation(input.departureLocation)}|${normalizeLocation(input.arrivalLocation)}`, routeId],
      ]);
      const [templateResult] = await connection.execute(
        `INSERT INTO schedule_templates (
           partner_id, route_id, vehicle_id, driver_id, start_date, end_date,
           weekdays, departure_times, base_price, driving_duration_minutes,
           duration_source, stop_duration_minutes, rest_duration_minutes,
           buffer_duration_minutes, minimum_turnaround_minutes,
           transfer_duration_minutes, status, idempotency_key, request_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
        [
          partnerId,
          routeId,
          input.vehicleId,
          input.driverId ?? null,
          input.startDate,
          input.endDate,
          JSON.stringify(input.weekdays),
          JSON.stringify(input.departureTimes),
          input.basePrice,
          duration.durationMinutes,
          duration.durationSource,
          input.stopDurationMinutes,
          input.restDurationMinutes,
          input.bufferDurationMinutes,
          input.minimumTurnaroundMinutes,
          0,
          input.idempotencyKey,
          requestHash,
        ],
      );
      const scheduleTemplateId = Number((templateResult as { insertId: number }).insertId);
      if (input.secondaryDriverIds?.length) {
        await connection.query(
          `INSERT INTO schedule_template_secondary_drivers (schedule_template_id, driver_id)
           VALUES ?`,
          [input.secondaryDriverIds.map((driverId) => [scheduleTemplateId, driverId])],
        );
      }
      const [vehicleRows] = await connection.query<RowDataPacket[]>(
        `SELECT total_seats FROM vehicles WHERE vehicle_id = ?`,
        [input.vehicleId],
      );
      const totalSeats = Number(vehicleRows[0].total_seats);
      const skipped = [...invalidOccurrences];
      let createdCount = 0;

      for (const occurrence of candidates) {
        const generationKey = `${scheduleTemplateId}:${occurrence.departureTime.replace(/[-: ]/g, '')}`;
        const routeKey = `${normalizeLocation(occurrence.departureLocation)}|${normalizeLocation(occurrence.arrivalLocation)}`;
        let occurrenceRouteId = routeIds.get(routeKey);
        if (occurrenceRouteId == null) {
          occurrenceRouteId = await this.getRouteId(
            connection,
            input,
            String(vehicle.vehicle_type),
            occurrence.departureLocation,
            occurrence.arrivalLocation,
          );
          routeIds.set(routeKey, occurrenceRouteId);
        }
        await connection.query('SAVEPOINT create_recurring_trip');
        try {
          const [tripResult] = await connection.execute(
            `INSERT INTO trips (
               route_id, vehicle_id, driver_id, departure_time, arrival_time,
               estimated_duration_minutes, minimum_turnaround_minutes,
               transfer_duration_minutes, schedule_template_id, generation_key,
               base_price, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled')`,
            [
              occurrenceRouteId,
              input.vehicleId,
              input.driverId ?? null,
              occurrence.departureTime,
              occurrence.arrivalTime,
              occurrence.estimatedDurationMinutes,
              occurrence.minimumTurnaroundMinutes,
              0,
              scheduleTemplateId,
              generationKey,
              input.basePrice,
            ],
          );
          const tripId = Number((tripResult as { insertId: number }).insertId);
          if (input.secondaryDriverIds?.length) {
            await connection.query(
              `INSERT INTO trip_secondary_drivers (trip_id, driver_id)
               VALUES ?`,
              [input.secondaryDriverIds.map((driverId) => [tripId, driverId])],
            );
          }
          const seats = generateBusSeats(tripId, totalSeats);
          const seatValues = seats.map((seat) => [
            seat.trip_id,
            seat.seat_code,
            seat.floor,
            seat.row,
            seat.position,
            seat.status,
          ]);
          await connection.query(
            `INSERT INTO seats (trip_id, seat_code, floor, \`row\`, position, status)
             VALUES ?`,
            [seatValues],
          );
          createdCount += 1;
        } catch (error) {
          await connection.query('ROLLBACK TO SAVEPOINT create_recurring_trip');
          if (mode === 'all_or_nothing') throw error;
          skipped.push({
            ...occurrence,
            conflicts: [
              error instanceof Error ? `Không tạo được chuyến: ${error.message}` : 'Không tạo được chuyến do lỗi dữ liệu.',
            ],
          });
        }
      }
      await connection.commit();
      return {
        scheduleTemplateId,
        createdCount,
        skipped,
        idempotentReplay: false,
        blocked: false,
        warning: duration.warning,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getTemplates(partnerId: number) {
    const [rows] = await pool.query(
      `SELECT
         st.schedule_template_id AS scheduleTemplateId,
         st.route_id AS routeId,
         r.departure_location AS departureLocation,
         r.arrival_location AS arrivalLocation,
         st.vehicle_id AS vehicleId,
         v.vehicle_name AS vehicleName,
         st.driver_id AS driverId,
         d.driver_name AS driverName,
         (SELECT GROUP_CONCAT(std.driver_id ORDER BY std.driver_id)
          FROM schedule_template_secondary_drivers std
          WHERE std.schedule_template_id = st.schedule_template_id) AS secondaryDriverIds,
         (SELECT GROUP_CONCAT(sd.driver_name ORDER BY sd.driver_name SEPARATOR ', ')
          FROM schedule_template_secondary_drivers std
          JOIN drivers sd ON sd.driver_id = std.driver_id
          WHERE std.schedule_template_id = st.schedule_template_id) AS secondaryDriverNames,
         st.start_date AS startDate,
         st.end_date AS endDate,
         st.weekdays,
         st.departure_times AS departureTimes,
         st.base_price AS basePrice,
         st.driving_duration_minutes AS drivingDurationMinutes,
         st.duration_source AS durationSource,
         st.stop_duration_minutes AS stopDurationMinutes,
         st.rest_duration_minutes AS restDurationMinutes,
         st.buffer_duration_minutes AS bufferDurationMinutes,
         st.minimum_turnaround_minutes AS minimumTurnaroundMinutes,
         st.status,
         COUNT(tr.trip_id) AS generatedTripCount
       FROM schedule_templates st
       JOIN routes r ON r.route_id = st.route_id
       JOIN vehicles v ON v.vehicle_id = st.vehicle_id
       LEFT JOIN drivers d ON d.driver_id = st.driver_id
       LEFT JOIN trips tr ON tr.schedule_template_id = st.schedule_template_id
       WHERE st.partner_id = ?
       GROUP BY st.schedule_template_id
       ORDER BY st.created_at DESC`,
      [partnerId],
    );
    return rows;
  }

  async setTemplateStatus(
    partnerId: number,
    templateId: number,
    status: 'Active' | 'Paused',
  ) {
    const [result] = await pool.execute(
      `UPDATE schedule_templates
       SET status = ?
       WHERE schedule_template_id = ? AND partner_id = ?`,
      [status, templateId, partnerId],
    );
    if ((result as { affectedRows: number }).affectedRows !== 1) {
      throw new Error('Không tìm thấy mẫu lịch thuộc nhà xe này.');
    }
  }
}

export default new RecurringScheduleService();
