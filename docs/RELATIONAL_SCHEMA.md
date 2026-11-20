# Relational Schema Specification & Normalization Analysis

**Institution**: PES University  
**Department**: Department of Computer Science and Engineering  
**Course**: Database Management Systems (Aug - Dec 2026)  
**Project**: Parkwise — Smart Parking Management System  
**Evaluation Criteria**: Component 2 (Relational Schema with Keys, Relationships, and Constraints - 3 Marks)

---

## 1. Relational Schema Definition

The conceptual Chen ER model is formally mapped to 16 normalized relational schemas. Primary keys are underlined ($\underline{\text{PK}}$), foreign keys are marked with ($\text{FK}$), unique constraints with ($\text{UQ}$), and check constraints with ($\text{CHK}$).

### 1.1 LoyaltyTiers
$$\text{LoyaltyTiers}(\underline{\text{tier\_id}}, \text{tier\_name}^{\text{UQ}}, \text{min\_points}, \text{discount\_pct}, \text{created\_at})$$
* **Primary Key**: `tier_id` (Surrogate integer)
* **Candidate Key / Unique**: `tier_name`
* **Constraints**: 
  * $\text{min\_points} \ge 0$
  * $0.00 \le \text{discount\_pct} \le 100.00$

### 1.2 Users (Customers)
$$\text{Users}(\underline{\text{user\_id}}, \text{tier\_id}^{\text{FK}}, \text{name}, \text{phone}, \text{email}^{\text{UQ}}, \text{created\_at})$$
* **Primary Key**: `user_id`
* **Candidate Key**: `email`
* **Foreign Key**: `tier_id` $\to$ `LoyaltyTiers(tier_id)` $\text{ON UPDATE CASCADE ON DELETE SET NULL}$
* **Derived Attribute**: `loyalty_points` is dynamically aggregated via query/view from completed payments.

### 1.3 Vehicles
$$\text{Vehicles}(\underline{\text{vehicle\_id}}, \text{user\_id}^{\text{FK}}, \text{plate\_no}^{\text{UQ}}, \text{type}, \text{created\_at})$$
* **Primary Key**: `vehicle_id`
* **Candidate Key**: `plate_no`
* **Foreign Key**: `user_id` $\to$ `Users(user_id)` $\text{ON UPDATE CASCADE ON DELETE RESTRICT}$
* **Constraint**: $\text{type} \in (\text{'Car'}, \text{'Motorcycle'}, \text{'SUV'}, \text{'Van'}, \text{'EV'}, \text{'Other'})$

### 1.4 ParkingLots (Facilities)
$$\text{ParkingLots}(\underline{\text{lot\_id}}, \text{name}, \text{location}, \text{created\_at})$$
* **Primary Key**: `lot_id`
* **Derived Attribute**: `total_capacity` is computed via `ParkingLotCapacity` view: $\text{COUNT}(\text{Slots.slot\_id})$.

### 1.5 PricingRules
$$\text{PricingRules}(\underline{\text{rule\_id}}, \text{lot\_id}^{\text{FK}}, \text{slot\_type}, \text{base\_rate}, \text{peak\_multiplier}, \text{start\_hour}, \text{end\_hour})$$
* **Primary Key**: `rule_id`
* **Foreign Key**: `lot_id` $\to$ `ParkingLots(lot_id)` $\text{ON UPDATE CASCADE ON DELETE CASCADE}$
* **Constraints**:
  * $\text{base\_rate} \ge 0.00$
  * $\text{peak\_multiplier} \ge 0.000$
  * $0 \le \text{start\_hour} \le 23$ and $0 \le \text{end\_hour} \le 23$ and $\text{start\_hour} \le \text{end\_hour}$

### 1.6 Zones
$$\text{Zones}(\underline{\text{zone\_id}}, \text{lot\_id}^{\text{FK}}, \text{level}, \text{zone\_type})$$
* **Primary Key**: `zone_id`
* **Foreign Key**: `lot_id` $\to$ `ParkingLots(lot_id)` $\text{ON UPDATE CASCADE ON DELETE CASCADE}$

