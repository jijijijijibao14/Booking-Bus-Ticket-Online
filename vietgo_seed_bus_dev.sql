-- =============================================================================
-- VIETGO - DEV SEED: BUS SEARCH AND SEAT MAP
-- Requires the schema from sql v2.sql and the database named booking.
-- Dev only: check IDs 9001-9005, 9101-9108, and 9201-9204 are reserved for this
-- seed. Existing rows with these IDs are updated so the script can be rerun.
-- =============================================================================

USE booking;

START TRANSACTION;

-- Routes use the same location names as the frontend search options.
INSERT INTO routes (
    route_id,
    departure_location,
    arrival_location,
    distance_km,
    vehicle_type
)
VALUES
    (9001, 'Hà Nội', 'TP. Hồ Chí Minh', 1600.00, 'Bus'),
    (9002, 'TP. Hồ Chí Minh', 'Đà Lạt', 310.00, 'Bus'),
    (9003, 'TP. Hồ Chí Minh', 'Cần Thơ', 170.00, 'Bus'),
    (9004, 'Hà Nội', 'Sapa', 320.00, 'Bus'),
    (9005, 'Đà Nẵng', 'Huế', 100.00, 'Bus')
ON DUPLICATE KEY UPDATE
    departure_location = VALUES(departure_location),
    arrival_location = VALUES(arrival_location),
    distance_km = VALUES(distance_km),
    vehicle_type = VALUES(vehicle_type);

-- partner_id is NULL so the seed never creates or overwrites real user accounts.
INSERT INTO vehicles (
    vehicle_id,
    partner_id,
    vehicle_name,
    license_plate,
    vehicle_type,
    total_seats
)
VALUES
    (9201, NULL, 'FUTA Giường Nằm 20 Chỗ', '51B-900.01', 'Bus', 20),
    (9202, NULL, 'Thành Bưởi Limousine 16 Chỗ', '49B-900.02', 'Bus', 16),
    (9203, NULL, 'Hải Vân Royal 18 Chỗ', '29B-900.03', 'Bus', 18),
    (9204, NULL, 'FUTA Ghế Ngồi 24 Chỗ', '51B-900.04', 'Bus', 24)
ON DUPLICATE KEY UPDATE
    partner_id = VALUES(partner_id),
    vehicle_name = VALUES(vehicle_name),
    license_plate = VALUES(license_plate),
    vehicle_type = VALUES(vehicle_type),
    total_seats = VALUES(total_seats);

-- Each run moves sample departures into the future.
SET @trip_date_1 = DATE_ADD(CURDATE(), INTERVAL 3 DAY);
SET @trip_date_2 = DATE_ADD(CURDATE(), INTERVAL 5 DAY);

INSERT INTO trips (
    trip_id,
    route_id,
    vehicle_id,
    departure_time,
    arrival_time,
    base_price,
    status
)
VALUES
    (9101, 9001, 9201,
     TIMESTAMP(@trip_date_1, '07:30:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '07:30:00'), INTERVAL 30 HOUR),
     850000.00, 'Scheduled'),
    (9102, 9001, 9202,
     TIMESTAMP(@trip_date_1, '19:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '19:00:00'), INTERVAL 29 HOUR),
     980000.00, 'Scheduled'),
    (9103, 9002, 9201,
     TIMESTAMP(@trip_date_1, '06:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '06:00:00'), INTERVAL 7 HOUR),
     350000.00, 'Scheduled'),
    (9104, 9002, 9202,
     TIMESTAMP(@trip_date_1, '22:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '22:00:00'), INTERVAL 7 HOUR),
     420000.00, 'Scheduled'),
    (9105, 9003, 9204,
     TIMESTAMP(@trip_date_1, '08:30:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '08:30:00'), INTERVAL 4 HOUR),
     180000.00, 'Scheduled'),
    (9106, 9004, 9203,
     TIMESTAMP(@trip_date_2, '21:30:00'),
     DATE_ADD(TIMESTAMP(@trip_date_2, '21:30:00'), INTERVAL 6 HOUR),
     420000.00, 'Scheduled'),
    (9107, 9005, 9204,
     TIMESTAMP(@trip_date_2, '09:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_2, '09:00:00'), INTERVAL 3 HOUR),
     120000.00, 'Scheduled'),
    (9108, 9005, 9204,
     TIMESTAMP(@trip_date_2, '15:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_2, '15:00:00'), INTERVAL 3 HOUR),
     120000.00, 'Scheduled')
ON DUPLICATE KEY UPDATE
    route_id = VALUES(route_id),
    vehicle_id = VALUES(vehicle_id),
    departure_time = VALUES(departure_time),
    arrival_time = VALUES(arrival_time),
    base_price = VALUES(base_price),
    status = VALUES(status);

-- Generate exactly the configured capacity for each bus. Existing seat status
-- is preserved on reruns so this seed cannot reopen a seat already booked.
INSERT INTO seats (
    trip_id,
    seat_code,
    floor,
    `row`,
    position,
    status
)
SELECT
    t.trip_id,
    CASE
        WHEN seat_numbers.seat_number <= CEIL(v.total_seats / 2)
            THEN CONCAT('A', LPAD(seat_numbers.seat_number, 2, '0'))
        ELSE CONCAT(
            'B',
            LPAD(seat_numbers.seat_number - CEIL(v.total_seats / 2), 2, '0')
        )
    END AS seat_code,
    1 AS floor,
    CASE
        WHEN seat_numbers.seat_number <= CEIL(v.total_seats / 2)
            THEN seat_numbers.seat_number
        ELSE seat_numbers.seat_number - CEIL(v.total_seats / 2)
    END AS `row`,
    CASE
        WHEN seat_numbers.seat_number <= CEIL(v.total_seats / 2) THEN 'left'
        ELSE 'right'
    END AS position,
    'Available' AS status
FROM (
    SELECT 1 AS seat_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL
    SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL
    SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL
    SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL
    SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL
    SELECT 24
) AS seat_numbers
JOIN trips AS t ON t.trip_id BETWEEN 9101 AND 9108
JOIN vehicles AS v ON v.vehicle_id = t.vehicle_id
WHERE seat_numbers.seat_number <= v.total_seats
ON DUPLICATE KEY UPDATE
    floor = VALUES(floor),
    `row` = VALUES(`row`),
    position = VALUES(position);

COMMIT;

-- Check the inserted sample trips and seat availability.
SELECT
    t.trip_id,
    r.departure_location,
    r.arrival_location,
    t.departure_time,
    t.arrival_time,
    v.vehicle_name,
    v.total_seats,
    t.base_price,
    t.status,
    SUM(CASE WHEN s.status = 'Available' THEN 1 ELSE 0 END) AS available_seats,
    COUNT(s.seat_id) AS total_seeded_seats
FROM trips AS t
JOIN routes AS r ON r.route_id = t.route_id
JOIN vehicles AS v ON v.vehicle_id = t.vehicle_id
LEFT JOIN seats AS s ON s.trip_id = t.trip_id
WHERE t.trip_id BETWEEN 9101 AND 9108
GROUP BY
    t.trip_id,
    r.departure_location,
    r.arrival_location,
    t.departure_time,
    t.arrival_time,
    v.vehicle_name,
    v.total_seats,
    t.base_price,
    t.status
ORDER BY t.departure_time;

-- In the frontend search, choose any route above and select the displayed date
-- (today + 3 days for trips 9101-9105, today + 5 days for trips 9106-9108).
