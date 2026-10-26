CREATE DATABASE IF NOT EXISTS smart_parking;
USE smart_parking;

-- Smart parking schema translated from smart_parking_chen_er.drawio.
-- Derived diagram attributes (Users.loyalty_points and ParkingLots.total_capacity)
-- are exposed through views because their source calculations are not modeled as entities.

CREATE TABLE LoyaltyTiers (
    tier_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tier_name VARCHAR(60) NOT NULL,
    min_points INT UNSIGNED NOT NULL DEFAULT 0,
    discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (tier_id),
    UNIQUE KEY uq_loyalty_tiers_name (tier_name),
    CONSTRAINT chk_tier_discount CHECK (discount_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE Users (
    user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tier_id BIGINT UNSIGNED NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(254) NOT NULL,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_email (email),
    KEY ix_users_tier (tier_id),
    CONSTRAINT fk_users_tier FOREIGN KEY (tier_id) REFERENCES LoyaltyTiers(tier_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE Vehicles (
    vehicle_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    plate_no VARCHAR(20) NOT NULL,
    type VARCHAR(40) NOT NULL,
    PRIMARY KEY (vehicle_id),
    UNIQUE KEY uq_vehicles_plate (plate_no),
    KEY ix_vehicles_user (user_id),
    CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE ParkingLots (
    lot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(255) NOT NULL,
    PRIMARY KEY (lot_id),
    KEY ix_parking_lots_name (name)
) ENGINE=InnoDB;

CREATE TABLE PricingRules (
    rule_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lot_id BIGINT UNSIGNED NOT NULL,
    slot_type VARCHAR(40) NOT NULL,
    base_rate DECIMAL(10,2) NOT NULL,
    peak_multiplier DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    start_hour TINYINT UNSIGNED NOT NULL,
    end_hour TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (rule_id),
    KEY ix_pricing_rules_lot (lot_id),
    CONSTRAINT chk_pricing_rate CHECK (base_rate >= 0),
    CONSTRAINT chk_peak_multiplier CHECK (peak_multiplier >= 0),
    CONSTRAINT chk_pricing_hours CHECK (start_hour <= 23 AND end_hour <= 23),
    CONSTRAINT fk_pricing_rules_lot FOREIGN KEY (lot_id) REFERENCES ParkingLots(lot_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Zones (
    zone_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lot_id BIGINT UNSIGNED NOT NULL,
    level VARCHAR(30) NOT NULL,
    zone_type VARCHAR(40) NOT NULL,
    PRIMARY KEY (zone_id),
    KEY ix_zones_lot (lot_id),
    CONSTRAINT fk_zones_lot FOREIGN KEY (lot_id) REFERENCES ParkingLots(lot_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Slots (
    slot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    zone_id BIGINT UNSIGNED NOT NULL,
    slot_type VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    PRIMARY KEY (slot_id),
    KEY ix_slots_zone (zone_id),
    KEY ix_slots_status (status),
    CONSTRAINT chk_slot_status CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    CONSTRAINT fk_slots_zone FOREIGN KEY (zone_id) REFERENCES Zones(zone_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Reservations (
    res_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    slot_id BIGINT UNSIGNED NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
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
) ENGINE=InnoDB;

CREATE TABLE ParkingSessions (
    session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    slot_id BIGINT UNSIGNED NOT NULL,
    res_id BIGINT UNSIGNED NULL,
    entry_time DATETIME NOT NULL,
    exit_time DATETIME NULL,
    PRIMARY KEY (session_id),
    UNIQUE KEY uq_parking_sessions_reservation (res_id),
    KEY ix_sessions_vehicle (vehicle_id),
    KEY ix_sessions_slot (slot_id),
    CONSTRAINT chk_session_times CHECK (exit_time IS NULL OR exit_time >= entry_time),
    CONSTRAINT fk_sessions_vehicle FOREIGN KEY (vehicle_id) REFERENCES Vehicles(vehicle_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sessions_slot FOREIGN KEY (slot_id) REFERENCES Slots(slot_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sessions_reservation FOREIGN KEY (res_id) REFERENCES Reservations(res_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE Payments (
    payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(30) NOT NULL,
    paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (payment_id),
    KEY ix_payments_session (session_id),
    CONSTRAINT chk_payment_amount CHECK (amount >= 0),
    CONSTRAINT fk_payments_session FOREIGN KEY (session_id) REFERENCES ParkingSessions(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Violations (
    violation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(80) NOT NULL,
    fine_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (violation_id),
    KEY ix_violations_session (session_id),
    CONSTRAINT chk_violation_fine CHECK (fine_amount >= 0),
    CONSTRAINT fk_violations_session FOREIGN KEY (session_id) REFERENCES ParkingSessions(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ChargingSessions (
    charge_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    kwh_used DECIMAL(10,3) NOT NULL DEFAULT 0,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (charge_id),
    KEY ix_charging_sessions_session (session_id),
    CONSTRAINT chk_charge_kwh CHECK (kwh_used >= 0),
    CONSTRAINT chk_charge_cost CHECK (cost >= 0),
    CONSTRAINT fk_charging_sessions_session FOREIGN KEY (session_id) REFERENCES ParkingSessions(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE SensorLogs (
    log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slot_id BIGINT UNSIGNED NOT NULL,
    reading DECIMAL(12,4) NOT NULL,
    logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id),
    KEY ix_sensor_logs_slot_time (slot_id, logged_at),
    CONSTRAINT fk_sensor_logs_slot FOREIGN KEY (slot_id) REFERENCES Slots(slot_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- Derived diagram attribute: current slot count per parking lot.
CREATE OR REPLACE VIEW ParkingLotCapacity AS
SELECT pl.lot_id, pl.name, pl.location, COUNT(s.slot_id) AS total_capacity
FROM ParkingLots AS pl
LEFT JOIN Zones AS z ON z.lot_id = pl.lot_id
LEFT JOIN Slots AS s ON s.zone_id = z.zone_id
GROUP BY pl.lot_id, pl.name, pl.location;

-- loyalty_points is marked derived in the ER diagram, but no point-award rule or
-- transaction entity is modeled. Keep it out of the base table until that rule exists.