### 1.7 Slots (Parking Bays)
$$\text{Slots}(\underline{\text{slot\_id}}, \text{zone\_id}^{\text{FK}}, \text{slot\_type}, \text{status})$$
* **Primary Key**: `slot_id`
* **Foreign Key**: `zone_id` $\to$ `Zones(zone_id)` $\text{ON UPDATE CASCADE ON DELETE CASCADE}$
* **Constraints**:
  * $\text{slot\_type} \in (\text{'Standard'}, \text{'EV'}, \text{'Accessible'}, \text{'Compact'}, \text{'VIP'})$
  * $\text{status} \in (\text{'available'}, \text{'occupied'}, \text{'reserved'}, \text{'maintenance'})$

### 1.8 Reservations
$$\text{Reservations}(\underline{\text{res\_id}}, \text{user\_id}^{\text{FK}}, \text{vehicle\_id}^{\text{FK}}, \text{slot\_id}^{\text{FK}}, \text{start\_time}, \text{end\_time}, \text{status}, \text{created\_at})$$
* **Primary Key**: `res_id`
* **Foreign Keys**:
  * `user_id` $\to$ `Users(user_id)` $\text{ON UPDATE CASCADE ON DELETE RESTRICT}$
  * `vehicle_id` $\to$ `Vehicles(vehicle_id)` $\text{ON UPDATE CASCADE ON DELETE RESTRICT}$
  * `slot_id` $\to$ `Slots(slot_id)` $\text{ON UPDATE CASCADE ON DELETE RESTRICT}$
* **Constraints**:
  * $\text{end\_time} > \text{start\_time}$
  * $\text{status} \in (\text{'pending'}, \text{'confirmed'}, \text{'cancelled'}, \text{'completed'}, \text{'no\_show'})$
* **Integrity Trigger**: `trg_reservation_no_overlap` prevents any double-booking for the same `slot_id` within an intersecting time range.

### 1.9 ParkingSessions
$$\text{ParkingSessions}(\underline{\text{session\_id}}, \text{vehicle\_id}^{\text{FK}}, \text{slot\_id}^{\text{FK}}, \text{res\_id}^{\text{FK, UQ}}, \text{entry\_time}, \text{exit\_time}, \text{active\_slot\_id}^{\text{UQ}})$$
* **Primary Key**: `session_id`
* **Foreign Keys**:
  * `vehicle_id` $\to$ `Vehicles(vehicle_id)` $\text{ON UPDATE CASCADE ON DELETE RESTRICT}$
  * `slot_id` $\to$ `Slots(slot_id)` $\text{ON UPDATE CASCADE ON DELETE RESTRICT}$
  * `res_id` $\to$ `Reservations(res_id)` $\text{ON UPDATE CASCADE ON DELETE SET NULL}$
* **Constraints**:
  * $\text{exit\_time IS NULL} \lor \text{exit\_time} \ge \text{entry\_time}$
  * Generated column `active_slot_id` enforces a unique active occupancy per parking space at any given moment.

### 1.10 Payments
$$\text{Payments}(\underline{\text{payment\_id}}, \text{session\_id}^{\text{FK}}, \text{amount}, \text{method}, \text{paid\_at})$$
* **Primary Key**: `payment_id`
* **Foreign Key**: `session_id` $\to$ `ParkingSessions(session_id)` $\text{ON UPDATE CASCADE ON DELETE CASCADE}$
* **Constraints**:
  * $\text{amount} \ge 0.00$
  * $\text{method} \in (\text{'UPI'}, \text{'Card'}, \text{'Cash'}, \text{'Wallet'}, \text{'Fastag'})$

### 1.11 Violations
$$\text{Violations}(\underline{\text{violation\_id}}, \text{session\_id}^{\text{FK}}, \text{type}, \text{fine\_amount}, \text{logged\_at})$$
* **Primary Key**: `violation_id`
* **Foreign Key**: `session_id` $\to$ `ParkingSessions(session_id)` $\text{ON UPDATE CASCADE ON DELETE CASCADE}$
* **Constraint**: $\text{fine\_amount} \ge 0.00$

### 1.12 ChargingSessions (EV)
$$\text{ChargingSessions}(\underline{\text{charge\_id}}, \text{session\_id}^{\text{FK}}, \text{kwh\_used}, \text{cost}, \text{started\_at})$$
* **Primary Key**: `charge_id`
* **Foreign Key**: `session_id` $\to$ `ParkingSessions(session_id)` $\text{ON UPDATE CASCADE ON DELETE CASCADE}$
* **Constraints**: $\text{kwh\_used} \ge 0.000$ and $\text{cost} \ge 0.00$

