# Viva Preparation Guide & Project Defense Manual

**Institution**: PES University  
**Department**: Department of Computer Science and Engineering  
**Course**: Database Management Systems (Aug - Dec 2026)  
**Project**: Parkwise — Smart Parking Management System  
**Evaluation Criteria**: Component 14 (Originality, Individual Contribution, Modification/Viva - 4 Marks)

---

## 1. Project Originality & Architecture Statement

Parkwise distinguishes itself from conventional academic mini-projects by implementing an end-to-end, production-grade **Polyglot DBMS Architecture**:
1. **Relational Core (MySQL 8.0+ / SQLite)**: 16 normalized BCNF tables with real-time state machines enforced via database triggers, stored procedures with ACID transaction rollback handlers, derived views, and native database role grants.
2. **Document & Vector Layer (MongoDB / Embedded Store)**: Operations notes and incident logging featuring strict JSON schema validation (`$jsonSchema`), compound indexing, and a multi-dimensional semantic vector search engine using cosine similarity.
3. **Role-Based Access Control (RBAC)**: Fine-grained database privilege separation separating Administrator and Attendant roles at both database and application boundaries.
4. **Interactive In-App SQL Runner**: Live query demonstration console embedded within the Next.js frontend to execute complex relational algebra (5-table joins, correlated subqueries, recursive CTEs) with real-time millisecond latency tracking.

---

## 2. Individual Contribution Record Template

Students should fill in their individual responsibilities prior to evaluation:

| Team Member Name | SRN / PRN | Specific Modules & Technical Contributions |
|---|---|---|
| **Student 1** | PES1UG... | ER Diagram design, MySQL DDL schema with domain constraints, foreign key cascaded integrity, and relational normalization proof (BCNF). |
| **Student 2** | PES1UG... | Advanced SQL implementation: stored procedures (`sp_check_in_vehicle`, `sp_check_out_vehicle`), triggers (`trg_reservation_no_overlap`), and recursive CTE queries. |
| **Student 3** | PES1UG... | NoSQL MongoDB setup, `$jsonSchema` validator, compound/text indexing, and vector similarity semantic search engine. |
| **Student 4** | PES1UG... | Next.js 15 frontend interface, Node.js REST API integration, RBAC authentication with scrypt hashing, and test suite execution. |

---

## 3. High-Frequency Viva Questions & Technical Answers

### Section A: Conceptual Modeling & ER Design
**Q1: What notation is used for your ER diagram, and how are derived attributes represented?**  
> *Answer*: We implemented Chen's notation (`smart_parking_chen_er.drawio`). Entities are rectangles, attributes are ellipses, primary keys are underlined, and relationships are diamonds with cardinality labels ($1:1$, $1:N$, $N:M$). Derived attributes (`loyalty_points` in `Users` and `total_capacity` in `ParkingLots`) are indicated by dashed ellipses because they are computed dynamically via SQL views (`ParkingLotCapacity`) rather than stored redundantly.

**Q2: What is a surrogate key, and why did you use surrogate keys across all entities?**  
> *Answer*: A surrogate key is an artificial, system-generated primary key (e.g., auto-incrementing integer `slot_id`, `res_id`) that has no business meaning. We use them instead of natural keys (like vehicle license plate or email) because natural keys can change, are wider in storage, and slow down foreign key join lookups. Natural candidate keys are protected via `UNIQUE` constraints (`uq_users_email`, `uq_vehicles_plate`).

---

### Section B: Relational Normalization & Constraints
**Q3: Prove that your `Slots` and `Users` relations are in BCNF.**  
> *Answer*: A relation is in BCNF if for every non-trivial functional dependency $X \to Y$, $X$ is a superkey. In `Users`, the functional dependencies are $\text{user\_id} \to (\text{name}, \text{phone}, \text{email}, \text{tier\_id})$ and $\text{email} \to (\text{user\_id}, \text{name}, \text{phone}, \text{tier\_id})$. Both `user_id` (PK) and `email` (UQ) are candidate keys (superkeys). There are no partial or transitive dependencies. Hence, it satisfies 1NF, 2NF, 3NF, and BCNF.

