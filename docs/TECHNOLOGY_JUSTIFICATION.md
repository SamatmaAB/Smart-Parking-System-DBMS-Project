# Technology Justification & Architectural Rationale

**Institution**: PES University  
**Department**: Department of Computer Science and Engineering  
**Course**: Database Management Systems (Aug - Dec 2026)  
**Project**: Parkwise — Smart Parking Management System  
**Evaluation Criteria**: Component 5 (Technology Justification - 1 Mark)

---

## 1. Multi-Model Architecture Overview

The Parkwise Smart Parking Management System implements a hybrid **Polyglot Persistence Architecture** that pairs a strict Relational SQL database with a schema-validated NoSQL Document store and a Vector Similarity engine.

```
                      ┌───────────────────────────────────────┐
                      │    Next.js 15 Client Interface        │
                      │  (TypeScript, React 19, Client State) │
                      └──────────────────┬────────────────────┘
                                         │  HTTP / REST API
                      ┌──────────────────┴────────────────────┐
                      │     Node.js Server & RBAC Engine      │
                      │  (scrypt Hash, Session Management)    │
                      └─────────┬───────────────────┬─────────┘
                                │                   │
             ┌──────────────────┴─────────┐         │
             ▼                            ▼         ▼
  ┌───────────────────────┐    ┌─────────────────────────────────┐
  │  Relational Database  │    │   NoSQL Document & Vector Store │
  │   (MySQL 8.0/SQLite)  │    │       (MongoDB / Embedded)      │
  ├───────────────────────┤    ├─────────────────────────────────┤
  │ • Strict ACID         │    │ • Dynamic JSON Schema Validator │
  │ • Keys & Constraints  │    │ • Handover & Incident Logs      │
  │ • Triggers & Procs    │    │ • High-Dim Semantic Vectors     │
  │ • Complex Joins & CTE │    │ • Cosine Similarity Matching    │
  └───────────────────────┘    └─────────────────────────────────┘
```

---

## 2. Relational Database Justification (MySQL 8.0+ / SQLite)

### Why SQL for Parking Facilities, Inventory, and Payments?
1. **ACID Transactions**:
   * Critical for financial integrity: checking out a vehicle, recording payment in `Payments`, and toggling space status to `available` in `Slots` must happen atomically. A power failure or server crash mid-transaction must never leave a slot marked occupied after payment or vice-versa.
2. **Referential Integrity & Constraints**:
   * Foreign keys with cascading options (`ON DELETE CASCADE`, `ON DELETE RESTRICT`) ensure orphan vehicle or reservation records cannot exist.
   * `CHECK` constraints prevent negative payment amounts, invalid hours (e.g., outside 0–23), and illegal slot states.
3. **Double-Booking & Race-Condition Prevention**:
   * Enforced via database triggers (`trg_reservation_no_overlap`) and unique filtered indexes (`uq_one_active_session_per_slot` WHERE `exit_time IS NULL`), guaranteeing that two attendants cannot simultaneously book or check in distinct vehicles into the same parking space.
4. **Complex Analytical Joins & Recursive CTEs**:
   * Relational algebra allows multi-table joins (aggregating lots, zones, slots, sessions, and payments in a single query) and recursive CTEs (generating 24-hour hourly sequence distributions for utilization heatmaps).

---

## 3. NoSQL Document Database Justification (MongoDB)

### Why NoSQL for Operations Handover & Incident Notes?
1. **Schema Flexibility & Evolution**:
   * Unlike rigid parking bays and billing entities, operational logs (incident reports, maintenance logs, security violations, shift handover notes) have polymorphic metadata. For instance, an EV charging note requires connector latch details, while a security note involves license plate infractions and camera timestamps.
2. **Document-Oriented Representation**:
   * Each operational note is stored as a self-contained BSON/JSON document containing embedded tags, priority classifications, author references, and vector embeddings, eliminating the overhead of joining multiple normalized lookup tables.
3. **Dynamic Schema Validation (`$jsonSchema`)**:
   * MongoDB’s `$jsonSchema` validator enforces required fields (`title`, `note`, `category`, `createdBy`) and string bounds while retaining document agility.
4. **Fast Compound and Full-Text Search**:
   * Compound indexes (`{ category: 1, updatedAt: -1 }`) and inverted text indexes (`{ title: 'text', note: 'text', tags: 'text' }`) provide rapid retrieval for high-volume shift handovers.

---

## 4. Vector Database & Semantic Similarity Justification

### Why Vector Search in Parking Operations?
1. **Semantic Matching Beyond Keyword Search**:
   * Traditional keyword matching fails when operators use different vocabulary. For example, searching for *"broken charger"* will not find a note titled *"EV stall 2 cable disconnected"*.
2. **Cosine Similarity Embedding**:
   * Operational notes are converted into normalized term vectors in multi-dimensional vector space. The search engine calculates cosine similarity:
     $$\text{Similarity}(\mathbf{q}, \mathbf{d}) = \frac{\mathbf{q} \cdot \mathbf{d}}{\|\mathbf{q}\| \|\mathbf{d}\|}$$
   * Notes are ranked by relevance percentage, allowing attendants to locate relevant past incidents in real time.

---

## 5. Frontend & Backend Stack Justification

| Technology | Justification |
|---|---|
| **Next.js 15 & React 19** | Component-based modularity, optimized production bundling, client-side reactive state (`useState`, `useEffect`, `useCallback`), responsive layout, and built-in API proxy rewrites. |
| **Node.js REST API** | Non-blocking, asynchronous event loop ideal for handling concurrent IoT sensor telemetry, parking reservations, and JSON document pipelines. |
| **scrypt & SHA-256 Tokens** | Cryptographically secure password hashing resilient against ASIC/GPU brute-force attacks, coupled with hashed session tokens stored in HttpOnly, SameSite cookies. |
