-- ============================================================================
-- PES University - Department of Computer Science and Engineering
-- DBMS Mini Project - Evaluation Component 8: Advanced SQL Concepts (6 Marks)
-- File: sql/advanced_concepts.sql
-- Description: Stored Procedures, Functions, Triggers, CTEs & Database Roles
-- ============================================================================

USE smart_parking;

DELIMITER //

-- ============================================================================
-- PART 1: STORED PROCEDURES (WITH TRANSACTIONS, ERROR HANDLING & VALIDATION)
-- ============================================================================

-- 1.1 Procedure: Check-in vehicle with ACID transaction and row-level locking
DROP PROCEDURE IF EXISTS sp_check_in_vehicle//
CREATE PROCEDURE sp_check_in_vehicle(
    IN p_vehicle_id BIGINT UNSIGNED,
    IN p_slot_id BIGINT UNSIGNED
)
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_active_count INT DEFAULT 0;
    
    -- Error Handler: Rollback and re-throw on any SQL exception
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Lock the target slot record for update to prevent race conditions
    SELECT status INTO v_status 
    FROM Slots 
    WHERE slot_id = p_slot_id 
    FOR UPDATE;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error: Target parking slot does not exist.';
    END IF;

    IF v_status NOT IN ('available', 'reserved') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error: Slot is not available for check-in.';
    END IF;

    -- Ensure vehicle does not already have an active session
    SELECT COUNT(*) INTO v_active_count 
    FROM ParkingSessions 
    WHERE vehicle_id = p_vehicle_id AND exit_time IS NULL;

    IF v_active_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error: Vehicle already has an active ongoing parking session.';
    END IF;

    -- Create new active parking session (Slot state is auto-updated by trigger)
    INSERT INTO ParkingSessions (vehicle_id, slot_id, entry_time)
    VALUES (p_vehicle_id, p_slot_id, CURRENT_TIMESTAMP);

    COMMIT;
END//

-- 1.2 Procedure: Check-out vehicle, calculate session payment and release slot
DROP PROCEDURE IF EXISTS sp_check_out_vehicle//
CREATE PROCEDURE sp_check_out_vehicle(
    IN p_session_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(10,2),
    IN p_method VARCHAR(30)
)
BEGIN
    DECLARE v_slot_id BIGINT UNSIGNED;
    DECLARE v_exit_time DATETIME;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_amount < 0.00 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error: Payment amount cannot be negative.';
    END IF;

    START TRANSACTION;

    SELECT slot_id, exit_time INTO v_slot_id, v_exit_time
    FROM ParkingSessions
    WHERE session_id = p_session_id
    FOR UPDATE;

    IF v_slot_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error: Parking session not found.';
    END IF;

    IF v_exit_time IS NOT NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error: Parking session is already checked out.';
    END IF;

    -- Record exit timestamp (Slot is released to 'available' by trigger)
    UPDATE ParkingSessions 
    SET exit_time = CURRENT_TIMESTAMP 
    WHERE session_id = p_session_id;

    -- Record payment transaction
    INSERT INTO Payments (session_id, amount, method, paid_at)
    VALUES (p_session_id, p_amount, p_method, CURRENT_TIMESTAMP);

    COMMIT;
END//

-- 1.3 Procedure: Cancel expired pending reservations (Batch Maintenance)
DROP PROCEDURE IF EXISTS sp_cancel_expired_reservations//
CREATE PROCEDURE sp_cancel_expired_reservations()
BEGIN
    DECLARE v_cancelled_count INT DEFAULT 0;

    UPDATE Reservations
    SET status = 'cancelled'
    WHERE status = 'pending' 
      AND start_time < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR);

    SET v_cancelled_count = ROW_COUNT();

    SELECT CONCAT(v_cancelled_count, ' expired reservations successfully cancelled.') AS status_message;
END//

-- 1.4 Procedure with IN and OUT parameters: Lot Occupancy Summary Report
DROP PROCEDURE IF EXISTS sp_get_lot_occupancy_report//
CREATE PROCEDURE sp_get_lot_occupancy_report(
    IN p_lot_id BIGINT UNSIGNED,
    OUT p_total INT,
    OUT p_occupied INT,
    OUT p_available INT
)
BEGIN
    SELECT 
        COUNT(s.slot_id),
        COALESCE(SUM(CASE WHEN s.status = 'occupied' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END), 0)
    INTO p_total, p_occupied, p_available
    FROM Slots s
    JOIN Zones z ON z.zone_id = s.zone_id
    WHERE z.lot_id = p_lot_id;
END//

-- ============================================================================
-- PART 2: USER-DEFINED FUNCTIONS (UDF)
-- ============================================================================

-- 2.1 Function: Compute billable ceiling hours
DROP FUNCTION IF EXISTS fn_billable_hours//
CREATE FUNCTION fn_billable_hours(p_entry DATETIME, p_exit DATETIME)
RETURNS INT
DETERMINISTIC
CONTAINS SQL
BEGIN
    DECLARE v_minutes INT;
    SET v_minutes = TIMESTAMPDIFF(MINUTE, p_entry, COALESCE(p_exit, CURRENT_TIMESTAMP));
    RETURN GREATEST(1, CEIL(v_minutes / 60.0));
END//

