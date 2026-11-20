// ============================================================================
// PES University - Department of Computer Science and Engineering
// DBMS Mini Project - Server Engine: REST API, SQLite Relational,
//                     NoSQL/MongoDB & Vector Similarity Store, RBAC Auth
// File: server.js
// ============================================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
let MongoClient, ObjectId;
try {
  const mongo = require('mongodb');
  MongoClient = mongo.MongoClient;
  ObjectId = mongo.ObjectId;
} catch {}

const ROOT = __dirname;
const PORT = Number(process.env.API_PORT || 3001);
const db = new DatabaseSync(path.join(ROOT, 'smart_parking.db'));

// Enable SQLite Foreign Key constraints enforcement
db.exec('PRAGMA foreign_keys = ON;');

// ----------------------------------------------------------------------------
// 1. RELATIONAL DATABASE BOOTSTRAP (16 Tables matching ER Diagram & RBAC)
// ----------------------------------------------------------------------------
db.exec(`
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

-- Persistent Embedded NoSQL Document Store (Full MongoDB compatibility fallback)
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

-- Indexes for Fast Access and Concurrency Constraints
CREATE INDEX IF NOT EXISTS idx_res_slot_time ON Reservations(slot_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sensor_slot_time ON SensorLogs(slot_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_sessions_vehicle ON ParkingSessions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_nosql_category ON _nosql_parking_notes(category, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_session_per_slot ON ParkingSessions(slot_id) WHERE exit_time IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_session_per_vehicle ON ParkingSessions(vehicle_id) WHERE exit_time IS NULL;

-- Triggers for Overlap Prevention
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
    SELECT RAISE(ABORT, 'Integrity Error: Reservation time overlaps an existing booking for this space.');
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
    SELECT RAISE(ABORT, 'Integrity Error: Updated reservation time overlaps an existing booking.');
END;

-- Capacity View
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
`);

// ----------------------------------------------------------------------------
// 2. AUTHENTICATION & PASSWORD HASHING (scrypt + timingSafeEqual)
// ----------------------------------------------------------------------------
db.exec(`
INSERT OR IGNORE INTO Roles(role_id, role_name, description) VALUES
(1, 'admin', 'Full administrative privileges: manage lots, zones, slots, users, pricing, violations, analytics'),
(2, 'attendant', 'Operational privileges: manage reservations, vehicle check-in, check-out, collect payments');
`);

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Seed default staff accounts
const seedStaff = db.prepare(`
  INSERT OR IGNORE INTO StaffAccounts(staff_id, name, email, password_hash, role_id)
  SELECT ?, ?, ?, ?, role_id FROM Roles WHERE role_name = ?
`);
seedStaff.run(1, 'Parkwise Administrator', 'admin@parkwise.local', passwordHash(process.env.DEMO_ADMIN_PASSWORD || 'Parkwise!2026'), 'admin');
seedStaff.run(2, 'Parking Floor Attendant', 'attendant@parkwise.local', passwordHash(process.env.DEMO_ATTENDANT_PASSWORD || 'Attendant!2026'), 'attendant');

