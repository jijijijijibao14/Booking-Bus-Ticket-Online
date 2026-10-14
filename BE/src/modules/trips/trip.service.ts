import pool from '../../config/database.js';
import redisClient from '../../config/redis.js';

import {
  TRAIN_CARRIAGES,
  generateTrainSeats,
} from './train-layout.util.js';

import {
  normalizeLocation,
} from '../../utils/normalize.util.js';

export class TripService {
  /**
   * Tìm kiếm chuyến đi theo:
   * - Điểm đi
   * - Điểm đến
   * - Ngày đi
   * - Loại phương tiện
   */
  async searchTrips(
    from: string,
    to: string,
    departureDate: string,
    type: string,
  ): Promise<any[]> {
    const normalizedFrom =
      normalizeLocation(from);

    const normalizedTo =
      normalizeLocation(to);

    /*
     * Tàu hỏa và máy bay sử dụng dữ liệu
     * được sinh tự động Just-In-Time.
     */
    if (
      type === 'Train' ||
      type === 'Flight'
    ) {
      return this.generateMockTrips(
        normalizedFrom,
        normalizedTo,
        departureDate,
        type,
      );
    }

    /*
     * Xe khách lấy dữ liệu thật từ database.
     */
    const startDate =
      `${departureDate} 00:00:00`;

    const endDate =
      `${departureDate} 23:59:59`;

    const query = `
      SELECT
        t.trip_id,
        t.departure_time,
        t.arrival_time,
        t.base_price,

        r.departure_location,
        r.arrival_location,

        v.vehicle_name,
        v.vehicle_type

      FROM trips t

      INNER JOIN routes r
        ON t.route_id = r.route_id

      INNER JOIN vehicles v
        ON t.vehicle_id = v.vehicle_id

      WHERE
        r.departure_location = ?
        AND r.arrival_location = ?
        AND r.vehicle_type = ?
        AND t.departure_time BETWEEN ? AND ?
        AND t.status = 'Scheduled'
        AND t.departure_time > NOW()

      ORDER BY t.departure_time ASC
    `;

    const [results] =
      await pool.query(
        query,
        [
          normalizedFrom,
          normalizedTo,
          type,
          startDate,
          endDate,
        ],
      );

    return results as any[];
  }

