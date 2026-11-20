-- ============================================================================
-- PES University - Department of Computer Science and Engineering
-- Database Management System - Experiential Learning Level 3 MiniProject
-- Smart Parking Management System (Parkwise)
-- MySQL 8.0+ Relational Schema DDL with Keys, Relationships & Constraints
-- ============================================================================

CREATE DATABASE IF NOT EXISTS smart_parking;
USE smart_parking;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS AuthAuditLogs;
DROP TABLE IF EXISTS AuthSessions;
DROP TABLE IF EXISTS StaffAccounts;
DROP TABLE IF EXISTS Roles;
DROP TABLE IF EXISTS SensorLogs;
DROP TABLE IF EXISTS ChargingSessions;
DROP TABLE IF EXISTS Violations;
DROP TABLE IF EXISTS Payments;
DROP TABLE IF EXISTS ParkingSessions;
DROP TABLE IF EXISTS Reservations;
DROP TABLE IF EXISTS Slots;
DROP TABLE IF EXISTS Zones;
DROP TABLE IF EXISTS PricingRules;
DROP TABLE IF EXISTS ParkingLots;
DROP TABLE IF EXISTS Vehicles;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS LoyaltyTiers;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 1. LoyaltyTiers: Customer rewards and discount classification
-- ----------------------------------------------------------------------------
CREATE TABLE LoyaltyTiers (
    tier_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tier_name VARCHAR(60) NOT NULL,
    min_points INT UNSIGNED NOT NULL DEFAULT 0,
    discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tier_id),
    UNIQUE KEY uq_loyalty_tiers_name (tier_name),
    CONSTRAINT chk_tier_points CHECK (min_points >= 0),
    CONSTRAINT chk_tier_discount CHECK (discount_pct BETWEEN 0.00 AND 100.00)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 2. Users: Registered drivers and parking customers