**Q4: How do you prevent overlapping parking reservations in SQL? Why not use a simple `CHECK` constraint?**  
> *Answer*: SQL table-level `CHECK` constraints can only validate values within the single row currently being inserted or updated; they cannot query other existing rows in the table. To prevent overlapping time windows across different rows for the same space, we implemented `BEFORE INSERT` and `BEFORE UPDATE` database triggers (`trg_reservation_no_overlap`). The trigger queries:
> ```sql
> WHERE r.slot_id = NEW.slot_id AND NEW.start_time < r.end_time AND NEW.end_time > r.start_time
> ```
> If any overlap is found, it aborts execution with `SIGNAL SQLSTATE '45000'`.

---

### Section C: Advanced SQL, Procedures, Triggers & CTEs
**Q5: What is the difference between a Stored Procedure and a User-Defined Function (UDF)?**  
> *Answer*: A function (`fn_billable_hours`, `fn_calculate_fee`) must return a single scalar value (or table), cannot manage transactions (`COMMIT`/`ROLLBACK`), and can be called directly inside a `SELECT` statement. A stored procedure (`sp_check_in_vehicle`, `sp_check_out_vehicle`) is invoked with `CALL`, can accept `IN` and `OUT` parameters, can perform complex transaction control (`START TRANSACTION`, `COMMIT`, `ROLLBACK`), and manages row-level locking (`FOR UPDATE`).

**Q6: Explain the Recursive CTE in your project.**  
> *Answer*: The recursive CTE in `sql/joins_and_subqueries.sql`:
> ```sql
> WITH RECURSIVE HourSeries(hour_no) AS (
>   SELECT 0
>   UNION ALL
>   SELECT hour_no + 1 FROM HourSeries WHERE hour_no < 23
> )
> ```
> The anchor member selects 0. The recursive member repeatedly adds 1 until it reaches 23. We then `LEFT JOIN` this sequence with `ParkingSessions` to produce a complete 24-hour hourly occupancy report, ensuring that even hours with zero check-ins appear in the output.

**Q7: Explain the difference between `EXISTS` and `IN` in your subqueries.**  
> *Answer*: `IN` evaluates the subquery first, creates an in-memory set of values, and checks whether the outer value is contained in that set. `EXISTS` is a boolean test used with correlated subqueries that terminates evaluation as soon as the first matching row is found (short-circuit evaluation). For large datasets with indexed foreign keys, `EXISTS` is significantly faster and handles `NULL` values safely without unexpected three-valued logic failures.

---

### Section D: NoSQL, Vector Search & RBAC
**Q8: Why use MongoDB alongside MySQL/SQLite instead of putting everything in SQL?**  
> *Answer*: This is polyglot persistence. Structured entities requiring strict ACID guarantees and financial balancing (payments, reservations, slot allocations) are stored in the relational database. Semi-structured, rapidly evolving shift handovers and incident reports (with variable tags, changing priority levels, and electrical diagnostic logs) are stored in MongoDB. MongoDB allows adding diagnostic fields without running DDL schema migrations that could lock active tables.

**Q9: How does the Vector Semantic Search work in your project?**  
> *Answer*: Every operational note is vectorized into a normalized multi-dimensional term frequency vector. When a user enters a query, the query string is converted into a query vector, and the system computes the cosine similarity against all stored document vectors:
> $$\text{Cosine Similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$
> The notes are sorted in descending order of similarity score and displayed with a percentage match pill. This allows finding semantically related notes even if the exact keyword differs (e.g., "broken charger" matches "EV cable fault").

**Q10: How is Role-Based Access Control (RBAC) enforced in the database?**  
> *Answer*: In MySQL, we define named database roles:
> ```sql
> CREATE ROLE 'parkwise_admin';
> CREATE ROLE 'parkwise_attendant';
> GRANT ALL PRIVILEGES ON smart_parking.* TO 'parkwise_admin';
> GRANT SELECT ON smart_parking.* TO 'parkwise_attendant';
> GRANT INSERT, UPDATE ON smart_parking.Reservations TO 'parkwise_attendant';
> GRANT EXECUTE ON PROCEDURE smart_parking.sp_check_in_vehicle TO 'parkwise_attendant';
> ```
> In the application and SQLite, permissions are verified on every write request: attendants are permitted to perform operational transactions (reservations, check-in, check-out), while inventory alterations (lots, zones, spaces, customer deletion) strictly require the administrator role.
