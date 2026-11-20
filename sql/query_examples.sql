-- DML, JOIN, nested/correlated, and recursive CTE examples (MySQL 8.0+).
USE smart_parking;

-- DML: add a space, then update its operational status.
-- INSERT INTO Slots(zone_id,slot_type,status) VALUES (1,'EV','available');
-- UPDATE Slots SET status='maintenance' WHERE slot_id=1;
-- DELETE FROM SensorLogs WHERE logged_at < CURRENT_TIMESTAMP - INTERVAL 90 DAY;

-- JOIN: occupancy and capacity by parking lot.
SELECT pl.name, COUNT(s.slot_id) AS capacity,
       SUM(s.status='occupied') AS occupied,
       SUM(s.status='available') AS available
FROM ParkingLots pl
LEFT JOIN Zones z ON z.lot_id=pl.lot_id
LEFT JOIN Slots s ON s.zone_id=z.zone_id
GROUP BY pl.lot_id,pl.name
ORDER BY pl.name;

-- Nested query: customers who have made at least one payment.
SELECT u.user_id,u.name,u.email
FROM Users u
WHERE u.user_id IN (
  SELECT v.user_id FROM Vehicles v
  JOIN ParkingSessions ps ON ps.vehicle_id=v.vehicle_id
  JOIN Payments p ON p.session_id=ps.session_id
);

-- Correlated query: slots with no active session.
SELECT s.slot_id,s.slot_type,s.status
FROM Slots s
WHERE NOT EXISTS (
  SELECT 1 FROM ParkingSessions ps
  WHERE ps.slot_id=s.slot_id AND ps.exit_time IS NULL
);

-- Recursive CTE: generate a 0-23 hour sequence for a daily utilization report.
WITH RECURSIVE hours(hour_no) AS (
  SELECT 0 UNION ALL SELECT hour_no+1 FROM hours WHERE hour_no<23
)
SELECT h.hour_no,COUNT(ps.session_id) AS entries
FROM hours h
LEFT JOIN ParkingSessions ps ON HOUR(ps.entry_time)=h.hour_no
GROUP BY h.hour_no ORDER BY h.hour_no;

-- CTE: revenue by lot with session-to-slot-to-zone relationships.
WITH lot_revenue AS (
  SELECT pl.lot_id,pl.name,SUM(pay.amount) revenue
  FROM ParkingLots pl
  JOIN Zones z ON z.lot_id=pl.lot_id
  JOIN Slots s ON s.zone_id=z.zone_id
  JOIN ParkingSessions ps ON ps.slot_id=s.slot_id
  JOIN Payments pay ON pay.session_id=ps.session_id
  GROUP BY pl.lot_id,pl.name
)
SELECT name,revenue,DENSE_RANK() OVER(ORDER BY revenue DESC) revenue_rank
FROM lot_revenue;