// ----------------------------------------------------------------------------
// 3. SEED ALL 13 ER DIAGRAM ENTITIES WITH REALISTIC DATA
// ----------------------------------------------------------------------------
function seedEntityData() {
  // 1. Loyalty Tiers
  const tierCount = db.prepare('SELECT COUNT(*) n FROM LoyaltyTiers').get().n;
  if (tierCount < 4) {
    db.prepare("INSERT OR IGNORE INTO LoyaltyTiers(tier_id, tier_name, min_points, discount_pct) VALUES (1, 'Standard', 0, 0)").run();
    db.prepare("INSERT OR IGNORE INTO LoyaltyTiers(tier_id, tier_name, min_points, discount_pct) VALUES (2, 'Silver', 100, 5)").run();
    db.prepare("INSERT OR IGNORE INTO LoyaltyTiers(tier_id, tier_name, min_points, discount_pct) VALUES (3, 'Gold', 250, 10)").run();
    db.prepare("INSERT OR IGNORE INTO LoyaltyTiers(tier_id, tier_name, min_points, discount_pct) VALUES (4, 'Platinum', 500, 15)").run();
  }

  // 2. Parking Lots
  let lot1Id = 1;
  const lotsInDb = db.prepare('SELECT lot_id FROM ParkingLots LIMIT 1').get();
  if (!lotsInDb) {
    const l1 = db.prepare('INSERT INTO ParkingLots(name, location) VALUES (?, ?)').run('Central Plaza Mall', 'MG Road, Bengaluru');
    lot1Id = Number(l1.lastInsertRowid);
    db.prepare('INSERT INTO ParkingLots(name, location) VALUES (?, ?)').run('Tech Park Phase 1', 'Electronic City, Bengaluru');
    db.prepare('INSERT INTO ParkingLots(name, location) VALUES (?, ?)').run('Airport Express Terminal', 'Devanahalli, Bengaluru');
  } else {
    lot1Id = Number(lotsInDb.lot_id);
  }

  // 3. Pricing Rules
  const ruleCount = db.prepare('SELECT COUNT(*) n FROM PricingRules').get().n;
  if (ruleCount === 0) {
    db.prepare('INSERT INTO PricingRules(lot_id, slot_type, base_rate, peak_multiplier, start_hour, end_hour) VALUES (?, ?, ?, ?, ?, ?)').run(lot1Id, 'Standard', 40.0, 1.25, 9, 21);
    db.prepare('INSERT INTO PricingRules(lot_id, slot_type, base_rate, peak_multiplier, start_hour, end_hour) VALUES (?, ?, ?, ?, ?, ?)').run(lot1Id, 'EV', 60.0, 1.10, 0, 23);
    db.prepare('INSERT INTO PricingRules(lot_id, slot_type, base_rate, peak_multiplier, start_hour, end_hour) VALUES (?, ?, ?, ?, ?, ?)').run(lot1Id, 'Accessible', 30.0, 1.00, 0, 23);
  }

  // 4. Zones & Slots
  const zoneCount = db.prepare('SELECT COUNT(*) n FROM Zones').get().n;
  let z1Id = 1;
  if (zoneCount === 0) {
    const z1 = db.prepare('INSERT INTO Zones(lot_id, level, zone_type) VALUES (?, ?, ?)').run(lot1Id, 'Basement B1', 'Standard');
    z1Id = Number(z1.lastInsertRowid);
    const z2 = db.prepare('INSERT INTO Zones(lot_id, level, zone_type) VALUES (?, ?, ?)').run(lot1Id, 'Basement B2', 'EV Charging');
    const z3 = db.prepare('INSERT INTO Zones(lot_id, level, zone_type) VALUES (?, ?, ?)').run(lot1Id, 'Ground Floor', 'VIP & Accessible');

    const addSlot = db.prepare('INSERT INTO Slots(zone_id, slot_type, status) VALUES (?, ?, ?)');
    for (let i = 1; i <= 6; i++) addSlot.run(z1Id, 'Standard', i === 2 ? 'occupied' : 'available');
    for (let i = 1; i <= 4; i++) addSlot.run(z2.lastInsertRowid, 'EV', i === 1 ? 'occupied' : 'available');
    addSlot.run(z3.lastInsertRowid, 'Accessible', 'available');
    addSlot.run(z3.lastInsertRowid, 'VIP', 'available');
  }

  // 5. Users
  const userCount = db.prepare('SELECT COUNT(*) n FROM Users').get().n;
  let u1Id = 1, u2Id = 2, u3Id = 3;
  if (userCount === 0) {
    const u1 = db.prepare('INSERT INTO Users(name, phone, email, tier_id) VALUES (?, ?, ?, ?)').run('Aarav Sharma', '+91 98765 43210', 'aarav.sharma@example.com', 4);
    const u2 = db.prepare('INSERT INTO Users(name, phone, email, tier_id) VALUES (?, ?, ?, ?)').run('Diya Patel', '+91 98234 56789', 'diya.patel@example.com', 3);
    const u3 = db.prepare('INSERT INTO Users(name, phone, email, tier_id) VALUES (?, ?, ?, ?)').run('Rohan Iyer', '+91 98450 12345', 'rohan.iyer@example.com', 2);
    db.prepare('INSERT INTO Users(name, phone, email, tier_id) VALUES (?, ?, ?, ?)').run('Ananya Rao', '+91 98111 22334', 'ananya.rao@example.com', 1);
    db.prepare('INSERT INTO Users(name, phone, email, tier_id) VALUES (?, ?, ?, ?)').run('Vikram Malhotra', '+91 98999 88776', 'vikram.m@example.com', 1);
    u1Id = Number(u1.lastInsertRowid);
    u2Id = Number(u2.lastInsertRowid);
    u3Id = Number(u3.lastInsertRowid);
  }

  // 6. Vehicles
  const vehicleCount = db.prepare('SELECT COUNT(*) n FROM Vehicles').get().n;
  let v1Id = 1, v2Id = 2, v3Id = 3, v4Id = 4;
  if (vehicleCount === 0) {
    const v1 = db.prepare('INSERT INTO Vehicles(user_id, plate_no, type) VALUES (?, ?, ?)').run(u1Id, 'KA-01-MJ-5001', 'Car');
    const v2 = db.prepare('INSERT INTO Vehicles(user_id, plate_no, type) VALUES (?, ?, ?)').run(u1Id, 'KA-01-EV-2024', 'EV');
    const v3 = db.prepare('INSERT INTO Vehicles(user_id, plate_no, type) VALUES (?, ?, ?)').run(u2Id, 'KA-03-AB-1234', 'SUV');
    const v4 = db.prepare('INSERT INTO Vehicles(user_id, plate_no, type) VALUES (?, ?, ?)').run(u3Id, 'KA-05-XY-9876', 'Car');
    db.prepare('INSERT INTO Vehicles(user_id, plate_no, type) VALUES (?, ?, ?)').run(u2Id, 'KA-04-MB-4411', 'Motorcycle');
    db.prepare('INSERT INTO Vehicles(user_id, plate_no, type) VALUES (?, ?, ?)').run(u3Id, 'KA-02-ZZ-7788', 'Car');
    v1Id = Number(v1.lastInsertRowid);
    v2Id = Number(v2.lastInsertRowid);
    v3Id = Number(v3.lastInsertRowid);
    v4Id = Number(v4.lastInsertRowid);
  }

  // 7. Sessions & Payments
  const sessionCount = db.prepare('SELECT COUNT(*) n FROM ParkingSessions').get().n;
  let s1Id = 1, s2Id = 2, s3Id = 3;
  if (sessionCount === 0) {
    const past3h = new Date(Date.now() - 10800000).toISOString();
    const past1h = new Date(Date.now() - 3600000).toISOString();
    const past45m = new Date(Date.now() - 2700000).toISOString();
    const past90m = new Date(Date.now() - 5400000).toISOString();

    const s1 = db.prepare('INSERT INTO ParkingSessions(vehicle_id, slot_id, entry_time, exit_time) VALUES (?, ?, ?, ?)').run(v4Id, 1, past3h, past1h);
    s1Id = Number(s1.lastInsertRowid);
    db.prepare('INSERT INTO Payments(session_id, amount, method, paid_at) VALUES (?, ?, ?, ?)').run(s1Id, 80.0, 'UPI', past1h);

    const s2 = db.prepare('INSERT INTO ParkingSessions(vehicle_id, slot_id, entry_time) VALUES (?, ?, ?)').run(v1Id, 2, past45m);
    s2Id = Number(s2.lastInsertRowid);
    db.prepare("UPDATE Slots SET status = 'occupied' WHERE slot_id = 2").run();

    const s3 = db.prepare('INSERT INTO ParkingSessions(vehicle_id, slot_id, entry_time) VALUES (?, ?, ?)').run(v2Id, 7, past90m);
    s3Id = Number(s3.lastInsertRowid);
    db.prepare("UPDATE Slots SET status = 'occupied' WHERE slot_id = 7").run();
  }

  // 8. Reservations
  const resCount = db.prepare('SELECT COUNT(*) n FROM Reservations').get().n;
  if (resCount === 0) {
    db.prepare('INSERT INTO Reservations(user_id, vehicle_id, slot_id, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?)').run(
      u2Id,
      v3Id,
      3,
      new Date(Date.now() + 3600000).toISOString(),
      new Date(Date.now() + 10800000).toISOString(),
      'confirmed'
    );
    db.prepare("UPDATE Slots SET status = 'reserved' WHERE slot_id = 3").run();
  }

  // 9. Violations
  const violationCount = db.prepare('SELECT COUNT(*) n FROM Violations').get().n;
  if (violationCount === 0) {
    const anySession = db.prepare('SELECT session_id FROM ParkingSessions LIMIT 1').get();
    if (anySession) {
      db.prepare('INSERT INTO Violations(session_id, type, fine_amount) VALUES (?, ?, ?)').run(
        anySession.session_id,
        'Overstaying allotted reservation duration',
        250.0
      );
      db.prepare('INSERT INTO Violations(session_id, type, fine_amount) VALUES (?, ?, ?)').run(
        anySession.session_id,
        'Improper parking across lane boundary',
        100.0
      );
    }
  }

  // 10. Charging Sessions (EV)
  const chargeCount = db.prepare('SELECT COUNT(*) n FROM ChargingSessions').get().n;
  if (chargeCount === 0) {
    const evSession = db.prepare('SELECT session_id FROM ParkingSessions ORDER BY session_id DESC LIMIT 1').get();
    if (evSession) {
      db.prepare('INSERT INTO ChargingSessions(session_id, kwh_used, cost) VALUES (?, ?, ?)').run(
        evSession.session_id,
        18.450,
        276.75
      );
    }
  }

  // 11. Sensor Logs (IoT)
  const sensorCount = db.prepare('SELECT COUNT(*) n FROM SensorLogs').get().n;
  if (sensorCount === 0) {
    const addSensor = db.prepare('INSERT INTO SensorLogs(slot_id, reading, logged_at) VALUES (?, ?, ?)');
    addSensor.run(1, 0.00, new Date(Date.now() - 600000).toISOString());
    addSensor.run(2, 1.00, new Date(Date.now() - 300000).toISOString());
    addSensor.run(3, 0.00, new Date(Date.now() - 180000).toISOString());
    addSensor.run(7, 1.00, new Date(Date.now() - 120000).toISOString());
  }
}

