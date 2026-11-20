-- ============================================================================
-- PES University - Department of Computer Science and Engineering
-- DBMS Mini Project - Evaluation Component 7: Joins, Nested, Correlated & Recursive Queries (4 Marks)
-- File: sql/joins_and_subqueries.sql
-- Description: Comprehensive query catalog demonstrating complex relational algebra
-- ============================================================================

USE smart_parking;

-- ============================================================================
-- 1. JOIN SQL QUERIES
-- ============================================================================

-- 1.1 Multi-Table INNER JOIN (3 Tables)
-- Retrieve confirmed reservations with customer name, contact, vehicle plate, and slot details
SELECT 
    r.res_id,
    u.name AS customer_name,
    u.phone AS customer_phone,
    v.plate_no,
    v.type AS vehicle_type,
    r.slot_id,
    r.start_time,
    r.end_time,
    r.status
FROM Reservations r
INNER JOIN Users u ON u.user_id = r.user_id
INNER JOIN Vehicles v ON v.vehicle_id = r.vehicle_id
WHERE r.status = 'confirmed'
ORDER BY r.start_time ASC;

-- 1.2 Multi-Table LEFT OUTER JOIN (5 Tables)
-- Complete parking facility inventory: lot capacity, zones, active occupancy, and collected revenue
SELECT 
    pl.lot_id,
    pl.name AS lot_name,
    pl.location,
    COUNT(DISTINCT s.slot_id) AS total_spaces,
    COUNT(DISTINCT CASE WHEN s.status = 'available' THEN s.slot_id END) AS available_spaces,
    COUNT(DISTINCT CASE WHEN s.status = 'occupied' THEN s.slot_id END) AS occupied_spaces,
    COUNT(DISTINCT CASE WHEN s.status = 'reserved' THEN s.slot_id END) AS reserved_spaces,
    COALESCE(SUM(p.amount), 0.00) AS total_revenue_inr
FROM ParkingLots pl
LEFT JOIN Zones z ON z.lot_id = pl.lot_id
LEFT JOIN Slots s ON s.zone_id = z.zone_id
LEFT JOIN ParkingSessions ps ON ps.slot_id = s.slot_id
LEFT JOIN Payments p ON p.session_id = ps.session_id
GROUP BY pl.lot_id, pl.name, pl.location
ORDER BY total_revenue_inr DESC;

-- 1.3 Self-Join / Comparison Join
-- Compare pricing rules within the same parking lot to identify rate differences between EV and Standard spaces
SELECT 
    p1.lot_id,
    pl.name AS lot_name,
    p1.slot_type AS regular_type,
    p1.base_rate AS regular_rate,
    p2.slot_type AS premium_type,
    p2.base_rate AS premium_rate,
    (p2.base_rate - p1.base_rate) AS rate_premium_inr
FROM PricingRules p1
JOIN PricingRules p2 ON p1.lot_id = p2.lot_id AND p1.slot_type = 'Standard' AND p2.slot_type = 'EV'
JOIN ParkingLots pl ON pl.lot_id = p1.lot_id;

-- ============================================================================
-- 2. NESTED SUBQUERIES (INDEPENDENT)
-- ============================================================================

-- 2.1 Nested Subquery with IN
-- Find all customers who have at least one completed parking payment
SELECT user_id, name, email, phone
FROM Users
WHERE user_id IN (
    SELECT DISTINCT v.user_id
    FROM Vehicles v
    JOIN ParkingSessions ps ON ps.vehicle_id = v.vehicle_id
    JOIN Payments p ON p.session_id = ps.session_id
);

-- 2.2 Nested Subquery with NOT IN
-- Find parking slots that have NEVER incurred any violation fines
SELECT slot_id, zone_id, slot_type, status
FROM Slots
WHERE slot_id NOT IN (
    SELECT DISTINCT ps.slot_id
    FROM ParkingSessions ps
    JOIN Violations v ON v.session_id = ps.session_id
);

-- 2.3 Scalar Subquery in SELECT Clause
-- Display each parking payment along with the overall average transaction value and difference
SELECT 
    payment_id,
    session_id,
    amount,
    method,
    paid_at,
    (SELECT ROUND(AVG(amount), 2) FROM Payments) AS global_avg_amount,
    ROUND(amount - (SELECT AVG(amount) FROM Payments), 2) AS diff_from_average
FROM Payments;

-- 2.4 Nested Subquery in FROM Clause (Derived Table)
-- Analyze peak parking hours by grouping check-in sessions
SELECT 
    hourly_traffic.checkin_hour,
    hourly_traffic.sessions_count,
    CASE 
        WHEN hourly_traffic.sessions_count >= 3 THEN 'Peak Load'
        WHEN hourly_traffic.sessions_count >= 1 THEN 'Moderate Load'
        ELSE 'Light Load'
    END AS load_category
FROM (
    SELECT 
        HOUR(entry_time) AS checkin_hour,
        COUNT(session_id) AS sessions_count
    FROM ParkingSessions
    GROUP BY HOUR(entry_time)
) AS hourly_traffic
ORDER BY hourly_traffic.sessions_count DESC;

