-- =============================================================================
-- VIETGO - LƯỢC ĐỒ CƠ SỞ DỮ LIỆU ĐẦY ĐỦ
-- Cơ sở dữ liệu: booking
-- Yêu cầu MySQL 8.0.16+ (cột generated và CHECK constraint được thực thi).
--
-- CẢNH BÁO: Đây là script cài đặt mới. Script sẽ xóa vĩnh viễn database
-- `booking` hiện có và toàn bộ dữ liệu trước khi tạo lại schema.
-- Backend hash mật khẩu bằng scrypt; không lưu mật khẩu dạng rõ tại đây.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DROP DATABASE IF EXISTS booking;
SET FOREIGN_KEY_CHECKS = 1;

CREATE DATABASE booking
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE booking;

-- =============================================================================
-- 1. TÀI KHOẢN VÀ HỒ SƠ ĐỐI TÁC
-- =============================================================================

CREATE TABLE users (
    user_id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NULL COMMENT 'Hash scrypt; NULL nếu chỉ đăng nhập bằng Google',
    email VARCHAR(100) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NULL,
    role ENUM('Customer', 'Partner', 'Admin') NOT NULL DEFAULT 'Customer',
    admin_account_guard TINYINT
        GENERATED ALWAYS AS (CASE WHEN role = 'Admin' THEN 1 ELSE NULL END) STORED,
    status ENUM('Pending Approval', 'Active', 'Rejected') NOT NULL DEFAULT 'Active',
    wallet_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_single_admin (admin_account_guard),
    CONSTRAINT chk_users_wallet_balance CHECK (wallet_balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE partner_profiles (
    partner_id INT NOT NULL,
    brand_name VARCHAR(100) NOT NULL,
    license_number VARCHAR(50) NOT NULL,
    commission_rate DECIMAL(4, 2) NOT NULL DEFAULT 10.00,
    withdrawable_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (partner_id),
    UNIQUE KEY uq_partner_profiles_license (license_number),
    CONSTRAINT fk_partner_profiles_user
        FOREIGN KEY (partner_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_partner_commission_rate CHECK (commission_rate BETWEEN 0 AND 100),
    CONSTRAINT chk_partner_withdrawable_balance CHECK (withdrawable_balance >= 0)
) ENGINE=InnoDB;

-- =============================================================================
-- 2. TUYẾN ĐƯỜNG, PHƯƠNG TIỆN VÀ TÀI XẾ
-- =============================================================================

CREATE TABLE routes (
    route_id INT NOT NULL AUTO_INCREMENT,
    departure_location VARCHAR(100) NOT NULL,
    arrival_location VARCHAR(100) NOT NULL,
    distance_km DECIMAL(6, 2) NULL,
    vehicle_type ENUM('Bus') NOT NULL DEFAULT 'Bus',
    PRIMARY KEY (route_id),
    KEY idx_routes_locations (departure_location, arrival_location),
    CONSTRAINT chk_routes_different_locations
        CHECK (departure_location <> arrival_location),
    CONSTRAINT chk_routes_distance CHECK (distance_km IS NULL OR distance_km > 0)
) ENGINE=InnoDB;

CREATE TABLE vehicles (
    vehicle_id INT NOT NULL AUTO_INCREMENT,
    partner_id INT NULL COMMENT 'Đối tác sở hữu phương tiện',
    vehicle_name VARCHAR(100) NOT NULL,
    license_plate VARCHAR(30) NULL,
    vehicle_type ENUM('Bus') NOT NULL DEFAULT 'Bus',
    total_seats INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    PRIMARY KEY (vehicle_id),
    KEY idx_vehicles_partner (partner_id),
    KEY idx_vehicles_type_status (vehicle_type, status),
    CONSTRAINT fk_vehicles_partner
        FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE SET NULL,
    CONSTRAINT chk_vehicles_total_seats CHECK (total_seats > 0)
) ENGINE=InnoDB;

CREATE TABLE drivers (
    driver_id INT NOT NULL AUTO_INCREMENT,
    partner_id INT NOT NULL,
    driver_name VARCHAR(100) NOT NULL,
    driver_phone VARCHAR(15) NOT NULL,
    experience INT NULL,
    status ENUM('available', 'on-trip', 'off-duty') NOT NULL DEFAULT 'available',
    PRIMARY KEY (driver_id),
    KEY idx_drivers_partner_status (partner_id, status),
    CONSTRAINT fk_drivers_partner
        FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE CASCADE,
    CONSTRAINT chk_drivers_experience CHECK (experience IS NULL OR experience >= 0)
) ENGINE=InnoDB;

CREATE TABLE route_duration_cache (
    route_hash CHAR(64) NOT NULL,
    origin VARCHAR(100) NOT NULL,
    destination VARCHAR(100) NOT NULL,
    duration_minutes INT NOT NULL,
    distance_km DECIMAL(8, 2) NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY (route_hash),
    CONSTRAINT chk_route_duration_cache_duration CHECK (duration_minutes > 0),
    CONSTRAINT chk_route_duration_cache_distance CHECK (distance_km IS NULL OR distance_km > 0)
) ENGINE=InnoDB;

CREATE TABLE schedule_templates (
    schedule_template_id INT NOT NULL AUTO_INCREMENT,
    partner_id INT NOT NULL,
    route_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    driver_id INT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    weekdays JSON NOT NULL,
    departure_times JSON NOT NULL,
    base_price DECIMAL(12, 2) NOT NULL,
    driving_duration_minutes INT NOT NULL,
    duration_source ENUM('partner', 'google_routes') NOT NULL DEFAULT 'partner',
    stop_duration_minutes INT NOT NULL DEFAULT 0,
    rest_duration_minutes INT NOT NULL DEFAULT 0,
    buffer_duration_minutes INT NOT NULL DEFAULT 0,
    minimum_turnaround_minutes INT NOT NULL DEFAULT 60,
    transfer_duration_minutes INT NOT NULL DEFAULT 0,
    status ENUM('Draft', 'Active', 'Paused') NOT NULL DEFAULT 'Active',
    idempotency_key VARCHAR(100) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (schedule_template_id),
    UNIQUE KEY uq_schedule_templates_idempotency (partner_id, idempotency_key),
    KEY idx_schedule_templates_partner_status (partner_id, status),
    CONSTRAINT fk_schedule_templates_partner
        FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE CASCADE,
    CONSTRAINT fk_schedule_templates_route
        FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE RESTRICT,
    CONSTRAINT fk_schedule_templates_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
    CONSTRAINT fk_schedule_templates_driver
        FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE SET NULL,
    CONSTRAINT chk_schedule_templates_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_schedule_templates_price CHECK (base_price >= 0),
    CONSTRAINT chk_schedule_templates_duration CHECK (driving_duration_minutes > 0),
    CONSTRAINT chk_schedule_templates_operating_minutes CHECK (
        stop_duration_minutes >= 0 AND rest_duration_minutes >= 0
        AND buffer_duration_minutes >= 0 AND minimum_turnaround_minutes >= 60
        AND transfer_duration_minutes >= 0
    )
) ENGINE=InnoDB;

-- =============================================================================
-- 3. CHUYẾN XE VÀ GHẾ
-- =============================================================================

CREATE TABLE trips (
    trip_id INT NOT NULL AUTO_INCREMENT,
    route_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    driver_id INT NULL,
    departure_time DATETIME NOT NULL,
    arrival_time DATETIME NOT NULL,
    estimated_duration_minutes INT NULL,
    actual_departure_time DATETIME NULL,
    actual_arrival_time DATETIME NULL,
    minimum_turnaround_minutes INT NOT NULL DEFAULT 60,
    transfer_duration_minutes INT NOT NULL DEFAULT 0,
    schedule_template_id INT NULL,
    generation_key VARCHAR(120) NULL,
    base_price DECIMAL(12, 2) NOT NULL,
    status ENUM('Scheduled', 'Departed', 'Completed', 'Cancelled')
        NOT NULL DEFAULT 'Scheduled',
    PRIMARY KEY (trip_id),
    KEY idx_trips_route_departure (route_id, departure_time),
    KEY idx_trips_vehicle_departure (vehicle_id, departure_time),
    KEY idx_trips_driver (driver_id),
    KEY idx_trips_status_departure (status, departure_time),
    UNIQUE KEY uq_trips_generation_key (generation_key),
    KEY idx_trips_template_departure (schedule_template_id, departure_time),
    CONSTRAINT fk_trips_route
        FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE RESTRICT,
    CONSTRAINT fk_trips_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
    CONSTRAINT fk_trips_driver
        FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE SET NULL,
    CONSTRAINT fk_trips_schedule_template
        FOREIGN KEY (schedule_template_id)
        REFERENCES schedule_templates(schedule_template_id) ON DELETE SET NULL,
    CONSTRAINT chk_trips_time CHECK (arrival_time > departure_time),
    CONSTRAINT chk_trips_base_price CHECK (base_price >= 0),
    CONSTRAINT chk_trips_estimated_duration CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),
    CONSTRAINT chk_trips_turnaround_minutes CHECK (minimum_turnaround_minutes >= 60 AND transfer_duration_minutes >= 0)
) ENGINE=InnoDB;

CREATE TABLE seats (
    seat_id INT NOT NULL AUTO_INCREMENT,
    trip_id INT NOT NULL,
    seat_code VARCHAR(10) NOT NULL COMMENT 'Mã ghế hiển thị trên giao diện, ví dụ A1',
    floor INT NULL,
    `row` INT NULL,
    position VARCHAR(10) NULL,
    status ENUM('Available', 'Booked') NOT NULL DEFAULT 'Available'
        COMMENT 'Trạng thái giữ ghế tạm thời được quản lý bằng Redis',
    PRIMARY KEY (seat_id),
    UNIQUE KEY uq_seats_trip_code (trip_id, seat_code),
    KEY idx_seats_trip_status (trip_id, status),
    CONSTRAINT fk_seats_trip
        FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE,
    CONSTRAINT chk_seats_floor CHECK (floor IS NULL OR floor > 0),
    CONSTRAINT chk_seats_row CHECK (`row` IS NULL OR `row` > 0)
) ENGINE=InnoDB;

-- =============================================================================
-- 4. ĐẶT VÉ, VÉ XE VÀ LỊCH SỬ GIAO DỊCH VÍ
-- =============================================================================

CREATE TABLE bookings (
    booking_id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    booking_code VARCHAR(50) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    payment_status ENUM('Pending', 'Paid', 'Refunded', 'Cancelled')
        NOT NULL DEFAULT 'Pending',
    contact_full_name VARCHAR(100) NOT NULL,
    contact_email VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(15) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (booking_id),
    UNIQUE KEY uq_bookings_code (booking_code),
    KEY idx_bookings_user_created (user_id, created_at),
    KEY idx_bookings_payment_status (payment_status, created_at),
    CONSTRAINT fk_bookings_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT chk_bookings_total_amount CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE tickets (
    ticket_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    seat_id INT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    passenger_email VARCHAR(100) NULL,
    passenger_phone VARCHAR(15) NULL,
    ticket_price DECIMAL(12, 2) NOT NULL,
    qr_code_data TEXT NOT NULL,
    PRIMARY KEY (ticket_id),
    KEY idx_tickets_booking (booking_id),
    KEY idx_tickets_seat (seat_id),
    CONSTRAINT fk_tickets_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT fk_tickets_seat
        FOREIGN KEY (seat_id) REFERENCES seats(seat_id) ON DELETE SET NULL,
    CONSTRAINT chk_tickets_price CHECK (ticket_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE wallet_transactions (
    wallet_transaction_id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    booking_id INT NULL,
    related_booking_id INT NULL,
    transaction_type ENUM('PAYMENT', 'REFUND', 'ADJUSTMENT') NOT NULL,
    amount DECIMAL(12, 2) NOT NULL COMMENT 'Số có dấu: thanh toán âm, hoàn tiền dương',
    balance_before DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    reference_code VARCHAR(100) NULL,
    description VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (wallet_transaction_id),
    KEY idx_wallet_transactions_user_created (user_id, created_at),
    KEY idx_wallet_transactions_booking_type (booking_id, transaction_type),
    KEY idx_wallet_transactions_related_booking (related_booking_id),
    CONSTRAINT fk_wallet_transactions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_wallet_transactions_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL,
    CONSTRAINT fk_wallet_transactions_related_booking
        FOREIGN KEY (related_booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL,
    CONSTRAINT chk_wallet_balance_before CHECK (balance_before >= 0),
    CONSTRAINT chk_wallet_balance_after CHECK (balance_after >= 0)
) ENGINE=InnoDB;

-- =============================================================================
-- 5. YÊU CẦU HOÀN TIỀN VÀ ĐÁNH GIÁ
-- =============================================================================

CREATE TABLE refund_requests (
    refund_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    partner_id INT NULL,
    reason TEXT NOT NULL,
    refund_amount DECIMAL(12, 2) NOT NULL,
    status ENUM('Pending', 'WaitRefund', 'Approved', 'Rejected')
        NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (refund_id),
    KEY idx_refund_requests_booking_created (booking_id, created_at),
    KEY idx_refund_requests_partner_status (partner_id, status),
    CONSTRAINT fk_refund_requests_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT fk_refund_requests_partner
        FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE SET NULL,
    CONSTRAINT chk_refund_requests_amount CHECK (refund_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE feedbacks (
    feedback_id INT NOT NULL AUTO_INCREMENT,
    ticket_id INT NOT NULL,
    user_id INT NOT NULL,
    rating_seats INT NOT NULL,
    rating_service INT NOT NULL,
    comment TEXT NULL,
    partner_reply TEXT NULL,
    partner_replied_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (feedback_id),
    UNIQUE KEY uq_feedbacks_ticket (ticket_id),
    KEY idx_feedbacks_user_created (user_id, created_at),
    CONSTRAINT fk_feedbacks_ticket
        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    CONSTRAINT fk_feedbacks_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_feedbacks_rating_seats CHECK (rating_seats BETWEEN 1 AND 5),
    CONSTRAINT chk_feedbacks_rating_service CHECK (rating_service BETWEEN 1 AND 5),
    CONSTRAINT chk_feedbacks_comment_length CHECK (comment IS NULL OR CHAR_LENGTH(comment) <= 2000),
    CONSTRAINT chk_feedbacks_reply_length CHECK (partner_reply IS NULL OR CHAR_LENGTH(partner_reply) <= 2000)
) ENGINE=InnoDB;

-- =============================================================================
-- 6. TRÒ CHUYỆN
-- =============================================================================

CREATE TABLE booking.chat_conversations (
    conversation_id INT NOT NULL AUTO_INCREMENT,
    conversation_type ENUM('CUSTOMER_PARTNER', 'CUSTOMER_SUPPORT', 'PARTNER_SUPPORT')
        NOT NULL,
    -- Participant IDs are validated by the communications backend.
    customer_id INT NULL,
    partner_id INT NULL,
    customer_key INT
        GENERATED ALWAYS AS (COALESCE(customer_id, 0)) STORED,
    partner_key INT
        GENERATED ALWAYS AS (COALESCE(partner_id, 0)) STORED,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id),
    UNIQUE KEY uq_chat_conversation_pair (conversation_type, customer_key, partner_key),
    KEY idx_chat_customer_updated (customer_id, updated_at),
    KEY idx_chat_partner_updated (partner_id, updated_at),
    CONSTRAINT chk_chat_conversation_participants CHECK (
        (conversation_type = 'CUSTOMER_PARTNER'
            AND customer_id IS NOT NULL AND partner_id IS NOT NULL)
        OR (conversation_type = 'CUSTOMER_SUPPORT'
            AND customer_id IS NOT NULL AND partner_id IS NULL)
        OR (conversation_type = 'PARTNER_SUPPORT'
            AND customer_id IS NULL AND partner_id IS NOT NULL)
    )
) ENGINE=InnoDB;

CREATE TABLE booking.chat_messages (
    message_id BIGINT NOT NULL AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    sender_role ENUM('Customer', 'Partner', 'Admin') NOT NULL,
    message_text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id),
    KEY idx_chat_messages_conversation (conversation_id, message_id),
    KEY idx_chat_messages_sender (sender_id, created_at),
    CONSTRAINT fk_chat_messages_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES booking.chat_conversations(conversation_id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_messages_sender
        FOREIGN KEY (sender_id) REFERENCES booking.users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_chat_messages_length CHECK (CHAR_LENGTH(message_text) BETWEEN 1 AND 2000)
) ENGINE=InnoDB;

-- =============================================================================
-- 7. ĐƠN THANH TOÁN VÀ CÁC LẦN GIAO DỊCH (VNPAY)
-- =============================================================================

CREATE TABLE payment_orders (
    payment_order_id INT NOT NULL AUTO_INCREMENT,
    order_code VARCHAR(100) NOT NULL,
    user_id INT NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    payment_status ENUM('Pending', 'Paid', 'Failed', 'Cancelled', 'Refunded')
        NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (payment_order_id),
    UNIQUE KEY uq_payment_orders_code (order_code),
    KEY idx_payment_orders_user_status (user_id, payment_status),
    CONSTRAINT fk_payment_orders_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT chk_payment_orders_total_amount CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE payment_order_items (
    payment_order_item_id INT NOT NULL AUTO_INCREMENT,
    payment_order_id INT NOT NULL,
    booking_id INT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    PRIMARY KEY (payment_order_item_id),
    UNIQUE KEY uq_payment_order_booking (payment_order_id, booking_id),
    UNIQUE KEY uq_payment_booking (booking_id),
    KEY idx_payment_order_items_booking (booking_id),
    CONSTRAINT fk_payment_order_items_order
        FOREIGN KEY (payment_order_id)
        REFERENCES payment_orders(payment_order_id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_order_items_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    CONSTRAINT chk_payment_order_items_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE payments (
    payment_id INT NOT NULL AUTO_INCREMENT,
    payment_order_id INT NULL,
    booking_id INT NULL,
    provider VARCHAR(30) NOT NULL DEFAULT 'VNPAY',
    txn_ref VARCHAR(100) NOT NULL,
    transaction_no VARCHAR(100) NULL,
    amount DECIMAL(12, 2) NOT NULL,
    bank_code VARCHAR(50) NULL,
    response_code VARCHAR(20) NULL,
    transaction_status VARCHAR(20) NULL,
    payment_status ENUM('Pending', 'Paid', 'Failed', 'Cancelled')
        NOT NULL DEFAULT 'Pending',
    payment_time DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (payment_id),
    UNIQUE KEY uq_payments_txn_ref (txn_ref),
    KEY idx_payments_booking_id (booking_id),
    KEY idx_payments_payment_order_id (payment_order_id),
    KEY idx_payments_status (payment_status),
    CONSTRAINT fk_payments_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payments_payment_order
        FOREIGN KEY (payment_order_id) REFERENCES payment_orders(payment_order_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE=InnoDB;