-- 2.2 Function: Compute fee with base rate, peak multiplier, and loyalty discount
DROP FUNCTION IF EXISTS fn_calculate_fee//
CREATE FUNCTION fn_calculate_fee(
    p_lot_id BIGINT UNSIGNED,
    p_slot_type VARCHAR(40),
    p_hours INT,
    p_discount_pct DECIMAL(5,2)
)
RETURNS DECIMAL(10,2)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_base_rate DECIMAL(10,2) DEFAULT 40.00;
    DECLARE v_peak_mult DECIMAL(6,3) DEFAULT 1.000;
    DECLARE v_gross DECIMAL(10,2);
    DECLARE v_net DECIMAL(10,2);

    SELECT base_rate, peak_multiplier INTO v_base_rate, v_peak_mult
    FROM PricingRules
    WHERE lot_id = p_lot_id AND slot_type = p_slot_type
    LIMIT 1;

    SET v_gross = v_base_rate * v_peak_mult * p_hours;
    SET v_net = v_gross * (1.00 - (COALESCE(p_discount_pct, 0.00) / 100.00));
    RETURN ROUND(v_net, 2);
END//

-- 2.3 Function: Boolean helper to check if a slot is currently available
DROP FUNCTION IF EXISTS fn_is_slot_available//
CREATE FUNCTION fn_is_slot_available(p_slot_id BIGINT UNSIGNED)
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_status VARCHAR(20);
    SELECT status INTO v_status FROM Slots WHERE slot_id = p_slot_id;
    RETURN (v_status = 'available');
END//

-- ============================================================================
-- PART 3: TRIGGERS (DATA INTEGRITY & AUTOMATED STATE MACHINE)
-- ============================================================================

-- 3.1 Trigger: Automatically mark slot as 'occupied' when session starts
DROP TRIGGER IF EXISTS trg_session_after_insert//
CREATE TRIGGER trg_session_after_insert
AFTER INSERT ON ParkingSessions
FOR EACH ROW
BEGIN
    UPDATE Slots SET status = 'occupied' WHERE slot_id = NEW.slot_id;
END//

-- 3.2 Trigger: Automatically release slot as 'available' when session ends
DROP TRIGGER IF EXISTS trg_session_after_exit//
CREATE TRIGGER trg_session_after_exit
AFTER UPDATE ON ParkingSessions
FOR EACH ROW
BEGIN
    IF OLD.exit_time IS NULL AND NEW.exit_time IS NOT NULL THEN
        UPDATE Slots SET status = 'available' WHERE slot_id = NEW.slot_id;
    END IF;
END//

-- 3.3 Trigger: Prevent double-booking / overlapping reservations on INSERT
DROP TRIGGER IF EXISTS trg_reservation_no_overlap//
CREATE TRIGGER trg_reservation_no_overlap
BEFORE INSERT ON Reservations
FOR EACH ROW
BEGIN
    IF NEW.status IN ('pending', 'confirmed') AND EXISTS (
        SELECT 1 FROM Reservations r
        WHERE r.slot_id = NEW.slot_id
          AND r.status IN ('pending', 'confirmed')
          AND NEW.start_time < r.end_time 
          AND NEW.end_time > r.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Integrity Violation: Reservation time window overlaps an existing booking for this space.';
    END IF;
END//

-- 3.4 Trigger: Prevent overlapping reservations on UPDATE (Rescheduling)
DROP TRIGGER IF EXISTS trg_reservation_no_overlap_update//
CREATE TRIGGER trg_reservation_no_overlap_update
BEFORE UPDATE ON Reservations
FOR EACH ROW
BEGIN
    IF NEW.status IN ('pending', 'confirmed') AND EXISTS (
        SELECT 1 FROM Reservations r
        WHERE r.slot_id = NEW.slot_id
          AND r.res_id <> NEW.res_id
          AND r.status IN ('pending', 'confirmed')
          AND NEW.start_time < r.end_time 
          AND NEW.end_time > r.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Integrity Violation: Updated reservation time window overlaps an existing booking.';
    END IF;
END//

DELIMITER ;

-- ============================================================================
-- PART 4: DATABASE ROLES AND FINE-GRAINED PRIVILEGES
-- ============================================================================

CREATE ROLE IF NOT EXISTS 'parkwise_admin';
CREATE ROLE IF NOT EXISTS 'parkwise_attendant';

-- Admin has complete control over procedures, functions, and tables
GRANT ALL PRIVILEGES ON smart_parking.* TO 'parkwise_admin';

-- Attendant has operational privileges and procedure execution grants
GRANT SELECT ON smart_parking.* TO 'parkwise_attendant';
GRANT INSERT, UPDATE ON smart_parking.Reservations TO 'parkwise_attendant';
GRANT EXECUTE ON PROCEDURE smart_parking.sp_check_in_vehicle TO 'parkwise_attendant';
GRANT EXECUTE ON PROCEDURE smart_parking.sp_check_out_vehicle TO 'parkwise_attendant';
GRANT EXECUTE ON FUNCTION smart_parking.fn_billable_hours TO 'parkwise_attendant';
GRANT EXECUTE ON FUNCTION smart_parking.fn_calculate_fee TO 'parkwise_attendant';
GRANT EXECUTE ON FUNCTION smart_parking.fn_is_slot_available TO 'parkwise_attendant';

FLUSH PRIVILEGES;
