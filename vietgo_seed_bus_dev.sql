-- =============================================================================
-- VIETGO - DEV SEED CHO LUỒNG XE KHÁCH -> BOOKING -> VNPAY
-- =============================================================================

USE transport_booking_db;

START TRANSACTION;
-- VIETGO - DEV SEED CHO LUỒNG XE KHÁCH -> BOOKING -> VNPAY
-- Mục tiêu:
--   1) Giữ nguyên tài khoản hiện có của bạn.
--   2) Tạo dữ liệu xe khách với ngày động trong tương lai.
--   3) Có tuyến Hà Nội -> TP. Hồ Chí Minh đúng với UI hiện tại.
--   4) Có ghế Available để test giữ ghế và tạo booking.
--
-- Có thể chạy lại nhiều lần trong môi trường development.
-- Dữ liệu seed dùng dải ID 9000+ để tránh đụng dữ liệu thật.
-- =============================================================================

USE transport_booking_db;

START TRANSACTION;

-- -----------------------------------------------------------------------------
-- 0. XÓA LẠI RIÊNG DỮ LIỆU SEED CŨ (KHÔNG XÓA TÀI KHOẢN THẬT CỦA BẠN)
-- -----------------------------------------------------------------------------
DELETE FROM seats
WHERE trip_id IN (9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108);

DELETE FROM trips
WHERE trip_id IN (9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108);

DELETE FROM vehicles
WHERE vehicle_id IN (9201, 9202, 9203, 9204);

DELETE FROM routes
WHERE route_id IN (9001, 9002, 9003, 9004, 9005);

-- -----------------------------------------------------------------------------
-- 1. TẠO TÀI KHOẢN ĐỐI TÁC DEMO
-- Lưu ý: password_plain chỉ phù hợp môi trường demo/dev.
-- Production phải dùng password_hash.
-- -----------------------------------------------------------------------------
INSERT INTO users (
    user_id,
    username,
    password_plain,
    email,
    full_name,
    phone,
    role,
    wallet_balance
)
VALUES
    (9002, 'futa_seed_partner', 'futa123', 'futa.seed@vietgo.local',
     'Phương Trang FUTA Bus Lines', '0900009002', 'Partner', 0.00),

    (9003, 'thanhbuoi_seed_partner', 'thanhbuoi123', 'thanhbuoi.seed@vietgo.local',
     'Thành Bưởi Limousine', '0900009003', 'Partner', 0.00),

    (9004, 'haivan_seed_partner', 'haivan123', 'haivan.seed@vietgo.local',
     'Hải Vân Express', '0900009004', 'Partner', 0.00)
ON DUPLICATE KEY UPDATE
    username = VALUES(username),
    password_plain = VALUES(password_plain),
    email = VALUES(email),
    full_name = VALUES(full_name),
    phone = VALUES(phone),
    role = VALUES(role);

INSERT INTO partner_profiles (
    partner_id,
    brand_name,
    license_number,
    commission_rate,
    withdrawable_balance,
    is_approved
)
VALUES
    (9002, 'Phương Trang FUTA Bus Lines', 'SEED-FUTA-2026', 10.00, 0.00, TRUE),
    (9003, 'Thành Bưởi Limousine', 'SEED-TB-2026', 12.00, 0.00, TRUE),
    (9004, 'Hải Vân Express', 'SEED-HV-2026', 9.50, 0.00, TRUE)
ON DUPLICATE KEY UPDATE
    brand_name = VALUES(brand_name),
    license_number = VALUES(license_number),
    commission_rate = VALUES(commission_rate),
    is_approved = VALUES(is_approved);

-- -----------------------------------------------------------------------------
-- 2. TUYẾN XE KHÁCH
-- Tên địa điểm dùng đúng kiểu hiển thị phổ biến ở frontend.
-- -----------------------------------------------------------------------------
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
    (9005, 'Đà Nẵng', 'Huế', 100.00, 'Bus');

-- -----------------------------------------------------------------------------
-- 3. XE KHÁCH
-- -----------------------------------------------------------------------------
INSERT INTO vehicles (
    vehicle_id,
    partner_id,
    vehicle_name,
    license_plate,
    vehicle_type,
    total_seats
)
VALUES
    (9201, 9002, 'FUTA Giường Nằm 20 Chỗ', '51B-900.01', 'Bus', 20),
    (9202, 9003, 'Thành Bưởi Limousine 16 Chỗ', '49B-900.02', 'Bus', 16),
    (9203, 9004, 'Hải Vân Royal 18 Chỗ', '29B-900.03', 'Bus', 18),
    (9204, 9002, 'FUTA Ghế Ngồi 24 Chỗ', '51B-900.04', 'Bus', 24);

