-- =============================================================================
-- ĐỒ ÁN MÔN HỌC: NỀN TẢNG ĐẶT VÉ TỔNG HỢP VIỆTGO (PRODUCTION READY)
-- DATABASE TARGET NAME: transport_booking_db (BẢN PLAIN TEXT - KHÔNG HASH PASSWORD)
-- THỜI GIAN THIẾT KẾ: THÁNG 06 NĂM 2026
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP DATABASE IF EXISTS transport_booking_db;
SET FOREIGN_KEY_CHECKS = 1;

CREATE DATABASE transport_booking_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE transport_booking_db;

-- -----------------------------------------------------------------------------
-- 1. PHÂN HỆ QUẢN LÝ TÀI KHOẢN VÀ VÍ ĐIỆN TỬ (RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_plain VARCHAR(100) NOT NULL COMMENT 'Mật khẩu văn bản thô phục vụ demo trực quan, không dùng hash',
    email VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    role ENUM('Customer', 'Partner', 'Admin') NOT NULL DEFAULT 'Customer',
    status ENUM('Pending Approval', 'Active', 'Rejected') NOT NULL DEFAULT 'Active',
    wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Ví tiền ảo phục vụ hoàn trả tiền vé trực tiếp',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE partner_profiles (
    partner_id INT PRIMARY KEY COMMENT 'Khóa ngoại liên kết 1-1 chặt chẽ với bảng Users',
    brand_name VARCHAR(100) NOT NULL COMMENT 'Tên thương hiệu đối tác vận tải',
    license_number VARCHAR(50) NOT NULL UNIQUE,
    commission_rate DECIMAL(4,2) NOT NULL DEFAULT 10.00 COMMENT 'Tỷ lệ % chiết khấu sàn thu của nhà xe',
    withdrawable_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Số dư doanh thu đối tác có thể bấm nút rút',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 2. PHÂN HỆ HẠ TẦNG TUYẾN ĐƯỜNG & ĐỘI PHƯƠNG TIỆN GỐC
-- -----------------------------------------------------------------------------
CREATE TABLE routes (
    route_id INT AUTO_INCREMENT PRIMARY KEY,
    departure_location VARCHAR(100) NOT NULL,
    arrival_location VARCHAR(100) NOT NULL,
    distance_km DECIMAL(6,2) NULL,
    vehicle_type ENUM('Bus') NOT NULL DEFAULT 'Bus'
) ENGINE=InnoDB;

CREATE TABLE vehicles (
    vehicle_id INT AUTO_INCREMENT PRIMARY KEY,
    partner_id INT NULL COMMENT 'Đối tác sở hữu phương tiện xe khách',
    vehicle_name VARCHAR(100) NOT NULL,
    license_plate VARCHAR(30) NULL COMMENT 'Biển số xe (Chỉ dành cho xe khách)',
    vehicle_type ENUM('Bus') NOT NULL DEFAULT 'Bus',
    total_seats INT NOT NULL,
    FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 3. PHÂN HỆ LỊCH TRÌNH XE KHÁCH VÀ CHI TIẾT CHỖ NGỒI
-- -----------------------------------------------------------------------------
CREATE TABLE trips (
    trip_id INT AUTO_INCREMENT PRIMARY KEY,
    route_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    departure_time DATETIME NOT NULL,
    arrival_time DATETIME NOT NULL,
    base_price DECIMAL(12,2) NOT NULL,
    status ENUM('Scheduled', 'Departed','Completed', 'Cancelled') NOT NULL DEFAULT 'Scheduled',
    FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE seats (
    seat_id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL,
    seat_code VARCHAR(10) NOT NULL COMMENT 'Mã ghế hiển thị trên UI (A1, B12...)',
    floor INT NULL COMMENT 'Tầng của ghế (1 hoặc 2 cho xe giường nằm)',
    `row` INT NULL COMMENT 'Hàng của ghế',
    position VARCHAR(10) NULL COMMENT 'Vị trí (left, right, middle)',
    status ENUM('Available', 'Booked') NOT NULL DEFAULT 'Available' COMMENT 'Trạng thái giữ chỗ (holding) được quản lý trên Redis',
    FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 4. PHÂN HỆ GIAO DỊCH, VÉ ĐIỆN TỬ VÀ KHÁCH ĐẶT HỘ
-- -----------------------------------------------------------------------------
CREATE TABLE bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    booking_code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Mã hóa đơn tổng',
    total_amount DECIMAL(12,2) NOT NULL,
    payment_status ENUM('Pending', 'Paid', 'Refunded') NOT NULL DEFAULT 'Pending',
    contact_full_name VARCHAR(100) NOT NULL COMMENT 'Thông tin liên hệ nhận hóa đơn chính',
    contact_email VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(15) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE tickets (
    ticket_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    seat_id INT NULL,
    passenger_name VARCHAR(100) NOT NULL COMMENT 'Họ tên hành khách thực tế (Hỗ trợ luồng đặt hộ)',
    passenger_email VARCHAR(100) NULL COMMENT 'Email liên hệ của hành khách (nếu có)',
    passenger_phone VARCHAR(15) NULL,
    ticket_price DECIMAL(12,2) NOT NULL,
    qr_code_data TEXT NOT NULL COMMENT 'Chuỗi dữ liệu thô phục vụ sinh mã QR Code',
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    FOREIGN KEY (seat_id) REFERENCES seats(seat_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 5. PHÂN HỆ CHĂM SÓC KHÁCH HÀNG: HOÀN TIỀN VÀ ĐÁNH GIÁ CHẤM SAO
-- -----------------------------------------------------------------------------
CREATE TABLE refund_requests (
    refund_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    partner_id INT NULL,
    reason TEXT NOT NULL,
    refund_amount DECIMAL(12,2) NOT NULL,
    status ENUM('Pending','Wait Refund', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE feedbacks (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL UNIQUE COMMENT 'Ép buộc ràng buộc UNIQUE: Một chiếc vé đi xong chỉ đánh giá được 1 lần',
    user_id INT NOT NULL,
    rating_seats INT NOT NULL CHECK (rating_seats BETWEEN 1 AND 5),
    rating_service INT NOT NULL CHECK (rating_service BETWEEN 1 AND 5),
    comment TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE drivers (
  driver_id INT AUTO_INCREMENT PRIMARY KEY,
  partner_id INT NOT NULL,
  driver_name VARCHAR(100) NOT NULL,
  driver_phone VARCHAR(15) NOT NULL,
  experience INT ,
  status ENUM('available','on-trip','off-duty') DEFAULT 'available',
  FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE CASCADE
);

ALTER TABLE trips
ADD COLUMN driver_id INT NULL,
ADD CONSTRAINT fk_trip_driver
  FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE SET NULL;

USE transport_booking_db;

CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,

    booking_id INT NOT NULL,

    provider VARCHAR(30) NOT NULL DEFAULT 'VNPAY',

    txn_ref VARCHAR(100) NOT NULL,
    transaction_no VARCHAR(100) NULL,

    amount DECIMAL(12,2) NOT NULL,

    bank_code VARCHAR(50) NULL,
    response_code VARCHAR(20) NULL,
    transaction_status VARCHAR(20) NULL,

    payment_status ENUM(
        'Pending',
        'Paid',
        'Failed',
        'Cancelled'
    ) NOT NULL DEFAULT 'Pending',

    payment_time DATETIME NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_payments_txn_ref
        UNIQUE (txn_ref),

    CONSTRAINT fk_payments_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    INDEX idx_payments_booking_id (booking_id),
    INDEX idx_payments_status (payment_status)
) ENGINE=InnoDB;