### 1.13 SensorLogs (IoT Readings)
$$\text{SensorLogs}(\underline{\text{log\_id}}, \text{slot\_id}^{\text{FK}}, \text{reading}, \text{logged\_at})$$
* **Primary Key**: `log_id`
* **Foreign Key**: `slot_id` $\to$ `Slots(slot_id)` $\text{ON UPDATE CASCADE ON DELETE CASCADE}$

### 1.14 Roles (Authentication & Authorization)
$$\text{Roles}(\underline{\text{role\_id}}, \text{role\_name}^{\text{UQ}}, \text{description})$$
* **Primary Key**: `role_id`
* **Constraint**: $\text{role\_name} \in (\text{'admin'}, \text{'attendant'}, \text{'auditor'})$

### 1.15 StaffAccounts (Staff Credentials)
$$\text{StaffAccounts}(\underline{\text{staff\_id}}, \text{role\_id}^{\text{FK}}, \text{name}, \text{email}^{\text{UQ}}, \text{password\_hash}, \text{created\_at})$$
* **Primary Key**: `staff_id`
* **Foreign Key**: `role_id` $\to$ `Roles(role_id)` $\text{ON UPDATE CASCADE ON DELETE RESTRICT}$

### 1.16 AuthSessions (Web Sessions)
$$\text{AuthSessions}(\underline{\text{token\_hash}}, \text{staff\_id}^{\text{FK}}, \text{expires\_at}, \text{created\_at})$$
* **Primary Key**: `token_hash` (SHA-256 digest)
* **Foreign Key**: `staff_id` $\to$ `StaffAccounts(staff_id)` $\text{ON DELETE CASCADE}$

---

## 2. Normalization Analysis (1NF $\to$ 2NF $\to$ 3NF $\to$ BCNF)

Every table in the Parkwise DBMS has been rigorously normalized to Boyce-Codd Normal Form (BCNF):

| Relation | Normal Form | Justification & Determinants |
|---|---|---|
| **Users** | **BCNF** | Key: `user_id`. FD: `user_id` $\to$ `tier_id, name, phone, email`. Also `email` $\to$ `user_id`. Both LHS are superkeys. All attributes are atomic (1NF). No partial dependencies (2NF). No transitive dependencies (3NF). |
| **Vehicles** | **BCNF** | Key: `vehicle_id`. FD: `vehicle_id` $\to$ `user_id, plate_no, type`. Also `plate_no` $\to$ `vehicle_id`. Every determinant is a candidate key. |
| **ParkingLots** | **BCNF** | Key: `lot_id`. FD: `lot_id` $\to$ `name, location`. Single atomic candidate key. |
| **PricingRules** | **BCNF** | Key: `rule_id`. FD: `rule_id` $\to$ `lot_id, slot_type, base_rate, peak_multiplier, start_hour, end_hour`. Prevents rate anomalies across different facilities. |
| **Zones** | **BCNF** | Key: `zone_id`. FD: `zone_id` $\to$ `lot_id, level, zone_type`. Level details belong strictly to the zone, avoiding lot-level redundancy. |
| **Slots** | **BCNF** | Key: `slot_id`. FD: `slot_id` $\to$ `zone_id, slot_type, status`. Slot status changes do not alter zone or lot definitions. |
| **Reservations** | **BCNF** | Key: `res_id`. FD: `res_id` $\to$ `user_id, vehicle_id, slot_id, start_time, end_time, status`. Fully dependent on `res_id`. |
| **ParkingSessions**| **BCNF** | Key: `session_id`. FD: `session_id` $\to$ `vehicle_id, slot_id, res_id, entry_time, exit_time`. All determinants are superkeys. |
| **Payments** | **BCNF** | Key: `payment_id`. FD: `payment_id` $\to$ `session_id, amount, method, paid_at`. Monetary transactions are immutable and decoupled from session state. |

### Elimination of Anomalies:
1. **Insertion Anomaly Eliminated**: A new Parking Lot can be added without having to define zones or spaces immediately.
2. **Deletion Anomaly Eliminated**: Deleting an expired reservation does not delete the customer or their vehicle record.
3. **Update Anomaly Eliminated**: Changing a customer's email or phone number requires an update to exactly one row in `Users`, preventing inconsistent state across reservations or parking sessions.