  /**
   * Sinh dữ liệu chuyến đi Just-In-Time
   * cho tàu hỏa và máy bay.
   */
  private generateMockTrips(
    from: string,
    to: string,
    departureDate: string,
    type: 'Train' | 'Flight',
  ): any[] {
    const results: any[] = [];
    const tripCount = 20;

    const now = new Date();

    const selectedDate =
      new Date(departureDate);

    const isToday =
      selectedDate.toDateString() ===
      now.toDateString();

    /*
     * Sinh chuyến tàu.
     */
    if (type === 'Train') {
      const vehicleName =
        'Đường sắt Việt Nam';

      const trainCodes = [
        'SE1',
        'SE3',
        'SE5',
        'TN1',
        'SE2',
        'SE4',
        'SE6',
        'TN2',
      ];

      const startHour = 5;

      for (
        let index = 0;
        index < tripCount;
        index += 1
      ) {
        const hour =
          (startHour + index) % 24;

        const minute =
          Math.floor(
            Math.random() * 4,
          ) * 15;

        const time =
          `${hour
            .toString()
            .padStart(2, '0')}:` +
          `${minute
            .toString()
            .padStart(2, '0')}`;

        const timeForId =
          time.replace(':', '-');

        const code =
          `${trainCodes[
            index % trainCodes.length
          ]}` +
          `${Math.floor(
            Math.random() * 5,
          )}`;

        const price =
          550000 +
          Math.floor(
            Math.random() * 15,
          ) *
            20000;

        const departureTime =
          new Date(
            `${departureDate}T${time}:00`,
          );

        /*
         * Bỏ qua các chuyến đã khởi hành
         * trong ngày hiện tại.
         */
        if (
          isToday &&
          departureTime < now
        ) {
          continue;
        }

        const arrivalTime =
          new Date(
            departureTime.getTime() +
              12 * 60 * 60 * 1000,
          );

        const mockTripId =
          `MOCK|Train|${code}|` +
          `${from}|${to}|` +
          `${departureDate}|${timeForId}`;

        results.push({
          trip_id: mockTripId,

          departure_time:
            departureTime.toISOString(),

          arrival_time:
            arrivalTime.toISOString(),

          base_price: price,

          departure_location: from,
          arrival_location: to,

          vehicle_name: vehicleName,
          vehicle_type: 'Train',

          duration: '12h 00m',
        });
      }

      return results;
    }

    /*
     * Sinh chuyến máy bay.
     */
    const airlines = [
      {
        name: 'Vietnam Airlines',
        prefix: 'VN',
        basePrice: 1400000,
      },
      {
        name: 'VietJet Air',
        prefix: 'VJ',
        basePrice: 950000,
      },
      {
        name: 'Bamboo Airways',
        prefix: 'QH',
        basePrice: 1200000,
      },
    ];

    const startHour = 6;

    for (
      let index = 0;
      index < tripCount;
      index += 1
    ) {
      const airline =
        airlines[
          index % airlines.length
        ];

      const hour =
        (
          startHour +
          Math.floor(index / 2)
        ) % 24;

      const minute =
        Math.floor(
          Math.random() * 12,
        ) * 5;

      const time =
        `${hour
          .toString()
          .padStart(2, '0')}:` +
        `${minute
          .toString()
          .padStart(2, '0')}`;

      const timeForId =
        time.replace(':', '-');

      const code =
        `${airline.prefix}` +
        `${
          100 +
          Math.floor(
            Math.random() * 899,
          )
        }`;

      const price =
        airline.basePrice +
        Math.floor(
          Math.random() * 20,
        ) *
          10000;

      const departureTime =
        new Date(
          `${departureDate}T${time}:00`,
        );

      /*
       * Bỏ qua các chuyến đã khởi hành
       * trong ngày hiện tại.
       */
      if (
        isToday &&
        departureTime < now
      ) {
        continue;
      }

      const arrivalTime =
        new Date(
          departureTime.getTime() +
            2 * 60 * 60 * 1000,
        );

      const mockTripId =
        `MOCK|Flight|${code}|` +
        `${from}|${to}|` +
        `${departureDate}|${timeForId}`;

      results.push({
        trip_id: mockTripId,

        departure_time:
          departureTime.toISOString(),

        arrival_time:
          arrivalTime.toISOString(),

        base_price: price,

        departure_location: from,
        arrival_location: to,

        vehicle_name: airline.name,
        vehicle_type: 'Flight',

        rating:
          (
            4.5 +
            (index % 5) / 10
          ).toFixed(1),

        duration: '2h 15m',
      });
    }

    return results;
  }