-- ----------------------------------------------------------------------------
CREATE TABLE Users (
    user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tier_id BIGINT UNSIGNED NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(254) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_email (email),
    KEY ix_users_tier (tier_id),
    CONSTRAINT fk_users_tier FOREIGN KEY (tier_id) REFERENCES LoyaltyTiers(tier_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 3. Vehicles: Registered customer vehicles with plate and type
-- ----------------------------------------------------------------------------
CREATE TABLE Vehicles (
    vehicle_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    plate_no VARCHAR(20) NOT NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'Car',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (vehicle_id),
    UNIQUE KEY uq_vehicles_plate (plate_no),
    KEY ix_vehicles_user (user_id),
    CONSTRAINT chk_vehicle_type CHECK (type IN ('Car', 'Motorcycle', 'SUV', 'Van', 'EV', 'Other')),
    CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 4. ParkingLots: Physical parking facilities
-- ----------------------------------------------------------------------------
CREATE TABLE ParkingLots (
    lot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lot_id),
    KEY ix_parking_lots_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 5. PricingRules: Time-based and slot-type specific rate definitions
-- ----------------------------------------------------------------------------
CREATE TABLE PricingRules (
    rule_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lot_id BIGINT UNSIGNED NOT NULL,
    slot_type VARCHAR(40) NOT NULL,
    base_rate DECIMAL(10,2) NOT NULL,
    peak_multiplier DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    start_hour TINYINT UNSIGNED NOT NULL DEFAULT 0,
    end_hour TINYINT UNSIGNED NOT NULL DEFAULT 23,
    PRIMARY KEY (rule_id),
    KEY ix_pricing_rules_lot (lot_id),
    CONSTRAINT chk_pricing_rate CHECK (base_rate >= 0.00),
    CONSTRAINT chk_peak_multiplier CHECK (peak_multiplier >= 0.000),
    CONSTRAINT chk_pricing_hours CHECK (start_hour <= 23 AND end_hour <= 23 AND start_hour <= end_hour),
    CONSTRAINT fk_pricing_rules_lot FOREIGN KEY (lot_id) REFERENCES ParkingLots(lot_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 6. Zones: Floors, sections or levels within a parking lot
-- ----------------------------------------------------------------------------
CREATE TABLE Zones (
    zone_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lot_id BIGINT UNSIGNED NOT NULL,
    level VARCHAR(30) NOT NULL,
    zone_type VARCHAR(40) NOT NULL DEFAULT 'Standard',
    PRIMARY KEY (zone_id),
    KEY ix_zones_lot (lot_id),
    CONSTRAINT fk_zones_lot FOREIGN KEY (lot_id) REFERENCES ParkingLots(lot_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 7. Slots: Individual parking bays/spaces
-- ----------------------------------------------------------------------------
CREATE TABLE Slots (
    slot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    zone_id BIGINT UNSIGNED NOT NULL,
    slot_type VARCHAR(40) NOT NULL DEFAULT 'Standard',
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    PRIMARY KEY (slot_id),
    KEY ix_slots_zone (zone_id),
    KEY ix_slots_status (status),
    CONSTRAINT chk_slot_type CHECK (slot_type IN ('Standard', 'EV', 'Accessible', 'Compact', 'VIP')),
    CONSTRAINT chk_slot_status CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    CONSTRAINT fk_slots_zone FOREIGN KEY (zone_id) REFERENCES Zones(zone_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 8. Reservations: Pre-booked slots with time window validation
-- ----------------------------------------------------------------------------
CREATE TABLE Reservations (
    res_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    slot_id BIGINT UNSIGNED NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (res_id),
    KEY ix_reservations_user (user_id),
    KEY ix_reservations_vehicle (vehicle_id),
    KEY ix_reservations_slot_time (slot_id, start_time, end_time),
    CONSTRAINT chk_reservation_time CHECK (end_time > start_time),
    CONSTRAINT chk_reservation_status CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
    CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_reservations_vehicle FOREIGN KEY (vehicle_id) REFERENCES Vehicles(vehicle_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_reservations_slot FOREIGN KEY (slot_id) REFERENCES Slots(slot_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 9. ParkingSessions: Active and historical check-in sessions
-- ----------------------------------------------------------------------------
CREATE TABLE ParkingSessions (
    session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    slot_id BIGINT UNSIGNED NOT NULL,
    res_id BIGINT UNSIGNED NULL,
    entry_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    exit_time DATETIME NULL,
    active_slot_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN exit_time IS NULL THEN slot_id ELSE NULL END) STORED,
    PRIMARY KEY (session_id),
    UNIQUE KEY uq_parking_sessions_reservation (res_id),
    UNIQUE KEY uq_parking_sessions_active_slot (active_slot_id),
    KEY ix_sessions_vehicle (vehicle_id),
    KEY ix_sessions_slot (slot_id),
    CONSTRAINT chk_session_times CHECK (exit_time IS NULL OR exit_time >= entry_time),
    CONSTRAINT fk_sessions_vehicle FOREIGN KEY (vehicle_id) REFERENCES Vehicles(vehicle_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sessions_slot FOREIGN KEY (slot_id) REFERENCES Slots(slot_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sessions_reservation FOREIGN KEY (res_id) REFERENCES Reservations(res_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 10. Payments: Financial transaction records for parking sessions
-- ----------------------------------------------------------------------------
CREATE TABLE Payments (
    payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(30) NOT NULL,
    paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (payment_id),
    KEY ix_payments_session (session_id),
    CONSTRAINT chk_payment_amount CHECK (amount >= 0.00),
    CONSTRAINT chk_payment_method CHECK (method IN ('UPI', 'Card', 'Cash', 'Wallet', 'Fastag')),
    CONSTRAINT fk_payments_session FOREIGN KEY (session_id) REFERENCES ParkingSessions(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 11. Violations: Overstay, unauthorized slot, or parking infraction logs
-- ----------------------------------------------------------------------------
CREATE TABLE Violations (
    violation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(80) NOT NULL,
    fine_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (violation_id),
    KEY ix_violations_session (session_id),
    CONSTRAINT chk_violation_fine CHECK (fine_amount >= 0.00),
    CONSTRAINT fk_violations_session FOREIGN KEY (session_id) REFERENCES ParkingSessions(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 12. ChargingSessions: Electric vehicle (EV) charging consumption logs
-- ----------------------------------------------------------------------------
CREATE TABLE ChargingSessions (
    charge_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    kwh_used DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (charge_id),
    KEY ix_charging_sessions_session (session_id),
    CONSTRAINT chk_charge_kwh CHECK (kwh_used >= 0.000),
    CONSTRAINT chk_charge_cost CHECK (cost >= 0.00),
    CONSTRAINT fk_charging_sessions_session FOREIGN KEY (session_id) REFERENCES ParkingSessions(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 13. SensorLogs: IoT slot presence readings (ultrasonic/camera sensors)
-- ----------------------------------------------------------------------------
CREATE TABLE SensorLogs (
    log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slot_id BIGINT UNSIGNED NOT NULL,
    reading DECIMAL(12,4) NOT NULL,
    logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id),
    KEY ix_sensor_logs_slot_time (slot_id, logged_at),
    CONSTRAINT fk_sensor_logs_slot FOREIGN KEY (slot_id) REFERENCES Slots(slot_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 14. Roles: Role-based access control roles (RBAC)
-- ----------------------------------------------------------------------------
CREATE TABLE Roles (
    role_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    role_name VARCHAR(40) NOT NULL,
    description VARCHAR(255) NULL,
    PRIMARY KEY (role_id),
    UNIQUE KEY uq_roles_name (role_name),
    CONSTRAINT chk_role_name CHECK (role_name IN ('admin', 'attendant', 'auditor'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 15. StaffAccounts: Staff login credentials with password hashing
-- ----------------------------------------------------------------------------
CREATE TABLE StaffAccounts (
    staff_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    role_id INT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (staff_id),
    UNIQUE KEY uq_staff_email (email),
    KEY ix_staff_role (role_id),
    CONSTRAINT fk_staff_role FOREIGN KEY (role_id) REFERENCES Roles(role_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 16. AuthSessions: Secure web session tokens
-- ----------------------------------------------------------------------------
CREATE TABLE AuthSessions (
    token_hash CHAR(64) NOT NULL,
    staff_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (token_hash),
    KEY ix_auth_staff (staff_id),
    CONSTRAINT fk_auth_staff FOREIGN KEY (staff_id) REFERENCES StaffAccounts(staff_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- DATABASE VIEWS
-- ============================================================================

-- Derived view: Total capacity and current status per parking lot
CREATE OR REPLACE VIEW ParkingLotCapacity AS
SELECT 
    pl.lot_id, 
    pl.name, 
    pl.location, 
    COUNT(s.slot_id) AS total_capacity,
    COALESCE(SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END), 0) AS available_slots,
    COALESCE(SUM(CASE WHEN s.status = 'occupied' THEN 1 ELSE 0 END), 0) AS occupied_slots,
    COALESCE(SUM(CASE WHEN s.status = 'reserved' THEN 1 ELSE 0 END), 0) AS reserved_slots
FROM ParkingLots AS pl
LEFT JOIN Zones AS z ON z.lot_id = pl.lot_id
LEFT JOIN Slots AS s ON s.zone_id = z.zone_id
GROUP BY pl.lot_id, pl.name, pl.location;

-- Active Occupancy view: Active parking sessions with vehicle and owner info
CREATE OR REPLACE VIEW ActiveOccupancyView AS
SELECT 
    ps.session_id,
    ps.vehicle_id,
    v.plate_no,
    v.type AS vehicle_type,
    u.name AS owner_name,
    u.phone AS owner_phone,
    ps.slot_id,
    s.slot_type,
    z.level,
    pl.name AS lot_name,
    ps.entry_time,
    TIMESTAMPDIFF(MINUTE, ps.entry_time, CURRENT_TIMESTAMP) AS elapsed_minutes
FROM ParkingSessions ps
JOIN Vehicles v ON v.vehicle_id = ps.vehicle_id
JOIN Users u ON u.user_id = v.user_id
JOIN Slots s ON s.slot_id = ps.slot_id
JOIN Zones z ON z.zone_id = s.zone_id
JOIN ParkingLots pl ON pl.lot_id = z.lot_id
WHERE ps.exit_time IS NULL;

-- Daily Revenue Summary view
CREATE OR REPLACE VIEW DailyRevenueSummaryView AS
SELECT 
    DATE(p.paid_at) AS payment_date,
    COUNT(p.payment_id) AS total_transactions,
    SUM(p.amount) AS total_revenue,
    AVG(p.amount) AS average_fee
FROM Payments p
GROUP BY DATE(p.paid_at);

-- ============================================================================
-- DATABASE ROLES & RBAC PERMISSIONS (MySQL 8.0+)
-- ============================================================================

CREATE ROLE IF NOT EXISTS 'parkwise_admin';
CREATE ROLE IF NOT EXISTS 'parkwise_attendant';

-- Admin has full administrative privileges over the smart_parking database
GRANT ALL PRIVILEGES ON smart_parking.* TO 'parkwise_admin';

-- Attendant has operational access: read all, manage reservations & check-in/out
GRANT SELECT ON smart_parking.* TO 'parkwise_attendant';
GRANT INSERT, UPDATE ON smart_parking.Reservations TO 'parkwise_attendant';
GRANT INSERT, UPDATE ON smart_parking.ParkingSessions TO 'parkwise_attendant';
GRANT INSERT ON smart_parking.Payments TO 'parkwise_attendant';
GRANT UPDATE (status) ON smart_parking.Slots TO 'parkwise_attendant';

FLUSH PRIVILEGES;