seedEntityData();

// ----------------------------------------------------------------------------
// 4. VECTOR EMBEDDINGS & SEMANTIC SEARCH ENGINE
// ----------------------------------------------------------------------------
const VOCABULARY = [
  'charger', 'ev', 'broken', 'maintenance', 'barrier', 'gate', 'ticket',
  'sensor', 'ground', 'basement', 'vip', 'full', 'reserved', 'security',
  'camera', 'payment', 'upi', 'cash', 'overstay', 'slot', 'incident',
  'traffic', 'peak', 'fire', 'emergency', 'power', 'offline', 'handover',
  'permit', 'clean', 'light', 'fault', 'alarm', 'plate', 'stuck', 'rfid'
];

function computeTextVector(text) {
  const lower = String(text || '').toLowerCase();
  const vector = VOCABULARY.map(term => {
    const count = (lower.match(new RegExp('\\b' + term, 'g')) || []).length;
    return count > 0 ? Number((1.0 + Math.log(count)).toFixed(4)) : 0.0;
  });
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1.0;
  return vector.map(v => Number((v / magnitude).toFixed(4)));
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : Number((dot / denom).toFixed(4));
}

// ----------------------------------------------------------------------------
// 5. DUAL NOSQL STORAGE LAYER (MongoDB Live + Embedded Fallback)
// ----------------------------------------------------------------------------
let mongoClient = null;

async function getMongoCollection() {
  if (!process.env.MONGODB_URI || !MongoClient) return null;
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
      await mongoClient.connect();
    }
    const db = mongoClient.db(process.env.MONGODB_DATABASE || 'parkwise');
    return db.collection('parking_notes');
  } catch {
    return null;
  }
}