  /**
   * Lấy sơ đồ ghế của chuyến đi.
   *
   * Chuyến thật:
   * - Lấy ghế từ MySQL.
   * - Kiểm tra khóa giữ ghế trên Redis.
   *
   * Chuyến mock:
   * - Sinh dữ liệu ghế theo loại phương tiện.
   */
  async getSeatLayout(
    tripId: string | number,
  ): Promise<any> {
    /*
     * Chuyến xe khách thật có tripId là số.
     */
    if (
      !Number.isNaN(
        Number(tripId),
      )
    ) {
      const realTripId =
        Number(tripId);

      const [dbSeats]: any =
        await pool.query(
          `
            SELECT
              seat_id AS seatId,
              trip_id AS tripId,

              /*
               * Frontend dùng id để hiển thị
               * mã ghế A01, A02, B01...
               */
              seat_code AS id,

              seat_code AS seatNumber,
              status,
              floor,
              \`row\`,
              position

            FROM seats

            WHERE trip_id = ?

            ORDER BY seat_id ASC
          `,
          [realTripId],
        );

      /*
       * Chuyến chưa có dữ liệu ghế.
       */
      if (dbSeats.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      /*
       * Tạo danh sách Redis key của từng ghế.
       */
      const seatKeys =
        dbSeats.map(
          (seat: any) =>
            `lock:trip:${realTripId}:` +
            `seat:${seat.seatId}`,
        );

      /*
       * Kiểm tra tất cả khóa Redis trong một lần gọi.
       */
      const lockStatuses =
        await redisClient.mget(
          seatKeys,
        );

      /*
       * Gộp trạng thái trong MySQL
       * với trạng thái giữ ghế trong Redis.
       */
      const seatsWithLockStatus =
        dbSeats.map(
          (
            seat: any,
            index: number,
          ) => {
            const isLocked =
              lockStatuses[index] !==
              null;

            const databaseStatus =
              String(
                seat.status,
              ).toLowerCase();

            const finalStatus =
              databaseStatus ===
                'available' &&
              isLocked
                ? 'holding'
                : databaseStatus;

            /*
             * Một số dữ liệu ghế Bus cũ/chuyến test chỉ có
             * seat_code (A01, B01, C01, D01...) nhưng các cột
             * floor, row, position trong DB đang NULL.
             *
             * Frontend BusBooking cần đủ 3 thuộc tính này để
             * render ghế vào đúng tầng / hàng / bên trái-phải.
             *
             * Quy ước:
             * Axx = Tầng 1 - Trái
             * Bxx = Tầng 1 - Phải
             * Cxx = Tầng 2 - Trái
             * Dxx = Tầng 2 - Phải
             */
            const seatCode =
              String(
                seat.id ||
                seat.seatNumber ||
                '',
              )
                .trim()
                .toUpperCase();

            const seatPrefix =
              seatCode.charAt(0);

            const rowFromCode =
              Number.parseInt(
                seatCode.slice(1),
                10,
              );

            let derivedFloor:
              number | null = null;

            let derivedPosition:
              'left' |
              'right' |
              null = null;

            if (
              seatPrefix === 'A' ||
              seatPrefix === 'B'
            ) {
              derivedFloor = 1;
            } else if (
              seatPrefix === 'C' ||
              seatPrefix === 'D'
            ) {
              derivedFloor = 2;
            }

            if (
              seatPrefix === 'A' ||
              seatPrefix === 'C'
            ) {
              derivedPosition = 'left';
            } else if (
              seatPrefix === 'B' ||
              seatPrefix === 'D'
            ) {
              derivedPosition = 'right';
            }

            const normalizedFloor =
              seat.floor != null
                ? Number(seat.floor)
                : derivedFloor;

            const normalizedRow =
              seat.row != null
                ? Number(seat.row)
                : (
                    Number.isNaN(
                      rowFromCode,
                    )
                      ? null
                      : rowFromCode
                  );

            const normalizedPosition =
              seat.position ||
              derivedPosition;

            return {
              ...seat,
              floor: normalizedFloor,
              row: normalizedRow,
              position:
                normalizedPosition,
              status: finalStatus,
            };
          },
        );

      return {
        success: true,
        data: seatsWithLockStatus,
      };
    }

    /*
     * Chuyến tàu và máy bay sử dụng tripId MOCK.
     */
    if (
      typeof tripId === 'string' &&
      tripId
        .toUpperCase()
        .startsWith('MOCK')
    ) {
      const parts =
        tripId
          .split('|')
          .map(
            (part) =>
              part.trim(),
          );

      const vehicleType =
        parts[1];

      /*
       * Sơ đồ ghế tàu hỏa.
       */
      if (
        vehicleType === 'Train'
      ) {
        const carriages =
          TRAIN_CARRIAGES;

        const seats =
          generateTrainSeats(
            'full',
          );

        return {
          success: true,
          carriages,
          seats,
        };
      }

      /*
       * Máy bay hiện chưa chọn ghế
       * chi tiết tại bước này.
       */
      if (
        vehicleType === 'Flight'
      ) {
        return {
          success: true,
          carriages: [],
          seats: [],
        };
      }
    }

    throw new Error(
      'Không tìm thấy sơ đồ ghế cho chuyến đi này.',
    );
  }

  /**
   * Tạo chuyến xe mới.
   *
   * Phần sinh tự động sơ đồ ghế sẽ được
   * hoàn thiện trong module merchant.
   */
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