-- ============================================================================
-- 3. CORRELATED SUBQUERIES
-- ============================================================================

-- 3.1 Correlated Subquery with EXISTS
-- Identify vehicles that are currently parked (active session with exit_time IS NULL)
SELECT 
    v.vehicle_id,
    v.plate_no,
    v.type,
    u.name AS owner_name
FROM Vehicles v
JOIN Users u ON u.user_id = v.user_id
WHERE EXISTS (
    SELECT 1 
    FROM ParkingSessions ps 
    WHERE ps.vehicle_id = v.vehicle_id 
      AND ps.exit_time IS NULL
);

-- 3.2 Correlated Subquery with NOT EXISTS
-- Find all available slots that have NO active session and NO overlapping future reservations
SELECT 
    s.slot_id,
    s.zone_id,
    s.slot_type,
    s.status
FROM Slots s
WHERE s.status = 'available'
  AND NOT EXISTS (
      SELECT 1 
      FROM ParkingSessions ps 
      WHERE ps.slot_id = s.slot_id 
        AND ps.exit_time IS NULL
  )
  AND NOT EXISTS (
      SELECT 1 
      FROM Reservations r 
      WHERE r.slot_id = s.slot_id 
        AND r.status IN ('pending', 'confirmed')
        AND r.start_time <= DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 HOUR)
        AND r.end_time >= CURRENT_TIMESTAMP
  );

-- 3.3 Correlated Subquery in SELECT (Calculated Metric per User)
-- For each customer, count their total registered vehicles and total completed parking sessions
SELECT 
    u.user_id,
    u.name,
    u.email,
    (SELECT COUNT(*) FROM Vehicles v WHERE v.user_id = u.user_id) AS registered_vehicles_count,
    (SELECT COUNT(*) 
     FROM ParkingSessions ps 
     JOIN Vehicles v ON v.vehicle_id = ps.vehicle_id 
     WHERE v.user_id = u.user_id AND ps.exit_time IS NOT NULL) AS completed_sessions_count
FROM Users u;

-- ============================================================================
-- 4. RECURSIVE QUERIES & CTEs (MySQL 8.0+)
-- ============================================================================

-- 4.1 Recursive CTE: Generate 24-Hour Timeline with Live Session Distribution
-- Generates sequence 0 to 23 to guarantee all 24 hours appear in report even with 0 check-ins
WITH RECURSIVE HourSeries(hour_no) AS (
    SELECT 0
    UNION ALL
    SELECT hour_no + 1 FROM HourSeries WHERE hour_no < 23
)
SELECT 
    h.hour_no AS hour_of_day,
    CONCAT(LPAD(h.hour_no, 2, '0'), ':00 - ', LPAD((h.hour_no + 1) % 24, 2, '0'), ':00') AS time_window,
    COUNT(ps.session_id) AS total_checkins,
    COALESCE(SUM(p.amount), 0.00) AS total_revenue_collected
FROM HourSeries h
LEFT JOIN ParkingSessions ps ON HOUR(ps.entry_time) = h.hour_no
LEFT JOIN Payments p ON p.session_id = ps.session_id
GROUP BY h.hour_no
ORDER BY h.hour_no ASC;

-- 4.2 Recursive CTE: Progressive Tiered Parking Tariff Escalation
-- Calculates hourly tiered parking charges: 1st hr ₹40, 2nd hr ₹30, 3rd+ hr ₹20 up to 8 hours
WITH RECURSIVE TariffLadder(duration_hr, hourly_rate, cumulative_total) AS (
    SELECT 1 AS duration_hr, 40.00 AS hourly_rate, 40.00 AS cumulative_total
    UNION ALL
    SELECT 
        duration_hr + 1,
        CASE WHEN duration_hr + 1 = 2 THEN 30.00 ELSE 20.00 END,
        cumulative_total + (CASE WHEN duration_hr + 1 = 2 THEN 30.00 ELSE 20.00 END)
    FROM TariffLadder
    WHERE duration_hr < 8
)
SELECT duration_hr, hourly_rate, cumulative_total
FROM TariffLadder;

-- 4.3 Multi-Step CTE with Window Function: Lot Revenue Leaderboard
WITH LotRevenueAgg AS (
    SELECT 
        pl.lot_id,
        pl.name AS lot_name,
        pl.location,
        COUNT(DISTINCT ps.session_id) AS total_sessions,
        COALESCE(SUM(p.amount), 0.00) AS gross_revenue
    FROM ParkingLots pl
    JOIN Zones z ON z.lot_id = pl.lot_id
    JOIN Slots s ON s.zone_id = z.zone_id
    LEFT JOIN ParkingSessions ps ON ps.slot_id = s.slot_id
    LEFT JOIN Payments p ON p.session_id = ps.session_id
    GROUP BY pl.lot_id, pl.name, pl.location
)
SELECT 
    lot_id,
    lot_name,
    location,
    total_sessions,
    gross_revenue,
    DENSE_RANK() OVER (ORDER BY gross_revenue DESC) AS revenue_rank,
    ROUND(gross_revenue * 100.0 / NULLIF(SUM(gross_revenue) OVER (), 0), 2) AS revenue_share_pct
FROM LotRevenueAgg;