const embeddedNoSQL = {
  async find(filter = {}) {
    let sql = 'SELECT * FROM _nosql_parking_notes';
    const params = [];
    if (filter.category) {
      sql += ' WHERE category = ?';
      params.push(filter.category);
    }
    sql += ' ORDER BY updated_at DESC';
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => ({
      _id: r.id,
      title: r.title,
      note: r.note,
      category: r.category,
      priority: r.priority,
      tags: JSON.parse(r.tags || '[]'),
      vector: JSON.parse(r.vector || '[]'),
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  },
  async findById(id) {
    const r = db.prepare('SELECT * FROM _nosql_parking_notes WHERE id = ?').get(id);
    if (!r) return null;
    return {
      _id: r.id,
      title: r.title,
      note: r.note,
      category: r.category,
      priority: r.priority,
      tags: JSON.parse(r.tags || '[]'),
      vector: JSON.parse(r.vector || '[]'),
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  },
  async insert(doc) {
    const id = doc._id || crypto.randomBytes(12).toString('hex');
    const vector = doc.vector || computeTextVector(`${doc.title} ${doc.note} ${(doc.tags || []).join(' ')}`);
    db.prepare(`
      INSERT INTO _nosql_parking_notes (id, title, note, category, priority, tags, vector, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      doc.title,
      doc.note,
      doc.category || 'operations',
      doc.priority || 'medium',
      JSON.stringify(doc.tags || []),
      JSON.stringify(vector),
      doc.createdBy || 'staff',
      doc.createdAt || new Date().toISOString(),
      doc.updatedAt || new Date().toISOString()
    );
    return { _id: id, ...doc, vector };
  },
  async update(id, updates) {
    const existing = await embeddedNoSQL.findById(id);
    if (!existing) return false;
    const title = updates.title !== undefined ? updates.title : existing.title;
    const note = updates.note !== undefined ? updates.note : existing.note;
    const category = updates.category !== undefined ? updates.category : existing.category;
    const priority = updates.priority !== undefined ? updates.priority : existing.priority;
    const tags = updates.tags !== undefined ? updates.tags : existing.tags;
    const vector = computeTextVector(`${title} ${note} ${(tags || []).join(' ')}`);
    const updatedAt = new Date().toISOString();

    db.prepare(`
      UPDATE _nosql_parking_notes
      SET title = ?, note = ?, category = ?, priority = ?, tags = ?, vector = ?, updated_at = ?
      WHERE id = ?
    `).run(title, note, category, priority, JSON.stringify(tags), JSON.stringify(vector), updatedAt, id);
    return true;
  },
  async delete(id) {
    const res = db.prepare('DELETE FROM _nosql_parking_notes WHERE id = ?').run(id);
    return res.changes > 0;
  }
};

// Seed initial NoSQL notes if empty
(async () => {
  const count = db.prepare('SELECT COUNT(*) n FROM _nosql_parking_notes').get().n;
  if (!count) {
    const seedNotes = [
      {
        title: 'Basement B2 EV Charger #2 Cable Fault',
        note: 'EV high-speed charger stall 2 in Basement B2 has an intermittent connector latch failure. Marked offline for electrical inspection.',
        category: 'ev_charging',
        priority: 'high',
        tags: ['ev', 'charger', 'maintenance', 'broken'],
        createdBy: 'admin@parkwise.local'
      },
      {
        title: 'Peak Evening Traffic Shift Handover',
        note: 'Expect heavy traffic flow between 17:00 and 21:00 due to city mall sales. Keep Ground floor bays 7 and 8 reserved for VIP arrivals.',
        category: 'operations',
        priority: 'medium',
        tags: ['traffic', 'peak', 'ground', 'vip'],
        createdBy: 'attendant@parkwise.local'
      },
      {
        title: 'Ultrasonic Sensor Log Glitch Slot #4',
        note: 'Ultrasonic occupancy sensor at slot #4 was intermittently reporting false positive occupied status. Recalibrated firmware.',
        category: 'maintenance',
        priority: 'low',
        tags: ['sensor', 'slot', 'maintenance'],
        createdBy: 'admin@parkwise.local'
      },
      {
        title: 'Unauthorized Parking in Lane 1',
        note: 'Vehicle KA-02-ZZ-7788 parked across lane divider near Terminal North P1. Fine of ₹100 logged and vehicle guided to appropriate bay.',
        category: 'security',
        priority: 'urgent',
        tags: ['incident', 'security', 'overstay', 'violation'],
        createdBy: 'attendant@parkwise.local'
      }
    ];
    for (const n of seedNotes) await embeddedNoSQL.insert(n);
  }
})();

// ----------------------------------------------------------------------------
// 6. HTTP HELPERS & RBAC MIDDLEWARE
// ----------------------------------------------------------------------------
function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2e6) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function requireFields(data, fields) {
  for (const f of fields) {
    if (data[f] === undefined || data[f] === null || String(data[f]).trim() === '') {
      throw new Error(`Field '${f}' is required`);
    }
  }
}

function getCurrentStaff(req) {
  const cookie = req.headers.cookie || '';
  const token = cookie
    .split(';')
    .map(p => p.trim())
    .find(p => p.startsWith('parkwise_session='))
    ?.slice('parkwise_session='.length);

  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(decodeURIComponent(token)).digest('hex');
  const session = db.prepare(`
    SELECT a.staff_id, a.name, a.email, r.role_name AS role
    FROM AuthSessions s
    JOIN StaffAccounts a USING(staff_id)
    JOIN Roles r USING(role_id)
    WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now')
  `).get(tokenHash);

  return session || null;
}

// ----------------------------------------------------------------------------
// 7. REST API ROUTER
// ----------------------------------------------------------------------------
async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  // --------------------------------------------------------------------------
  // Public / Authentication Endpoints
  // --------------------------------------------------------------------------
  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const data = await parseBody(req);
      const email = String(data.email || '').trim().toLowerCase();
      const account = db.prepare(`
        SELECT a.*, r.role_name AS role 
        FROM StaffAccounts a 
        JOIN Roles r USING(role_id) 
        WHERE LOWER(a.email) = ?
      `).get(email);

      if (!account || !verifyPassword(String(data.password || ''), account.password_hash)) {
        return send(res, 401, { error: 'Invalid email address or password' });
      }

      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare(`
        INSERT INTO AuthSessions (token_hash, staff_id, expires_at)
        VALUES (?, ?, datetime('now', '+12 hours'))
      `).run(tokenHash, account.staff_id);

      res.setHeader('Set-Cookie', `parkwise_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
      return send(res, 200, {
        staff: { staff_id: account.staff_id, name: account.name, email: account.email, role: account.role }
      });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const staff = getCurrentStaff(req);
    return staff ? send(res, 200, { staff }) : send(res, 401, { error: 'Authentication required' });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const staff = getCurrentStaff(req);
    if (staff) {
      const cookie = req.headers.cookie || '';
      const token = cookie.split(';').map(p => p.trim()).find(p => p.startsWith('parkwise_session='))?.slice('parkwise_session='.length);
      if (token) {
        const tokenHash = crypto.createHash('sha256').update(decodeURIComponent(token)).digest('hex');
        db.prepare('DELETE FROM AuthSessions WHERE token_hash = ?').run(tokenHash);
      }
    }
    res.setHeader('Set-Cookie', 'parkwise_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  // System Health & Engine Status
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const mongoColl = await getMongoCollection();
    return send(res, 200, {
      status: 'healthy',
      time: new Date().toISOString(),
      relational: 'SQLite (PRAGMA foreign_keys = ON)',
      nosql_engine: mongoColl ? 'MongoDB (Live Connected)' : 'Embedded NoSQL Document Store (Active)',
      vector_search: 'Active (Cosine Similarity Semantic Embeddings)'
    });
  }

  // --------------------------------------------------------------------------
  // Authenticated RBAC Boundary
  // --------------------------------------------------------------------------
  const staff = getCurrentStaff(req);
  if (!staff) return send(res, 401, { error: 'Authentication required to access this endpoint.' });

  // Role Permissions: Attendants can create reservations, check-in, check-out, record payments, and create notes.
  // Structural changes (Lots, Zones, Slots, Pricing, Customers, Deleting Notes) require Admin role.
  const attendantAllowedWrites = ['/api/reservations', '/api/check-in', '/api/check-out', '/api/notes', '/api/notes/vector-search', '/api/sensor-logs'];
  if (req.method !== 'GET' && staff.role !== 'admin' && !attendantAllowedWrites.includes(url.pathname)) {
    return send(res, 403, { error: `Permission Denied: Role '${staff.role}' cannot perform administrative writes on ${url.pathname}` });
  }

  // --------------------------------------------------------------------------
  // Summary & Dashboard Data Endpoints
  // --------------------------------------------------------------------------
  if (req.method === 'GET' && url.pathname === '/api/summary') {
    const q = sql => db.prepare(sql).get().n;
    return send(res, 200, {
      lots: q('SELECT COUNT(*) n FROM ParkingLots'),
      slots: q("SELECT COUNT(*) n FROM Slots WHERE status = 'available'"),
      occupied: q("SELECT COUNT(*) n FROM Slots WHERE status = 'occupied'"),
      reserved: q("SELECT COUNT(*) n FROM Slots WHERE status = 'reserved'"),
      active: q('SELECT COUNT(*) n FROM ParkingSessions WHERE exit_time IS NULL'),
      revenue: db.prepare('SELECT COALESCE(SUM(amount), 0) n FROM Payments').get().n,
      capacity: db.prepare('SELECT COALESCE(SUM(total_capacity), 0) n FROM ParkingLotCapacity').get().n,
      violations: q('SELECT COUNT(*) n FROM Violations'),
      ev_charging: q('SELECT COUNT(*) n FROM ChargingSessions')
    });
  }

  // Complete data return covering ALL 13 ER DIAGRAM ENTITIES
  if (req.method === 'GET' && url.pathname === '/api/data') {
    return send(res, 200, {
      // 1. ParkingLots (Capacity view with derived total_capacity)
      lots: db.prepare('SELECT * FROM ParkingLotCapacity ORDER BY name').all(),
      // 2. Zones
      zones: db.prepare('SELECT z.*, p.name AS lot_name FROM Zones z JOIN ParkingLots p USING(lot_id) ORDER BY p.name, z.level').all(),
      // 3. Slots
      slots: db.prepare('SELECT s.*, z.lot_id, z.level, p.name AS lot_name FROM Slots s JOIN Zones z USING(zone_id) JOIN ParkingLots p USING(lot_id) ORDER BY p.name, z.level, s.slot_id').all(),
      // 4. LoyaltyTiers
      loyalty_tiers: db.prepare('SELECT * FROM LoyaltyTiers ORDER BY min_points ASC').all(),
      // 5. Users (with derived loyalty points)
      users: db.prepare(`
        SELECT u.*, lt.tier_name, lt.discount_pct,
               COALESCE((SELECT COUNT(*) FROM ParkingSessions ps JOIN Vehicles v USING(vehicle_id) WHERE v.user_id = u.user_id) * 25, 0) AS loyalty_points
        FROM Users u
        LEFT JOIN LoyaltyTiers lt USING(tier_id)
        ORDER BY u.user_id
      `).all(),
      // 6. Vehicles
      vehicles: db.prepare('SELECT v.*, u.name AS owner FROM Vehicles v JOIN Users u USING(user_id) ORDER BY v.plate_no').all(),
      // 7. PricingRules
      pricing_rules: db.prepare('SELECT pr.*, p.name AS lot_name FROM PricingRules pr JOIN ParkingLots p USING(lot_id) ORDER BY p.name, pr.slot_type').all(),
      // 8. Reservations
      reservations: db.prepare(`
        SELECT r.*, u.name AS user_name, v.plate_no, s.slot_id, p.name AS lot_name, z.level
        FROM Reservations r
        JOIN Users u USING(user_id)
        JOIN Vehicles v USING(vehicle_id)
        JOIN Slots s USING(slot_id)
        JOIN Zones z USING(zone_id)
        JOIN ParkingLots p USING(lot_id)
        ORDER BY r.res_id DESC LIMIT 40
      `).all(),
      // 9. ParkingSessions
      sessions: db.prepare(`
        SELECT ps.*, v.plate_no, v.type AS vehicle_type, s.slot_id, p.name AS lot_name, z.level,
               COALESCE(pay.amount, 0) AS payment_amount, pay.method AS payment_method
        FROM ParkingSessions ps
        JOIN Vehicles v USING(vehicle_id)
        JOIN Slots s USING(slot_id)
        JOIN Zones z USING(zone_id)
        JOIN ParkingLots p USING(lot_id)
        LEFT JOIN Payments pay USING(session_id)
        ORDER BY ps.session_id DESC LIMIT 40
      `).all(),
      // 10. Payments
      payments: db.prepare(`
        SELECT pay.*, ps.vehicle_id, v.plate_no, s.slot_id, p.name AS lot_name
        FROM Payments pay
        JOIN ParkingSessions ps USING(session_id)
        JOIN Vehicles v USING(vehicle_id)
        JOIN Slots s USING(slot_id)
        JOIN Zones z USING(zone_id)
        JOIN ParkingLots p USING(lot_id)
        ORDER BY pay.paid_at DESC LIMIT 40
      `).all(),
      // 11. Violations
      violations: db.prepare(`
        SELECT vio.*, v.plate_no, u.name AS customer_name, s.slot_id, p.name AS lot_name
        FROM Violations vio
        JOIN ParkingSessions ps USING(session_id)
        JOIN Vehicles v USING(vehicle_id)
        JOIN Users u USING(user_id)
        JOIN Slots s USING(slot_id)
        JOIN Zones z USING(zone_id)
        JOIN ParkingLots p USING(lot_id)
        ORDER BY vio.violation_id DESC LIMIT 40
      `).all(),
      // 12. ChargingSessions (EV)
      charging_sessions: db.prepare(`
        SELECT cs.*, v.plate_no, s.slot_id, p.name AS lot_name
        FROM ChargingSessions cs
        JOIN ParkingSessions ps USING(session_id)
        JOIN Vehicles v USING(vehicle_id)
        JOIN Slots s USING(slot_id)
        JOIN Zones z USING(zone_id)
        JOIN ParkingLots p USING(lot_id)
        ORDER BY cs.charge_id DESC LIMIT 40
      `).all(),
      // 13. SensorLogs (IoT Telemetry)
      sensor_logs: db.prepare(`
        SELECT sl.*, s.slot_type, s.status AS slot_status, z.level, p.name AS lot_name
        FROM SensorLogs sl
        JOIN Slots s USING(slot_id)
        JOIN Zones z USING(zone_id)
        JOIN ParkingLots p USING(lot_id)
        ORDER BY sl.logged_at DESC LIMIT 40
      `).all()
    });
  }

  // --------------------------------------------------------------------------
  // NoSQL Document Store & Vector Similarity Endpoints
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/notes' && req.method === 'GET') {
    try {
      const category = url.searchParams.get('category');
      const search = url.searchParams.get('search');
      const mongoColl = await getMongoCollection();

      let notes;
      if (mongoColl) {
        const query = {};
        if (category && category !== 'all') query.category = category;
        if (search) query.$text = { $search: search };
        const raw = await mongoColl.find(query).sort({ updatedAt: -1 }).limit(100).toArray();
        notes = raw.map(r => ({ ...r, _id: String(r._id) }));
      } else {
        notes = await embeddedNoSQL.find(category && category !== 'all' ? { category } : {});
        if (search) {
          const s = search.toLowerCase();
          notes = notes.filter(n => n.title.toLowerCase().includes(s) || n.note.toLowerCase().includes(s));
        }
      }

      return send(res, 200, {
        notes,
        storageEngine: mongoColl ? 'MongoDB (Live)' : 'Embedded NoSQL (Schema-Validated)'
      });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  if (url.pathname === '/api/notes/vector-search' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const queryText = String(data.query || '').trim();
      if (!queryText) return send(res, 400, { error: 'Search query is required for vector search' });

      const queryVector = computeTextVector(queryText);
      const mongoColl = await getMongoCollection();
      let allNotes;
      if (mongoColl) {
        const raw = await mongoColl.find({}).toArray();
        allNotes = raw.map(r => ({ ...r, _id: String(r._id) }));
      } else {
        allNotes = await embeddedNoSQL.find({});
      }

      const scoredNotes = allNotes.map(n => {
        const noteVec = n.vector && n.vector.length ? n.vector : computeTextVector(`${n.title} ${n.note} ${(n.tags || []).join(' ')}`);
        const sim = cosineSimilarity(queryVector, noteVec);
        return { ...n, similarityScore: sim, similarityPct: Math.round(sim * 100) };
      });

      scoredNotes.sort((a, b) => b.similarityScore - a.similarityScore);
      return send(res, 200, {
        query: queryText,
        matches: scoredNotes.slice(0, 10),
        storageEngine: mongoColl ? 'MongoDB (Live)' : 'Embedded NoSQL (Vector-Indexed)'
      });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  if (url.pathname === '/api/notes' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      requireFields(data, ['title', 'note']);
      const title = String(data.title).trim();
      const note = String(data.note).trim();
      const category = String(data.category || 'operations').trim();
      const priority = String(data.priority || 'medium').trim();
      const tags = Array.isArray(data.tags) ? data.tags : String(data.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      const vector = computeTextVector(`${title} ${note} ${tags.join(' ')}`);

      const doc = {
        title,
        note,
        category,
        priority,
        tags,
        vector,
        createdBy: staff.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const mongoColl = await getMongoCollection();
      if (mongoColl) {
        const result = await mongoColl.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
        return send(res, 201, { _id: String(result.insertedId), ...doc });
      } else {
        const created = await embeddedNoSQL.insert(doc);
        return send(res, 201, created);
      }
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  const noteIdMatch = url.pathname.match(/^\/api\/notes\/([a-zA-Z0-9_-]+)$/);
  if (noteIdMatch) {
    const id = noteIdMatch[1];
    const mongoColl = await getMongoCollection();

    if (req.method === 'GET') {
      try {
        let note;
        if (mongoColl && ObjectId.isValid(id)) {
          const raw = await mongoColl.findOne({ _id: new ObjectId(id) });
          note = raw ? { ...raw, _id: String(raw._id) } : null;
        } else {
          note = await embeddedNoSQL.findById(id);
        }
        return note ? send(res, 200, note) : send(res, 404, { error: 'Note not found' });
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    if (req.method === 'PUT') {
      try {
        const data = await parseBody(req);
        const updates = {};
        if (data.title !== undefined) updates.title = String(data.title).trim();
        if (data.note !== undefined) updates.note = String(data.note).trim();
        if (data.category !== undefined) updates.category = String(data.category).trim();
        if (data.priority !== undefined) updates.priority = String(data.priority).trim();
        if (data.tags !== undefined) {
          updates.tags = Array.isArray(data.tags) ? data.tags : String(data.tags).split(',').map(t => t.trim()).filter(Boolean);
        }

        if (mongoColl && ObjectId.isValid(id)) {
          const vector = computeTextVector(`${updates.title || ''} ${updates.note || ''} ${(updates.tags || []).join(' ')}`);
          const resMongo = await mongoColl.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...updates, vector, updatedAt: new Date() } }
          );
          return resMongo.matchedCount ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Note not found' });
        } else {
          const ok = await embeddedNoSQL.update(id, updates);
          return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Note not found' });
        }
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
    }

    if (req.method === 'DELETE') {
      try {
        if (staff.role !== 'admin') {
          return send(res, 403, { error: 'Administrator authority required to delete operations notes' });
        }
        if (mongoColl && ObjectId.isValid(id)) {
          const resMongo = await mongoColl.deleteOne({ _id: new ObjectId(id) });
          return resMongo.deletedCount ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Note not found' });
        } else {
          const ok = await embeddedNoSQL.delete(id);
          return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Note not found' });
        }
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Live SQL Query Console Endpoint
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/sql-queries/run' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const queryId = data.queryId;
      const customSql = data.sql;

      let queryToRun = '';
      let title = '';

      switch (queryId) {
        case 'join_5_tables':
          title = '5-Table Facility Inventory & Revenue Join (Rubric Item 7)';
          queryToRun = `
            SELECT pl.lot_id, pl.name AS lot_name, pl.location,
                   COUNT(DISTINCT s.slot_id) AS total_spaces,
                   COUNT(DISTINCT CASE WHEN s.status='available' THEN s.slot_id END) AS available,
                   COUNT(DISTINCT CASE WHEN s.status='occupied' THEN s.slot_id END) AS occupied,
                   COALESCE(SUM(p.amount), 0.0) AS total_revenue
            FROM ParkingLots pl
            LEFT JOIN Zones z ON z.lot_id = pl.lot_id
            LEFT JOIN Slots s ON s.zone_id = z.zone_id
            LEFT JOIN ParkingSessions ps ON ps.slot_id = s.slot_id
            LEFT JOIN Payments p ON p.session_id = ps.session_id
            GROUP BY pl.lot_id, pl.name, pl.location
            ORDER BY total_revenue DESC;
          `;
          break;
        case 'correlated_not_exists':
          title = 'Correlated Subquery with NOT EXISTS: Vacant Slots (Rubric Item 7)';
          queryToRun = `
            SELECT s.slot_id, s.slot_type, s.status, z.level, pl.name AS lot_name
            FROM Slots s
            JOIN Zones z ON z.zone_id = s.zone_id
            JOIN ParkingLots pl ON pl.lot_id = z.lot_id
            WHERE s.status = 'available'
              AND NOT EXISTS (
                SELECT 1 FROM ParkingSessions ps
                WHERE ps.slot_id = s.slot_id AND ps.exit_time IS NULL
              );
          `;
          break;
        case 'nested_in':
          title = 'Nested Subquery with IN: Paying Customers (Rubric Item 7)';
          queryToRun = `
            SELECT user_id, name, email, phone
            FROM Users
            WHERE user_id IN (
              SELECT DISTINCT v.user_id
              FROM Vehicles v
              JOIN ParkingSessions ps ON ps.vehicle_id = v.vehicle_id
              JOIN Payments p ON p.session_id = ps.session_id
            );
          `;
          break;
        case 'recursive_cte':
          title = 'Recursive CTE: 24-Hour Timeline Distribution (Rubric Item 7 & 8)';
          queryToRun = `
            WITH RECURSIVE HourSeries(hour_no) AS (
              SELECT 0
              UNION ALL
              SELECT hour_no + 1 FROM HourSeries WHERE hour_no < 23
            )
            SELECT h.hour_no AS hour_of_day,
                   COUNT(ps.session_id) AS checkins_count,
                   COALESCE(SUM(p.amount), 0.0) AS hourly_revenue
            FROM HourSeries h
            LEFT JOIN ParkingSessions ps ON CAST(strftime('%H', ps.entry_time) AS INTEGER) = h.hour_no
            LEFT JOIN Payments p ON p.session_id = ps.session_id
            GROUP BY h.hour_no
            ORDER BY h.hour_no ASC;
          `;
          break;
        case 'window_function_rank':
          title = 'CTE with DENSE_RANK() Window Function: Lot Revenue Leaderboard (Rubric Item 8)';
          queryToRun = `
            WITH LotRevenueAgg AS (
              SELECT pl.lot_id, pl.name AS lot_name,
                     COUNT(DISTINCT ps.session_id) AS total_sessions,
                     COALESCE(SUM(p.amount), 0.0) AS gross_revenue
              FROM ParkingLots pl
              JOIN Zones z ON z.lot_id = pl.lot_id
              JOIN Slots s ON s.zone_id = z.zone_id
              LEFT JOIN ParkingSessions ps ON ps.slot_id = s.slot_id
              LEFT JOIN Payments p ON p.session_id = ps.session_id
              GROUP BY pl.lot_id, pl.name
            )
            SELECT lot_id, lot_name, total_sessions, gross_revenue,
                   DENSE_RANK() OVER (ORDER BY gross_revenue DESC) AS revenue_rank
            FROM LotRevenueAgg;
          `;
          break;
        default:
          queryToRun = customSql;
          title = 'Custom Ad-Hoc Evaluation Query';
          break;
      }

      if (!queryToRun || !queryToRun.trim()) {
        return send(res, 400, { error: 'Valid SQL query required' });
      }

      const t0 = performance.now();
      const results = db.prepare(queryToRun.trim()).all();
      const t1 = performance.now();

      const columns = results.length > 0 ? Object.keys(results[0]) : [];
      return send(res, 200, {
        title,
        query: queryToRun.trim(),
        columns,
        rows: results,
        rowCount: results.length,
        executionTimeMs: Number((t1 - t0).toFixed(2))
      });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // Relational Entities CRUD Operations (ACID Safe)
  // --------------------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const data = await parseBody(req);
      switch (url.pathname) {
        case '/api/lots': {
          requireFields(data, ['name', 'location']);
          db.prepare('INSERT INTO ParkingLots (name, location) VALUES (?, ?)').run(data.name.trim(), data.location.trim());
          return send(res, 201, { ok: true, message: 'Parking lot created successfully' });
        }
        case '/api/zones': {
          requireFields(data, ['lot_id', 'level']);
          db.prepare('INSERT INTO Zones (lot_id, level, zone_type) VALUES (?, ?, ?)').run(
            Number(data.lot_id),
            data.level.trim(),
            (data.zone_type || 'Standard').trim()
          );
          return send(res, 201, { ok: true, message: 'Zone created successfully' });
        }
        case '/api/slots': {
          requireFields(data, ['zone_id']);
          db.prepare('INSERT INTO Slots (zone_id, slot_type, status) VALUES (?, ?, ?)').run(
            Number(data.zone_id),
            (data.slot_type || 'Standard').trim(),
            'available'
          );
          return send(res, 201, { ok: true, message: 'Parking space created successfully' });
        }
        case '/api/users': {
          requireFields(data, ['name', 'email']);
          db.prepare('INSERT INTO Users (name, email, phone, tier_id) VALUES (?, ?, ?, ?)').run(
            data.name.trim(),
            data.email.trim().toLowerCase(),
            data.phone ? data.phone.trim() : null,
            data.tier_id ? Number(data.tier_id) : 1
          );
          return send(res, 201, { ok: true, message: 'Customer registered successfully' });
        }
        case '/api/vehicles': {
          requireFields(data, ['user_id', 'plate_no', 'type']);
          db.prepare('INSERT INTO Vehicles (user_id, plate_no, type) VALUES (?, ?, ?)').run(
            Number(data.user_id),
            data.plate_no.trim().toUpperCase(),
            data.type.trim()
          );
          return send(res, 201, { ok: true, message: 'Vehicle registered successfully' });
        }
        case '/api/pricing-rules': {
          requireFields(data, ['lot_id', 'slot_type', 'base_rate']);
          db.prepare(`
            INSERT INTO PricingRules (lot_id, slot_type, base_rate, peak_multiplier, start_hour, end_hour)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            Number(data.lot_id),
            data.slot_type.trim(),
            Number(data.base_rate),
            data.peak_multiplier ? Number(data.peak_multiplier) : 1.0,
            data.start_hour !== undefined ? Number(data.start_hour) : 0,
            data.end_hour !== undefined ? Number(data.end_hour) : 23
          );
          return send(res, 201, { ok: true, message: 'Pricing rule created successfully' });
        }
        case '/api/violations': {
          requireFields(data, ['session_id', 'type', 'fine_amount']);
          db.prepare(`
            INSERT INTO Violations (session_id, type, fine_amount)
            VALUES (?, ?, ?)
          `).run(Number(data.session_id), data.type.trim(), Number(data.fine_amount));
          return send(res, 201, { ok: true, message: 'Violation logged successfully' });
        }
        case '/api/charging-sessions': {
          requireFields(data, ['session_id', 'kwh_used', 'cost']);
          db.prepare(`
            INSERT INTO ChargingSessions (session_id, kwh_used, cost)
            VALUES (?, ?, ?)
          `).run(Number(data.session_id), Number(data.kwh_used), Number(data.cost));
          return send(res, 201, { ok: true, message: 'EV Charging session logged successfully' });
        }
        case '/api/sensor-logs': {
          requireFields(data, ['slot_id', 'reading']);
          db.prepare(`
            INSERT INTO SensorLogs (slot_id, reading, logged_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
          `).run(Number(data.slot_id), Number(data.reading));
          return send(res, 201, { ok: true, message: 'Sensor log recorded' });
        }
        case '/api/loyalty-tiers': {
          requireFields(data, ['tier_name', 'min_points', 'discount_pct']);
          db.prepare(`
            INSERT INTO LoyaltyTiers (tier_name, min_points, discount_pct)
            VALUES (?, ?, ?)
          `).run(data.tier_name.trim(), Number(data.min_points), Number(data.discount_pct));
          return send(res, 201, { ok: true, message: 'Loyalty tier created successfully' });
        }
        case '/api/reservations': {
          requireFields(data, ['user_id', 'vehicle_id', 'slot_id', 'start_time', 'end_time']);
          const start = new Date(data.start_time);
          const end = new Date(data.end_time);
          if (end <= start) throw new Error('Reservation end time must be after start time');

          const vehicle = db.prepare('SELECT user_id FROM Vehicles WHERE vehicle_id = ?').get(data.vehicle_id);
          if (!vehicle || Number(vehicle.user_id) !== Number(data.user_id)) {
            throw new Error('Vehicle must belong to the selected customer');
          }

          const slot = db.prepare('SELECT status FROM Slots WHERE slot_id = ?').get(data.slot_id);
          if (!slot || slot.status !== 'available') throw new Error('Selected parking space is not currently available');

          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare(`
              INSERT INTO Reservations (user_id, vehicle_id, slot_id, start_time, end_time, status)
              VALUES (?, ?, ?, ?, ?, 'confirmed')
            `).run(data.user_id, data.vehicle_id, data.slot_id, start.toISOString(), end.toISOString());
            db.prepare("UPDATE Slots SET status = 'reserved' WHERE slot_id = ?").run(data.slot_id);
            db.exec('COMMIT');
            return send(res, 201, { ok: true, message: 'Reservation confirmed' });
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        }
        case '/api/check-in': {
          requireFields(data, ['vehicle_id', 'slot_id']);
          const slot = db.prepare('SELECT status FROM Slots WHERE slot_id = ?').get(data.slot_id);
          if (!slot || !['available', 'reserved'].includes(slot.status)) {
            throw new Error('Slot is not available for check-in');
          }

          const activeCheck = db.prepare('SELECT session_id FROM ParkingSessions WHERE vehicle_id = ? AND exit_time IS NULL').get(data.vehicle_id);
          if (activeCheck) throw new Error('Vehicle already has an active ongoing parking session');

          db.exec('BEGIN IMMEDIATE');
          try {
            const sess = db.prepare(`
              INSERT INTO ParkingSessions (vehicle_id, slot_id, res_id, entry_time)
              VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `).run(data.vehicle_id, data.slot_id, data.res_id || null);

            db.prepare("UPDATE Slots SET status = 'occupied' WHERE slot_id = ?").run(data.slot_id);
            if (data.res_id) {
              db.prepare("UPDATE Reservations SET status = 'completed' WHERE res_id = ?").run(data.res_id);
            }
            db.exec('COMMIT');
            return send(res, 201, { ok: true, session_id: Number(sess.lastInsertRowid), message: 'Vehicle checked in successfully' });
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        }
        case '/api/check-out': {
          requireFields(data, ['session_id', 'amount', 'method']);
          const session = db.prepare('SELECT * FROM ParkingSessions WHERE session_id = ? AND exit_time IS NULL').get(data.session_id);
          if (!session) throw new Error('Active ongoing session not found');

          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('UPDATE ParkingSessions SET exit_time = CURRENT_TIMESTAMP WHERE session_id = ?').run(data.session_id);
            db.prepare("UPDATE Slots SET status = 'available' WHERE slot_id = ?").run(session.slot_id);
            db.prepare('INSERT INTO Payments (session_id, amount, method, paid_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(
              data.session_id,
              Number(data.amount),
              data.method
            );
            db.exec('COMMIT');
            return send(res, 201, { ok: true, message: 'Vehicle checked out and payment recorded' });
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        }
        default:
          return send(res, 404, { error: `Endpoint ${url.pathname} not found` });
      }
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  return send(res, 404, { error: 'Endpoint not found' });
}

// ----------------------------------------------------------------------------
// 8. HTTP SERVER LISTENER WITH STATIC ASSETS
// ----------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

  const file = url.pathname === '/' ? 'index.html' : path.basename(url.pathname);
  const full = path.join(ROOT, 'public', file);

  if (!fs.existsSync(full)) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');

  const ext = path.extname(full).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png'
  };

  send(res, 200, fs.readFileSync(full), types[ext] || 'text/plain; charset=utf-8');
});

server.listen(PORT, () => {
  console.log(`[Parkwise API] Smart Parking Server active at http://localhost:${PORT}`);
});
