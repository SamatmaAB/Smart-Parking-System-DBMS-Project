-- ============================================================================
-- PES University - Department of Computer Science and Engineering
-- DBMS Mini Project - Evaluation Component 6: DML Operations (4 Marks)
-- File: sql/dml_operations.sql
-- Description: Demonstrates comprehensive INSERT, UPDATE, DELETE, and SELECT DML
-- ============================================================================

USE smart_parking;

-- ============================================================================
-- PART 1: INSERT OPERATIONS
-- ============================================================================

-- 1.1 Single-row INSERT with explicit columns
INSERT INTO Users (name, phone, email, tier_id)
VALUES ('Kavya Nair', '+91 99000 11223', 'kavya.nair@example.com', 2);

-- 1.2 Multi-row Batch INSERT
INSERT INTO Slots (zone_id, slot_type, status) VALUES
(1, 'Compact', 'available'),
(1, 'Compact', 'available'),
(3, 'VIP', 'available');

-- 1.3 INSERT with DEFAULT values
-- Inserts a standard loyalty tier utilizing default min_points (0) and discount_pct (0.00)
INSERT INTO LoyaltyTiers (tier_name)
VALUES ('Corporate VIP');

-- 1.4 INSERT INTO ... SELECT (Subquery-driven Insert)
-- Record a violation fine by selecting active parking session details
INSERT INTO Violations (session_id, type, fine_amount)
SELECT 
    ps.session_id, 
    'Overtime Parking Alert' AS type, 
    150.00 AS fine_amount
FROM ParkingSessions ps
WHERE ps.exit_time IS NULL 
  AND TIMESTAMPDIFF(MINUTE, ps.entry_time, CURRENT_TIMESTAMP) > 60
LIMIT 1;

-- ============================================================================
-- PART 2: UPDATE OPERATIONS
-- ============================================================================

-- 2.1 Basic Conditional UPDATE
-- Mark a specific slot as undergoing maintenance
UPDATE Slots 
SET status = 'maintenance' 
WHERE slot_id = 4 AND status = 'available';

-- 2.2 UPDATE with Arithmetic and Peak Pricing adjustments
-- Increase base rate by 10% for peak hour pricing rules during rush hour
UPDATE PricingRules
SET base_rate = ROUND(base_rate * 1.10, 2),
    peak_multiplier = 1.350
WHERE slot_type = 'Standard' AND start_hour <= 9 AND end_hour >= 18;

-- 2.3 UPDATE with CASE Conditional Logic
-- Upgrade loyalty tiers based on discount thresholds
UPDATE LoyaltyTiers
SET discount_pct = CASE
    WHEN tier_name = 'Silver' THEN 7.50
    WHEN tier_name = 'Gold' THEN 12.00
    WHEN tier_name = 'Platinum' THEN 18.00
    ELSE discount_pct
END
WHERE tier_name IN ('Silver', 'Gold', 'Platinum');

-- 2.4 Correlated / Joined UPDATE
-- Synchronize slot status to 'available' when a parking session exits
UPDATE Slots s
JOIN ParkingSessions ps ON ps.slot_id = s.slot_id
SET s.status = 'available'
WHERE ps.session_id = 1 AND ps.exit_time IS NOT NULL;

-- ============================================================================
-- PART 3: DELETE OPERATIONS
-- ============================================================================

-- 3.1 Conditional DELETE
-- Delete obsolete IoT sensor readings older than 30 days
DELETE FROM SensorLogs 
WHERE logged_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY);

-- 3.2 DELETE with Subquery
-- Delete expired unconfirmed reservations (no show / past start time without active check-in)
DELETE FROM Reservations 
WHERE status = 'pending' 
  AND start_time < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 HOUR)
  AND res_id NOT IN (SELECT COALESCE(res_id, 0) FROM ParkingSessions WHERE res_id IS NOT NULL);

-- 3.3 Cascade DELETE Demonstration
-- Demonstrates referential integrity: deleting a test parking session automatically
-- cascades and deletes its associated Payments and Violations records
-- (Tested within a rollback block to preserve base data)
START TRANSACTION;
  -- Insert dummy session and payment
  INSERT INTO ParkingSessions (session_id, vehicle_id, slot_id, entry_time, exit_time) 
  VALUES (9999, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO Payments (payment_id, session_id, amount, method) 
  VALUES (9999, 9999, 50.00, 'UPI');
  
  -- Delete parent: child payments are automatically purged via ON DELETE CASCADE
  DELETE FROM ParkingSessions WHERE session_id = 9999;
  
  -- Verify child table record was cascaded
  SELECT COUNT(*) AS remaining_payments_for_session_9999 
  FROM Payments WHERE session_id = 9999;
ROLLBACK;

-- ============================================================================
-- PART 4: SELECT DML WITH FILTERING, PATTERNS & AGGREGATIONS
-- ============================================================================

-- 4.1 Pattern matching and range filters (LIKE and BETWEEN)
SELECT vehicle_id, plate_no, type
FROM Vehicles
WHERE plate_no LIKE 'KA-01%' AND type IN ('Car', 'EV');

-- 4.2 Aggregation with GROUP BY and HAVING
-- Find lots with total collected revenue exceeding ₹100
SELECT 
    pl.lot_id,
    pl.name AS lot_name,
    COUNT(DISTINCT ps.session_id) AS completed_sessions,
    SUM(p.amount) AS total_revenue,
    ROUND(AVG(p.amount), 2) AS avg_ticket_size
FROM ParkingLots pl
JOIN Zones z ON z.lot_id = pl.lot_id
JOIN Slots s ON s.zone_id = z.zone_id
JOIN ParkingSessions ps ON ps.slot_id = s.slot_id
JOIN Payments p ON p.session_id = ps.session_id
GROUP BY pl.lot_id, pl.name
HAVING SUM(p.amount) > 100.00
ORDER BY total_revenue DESC;
