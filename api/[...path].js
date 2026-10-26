const { neon } = require('@neondatabase/serverless');

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS LoyaltyTiers (tier_id SERIAL PRIMARY KEY, tier_name VARCHAR(60) NOT NULL UNIQUE, min_points INTEGER NOT NULL DEFAULT 0 CHECK(min_points >= 0), discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(discount_pct BETWEEN 0 AND 100))`,
  `CREATE TABLE IF NOT EXISTS Users (user_id SERIAL PRIMARY KEY, tier_id INTEGER REFERENCES LoyaltyTiers(tier_id) ON UPDATE CASCADE ON DELETE SET NULL, name VARCHAR(120) NOT NULL, phone VARCHAR(30), email VARCHAR(254) NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS Vehicles (vehicle_id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES Users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT, plate_no VARCHAR(20) NOT NULL UNIQUE, type VARCHAR(40) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ParkingLots (lot_id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, location VARCHAR(255) NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS PricingRules (rule_id SERIAL PRIMARY KEY, lot_id INTEGER NOT NULL REFERENCES ParkingLots(lot_id) ON UPDATE CASCADE ON DELETE CASCADE, slot_type VARCHAR(40) NOT NULL, base_rate NUMERIC(10,2) NOT NULL CHECK(base_rate >= 0), peak_multiplier NUMERIC(6,3) NOT NULL DEFAULT 1 CHECK(peak_multiplier >= 0), start_hour SMALLINT NOT NULL CHECK(start_hour BETWEEN 0 AND 23), end_hour SMALLINT NOT NULL CHECK(end_hour BETWEEN 0 AND 23))`,
  `CREATE TABLE IF NOT EXISTS Zones (zone_id SERIAL PRIMARY KEY, lot_id INTEGER NOT NULL REFERENCES ParkingLots(lot_id) ON UPDATE CASCADE ON DELETE CASCADE, level VARCHAR(30) NOT NULL, zone_type VARCHAR(40) NOT NULL, UNIQUE(lot_id, level, zone_type))`,
  `CREATE TABLE IF NOT EXISTS Slots (slot_id SERIAL PRIMARY KEY, zone_id INTEGER NOT NULL REFERENCES Zones(zone_id) ON UPDATE CASCADE ON DELETE CASCADE, slot_type VARCHAR(40) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK(status IN ('available','occupied','reserved','maintenance')))` ,
  `CREATE TABLE IF NOT EXISTS Reservations (res_id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES Users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT, vehicle_id INTEGER NOT NULL REFERENCES Vehicles(vehicle_id) ON UPDATE CASCADE ON DELETE RESTRICT, slot_id INTEGER NOT NULL REFERENCES Slots(slot_id) ON UPDATE CASCADE ON DELETE RESTRICT, start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','completed','no_show')), CHECK(end_time > start_time))`,
  `CREATE TABLE IF NOT EXISTS ParkingSessions (session_id SERIAL PRIMARY KEY, vehicle_id INTEGER NOT NULL REFERENCES Vehicles(vehicle_id) ON UPDATE CASCADE ON DELETE RESTRICT, slot_id INTEGER NOT NULL REFERENCES Slots(slot_id) ON UPDATE CASCADE ON DELETE RESTRICT, res_id INTEGER UNIQUE REFERENCES Reservations(res_id) ON UPDATE CASCADE ON DELETE SET NULL, entry_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, exit_time TIMESTAMPTZ, CHECK(exit_time IS NULL OR exit_time >= entry_time))`,
  `CREATE TABLE IF NOT EXISTS Payments (payment_id SERIAL PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES ParkingSessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE, amount NUMERIC(10,2) NOT NULL CHECK(amount >= 0), method VARCHAR(30) NOT NULL, paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS Violations (violation_id SERIAL PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES ParkingSessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE, type VARCHAR(80) NOT NULL, fine_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(fine_amount >= 0))`,
  `CREATE TABLE IF NOT EXISTS ChargingSessions (charge_id SERIAL PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES ParkingSessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE, kwh_used NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK(kwh_used >= 0), cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(cost >= 0))`,
  `CREATE TABLE IF NOT EXISTS SensorLogs (log_id SERIAL PRIMARY KEY, slot_id INTEGER NOT NULL REFERENCES Slots(slot_id) ON UPDATE CASCADE ON DELETE CASCADE, reading NUMERIC(12,4) NOT NULL, logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_reservations_slot_time ON Reservations(slot_id, start_time, end_time)`,
  `CREATE INDEX IF NOT EXISTS idx_sensor_logs_slot_time ON SensorLogs(slot_id, logged_at)`,
  `CREATE OR REPLACE VIEW ParkingLotCapacity AS SELECT p.lot_id,p.name,p.location,COUNT(s.slot_id)::INTEGER AS total_capacity FROM ParkingLots p LEFT JOIN Zones z USING(lot_id) LEFT JOIN Slots s USING(zone_id) GROUP BY p.lot_id,p.name,p.location`
];

let initialization;
function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not connected yet. Add DATABASE_URL in Vercel Environment Variables.');
  return neon(process.env.DATABASE_URL);
}
async function initialize(sql) {
  if (!initialization) initialization = (async () => {
    await sql.transaction(schemaStatements.map(statement => sql.query(statement)));
    await sql.query(`INSERT INTO LoyaltyTiers(tier_name,min_points,discount_pct) VALUES ('Standard',0,0) ON CONFLICT (tier_name) DO NOTHING`);
    await sql.query(`INSERT INTO ParkingLots(name,location) SELECT 'Central Plaza','Downtown' WHERE NOT EXISTS (SELECT 1 FROM ParkingLots)`);
    await sql.query(`INSERT INTO Zones(lot_id,level,zone_type) SELECT lot_id,'Ground','Standard' FROM ParkingLots p WHERE p.name='Central Plaza' AND NOT EXISTS (SELECT 1 FROM Zones z WHERE z.lot_id=p.lot_id)`);
    await sql.query(`INSERT INTO Slots(zone_id,slot_type,status) SELECT z.zone_id,CASE WHEN seq.n <= 2 THEN 'EV' ELSE 'Standard' END,'available' FROM Zones z CROSS JOIN generate_series(1,12) AS seq(n) WHERE z.level='Ground' AND z.zone_type='Standard' AND NOT EXISTS (SELECT 1 FROM Slots s WHERE s.zone_id=z.zone_id)`);
  })().catch(error => { initialization = null; throw error; });
  return initialization;
}
function send(res, status, data) { return res.status(status).json(data); }
function required(data, names) {
  for (const name of names) if (data[name] === undefined || data[name] === null || String(data[name]).trim() === '') throw new Error(`${name} is required`);
}
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const sql = getSql();
    await initialize(sql);
    const pathname = new URL(req.url, 'https://vercel.invalid').pathname;
    const endpoint = pathname.replace(/^\/api\/?/, '');
    if (req.method === 'GET' && endpoint === 'summary') {
      const [lots, available, occupied, active, revenue, capacity] = await sql.transaction([
        sql`SELECT COUNT(*)::INTEGER AS n FROM ParkingLots`,
        sql`SELECT COUNT(*)::INTEGER AS n FROM Slots WHERE status='available'`,
        sql`SELECT COUNT(*)::INTEGER AS n FROM Slots WHERE status='occupied'`,
        sql`SELECT COUNT(*)::INTEGER AS n FROM ParkingSessions WHERE exit_time IS NULL`,
        sql`SELECT COALESCE(SUM(amount),0)::NUMERIC AS n FROM Payments`,
        sql`SELECT COALESCE(SUM(total_capacity),0)::INTEGER AS n FROM ParkingLotCapacity`
      ], { isolationMode: 'ReadCommitted', readOnly: true });
      return send(res, 200, { lots: lots[0].n, slots: available[0].n, occupied: occupied[0].n, active: active[0].n, revenue: revenue[0].n, capacity: capacity[0].n });
    }
    if (req.method === 'GET' && endpoint === 'data') {
      const [lots,zones,slots,users,vehicles,reservations,sessions] = await sql.transaction([
        sql`SELECT * FROM ParkingLotCapacity ORDER BY name`,
        sql`SELECT z.*,p.name lot_name FROM Zones z JOIN ParkingLots p USING(lot_id) ORDER BY p.name,z.level`,
        sql`SELECT s.*,z.lot_id,z.level,p.name lot_name FROM Slots s JOIN Zones z USING(zone_id) JOIN ParkingLots p USING(lot_id) ORDER BY p.name,z.level,s.slot_id`,
        sql`SELECT * FROM Users ORDER BY name`,
        sql`SELECT v.*,u.name owner FROM Vehicles v JOIN Users u USING(user_id) ORDER BY v.plate_no`,
        sql`SELECT r.*,u.name user_name,v.plate_no,s.slot_id,p.name lot_name FROM Reservations r JOIN Users u USING(user_id) JOIN Vehicles v USING(vehicle_id) JOIN Slots s USING(slot_id) JOIN Zones z USING(zone_id) JOIN ParkingLots p USING(lot_id) ORDER BY r.res_id DESC LIMIT 30`,
        sql`SELECT ps.*,v.plate_no,s.slot_id,p.name lot_name FROM ParkingSessions ps JOIN Vehicles v USING(vehicle_id) JOIN Slots s USING(slot_id) JOIN Zones z USING(zone_id) JOIN ParkingLots p USING(lot_id) ORDER BY ps.session_id DESC LIMIT 30`
      ], { isolationMode: 'ReadCommitted', readOnly: true });
      return send(res, 200, {lots:lots[0],zones:zones[0],slots:slots[0],users:users[0],vehicles:vehicles[0],reservations:reservations[0],sessions:sessions[0]});
    }
    if (req.method !== 'POST') return send(res, 404, {error:'Endpoint not found'});
    const data = parseBody(req);
    switch (endpoint) {
      case 'lots':
        required(data,['name','location']);
        await sql`INSERT INTO ParkingLots(name,location) VALUES (${data.name.trim()},${data.location.trim()})`;
        break;
      case 'zones':
        required(data,['lot_id','level','zone_type']);
        await sql`INSERT INTO Zones(lot_id,level,zone_type) VALUES (${Number(data.lot_id)},${data.level.trim()},${data.zone_type.trim()})`;
        break;
      case 'slots':
        required(data,['zone_id','slot_type']);
        await sql`INSERT INTO Slots(zone_id,slot_type) VALUES (${Number(data.zone_id)},${data.slot_type.trim()})`;
        break;
      case 'users':
        required(data,['name','email']);
        await sql`INSERT INTO Users(name,email,phone,tier_id) VALUES (${data.name.trim()},${data.email.trim().toLowerCase()},${data.phone||null},${data.tier_id?Number(data.tier_id):null})`;
        break;
      case 'vehicles':
        required(data,['user_id','plate_no','type']);
        await sql`INSERT INTO Vehicles(user_id,plate_no,type) VALUES (${Number(data.user_id)},${data.plate_no.trim().toUpperCase()},${data.type.trim()})`;
        break;
      case 'reservations': {
        required(data,['user_id','vehicle_id','slot_id','start_time','end_time']);
        if (new Date(data.end_time) <= new Date(data.start_time)) throw new Error('End time must be after start time');
        const [vehicle] = await sql`SELECT user_id FROM Vehicles WHERE vehicle_id=${Number(data.vehicle_id)}`;
        if (!vehicle || Number(vehicle.user_id)!==Number(data.user_id)) throw new Error('Choose a vehicle registered to this customer');
        const [reservation] = await sql`WITH reserved AS (UPDATE Slots SET status='reserved' WHERE slot_id=${Number(data.slot_id)} AND status='available' RETURNING slot_id) INSERT INTO Reservations(user_id,vehicle_id,slot_id,start_time,end_time,status) SELECT ${Number(data.user_id)},${Number(data.vehicle_id)},slot_id,${new Date(data.start_time).toISOString()},${new Date(data.end_time).toISOString()},'confirmed' FROM reserved RETURNING res_id`;
        if (!reservation) throw new Error('Choose an available slot');
        break;
      }
      case 'check-in': {
        required(data,['vehicle_id','slot_id']);
        if (data.res_id) {
          const [reservation] = await sql`SELECT vehicle_id,slot_id,status FROM Reservations WHERE res_id=${Number(data.res_id)}`;
          if (!reservation || Number(reservation.vehicle_id)!==Number(data.vehicle_id) || Number(reservation.slot_id)!==Number(data.slot_id) || !['pending','confirmed'].includes(reservation.status)) throw new Error('Reservation does not match this vehicle and space');
        }
        const [session] = await sql`WITH completed_reservation AS (UPDATE Reservations SET status='completed' WHERE res_id=${data.res_id?Number(data.res_id):null} AND vehicle_id=${Number(data.vehicle_id)} AND slot_id=${Number(data.slot_id)} AND status IN ('pending','confirmed') RETURNING res_id), occupied AS (UPDATE Slots SET status='occupied' WHERE slot_id=${Number(data.slot_id)} AND status IN ('available','reserved') AND (${data.res_id?Number(data.res_id):null}::INTEGER IS NULL OR EXISTS (SELECT 1 FROM completed_reservation)) RETURNING slot_id) INSERT INTO ParkingSessions(vehicle_id,slot_id,res_id) SELECT ${Number(data.vehicle_id)},slot_id,${data.res_id?Number(data.res_id):null} FROM occupied RETURNING session_id`;
        if (!session) throw new Error('Slot or reservation is no longer available');
        return send(res,201,{session_id:session.session_id});
      }
      case 'check-out': {
        required(data,['session_id','amount','method']);
        const [session] = await sql`WITH completed AS (UPDATE ParkingSessions SET exit_time=CURRENT_TIMESTAMP WHERE session_id=${Number(data.session_id)} AND exit_time IS NULL RETURNING session_id,slot_id), freed AS (UPDATE Slots s SET status='available' FROM completed c WHERE s.slot_id=c.slot_id RETURNING s.slot_id), payment AS (INSERT INTO Payments(session_id,amount,method) SELECT session_id,${Number(data.amount)},${data.method} FROM completed RETURNING payment_id) SELECT session_id FROM completed`;
        if (!session) throw new Error('Active session not found');
        break;
      }
      default: return send(res,404,{error:'Endpoint not found'});
    }
    return send(res,201,{ok:true});
  } catch (error) {
    console.error('Smart Parking API error:',error);
    const status = error.message.includes('required') || error.message.startsWith('Choose') || error.message.startsWith('End time') || error.message.startsWith('Slot') || error.message.startsWith('Reservation') || error.message.startsWith('Active session') ? 400 : 500;
    return send(res,status,{error:status===400?error.message:'Database request failed'});
  }
};
