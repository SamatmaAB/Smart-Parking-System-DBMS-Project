-- ============================================================================
-- PES University - Department of Computer Science and Engineering
-- DBMS Mini Project - Seed Data for Smart Parking Management System
-- ============================================================================

USE smart_parking;

-- 1. Loyalty Tiers
INSERT INTO LoyaltyTiers (tier_id, tier_name, min_points, discount_pct) VALUES
(1, 'Standard', 0, 0.00),
(2, 'Silver', 100, 5.00),
(3, 'Gold', 250, 10.00),
(4, 'Platinum', 500, 15.00)
ON DUPLICATE KEY UPDATE discount_pct=VALUES(discount_pct);

-- 2. Users (Customers)
INSERT INTO Users (user_id, tier_id, name, phone, email) VALUES
(1, 4, 'Aarav Sharma', '+91 98765 43210', 'aarav.sharma@example.com'),
(2, 3, 'Diya Patel', '+91 98234 56789', 'diya.patel@example.com'),
(3, 2, 'Rohan Iyer', '+91 98450 12345', 'rohan.iyer@example.com'),
(4, 1, 'Ananya Rao', '+91 98111 22334', 'ananya.rao@example.com'),
(5, 1, 'Vikram Malhotra', '+91 98999 88776', 'vikram.m@example.com'),
(6, 2, 'Sneha Kulkarni', '+91 97333 44556', 'sneha.k@example.com')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 3. Vehicles
INSERT INTO Vehicles (vehicle_id, user_id, plate_no, type) VALUES
(1, 1, 'KA-01-MJ-5001', 'Car'),
(2, 1, 'KA-01-EV-2024', 'EV'),
(3, 2, 'KA-03-AB-1234', 'SUV'),
(4, 3, 'KA-05-XY-9876', 'Car'),
(5, 4, 'KA-04-MB-4411', 'Motorcycle'),
(6, 5, 'KA-02-ZZ-7788', 'Car'),
(7, 6, 'KA-51-EV-3300', 'EV')
ON DUPLICATE KEY UPDATE plate_no=VALUES(plate_no);

-- 4. Parking Lots
INSERT INTO ParkingLots (lot_id, name, location) VALUES
(1, 'Central Plaza Mall', 'MG Road, Bengaluru'),
(2, 'Tech Park Phase 1', 'Electronic City, Bengaluru'),
(3, 'Airport Express Terminal', 'Devanahalli, Bengaluru')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 5. Pricing Rules
INSERT INTO PricingRules (rule_id, lot_id, slot_type, base_rate, peak_multiplier, start_hour, end_hour) VALUES
(1, 1, 'Standard', 40.00, 1.250, 9, 21),
(2, 1, 'EV', 60.00, 1.100, 0, 23),
(3, 1, 'Accessible', 30.00, 1.000, 0, 23),
(4, 2, 'Standard', 30.00, 1.500, 8, 19),
(5, 2, 'EV', 50.00, 1.200, 0, 23),
(6, 3, 'Standard', 80.00, 1.300, 0, 23)
ON DUPLICATE KEY UPDATE base_rate=VALUES(base_rate);

-- 6. Zones
INSERT INTO Zones (zone_id, lot_id, level, zone_type) VALUES
(1, 1, 'Basement B1', 'Standard'),
(2, 1, 'Basement B2', 'EV Charging'),
(3, 1, 'Ground Floor', 'VIP & Accessible'),
(4, 2, 'Level 1', 'Standard'),
(5, 2, 'Level 2', 'EV Charging'),
(6, 3, 'Terminal North P1', 'Premium')
ON DUPLICATE KEY UPDATE level=VALUES(level);

-- 7. Slots
INSERT INTO Slots (slot_id, zone_id, slot_type, status) VALUES
-- Lot 1, Zone 1 (B1)
(1, 1, 'Standard', 'available'),
(2, 1, 'Standard', 'occupied'),
(3, 1, 'Standard', 'reserved'),
(4, 1, 'Standard', 'available'),
-- Lot 1, Zone 2 (B2 - EV)
(5, 2, 'EV', 'occupied'),
(6, 2, 'EV', 'available'),
-- Lot 1, Zone 3 (Ground)
(7, 3, 'Accessible', 'available'),
(8, 3, 'VIP', 'available'),
-- Lot 2, Zone 4 & 5
(9, 4, 'Standard', 'available'),
(10, 4, 'Standard', 'maintenance'),
(11, 5, 'EV', 'available'),
-- Lot 3, Zone 6
(12, 6, 'Standard', 'occupied')
ON DUPLICATE KEY UPDATE status=VALUES(status);