-- -----------------------------------------------------------------------------
-- 4. NGÀY CHẠY ĐỘNG
-- Mỗi lần chạy seed, chuyến luôn nằm trong tương lai.
-- -----------------------------------------------------------------------------
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
    -- Hà Nội -> TP. Hồ Chí Minh
    (9101, 9001, 9201,
     TIMESTAMP(@trip_date_1, '07:30:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '07:30:00'), INTERVAL 30 HOUR),
     850000.00, 'Scheduled'),

    (9102, 9001, 9202,
     TIMESTAMP(@trip_date_1, '19:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '19:00:00'), INTERVAL 29 HOUR),
     980000.00, 'Scheduled'),

    -- TP. Hồ Chí Minh -> Đà Lạt
    (9103, 9002, 9201,
     TIMESTAMP(@trip_date_1, '06:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '06:00:00'), INTERVAL 7 HOUR),
     350000.00, 'Scheduled'),

    (9104, 9002, 9202,
     TIMESTAMP(@trip_date_1, '22:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '22:00:00'), INTERVAL 7 HOUR),
     420000.00, 'Scheduled'),

    -- TP. Hồ Chí Minh -> Cần Thơ
    (9105, 9003, 9204,
     TIMESTAMP(@trip_date_1, '08:30:00'),
     DATE_ADD(TIMESTAMP(@trip_date_1, '08:30:00'), INTERVAL 4 HOUR),
     180000.00, 'Scheduled'),

    -- Hà Nội -> Sapa
    (9106, 9004, 9203,
     TIMESTAMP(@trip_date_2, '21:30:00'),
     DATE_ADD(TIMESTAMP(@trip_date_2, '21:30:00'), INTERVAL 6 HOUR),
     420000.00, 'Scheduled'),

    -- Đà Nẵng -> Huế
    (9107, 9005, 9204,
     TIMESTAMP(@trip_date_2, '09:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_2, '09:00:00'), INTERVAL 3 HOUR),
     120000.00, 'Scheduled'),

    (9108, 9005, 9204,
     TIMESTAMP(@trip_date_2, '15:00:00'),
     DATE_ADD(TIMESTAMP(@trip_date_2, '15:00:00'), INTERVAL 3 HOUR),
     120000.00, 'Scheduled');

-- -----------------------------------------------------------------------------
-- 5. GHẾ XE KHÁCH
-- Schema hiện tại dùng cột seat_number, không dùng seat_code.
-- -----------------------------------------------------------------------------
INSERT INTO seats (trip_id, carriage_id, seat_number, status) VALUES
-- Trip 9101 - 20 ghế
(9101, NULL, 'A01', 'Available'), (9101, NULL, 'A02', 'Available'),
(9101, NULL, 'A03', 'Available'), (9101, NULL, 'A04', 'Available'),
(9101, NULL, 'A05', 'Available'), (9101, NULL, 'A06', 'Available'),
(9101, NULL, 'A07', 'Available'), (9101, NULL, 'A08', 'Available'),
(9101, NULL, 'A09', 'Available'), (9101, NULL, 'A10', 'Available'),
(9101, NULL, 'B01', 'Available'), (9101, NULL, 'B02', 'Available'),
(9101, NULL, 'B03', 'Booked'),    (9101, NULL, 'B04', 'Available'),
(9101, NULL, 'B05', 'Available'), (9101, NULL, 'B06', 'Available'),
(9101, NULL, 'B07', 'Available'), (9101, NULL, 'B08', 'Available'),
(9101, NULL, 'B09', 'Available'), (9101, NULL, 'B10', 'Available'),

-- Trip 9102 - 16 ghế
(9102, NULL, 'L01', 'Available'), (9102, NULL, 'L02', 'Available'),
(9102, NULL, 'L03', 'Available'), (9102, NULL, 'L04', 'Available'),
(9102, NULL, 'L05', 'Available'), (9102, NULL, 'L06', 'Available'),
(9102, NULL, 'L07', 'Booked'),    (9102, NULL, 'L08', 'Available'),
(9102, NULL, 'L09', 'Available'), (9102, NULL, 'L10', 'Available'),
(9102, NULL, 'L11', 'Available'), (9102, NULL, 'L12', 'Available'),
(9102, NULL, 'L13', 'Available'), (9102, NULL, 'L14', 'Available'),
(9102, NULL, 'L15', 'Available'), (9102, NULL, 'L16', 'Available'),

-- Trip 9103 - 20 ghế
(9103, NULL, 'A01', 'Available'), (9103, NULL, 'A02', 'Available'),
(9103, NULL, 'A03', 'Available'), (9103, NULL, 'A04', 'Available'),
(9103, NULL, 'A05', 'Available'), (9103, NULL, 'A06', 'Available'),
(9103, NULL, 'A07', 'Available'), (9103, NULL, 'A08', 'Available'),
(9103, NULL, 'A09', 'Available'), (9103, NULL, 'A10', 'Available'),
(9103, NULL, 'B01', 'Available'), (9103, NULL, 'B02', 'Available'),
(9103, NULL, 'B03', 'Available'), (9103, NULL, 'B04', 'Available'),
(9103, NULL, 'B05', 'Available'), (9103, NULL, 'B06', 'Available'),
(9103, NULL, 'B07', 'Available'), (9103, NULL, 'B08', 'Available'),
(9103, NULL, 'B09', 'Available'), (9103, NULL, 'B10', 'Available'),

-- Trip 9104 - 16 ghế
(9104, NULL, 'VIP01', 'Available'), (9104, NULL, 'VIP02', 'Available'),
(9104, NULL, 'VIP03', 'Available'), (9104, NULL, 'VIP04', 'Available'),
(9104, NULL, 'VIP05', 'Available'), (9104, NULL, 'VIP06', 'Available'),
(9104, NULL, 'VIP07', 'Available'), (9104, NULL, 'VIP08', 'Available'),
(9104, NULL, 'VIP09', 'Available'), (9104, NULL, 'VIP10', 'Available'),
(9104, NULL, 'VIP11', 'Available'), (9104, NULL, 'VIP12', 'Available'),
(9104, NULL, 'VIP13', 'Available'), (9104, NULL, 'VIP14', 'Available'),
(9104, NULL, 'VIP15', 'Available'), (9104, NULL, 'VIP16', 'Available'),

-- Trip 9105 - 12 ghế đủ để test
(9105, NULL, 'C01', 'Available'), (9105, NULL, 'C02', 'Available'),
(9105, NULL, 'C03', 'Available'), (9105, NULL, 'C04', 'Available'),
(9105, NULL, 'C05', 'Available'), (9105, NULL, 'C06', 'Available'),
(9105, NULL, 'C07', 'Available'), (9105, NULL, 'C08', 'Available'),
(9105, NULL, 'C09', 'Available'), (9105, NULL, 'C10', 'Available'),
(9105, NULL, 'C11', 'Available'), (9105, NULL, 'C12', 'Available'),

-- Trip 9106 - 12 ghế
(9106, NULL, 'S01', 'Available'), (9106, NULL, 'S02', 'Available'),
(9106, NULL, 'S03', 'Available'), (9106, NULL, 'S04', 'Available'),
(9106, NULL, 'S05', 'Available'), (9106, NULL, 'S06', 'Available'),
(9106, NULL, 'S07', 'Available'), (9106, NULL, 'S08', 'Available'),
(9106, NULL, 'S09', 'Available'), (9106, NULL, 'S10', 'Available'),
(9106, NULL, 'S11', 'Available'), (9106, NULL, 'S12', 'Available'),

-- Trip 9107 - 10 ghế
(9107, NULL, 'H01', 'Available'), (9107, NULL, 'H02', 'Available'),
(9107, NULL, 'H03', 'Available'), (9107, NULL, 'H04', 'Available'),
(9107, NULL, 'H05', 'Available'), (9107, NULL, 'H06', 'Available'),
(9107, NULL, 'H07', 'Available'), (9107, NULL, 'H08', 'Available'),
(9107, NULL, 'H09', 'Available'), (9107, NULL, 'H10', 'Available'),

-- Trip 9108 - 10 ghế
(9108, NULL, 'H01', 'Available'), (9108, NULL, 'H02', 'Available'),
(9108, NULL, 'H03', 'Available'), (9108, NULL, 'H04', 'Available'),
(9108, NULL, 'H05', 'Available'), (9108, NULL, 'H06', 'Available'),
(9108, NULL, 'H07', 'Available'), (9108, NULL, 'H08', 'Available'),
(9108, NULL, 'H09', 'Available'), (9108, NULL, 'H10', 'Available');

COMMIT;

-- =============================================================================
-- 6. KIỂM TRA SAU KHI SEED
-- =============================================================================
SELECT
    t.trip_id,
    r.departure_location,
    r.arrival_location,
    t.departure_time,
    t.arrival_time,
    v.vehicle_name,
    t.base_price,
    t.status,
    SUM(CASE WHEN s.status = 'Available' THEN 1 ELSE 0 END) AS available_seats,
    COUNT(s.seat_id) AS total_seeded_seats
FROM trips t
JOIN routes r ON r.route_id = t.route_id
JOIN vehicles v ON v.vehicle_id = t.vehicle_id
LEFT JOIN seats s ON s.trip_id = t.trip_id
WHERE t.trip_id BETWEEN 9101 AND 9108
GROUP BY
    t.trip_id,
    r.departure_location,
    r.arrival_location,
    t.departure_time,
    t.arrival_time,
    v.vehicle_name,
    t.base_price,
    t.status
ORDER BY t.departure_time;

-- Gợi ý test frontend:
--   Tuyến: Hà Nội -> TP. Hồ Chí Minh
--   Ngày:  CURDATE() + 3 ngày
-- Hoặc:
--   Tuyến: TP. Hồ Chí Minh -> Đà Lạt
--   Ngày:  CURDATE() + 3 ngày
