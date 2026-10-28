USE booking;

ALTER TABLE wallet_transactions
    MODIFY COLUMN transaction_type ENUM('PAYMENT', 'REFUND', 'ADJUSTMENT', 'PARTNER_PAYOUT') NOT NULL;

ALTER TABLE users
  MODIFY COLUMN status ENUM(
    'Pending Approval',
    'Active',
    'Rejected',
    'Suspended',
    'Deleted'
  ) NOT NULL DEFAULT 'Active';

SET @completed_at_ddl = IF(
  (SELECT COUNT(*)
   FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'trips'
     AND column_name = 'completed_at') = 0,
  'ALTER TABLE trips ADD COLUMN completed_at DATETIME NULL',
  'SELECT 1'
);
PREPARE completed_at_statement FROM @completed_at_ddl;
EXECUTE completed_at_statement;
DEALLOCATE PREPARE completed_at_statement;

UPDATE trips
SET completed_at = COALESCE(actual_arrival_time, arrival_time, NOW())
WHERE status = 'Completed'
  AND completed_at IS NULL;

CREATE TABLE IF NOT EXISTS partner_payment_accounts (
    partner_id INT NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    bank_account_name VARCHAR(150) NOT NULL,
    bank_account_number VARCHAR(50) NOT NULL,
    branch_name VARCHAR(150) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (partner_id),
    CONSTRAINT fk_partner_payment_accounts_partner
        FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_financial_accounts (
    account_code VARCHAR(30) NOT NULL,
    opening_balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    current_balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (account_code),
    CONSTRAINT chk_system_financial_account_code
        CHECK (account_code IN ('SYSTEM_WALLET', 'COMMISSION_WALLET')),
    CONSTRAINT chk_system_financial_opening_balance CHECK (opening_balance >= 0),
    CONSTRAINT chk_system_financial_current_balance CHECK (current_balance >= 0)
) ENGINE=InnoDB;

SET @current_balance_ddl = IF(
  (SELECT COUNT(*)
   FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'system_financial_accounts'
     AND column_name = 'current_balance') = 0,
  'ALTER TABLE system_financial_accounts ADD COLUMN current_balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE current_balance_statement FROM @current_balance_ddl;
EXECUTE current_balance_statement;
DEALLOCATE PREPARE current_balance_statement;

INSERT INTO system_financial_accounts (account_code, opening_balance)
VALUES ('SYSTEM_WALLET', 0.00), ('COMMISSION_WALLET', 0.00)
ON DUPLICATE KEY UPDATE account_code = VALUES(account_code);

CREATE TABLE IF NOT EXISTS system_commission_settings (
    setting_id TINYINT NOT NULL DEFAULT 1,
    commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_id),
    CONSTRAINT chk_system_commission_settings_singleton CHECK (setting_id = 1),
    CONSTRAINT chk_system_commission_rate CHECK (commission_rate BETWEEN 0 AND 100)
) ENGINE=InnoDB;

INSERT INTO system_commission_settings (setting_id, commission_rate)
VALUES (1, 10.00)
ON DUPLICATE KEY UPDATE setting_id = VALUES(setting_id);

CREATE TABLE IF NOT EXISTS system_financial_transactions (
    transaction_id BIGINT NOT NULL AUTO_INCREMENT,
    account_code VARCHAR(30) NOT NULL,
    admin_user_id INT NULL,
    transaction_type ENUM('PAYMENT', 'REFUND', 'COMMISSION', 'ADJUSTMENT', 'PARTNER_PAYOUT') NOT NULL,
    amount DECIMAL(14, 2) NOT NULL COMMENT 'Số có dấu: tiền vào dương, tiền ra âm',
    reference_code VARCHAR(100) NULL,
    description VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (transaction_id),
    KEY idx_system_financial_transactions_account_created (account_code, created_at),
    KEY idx_system_financial_transactions_reference (reference_code),
    CONSTRAINT fk_system_financial_transactions_account
        FOREIGN KEY (account_code) REFERENCES system_financial_accounts(account_code) ON DELETE RESTRICT,
    CONSTRAINT fk_system_financial_transactions_admin
        FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT chk_system_financial_transaction_amount CHECK (amount <> 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS partner_payouts (
    payout_id INT NOT NULL AUTO_INCREMENT,
    partner_id INT NOT NULL,
    admin_user_id INT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status ENUM('Paid') NOT NULL DEFAULT 'Paid',
    reference_code VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (payout_id),
    UNIQUE KEY uq_partner_payout_reference (reference_code),
    KEY idx_partner_payouts_partner_created (partner_id, created_at),
    CONSTRAINT fk_partner_payouts_partner
        FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE RESTRICT,
    CONSTRAINT fk_partner_payouts_admin
        FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT chk_partner_payouts_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS partner_trip_settlements (
    trip_id INT NOT NULL,
    partner_id INT NOT NULL,
    gross_amount DECIMAL(14, 2) NOT NULL,
    commission_rate DECIMAL(5, 2) NOT NULL,
    commission_amount DECIMAL(14, 2) NOT NULL,
    partner_amount DECIMAL(14, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (trip_id),
    KEY idx_partner_trip_settlements_partner_created (partner_id, created_at),
    CONSTRAINT fk_partner_trip_settlements_trip
        FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE RESTRICT,
    CONSTRAINT fk_partner_trip_settlements_partner
        FOREIGN KEY (partner_id) REFERENCES partner_profiles(partner_id) ON DELETE RESTRICT,
    CONSTRAINT chk_partner_trip_settlement_commission_rate CHECK (commission_rate BETWEEN 0 AND 100),
    CONSTRAINT chk_partner_trip_settlement_amounts CHECK (
        gross_amount >= 0 AND commission_amount >= 0 AND partner_amount >= 0
        AND ROUND(commission_amount + partner_amount, 2) = gross_amount
    )
) ENGINE=InnoDB;

UPDATE wallet_transactions wt
JOIN partner_payouts p
  ON p.partner_id = wt.user_id
 AND p.reference_code = wt.reference_code
SET wt.transaction_type = 'PARTNER_PAYOUT'
WHERE wt.transaction_type = 'ADJUSTMENT'
  AND wt.description = 'Nhận tiền chi trả từ ví hệ thống VIETGO';

INSERT INTO system_financial_transactions
    (account_code, transaction_type, amount, reference_code, description)
SELECT 'SYSTEM_WALLET', 'PAYMENT', b.total_amount, b.booking_code,
       CONCAT('Backfill tiền thanh toán booking ', b.booking_code)
FROM bookings b
WHERE b.payment_status IN ('Paid', 'Refunded')
  AND b.total_amount > 0
  AND NOT EXISTS (
      SELECT 1
      FROM system_financial_transactions t
      WHERE t.account_code = 'SYSTEM_WALLET'
        AND t.transaction_type = 'PAYMENT'
        AND t.reference_code = b.booking_code
  );

INSERT INTO system_financial_transactions
    (account_code, transaction_type, amount, reference_code, description)
SELECT 'SYSTEM_WALLET', 'REFUND', -rr.refund_amount,
       CONCAT('REFUND-', rr.refund_id),
       CONCAT('Backfill hoàn tiền booking #', rr.booking_id)
FROM refund_requests rr
WHERE rr.status = 'Approved'
  AND rr.refund_amount > 0
  AND NOT EXISTS (
      SELECT 1
      FROM system_financial_transactions t
      WHERE t.account_code = 'SYSTEM_WALLET'
        AND t.transaction_type = 'REFUND'
        AND t.reference_code = CONCAT('REFUND-', rr.refund_id)
  );

INSERT INTO system_financial_transactions
    (account_code, transaction_type, amount, reference_code, description)
SELECT 'SYSTEM_WALLET', 'COMMISSION', -s.commission_amount,
       CONCAT('TRIP-', s.trip_id),
       CONCAT('Backfill chuyển hoa hồng từ chuyến #', s.trip_id)
FROM partner_trip_settlements s
WHERE s.commission_amount > 0
  AND NOT EXISTS (
      SELECT 1
      FROM system_financial_transactions t
      WHERE t.account_code = 'SYSTEM_WALLET'
        AND t.transaction_type = 'COMMISSION'
        AND t.reference_code = CONCAT('TRIP-', s.trip_id)
  );

INSERT INTO system_financial_transactions
    (account_code, transaction_type, amount, reference_code, description)
SELECT 'COMMISSION_WALLET', 'COMMISSION', s.commission_amount,
       CONCAT('TRIP-', s.trip_id),
       CONCAT('Backfill hoa hồng từ chuyến #', s.trip_id)
FROM partner_trip_settlements s
WHERE s.commission_amount > 0
  AND NOT EXISTS (
      SELECT 1
      FROM system_financial_transactions t
      WHERE t.account_code = 'COMMISSION_WALLET'
        AND t.transaction_type = 'COMMISSION'
        AND t.reference_code = CONCAT('TRIP-', s.trip_id)
  );

INSERT INTO system_financial_transactions
    (account_code, transaction_type, amount, reference_code, description)
SELECT 'SYSTEM_WALLET', 'PARTNER_PAYOUT', -p.amount, p.reference_code,
       CONCAT('Backfill chi trả đối tác #', p.partner_id)
FROM partner_payouts p
WHERE p.amount > 0
  AND NOT EXISTS (
      SELECT 1
      FROM system_financial_transactions t
      WHERE t.account_code = 'SYSTEM_WALLET'
        AND t.transaction_type = 'PARTNER_PAYOUT'
        AND t.reference_code = p.reference_code
  );

START TRANSACTION;

CREATE TEMPORARY TABLE payout_wallet_credits AS
SELECT p.payout_id,
       p.partner_id,
       p.amount,
       p.reference_code,
       COALESCE(u.wallet_balance, 0) +
         COALESCE(
           SUM(p.amount) OVER (
             PARTITION BY p.partner_id
             ORDER BY p.created_at, p.payout_id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ),
           0
         ) AS balance_before
FROM partner_payouts p
JOIN users u ON u.user_id = p.partner_id
WHERE p.amount > 0
  AND NOT EXISTS (
      SELECT 1
      FROM wallet_transactions wt
      WHERE wt.user_id = p.partner_id
        AND wt.transaction_type = 'PARTNER_PAYOUT'
        AND wt.reference_code = p.reference_code
  );

INSERT INTO wallet_transactions
    (user_id, transaction_type, amount, balance_before, balance_after, reference_code, description)
SELECT partner_id, 'PARTNER_PAYOUT', amount, balance_before, balance_before + amount,
       reference_code, 'Chi trả đối tác từ Ví hệ thống VIETGO'
FROM payout_wallet_credits;

UPDATE users u
JOIN (
    SELECT partner_id, SUM(amount) AS total_amount
    FROM payout_wallet_credits
    GROUP BY partner_id
) credits ON credits.partner_id = u.user_id
SET u.wallet_balance = u.wallet_balance + credits.total_amount;

DROP TEMPORARY TABLE payout_wallet_credits;
COMMIT;

UPDATE system_financial_accounts a
SET a.current_balance = a.opening_balance + COALESCE((
    SELECT SUM(t.amount)
    FROM system_financial_transactions t
    WHERE t.account_code = a.account_code
), 0);