-- 8. Reservations
INSERT INTO Reservations (res_id, user_id, vehicle_id, slot_id, start_time, end_time, status) VALUES
(1, 1, 1, 3, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 HOUR), DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 5 HOUR), 'confirmed'),
(2, 2, 3, 1, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY), DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 28 HOUR), 'confirmed'),
(3, 3, 4, 2, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR), 'completed'),
(4, 4, 5, 4, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 20 HOUR), 'completed')
ON DUPLICATE KEY UPDATE status=VALUES(status);

-- 9. Parking Sessions
INSERT INTO ParkingSessions (session_id, vehicle_id, slot_id, res_id, entry_time, exit_time) VALUES
-- Completed sessions
(1, 4, 2, 3, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)),
(2, 5, 4, 4, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 20 HOUR)),
(3, 6, 1, NULL, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 HOUR), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 HOUR)),
-- Active sessions
(4, 1, 2, NULL, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 45 MINUTE), NULL),
(5, 2, 5, NULL, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 MINUTE), NULL),
(6, 3, 12, NULL, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE), NULL)
ON DUPLICATE KEY UPDATE exit_time=VALUES(exit_time);

-- 10. Payments
INSERT INTO Payments (payment_id, session_id, amount, method, paid_at) VALUES
(1, 1, 80.00, 'UPI', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)),
(2, 2, 160.00, 'Card', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 20 HOUR)),
(3, 3, 120.00, 'Fastag', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 HOUR))
ON DUPLICATE KEY UPDATE amount=VALUES(amount);

-- 11. Violations
INSERT INTO Violations (violation_id, session_id, type, fine_amount, logged_at) VALUES
(1, 2, 'Overstaying allotted reservation window', 250.00, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 21 HOUR)),
(2, 5, 'Improper parking in charging bay', 100.00, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 MINUTE))
ON DUPLICATE KEY UPDATE fine_amount=VALUES(fine_amount);

-- 12. Charging Sessions (EV)
INSERT INTO ChargingSessions (charge_id, session_id, kwh_used, cost, started_at) VALUES
(1, 5, 18.450, 276.75, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 80 MINUTE))
ON DUPLICATE KEY UPDATE cost=VALUES(cost);

-- 13. Sensor Logs (IoT)
INSERT INTO SensorLogs (slot_id, reading, logged_at) VALUES
(1, 0.00, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE)),
(2, 1.00, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)),
(5, 1.00, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE)),
(6, 0.00, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 MINUTE)),
(12, 1.00, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 8 MINUTE));

-- 14. Roles (Authentication RBAC)
INSERT INTO Roles (role_id, role_name, description) VALUES
(1, 'admin', 'Full administrative authority: manage lots, zones, slots, users, view all financial and operational reports'),
(2, 'attendant', 'Operational floor authority: handle vehicle check-in, check-out, collect payments, manage reservations')
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- 15. Staff Accounts (Passwords: Parkwise!2026 and Attendant!2026)
INSERT INTO StaffAccounts (staff_id, role_id, name, email, password_hash) VALUES
(1, 1, 'Parkwise Administrator', 'admin@parkwise.local', 'c3cb39891823ebce321d227fbaee6021:7cbe22906ec14bf681c62f2e71d3a0e163773cbb7bcf5f769c84e1b4b2cbcc12e5be3ad664ef51336c1e59cba626cb9ba7fba53406aa8436ba2b83b1695427ad'),
(2, 2, 'Parking Floor Attendant', 'attendant@parkwise.local', '9a039750d750849ce3e30fec6585189e:a5c2d3cfc737c38573c05c08365ef52ff235a8f0b7fa1f2aa69a5a3a78ea307e54737d94bc6bb2e0fcfb297b483b87a8b3cfeb5ba7fa32c6e61f4fa24b584a20')
ON DUPLICATE KEY UPDATE name=VALUES(name);
