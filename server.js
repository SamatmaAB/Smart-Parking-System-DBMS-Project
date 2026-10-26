const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const db = new DatabaseSync(path.join(ROOT, 'smart_parking.db'));
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS LoyaltyTiers(tier_id INTEGER PRIMARY KEY, tier_name TEXT NOT NULL UNIQUE, min_points INTEGER NOT NULL DEFAULT 0 CHECK(min_points>=0), discount_pct REAL NOT NULL DEFAULT 0 CHECK(discount_pct BETWEEN 0 AND 100));
CREATE TABLE IF NOT EXISTS Users(user_id INTEGER PRIMARY KEY, tier_id INTEGER REFERENCES LoyaltyTiers ON UPDATE CASCADE ON DELETE SET NULL, name TEXT NOT NULL, phone TEXT, email TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS Vehicles(vehicle_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES Users ON UPDATE CASCADE ON DELETE RESTRICT, plate_no TEXT NOT NULL UNIQUE, type TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ParkingLots(lot_id INTEGER PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS PricingRules(rule_id INTEGER PRIMARY KEY, lot_id INTEGER NOT NULL REFERENCES ParkingLots ON UPDATE CASCADE ON DELETE CASCADE, slot_type TEXT NOT NULL, base_rate REAL NOT NULL CHECK(base_rate>=0), peak_multiplier REAL NOT NULL DEFAULT 1 CHECK(peak_multiplier>=0), start_hour INTEGER NOT NULL CHECK(start_hour BETWEEN 0 AND 23), end_hour INTEGER NOT NULL CHECK(end_hour BETWEEN 0 AND 23));
CREATE TABLE IF NOT EXISTS Zones(zone_id INTEGER PRIMARY KEY, lot_id INTEGER NOT NULL REFERENCES ParkingLots ON UPDATE CASCADE ON DELETE CASCADE, level TEXT NOT NULL, zone_type TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Slots(slot_id INTEGER PRIMARY KEY, zone_id INTEGER NOT NULL REFERENCES Zones ON UPDATE CASCADE ON DELETE CASCADE, slot_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','occupied','reserved','maintenance')));
CREATE TABLE IF NOT EXISTS Reservations(res_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES Users ON UPDATE CASCADE ON DELETE RESTRICT, vehicle_id INTEGER NOT NULL REFERENCES Vehicles ON UPDATE CASCADE ON DELETE RESTRICT, slot_id INTEGER NOT NULL REFERENCES Slots ON UPDATE CASCADE ON DELETE RESTRICT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','completed','no_show')), CHECK(end_time>start_time));
CREATE TABLE IF NOT EXISTS ParkingSessions(session_id INTEGER PRIMARY KEY, vehicle_id INTEGER NOT NULL REFERENCES Vehicles ON UPDATE CASCADE ON DELETE RESTRICT, slot_id INTEGER NOT NULL REFERENCES Slots ON UPDATE CASCADE ON DELETE RESTRICT, res_id INTEGER UNIQUE REFERENCES Reservations ON UPDATE CASCADE ON DELETE SET NULL, entry_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, exit_time TEXT, CHECK(exit_time IS NULL OR exit_time>=entry_time));
CREATE TABLE IF NOT EXISTS Payments(payment_id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES ParkingSessions ON UPDATE CASCADE ON DELETE CASCADE, amount REAL NOT NULL CHECK(amount>=0), method TEXT NOT NULL, paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Violations(violation_id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES ParkingSessions ON UPDATE CASCADE ON DELETE CASCADE, type TEXT NOT NULL, fine_amount REAL NOT NULL DEFAULT 0 CHECK(fine_amount>=0));
CREATE TABLE IF NOT EXISTS ChargingSessions(charge_id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES ParkingSessions ON UPDATE CASCADE ON DELETE CASCADE, kwh_used REAL NOT NULL DEFAULT 0 CHECK(kwh_used>=0), cost REAL NOT NULL DEFAULT 0 CHECK(cost>=0));
CREATE TABLE IF NOT EXISTS SensorLogs(log_id INTEGER PRIMARY KEY, slot_id INTEGER NOT NULL REFERENCES Slots ON UPDATE CASCADE ON DELETE CASCADE, reading REAL NOT NULL, logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_res_slot_time ON Reservations(slot_id,start_time,end_time);
CREATE INDEX IF NOT EXISTS idx_sensor_slot_time ON SensorLogs(slot_id,logged_at);
CREATE VIEW IF NOT EXISTS ParkingLotCapacity AS SELECT p.lot_id,p.name,p.location,COUNT(s.slot_id) total_capacity FROM ParkingLots p LEFT JOIN Zones z USING(lot_id) LEFT JOIN Slots s USING(zone_id) GROUP BY p.lot_id;
`);

const count = db.prepare('SELECT COUNT(*) n FROM ParkingLots').get().n;
if (!count) {
  const lot = db.prepare('INSERT INTO ParkingLots(name,location) VALUES (?,?)').run('Central Plaza', 'Downtown');
  const zone = db.prepare('INSERT INTO Zones(lot_id,level,zone_type) VALUES (?,?,?)').run(lot.lastInsertRowid, 'Ground', 'Standard');
  const addSlot = db.prepare('INSERT INTO Slots(zone_id,slot_type,status) VALUES (?,?,?)');
  for (let i = 0; i < 12; i++) addSlot.run(zone.lastInsertRowid, i < 2 ? 'EV' : 'Standard', 'available');
  db.prepare('INSERT INTO LoyaltyTiers(tier_name,min_points,discount_pct) VALUES (?,?,?)').run('Standard', 0, 0);
}

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1e6) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function required(data, names) {
  for (const name of names) if (data[name] === undefined || data[name] === null || String(data[name]).trim() === '') throw new Error(`${name} is required`);
}
function run(sql, values) { return db.prepare(sql).run(...values); }
function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/summary') {
    const one = sql => db.prepare(sql).get().n;
    return send(res, 200, {
      lots: one('SELECT COUNT(*) n FROM ParkingLots'), slots: one("SELECT COUNT(*) n FROM Slots WHERE status='available'"),
      occupied: one("SELECT COUNT(*) n FROM Slots WHERE status='occupied'"), active: one('SELECT COUNT(*) n FROM ParkingSessions WHERE exit_time IS NULL'),
      revenue: db.prepare('SELECT COALESCE(SUM(amount),0) n FROM Payments').get().n,
      capacity: db.prepare('SELECT COALESCE(SUM(total_capacity),0) n FROM ParkingLotCapacity').get().n
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/data') {
    const rows = table => db.prepare(`SELECT * FROM ${table}`).all();
    return send(res, 200, {
      lots: db.prepare('SELECT * FROM ParkingLotCapacity ORDER BY name').all(),
      zones: db.prepare('SELECT z.*,p.name lot_name FROM Zones z JOIN ParkingLots p USING(lot_id) ORDER BY p.name,z.level').all(),
      slots: db.prepare('SELECT s.*,z.lot_id,z.level,p.name lot_name FROM Slots s JOIN Zones z USING(zone_id) JOIN ParkingLots p USING(lot_id) ORDER BY p.name,z.level,s.slot_id').all(),
      users: rows('Users'), vehicles: db.prepare('SELECT v.*,u.name owner FROM Vehicles v JOIN Users u USING(user_id) ORDER BY v.plate_no').all(),
      reservations: db.prepare('SELECT r.*,u.name user_name,v.plate_no,s.slot_id,p.name lot_name FROM Reservations r JOIN Users u USING(user_id) JOIN Vehicles v USING(vehicle_id) JOIN Slots s USING(slot_id) JOIN Zones z USING(zone_id) JOIN ParkingLots p USING(lot_id) ORDER BY r.res_id DESC LIMIT 30').all(),
      sessions: db.prepare('SELECT ps.*,v.plate_no,s.slot_id,p.name lot_name FROM ParkingSessions ps JOIN Vehicles v USING(vehicle_id) JOIN Slots s USING(slot_id) JOIN Zones z USING(zone_id) JOIN ParkingLots p USING(lot_id) ORDER BY ps.session_id DESC LIMIT 30').all()
    });
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) return body(req).then(data => {
    try {
      switch (url.pathname) {
        case '/api/lots': required(data, ['name','location']); run('INSERT INTO ParkingLots(name,location) VALUES (?,?)',[data.name.trim(),data.location.trim()]); break;
        case '/api/zones': required(data, ['lot_id','level','zone_type']); run('INSERT INTO Zones(lot_id,level,zone_type) VALUES (?,?,?)',[data.lot_id,data.level.trim(),data.zone_type.trim()]); break;
        case '/api/slots': required(data, ['zone_id','slot_type']); run('INSERT INTO Slots(zone_id,slot_type) VALUES (?,?)',[data.zone_id,data.slot_type.trim()]); break;
        case '/api/users': required(data, ['name','email']); run('INSERT INTO Users(name,email,phone,tier_id) VALUES (?,?,?,?)',[data.name.trim(),data.email.trim().toLowerCase(),data.phone || null,data.tier_id || null]); break;
        case '/api/vehicles': required(data, ['user_id','plate_no','type']); run('INSERT INTO Vehicles(user_id,plate_no,type) VALUES (?,?,?)',[data.user_id,data.plate_no.trim().toUpperCase(),data.type.trim()]); break;
        case '/api/reservations': {
          required(data, ['user_id','vehicle_id','slot_id','start_time','end_time']);
          if (new Date(data.end_time) <= new Date(data.start_time)) throw new Error('End time must be after start time');
          const vehicle = db.prepare('SELECT user_id FROM Vehicles WHERE vehicle_id=?').get(data.vehicle_id);
          if (!vehicle || Number(vehicle.user_id) !== Number(data.user_id)) throw new Error('Choose a vehicle registered to this customer');
          const slot = db.prepare("SELECT status FROM Slots WHERE slot_id=?").get(data.slot_id);
          if (!slot || slot.status !== 'available') throw new Error('Choose an available slot');
          run('INSERT INTO Reservations(user_id,vehicle_id,slot_id,start_time,end_time,status) VALUES (?,?,?,?,?,?)',[data.user_id,data.vehicle_id,data.slot_id,new Date(data.start_time).toISOString(),new Date(data.end_time).toISOString(),'confirmed']);
          run("UPDATE Slots SET status='reserved' WHERE slot_id=?",[data.slot_id]); break;
        }
        case '/api/check-in': {
          required(data, ['vehicle_id','slot_id']);
          const slot = db.prepare('SELECT status FROM Slots WHERE slot_id=?').get(data.slot_id);
          if (!slot || !['available','reserved'].includes(slot.status)) throw new Error('Slot is not available for check-in');
          if (data.res_id) {
            const reservation = db.prepare('SELECT vehicle_id,slot_id,status FROM Reservations WHERE res_id=?').get(data.res_id);
            if (!reservation || Number(reservation.vehicle_id) !== Number(data.vehicle_id) || Number(reservation.slot_id) !== Number(data.slot_id) || !['pending','confirmed'].includes(reservation.status)) throw new Error('Reservation does not match this vehicle and space');
          }
          const session = run('INSERT INTO ParkingSessions(vehicle_id,slot_id,res_id) VALUES (?,?,?)',[data.vehicle_id,data.slot_id,data.res_id || null]);
          run("UPDATE Slots SET status='occupied' WHERE slot_id=?",[data.slot_id]);
          if (data.res_id) run("UPDATE Reservations SET status='completed' WHERE res_id=?",[data.res_id]);
          send(res, 201, { session_id: Number(session.lastInsertRowid) }); return;
        }
        case '/api/check-out': {
          required(data, ['session_id','amount','method']);
          const session = db.prepare('SELECT * FROM ParkingSessions WHERE session_id=? AND exit_time IS NULL').get(data.session_id);
          if (!session) throw new Error('Active session not found');
          db.exec('BEGIN');
          run('UPDATE ParkingSessions SET exit_time=CURRENT_TIMESTAMP WHERE session_id=?',[data.session_id]);
          run("UPDATE Slots SET status='available' WHERE slot_id=?",[session.slot_id]);
          run('INSERT INTO Payments(session_id,amount,method) VALUES (?,?,?)',[data.session_id,Number(data.amount),data.method]);
          db.exec('COMMIT'); break;
        }
        default: return send(res, 404, { error: 'Endpoint not found' });
      }
      send(res, 201, { ok: true });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      send(res, 400, { error: error.message });
    }
  }).catch(error => send(res, 400, { error: error.message }));
  return send(res, 404, { error: 'Endpoint not found' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  const file = url.pathname === '/' ? 'index.html' : path.basename(url.pathname);
  const full = path.join(ROOT, 'public', file);
  if (!['index.html','app.js','styles.css'].includes(file) || !fs.existsSync(full)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
  send(res, 200, fs.readFileSync(full), type);
});
server.listen(PORT, () => console.log(`Smart Parking is running at http://localhost:${PORT}`));
