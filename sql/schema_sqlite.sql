-- ============================================================================
-- PES University - Department of Computer Science and Engineering
-- DBMS Mini Project - SQLite DDL Schema Definition (Local Demo Engine)
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS LoyaltyTiers (
    tier_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_name TEXT NOT NULL UNIQUE,
    min_points INTEGER NOT NULL DEFAULT 0 CHECK(min_points >= 0),
    discount_pct REAL NOT NULL DEFAULT 0.0 CHECK(discount_pct BETWEEN 0.0 AND 100.0)
);

CREATE TABLE IF NOT EXISTS Roles (
    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT NOT NULL UNIQUE CHECK(role_name IN ('admin', 'attendant', 'auditor')),
    description TEXT
);

CREATE TABLE IF NOT EXISTS StaffAccounts (
    staff_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id INTEGER NOT NULL REFERENCES Roles(role_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS AuthSessions (
    token_hash TEXT PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES StaffAccounts(staff_id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_id INTEGER REFERENCES LoyaltyTiers(tier_id) ON UPDATE CASCADE ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Vehicles (
    vehicle_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES Users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    plate_no TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('Car', 'Motorcycle', 'SUV', 'Van', 'EV', 'Other')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ParkingLots (
    lot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS PricingRules (
    rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id INTEGER NOT NULL REFERENCES ParkingLots(lot_id) ON UPDATE CASCADE ON DELETE CASCADE,
    slot_type TEXT NOT NULL,
    base_rate REAL NOT NULL CHECK(base_rate >= 0),
    peak_multiplier REAL NOT NULL DEFAULT 1.0 CHECK(peak_multiplier >= 0),
    start_hour INTEGER NOT NULL CHECK(start_hour BETWEEN 0 AND 23),
    end_hour INTEGER NOT NULL CHECK(end_hour BETWEEN 0 AND 23)
);

CREATE TABLE IF NOT EXISTS Zones (
    zone_id INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id INTEGER NOT NULL REFERENCES ParkingLots(lot_id) ON UPDATE CASCADE ON DELETE CASCADE,
    level TEXT NOT NULL,
    zone_type TEXT NOT NULL DEFAULT 'Standard'
);

CREATE TABLE IF NOT EXISTS Slots (
    slot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id INTEGER NOT NULL REFERENCES Zones(zone_id) ON UPDATE CASCADE ON DELETE CASCADE,
    slot_type TEXT NOT NULL DEFAULT 'Standard' CHECK(slot_type IN ('Standard', 'EV', 'Accessible', 'Compact', 'VIP')),
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'reserved', 'maintenance'))
);

CREATE TABLE IF NOT EXISTS Reservations (
    res_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES Users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    vehicle_id INTEGER NOT NULL REFERENCES Vehicles(vehicle_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    slot_id INTEGER NOT NULL REFERENCES Slots(slot_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(datetime(end_time) > datetime(start_time))
);

CREATE TABLE IF NOT EXISTS ParkingSessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES Vehicles(vehicle_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    slot_id INTEGER NOT NULL REFERENCES Slots(slot_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    res_id INTEGER UNIQUE REFERENCES Reservations(res_id) ON UPDATE CASCADE ON DELETE SET NULL,
    entry_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    exit_time TEXT,
    CHECK(exit_time IS NULL OR datetime(exit_time) >= datetime(entry_time))
);

CREATE TABLE IF NOT EXISTS Payments (
    payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES ParkingSessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE,
    amount REAL NOT NULL CHECK(amount >= 0),
    method TEXT NOT NULL CHECK(method IN ('UPI', 'Card', 'Cash', 'Wallet', 'Fastag')),
    paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Violations (
    violation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES ParkingSessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE,
    type TEXT NOT NULL,
    fine_amount REAL NOT NULL DEFAULT 0 CHECK(fine_amount >= 0),
    logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ChargingSessions (
    charge_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES ParkingSessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE,
    kwh_used REAL NOT NULL DEFAULT 0 CHECK(kwh_used >= 0),
    cost REAL NOT NULL DEFAULT 0 CHECK(cost >= 0),
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS SensorLogs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL REFERENCES Slots(slot_id) ON UPDATE CASCADE ON DELETE CASCADE,
    reading REAL NOT NULL,
    logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Persistent Embedded NoSQL Document Collection (fallback when MongoDB server is not running)
CREATE TABLE IF NOT EXISTS _nosql_parking_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    note TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    tags TEXT NOT NULL DEFAULT '[]',
    vector TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_res_slot_time ON Reservations(slot_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sensor_slot_time ON SensorLogs(slot_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_sessions_vehicle ON ParkingSessions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_nosql_category ON _nosql_parking_notes(category, updated_at DESC);

-- Unique partial indexes to enforce 1 active session per slot and vehicle
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_session_per_slot ON ParkingSessions(slot_id) WHERE exit_time IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_session_per_vehicle ON ParkingSessions(vehicle_id) WHERE exit_time IS NULL;

-- Triggers for Overlap Prevention in SQLite
CREATE TRIGGER IF NOT EXISTS trg_sqlite_reservation_no_overlap_insert
BEFORE INSERT ON Reservations
WHEN NEW.status IN ('pending', 'confirmed') AND EXISTS (
    SELECT 1 FROM Reservations r 
    WHERE r.slot_id = NEW.slot_id 
      AND r.status IN ('pending', 'confirmed')
      AND datetime(NEW.start_time) < datetime(r.end_time) 
      AND datetime(NEW.end_time) > datetime(r.start_time)
)
BEGIN
    SELECT RAISE(ABORT, 'Integrity Error: Reservation time window overlaps an existing booking for this space');
END;

CREATE TRIGGER IF NOT EXISTS trg_sqlite_reservation_no_overlap_update
BEFORE UPDATE OF slot_id, start_time, end_time, status ON Reservations
WHEN NEW.status IN ('pending', 'confirmed') AND EXISTS (
    SELECT 1 FROM Reservations r 
    WHERE r.slot_id = NEW.slot_id 
      AND r.res_id <> NEW.res_id 
      AND r.status IN ('pending', 'confirmed')
      AND datetime(NEW.start_time) < datetime(r.end_time) 
      AND datetime(NEW.end_time) > datetime(r.start_time)
)
BEGIN
    SELECT RAISE(ABORT, 'Integrity Error: Updated reservation time window overlaps an existing booking');
END;

-- Views
CREATE VIEW IF NOT EXISTS ParkingLotCapacity AS
SELECT 
    p.lot_id,
    p.name,
    p.location,
    COUNT(s.slot_id) AS total_capacity,
    COALESCE(SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END), 0) AS available_slots,
    COALESCE(SUM(CASE WHEN s.status = 'occupied' THEN 1 ELSE 0 END), 0) AS occupied_slots,
    COALESCE(SUM(CASE WHEN s.status = 'reserved' THEN 1 ELSE 0 END), 0) AS reserved_slots
FROM ParkingLots p
LEFT JOIN Zones z ON z.lot_id = p.lot_id
LEFT JOIN Slots s ON s.zone_id = z.zone_id
GROUP BY p.lot_id, p.name, p.location;
