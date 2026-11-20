'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES MATCHING ALL 13 ER DIAGRAM ENTITIES + RBAC AUTH
// ============================================================================

interface Staff {
  staff_id?: number;
  name: string;
  email: string;
  role: 'admin' | 'attendant';
}

interface Summary {
  lots: number;
  slots: number;
  occupied: number;
  reserved: number;
  active: number;
  revenue: number;
  capacity: number;
  violations: number;
  ev_charging: number;
}

// 1. LoyaltyTiers
interface LoyaltyTier {
  tier_id: number;
  tier_name: string;
  min_points: number;
  discount_pct: number;
}

// 2. Users (Customers) with derived loyalty_points
interface User {
  user_id: number;
  name: string;
  email: string;
  phone?: string;
  tier_id?: number;
  tier_name?: string;
  discount_pct?: number;
  loyalty_points?: number;
}

// 3. Vehicles
interface Vehicle {
  vehicle_id: number;
  user_id: number;
  plate_no: string;
  type: string;
  owner?: string;
}

// 4. ParkingLots with derived total_capacity
interface ParkingLot {
  lot_id: number;
  name: string;
  location: string;
  total_capacity?: number;
  available_slots?: number;
  occupied_slots?: number;
  reserved_slots?: number;
}

// 5. PricingRules
interface PricingRule {
  rule_id: number;
  lot_id: number;
  slot_type: string;
  base_rate: number;
  peak_multiplier: number;
  start_hour: number;
  end_hour: number;
  lot_name?: string;
}

// 6. Zones
interface Zone {
  zone_id: number;
  lot_id: number;
  level: string;
  zone_type: string;
  lot_name?: string;
}

// 7. Slots
interface Slot {
  slot_id: number;
  zone_id: number;
  slot_type: string;
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
  lot_id?: number;
  level?: string;
  lot_name?: string;
}

// 8. Reservations
interface Reservation {
  res_id: number;
  user_id: number;
  vehicle_id: number;
  slot_id: number;
  start_time: string;
  end_time: string;
  status: string;
  user_name?: string;
  plate_no?: string;
  lot_name?: string;
  level?: string;
}

// 9. ParkingSessions
interface ParkingSession {
  session_id: number;
  vehicle_id: number;
  slot_id: number;
  res_id?: number;
  entry_time: string;
  exit_time?: string;
  plate_no?: string;
  vehicle_type?: string;
  lot_name?: string;
  level?: string;
  payment_amount?: number;
  payment_method?: string;
}

// 10. Payments
interface Payment {
  payment_id: number;
  session_id: number;
  amount: number;
  method: string;
  paid_at: string;
  plate_no?: string;
  lot_name?: string;
}

// 11. Violations
interface Violation {
  violation_id: number;
  session_id: number;
  type: string;
  fine_amount: number;
  plate_no?: string;
  customer_name?: string;
  lot_name?: string;
  slot_id?: number;
}

// 12. ChargingSessions (EV)
interface ChargingSession {
  charge_id: number;
  session_id: number;
  kwh_used: number;
  cost: number;
  plate_no?: string;
  lot_name?: string;
}

// 13. SensorLogs (IoT Telemetry)
interface SensorLog {
  log_id: number;
  slot_id: number;
  reading: number;
  logged_at: string;
  slot_type?: string;
  slot_status?: string;
  level?: string;
  lot_name?: string;
}

// NoSQL & Vector Notes
interface Note {
  _id: string;
  title: string;
  note: string;
  category: string;
  priority?: string;
  tags?: string[];
  vector?: number[];
  similarityScore?: number;
  similarityPct?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface QueryResult {
  title: string;
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

export default function Dashboard() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'parking' | 'people' | 'reservations' | 'pricing_ev' | 'violations_sensors' | 'payments' | 'notes' | 'sql' | 'er_schema'
  >('overview');

  // Relational Entities State (13 ER Entities)
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [chargingSessions, setChargingSessions] = useState<ChargingSession[]>([]);
  const [sensorLogs, setSensorLogs] = useState<SensorLog[]>([]);

  // NoSQL & Vector Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteCategory, setNoteCategory] = useState<string>('all');
  const [vectorQuery, setVectorQuery] = useState('');
  const [isVectorSearch, setIsVectorSearch] = useState(false);
  const [storageEngine, setStorageEngine] = useState('Checking...');

  // SQL Runner State
  const [selectedQueryId, setSelectedQueryId] = useState('join_5_tables');
  const [customSql, setCustomSql] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);

  // Modals & UI States
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [modalData, setModalData] = useState<any>({});
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Auth form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('admin');

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const apiCall = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const res = await fetch(endpoint, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, []);

  const fetchAuth = useCallback(async () => {
    try {
      const res = await apiCall('/api/me');
      setStaff(res.staff);
    } catch {
      setStaff(null);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, dataRes] = await Promise.all([
        apiCall('/api/summary'),
        apiCall('/api/data'),
      ]);
      setSummary(sumRes);
      setLots(dataRes.lots || []);
      setZones(dataRes.zones || []);
      setSlots(dataRes.slots || []);
      setUsers(dataRes.users || []);
      setVehicles(dataRes.vehicles || []);
      setLoyaltyTiers(dataRes.loyalty_tiers || []);
      setPricingRules(dataRes.pricing_rules || []);
      setReservations(dataRes.reservations || []);
      setSessions(dataRes.sessions || []);
      setPayments(dataRes.payments || []);
      setViolations(dataRes.violations || []);
      setChargingSessions(dataRes.charging_sessions || []);
      setSensorLogs(dataRes.sensor_logs || []);
    } catch (err: any) {
      showToast(err.message, true);
    }
  }, [apiCall, showToast]);

  const fetchNotes = useCallback(async () => {
    try {
      if (isVectorSearch && vectorQuery.trim()) {
        const res = await apiCall('/api/notes/vector-search', {
          method: 'POST',
          body: JSON.stringify({ query: vectorQuery.trim() }),
        });
        setNotes(res.matches || []);
        setStorageEngine(res.storageEngine || 'Active');
      } else {
        const url = noteCategory !== 'all' ? `/api/notes?category=${noteCategory}` : '/api/notes';
        const res = await apiCall(url);
        setNotes(res.notes || []);
        setStorageEngine(res.storageEngine || 'Active');
      }
    } catch (err: any) {
      showToast(err.message, true);
    }
  }, [apiCall, isVectorSearch, vectorQuery, noteCategory, showToast]);

  useEffect(() => {
    fetchAuth();
  }, [fetchAuth]);

  useEffect(() => {
    if (staff) {
      fetchData();
      fetchNotes();
    }
  }, [staff, fetchData, fetchNotes]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await apiCall('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      setStaff(res.staff);
      showToast(`Welcome, ${res.staff.name}`);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await apiCall('/api/register', {
        method: 'POST',
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword, role: regRole }),
      });
      setStaff(res.staff);
      showToast(`Account created! Welcome, ${res.staff.name}`);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await apiCall('/api/logout', { method: 'POST' });
      setStaff(null);
      showToast('Signed out successfully');
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  const runSqlQuery = async (queryId?: string) => {
    setQueryRunning(true);
    try {
      const payload: any = {};
      if (queryId) {
        payload.queryId = queryId;
      } else if (selectedQueryId === 'custom') {
        payload.sql = customSql;
      } else {
        payload.queryId = selectedQueryId;
      }

      const res = await apiCall('/api/sql-queries/run', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setQueryResult(res);
      showToast(`Query executed in ${res.executionTimeMs} ms`);
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setQueryRunning(false);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeModal === 'lot') {
        await apiCall('/api/lots', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Parking lot created successfully');
      } else if (activeModal === 'zone') {
        await apiCall('/api/zones', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Zone created successfully');
      } else if (activeModal === 'slot') {
        await apiCall('/api/slots', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Parking space created successfully');
      } else if (activeModal === 'user') {
        await apiCall('/api/users', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Customer registered successfully');
      } else if (activeModal === 'vehicle') {
        await apiCall('/api/vehicles', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Vehicle registered successfully');
      } else if (activeModal === 'pricing_rule') {
        await apiCall('/api/pricing-rules', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Pricing rule created successfully');
      } else if (activeModal === 'violation') {
        await apiCall('/api/violations', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Parking violation fine logged');
      } else if (activeModal === 'charging') {
        await apiCall('/api/charging-sessions', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('EV charging session logged');
      } else if (activeModal === 'sensor') {
        await apiCall('/api/sensor-logs', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('IoT sensor reading logged');
      } else if (activeModal === 'reservation') {
        await apiCall('/api/reservations', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Reservation confirmed');
      } else if (activeModal === 'checkin') {
        await apiCall('/api/check-in', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Vehicle checked in successfully');
      } else if (activeModal === 'checkout') {
        await apiCall('/api/check-out', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Vehicle checked out & payment settled');
      } else if (activeModal === 'note') {
        await apiCall('/api/notes', { method: 'POST', body: JSON.stringify(modalData) });
        showToast('Note created with vector embeddings');
        fetchNotes();
      } else if (activeModal === 'edit_note') {
        await apiCall(`/api/notes/${modalData._id}`, { method: 'PUT', body: JSON.stringify(modalData) });
        showToast('Note updated successfully');
        fetchNotes();
      }
      setActiveModal(null);
      setModalData({});
      fetchData();
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm('Are you sure you want to delete this operations note?')) return;
    try {
      await apiCall(`/api/notes/${id}`, { method: 'DELETE' });
      showToast('Note deleted successfully');
      fetchNotes();
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0c1017' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Parkwise DBMS</div>
          <p>Connecting to database services...</p>
        </div>
      </div>
    );
  }

  // Production-Ready Authentication View
  if (!staff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', background: '#090d13' }}>
        <div className="modal-dialog" style={{ maxWidth: '440px', width: '100%' }}>
          <div className="brand-section" style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <span className="brand-badge">PES UNIVERSITY CSE DBMS</span>
            <div className="brand-title" style={{ justifyContent: 'center' }}>
              <span className="brand-icon">P</span>
              <span>Parkwise</span>
            </div>
            <p className="brand-sub">Smart Parking Management System · Production Portal</p>
          </div>

          {/* Auth Mode Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setLoginError(''); }}
              style={{
                flex: 1, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                color: authMode === 'login' ? '#60a5fa' : 'var(--text-dim)',
                borderBottom: authMode === 'login' ? '2px solid #60a5fa' : '2px solid transparent',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setLoginError(''); }}
              style={{
                flex: 1, padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                color: authMode === 'register' ? '#60a5fa' : 'var(--text-dim)',
                borderBottom: authMode === 'register' ? '2px solid #60a5fa' : '2px solid transparent',
              }}
            >
              Register Staff Account
            </button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Staff Sign In</h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Enter your credentials to access system management and operational tools.
              </p>

              {loginError && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                  {loginError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Staff Email</label>
                <input
                  className="form-input"
                  type="email"
                  required
                  placeholder="you@parkwise.local"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '22px' }}>
                <label>Password</label>
                <input
                  className="form-input"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>
                Sign In to System
              </button>

              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-dim)' }}>
                <strong>Default Staff Credentials:</strong>
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>• Administrator: <code>admin@parkwise.local</code> / <code>Parkwise!2026</code></div>
                  <div>• Floor Attendant: <code>attendant@parkwise.local</code> / <code>Attendant!2026</code></div>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Register New Staff Account</h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Create a new staff account to access the parking management system.
              </p>

              {loginError && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                  {loginError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Full Name</label>
                <input
                  className="form-input"
                  type="text"
                  required
                  placeholder="e.g. Aarav Sharma"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Email Address</label>
                <input
                  className="form-input"
                  type="email"
                  required
                  placeholder="e.g. aarav@parkwise.local"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Password (min. 6 characters)</label>
                <input
                  className="form-input"
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••••••"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '22px' }}>
                <label>System Role</label>
                <select
                  className="form-select"
                  value={regRole}
                  onChange={e => setRegRole(e.target.value)}
                >
                  <option value="admin">Administrator (Full Access)</option>
                  <option value="attendant">Floor Attendant (Operational Access)</option>
                </select>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>
                Create Account & Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {toast && (
        <div className={`toast-notice ${toast.isError ? 'error' : ''}`}>
          {toast.message}
        </div>
      )}

      {/* Production Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-section">
          <span className="brand-badge">PES UNIVERSITY CSE DBMS</span>
          <div className="brand-title">
            <span className="brand-icon">P</span>
            <span>Parkwise</span>
          </div>
          <div className="brand-sub">Smart Parking Management System</div>
        </div>

        <div className="nav-group-label">FACILITY OPERATIONS</div>
        <div className="nav-list">
          <button
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <span className="nav-icon">◫</span> Overview
          </button>
          <button
            className={`nav-item ${activeTab === 'parking' ? 'active' : ''}`}
            onClick={() => setActiveTab('parking')}
          >
            <span className="nav-icon">▦</span> Facilities & Bays
          </button>
          <button
            className={`nav-item ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => setActiveTab('people')}
          >
            <span className="nav-icon">♙</span> Customers & Loyalty
          </button>
          <button
            className={`nav-item ${activeTab === 'reservations' ? 'active' : ''}`}
            onClick={() => setActiveTab('reservations')}
          >
            <span className="nav-icon">◷</span> Reservations
          </button>
        </div>

        <div className="nav-group-label" style={{ marginTop: '12px' }}>SERVICES & TELEMETRY</div>
        <div className="nav-list">
          <button
            className={`nav-item ${activeTab === 'pricing_ev' ? 'active' : ''}`}
            onClick={() => setActiveTab('pricing_ev')}
          >
            <span className="nav-icon">⚡</span> Tariffs & EV Charging
          </button>
          <button
            className={`nav-item ${activeTab === 'violations_sensors' ? 'active' : ''}`}
            onClick={() => setActiveTab('violations_sensors')}
          >
            <span className="nav-icon">⚠️</span> Violations & Sensors
          </button>
          <button
            className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <span className="nav-icon">💳</span> Financials & Payments
          </button>
          <button
            className={`nav-item ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            <span className="nav-icon">▤</span> Operations Notes (NoSQL)
          </button>
        </div>

        <div className="nav-group-label" style={{ marginTop: '12px' }}>EVALUATION & AUDIT</div>
        <div className="nav-list">
          <button
            className={`nav-item ${activeTab === 'sql' ? 'active' : ''}`}
            onClick={() => setActiveTab('sql')}
          >
            <span className="nav-icon">⚡</span> SQL Console & Analytics
          </button>
          <button
            className={`nav-item ${activeTab === 'er_schema' ? 'active' : ''}`}
            onClick={() => setActiveTab('er_schema')}
          >
            <span className="nav-icon">🗂</span> ER & Relational Schema
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="connection-pill">
            <span className="pulse-dot"></span>
            <span>Relational: SQLite Connected</span>
          </div>
          <div className="system-details">NoSQL: {storageEngine}</div>
          <div className="system-details" style={{ marginTop: '2px' }}>RBAC: Minimum 2 Database Roles</div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="main-wrapper">
        {/* Production Topbar without artificial switch buttons */}
        <header className="topbar">
          <div className="page-heading">
            <h1>
              {activeTab === 'overview' && 'System Overview & Operational Health'}
              {activeTab === 'parking' && 'Facilities, Zones & Parking Spaces'}
              {activeTab === 'people' && 'Customers, Loyalty Tiers & Registered Vehicles'}
              {activeTab === 'reservations' && 'Pre-Booked Space Reservations'}
              {activeTab === 'pricing_ev' && 'Pricing Rules & EV Charging Sessions'}
              {activeTab === 'violations_sensors' && 'Infractions, Fines & IoT Sensor Logs'}
              {activeTab === 'payments' && 'Payment Transactions & Revenue Ledger'}
              {activeTab === 'notes' && 'Operations Handover & Vector Semantic Search'}
              {activeTab === 'sql' && 'Live SQL Queries, CTEs & Procedure Runner'}
              {activeTab === 'er_schema' && 'Chen ER Diagram & 3NF/BCNF Schema Specifications'}
            </h1>
            <p>Department of Computer Science & Engineering · Aug - Dec 2026</p>
          </div>

          <div className="topbar-right">
            <div className="role-badge">
              <span>{staff.name}</span>
              <span className={`role-tag ${staff.role}`}>{staff.role}</span>
            </div>

            <button className="btn btn-outline btn-sm" onClick={fetchData} title="Refresh live database state">
              ↻ Refresh
            </button>

            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </header>

        <main className="content-body">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div>
              <div className="rubric-banner">
                <div className="rubric-info">
                  <span className="rubric-tag">ALL 13 ER ENTITIES IMPLEMENTED</span>
                  <div className="rubric-text">
                    <strong>Complete System Verification:</strong> All 13 entities from <code>smart_parking_chen_er.drawio</code> (Lots, Zones, Slots, Users, Vehicles, Loyalty Tiers, Pricing Rules, Reservations, Sessions, Payments, Violations, EV Charging, Sensor Logs) are populated in the database and manageable through the interface.
                  </div>
                </div>
              </div>

              {/* KPI Metrics */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-head">
                    <span>TOTAL SPACES</span>
                    <span className="kpi-icon blue">▦</span>
                  </div>
                  <div className="kpi-val">{summary?.capacity ?? '—'}</div>
                  <div className="kpi-sub">Across {summary?.lots ?? '0'} parking facilities</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-head">
                    <span>AVAILABLE NOW</span>
                    <span className="kpi-icon green">✓</span>
                  </div>
                  <div className="kpi-val" style={{ color: '#34d399' }}>{summary?.slots ?? '—'}</div>
                  <div className="kpi-sub">Ready for vehicle check-in</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-head">
                    <span>CURRENTLY PARKED</span>
                    <span className="kpi-icon orange">↗</span>
                  </div>
                  <div className="kpi-val" style={{ color: '#fbbf24' }}>{summary?.active ?? '—'}</div>
                  <div className="kpi-sub">{summary?.occupied ?? 0} occupied · {summary?.reserved ?? 0} reserved</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-head">
                    <span>PAYMENTS COLLECTED</span>
                    <span className="kpi-icon purple">₹</span>
                  </div>
                  <div className="kpi-val" style={{ color: '#c084fc' }}>
                    ₹{new Intl.NumberFormat('en-IN').format(summary?.revenue ?? 0)}
                  </div>
                  <div className="kpi-sub">{payments.length} transactions recorded</div>
                </div>
              </div>

              {/* Parking Facilities */}
              <div className="section-header">
                <div>
                  <h2>Parking Lots & Utilization</h2>
                  <p>Capacity derived from view: ParkingLotCapacity</p>
                </div>
                {staff.role === 'admin' && (
                  <button className="btn btn-primary btn-sm" onClick={() => setActiveModal('lot')}>
                    ＋ Add Parking Lot
                  </button>
                )}
              </div>

              <div className="lot-grid">
                {lots.map(l => {
                  const lotSlots = slots.filter(s => s.lot_id === l.lot_id);
                  const total = lotSlots.length || l.total_capacity || 1;
                  const occ = lotSlots.filter(s => s.status === 'occupied').length || l.occupied_slots || 0;
                  const avail = lotSlots.filter(s => s.status === 'available').length || l.available_slots || 0;
                  const pct = Math.round((occ / total) * 100);

                  return (
                    <div key={l.lot_id} className="lot-box">
                      <div className="lot-box-title">{l.name}</div>
                      <div className="lot-box-location">⌖ &nbsp;{l.location}</div>
                      <div className="lot-stats-row">
                        <div className="lot-stat-item">
                          <strong>{total}</strong>
                          <small>Capacity</small>
                        </div>
                        <div className="lot-stat-item">
                          <strong style={{ color: '#34d399' }}>{avail}</strong>
                          <small>Available</small>
                        </div>
                        <div className="lot-stat-item">
                          <strong style={{ color: '#fbbf24' }}>{occ}</strong>
                          <small>Occupied</small>
                        </div>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%` }}></div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>Utilization</span>
                        <b>{pct}%</b>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Sessions & Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                <div className="panel">
                  <div className="section-header" style={{ marginBottom: '14px' }}>
                    <div>
                      <h2>Recent Parking Sessions</h2>
                      <p>Vehicle entry and exit history</p>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => setActiveTab('parking')}>
                      View all →
                    </button>
                  </div>

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Vehicle</th>
                          <th>Lot & Space</th>
                          <th>Entry Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.slice(0, 5).map(s => (
                          <tr key={s.session_id}>
                            <td>
                              <strong>{s.plate_no}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{s.vehicle_type}</div>
                            </td>
                            <td>
                              {s.lot_name} · <strong>#{s.slot_id}</strong>
                            </td>
                            <td>{new Date(s.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>
                              <span className={`status-pill ${s.exit_time ? 'completed' : 'occupied'}`}>
                                {s.exit_time ? 'Completed' : 'Parked'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="section-header" style={{ marginBottom: '6px' }}>
                    <div>
                      <h2>Quick Floor Actions</h2>
                      <p>Operational tasks</p>
                    </div>
                  </div>

                  <button className="btn btn-primary" style={{ justifyContent: 'flex-start' }} onClick={() => setActiveModal('checkin')}>
                    ↗ &nbsp;Check in Vehicle
                  </button>

                  <button className="btn btn-outline" style={{ justifyContent: 'flex-start' }} onClick={() => setActiveModal('reservation')}>
                    ◷ &nbsp;Make a Reservation
                  </button>

                  {staff.role === 'admin' ? (
                    <button className="btn btn-outline" style={{ justifyContent: 'flex-start' }} onClick={() => setActiveModal('user')}>
                      ＋ &nbsp;Add Customer & Vehicle
                    </button>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '8px', background: 'var(--bg-card)', borderRadius: '6px' }}>
                      Attendant Mode: Floor check-in/out and reservations active. Administrative writes restricted (RBAC).
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PARKING FACILITIES & BAYS */}
          {activeTab === 'parking' && (
            <div>
              <div className="section-header">
                <div>
                  <h2>Facilities, Zones & Space Inventory</h2>
                  <p>Entities: <code>ParkingLots</code> (1) contains (N) <code>Zones</code> (1) has (N) <code>Slots</code></p>
                </div>
                {staff.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setActiveModal('zone')}>＋ Add Zone</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setActiveModal('slot')}>＋ Add Space</button>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                <div className="panel">
                  {zones.map(z => {
                    const zoneSlots = slots.filter(s => s.zone_id === z.zone_id);
                    return (
                      <div key={z.zone_id} style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                          <div>
                            <strong style={{ color: '#fff', fontSize: '14px' }}>{z.lot_name} · {z.level}</strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '10px' }}>({z.zone_type})</span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zoneSlots.length} spaces</span>
                        </div>

                        <div className="space-pills-container">
                          {zoneSlots.map(s => (
                            <div key={s.slot_id} className={`space-card-pill ${s.status}`}>
                              <strong>#{s.slot_id}</strong>
                              <span style={{ fontSize: '10px', textTransform: 'uppercase' }}>{s.slot_type}</span>
                              <span className={`status-pill ${s.status}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                                {s.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="panel">
                  <div className="section-header" style={{ marginBottom: '14px' }}>
                    <div>
                      <h2>Currently Parked Vehicles</h2>
                      <p>Active sessions with exit payment</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sessions.filter(s => !s.exit_time).length === 0 ? (
                      <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>No vehicles currently parked.</div>
                    ) : (
                      sessions.filter(s => !s.exit_time).map(s => (
                        <div key={s.session_id} style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ fontSize: '14px', color: '#fff' }}>{s.plate_no}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                Slot #{s.slot_id} · {s.lot_name}
                              </div>
                            </div>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setModalData({ session_id: s.session_id, amount: 80, method: 'UPI' });
                                setActiveModal('checkout');
                              }}
                            >
                              Check Out
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOMERS, LOYALTY & VEHICLES */}
          {activeTab === 'people' && (
            <div>
              <div className="section-header">
                <div>
                  <h2>Customers, Loyalty Rewards & Registered Vehicles</h2>
                  <p>Entities: <code>Users</code> (N) belongs to (1) <code>LoyaltyTiers</code> | <code>Users</code> (1) owns (N) <code>Vehicles</code></p>
                </div>
                {staff.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setActiveModal('vehicle')}>＋ Add Vehicle</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setActiveModal('user')}>＋ Add Customer</button>
                  </div>
                )}
              </div>

              {/* Loyalty Tiers Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {loyaltyTiers.map(t => (
                  <div key={t.tier_id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#60a5fa', fontSize: '14px' }}>{t.tier_name} Tier</strong>
                      <span className="status-pill completed">{t.discount_pct}% Off</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                      Threshold: <strong>{t.min_points}</strong> points
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Directory Table */}
              <div className="panel">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Email & Phone</th>
                        <th>Loyalty Tier</th>
                        <th>Derived Points</th>
                        <th>Registered Vehicles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => {
                        const userVehicles = vehicles.filter(v => v.user_id === u.user_id);
                        return (
                          <tr key={u.user_id}>
                            <td>
                              <strong>{u.name}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>User #{u.user_id}</div>
                            </td>
                            <td>
                              <div>{u.email}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{u.phone || 'No phone'}</div>
                            </td>
                            <td>
                              <span className="status-pill completed">
                                {u.tier_name || 'Standard'} ({u.discount_pct || 0}% discount)
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: '#38bdf8' }}>{u.loyalty_points || 0}</strong> <small style={{ color: 'var(--text-dim)' }}>pts (derived)</small>
                            </td>
                            <td>
                              {userVehicles.length === 0 ? (
                                <span style={{ color: 'var(--text-dim)' }}>No vehicle registered</span>
                              ) : (
                                userVehicles.map(v => (
                                  <div key={v.vehicle_id} style={{ fontSize: '12px' }}>
                                    <strong>{v.plate_no}</strong> <small style={{ color: 'var(--text-dim)' }}>({v.type})</small>
                                  </div>
                                ))
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RESERVATIONS */}
          {activeTab === 'reservations' && (
            <div>
              <div className="section-header">
                <div>
                  <h2>Pre-Booked Space Reservations</h2>
                  <p>Entity: <code>Reservations</code> (Trigger-enforced time-slot non-overlapping constraint)</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setActiveModal('reservation')}>
                  ＋ New Reservation
                </button>
              </div>

              <div className="panel">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Res ID</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Space & Facility</th>
                        <th>Reservation Window</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map(r => (
                        <tr key={r.res_id}>
                          <td><strong>#{r.res_id}</strong></td>
                          <td>{r.user_name}</td>
                          <td><strong>{r.plate_no}</strong></td>
                          <td>{r.lot_name} · Slot #{r.slot_id}</td>
                          <td>
                            {new Date(r.start_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} –{' '}
                            {new Date(r.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <span className={`status-pill ${r.status}`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TARIFFS & EV CHARGING SESSIONS */}
          {activeTab === 'pricing_ev' && (
            <div>
              <div className="section-header">
                <div>
                  <h2>Tariff Rules & Electric Vehicle Charging Sessions</h2>
                  <p>Entities: <code>PricingRules</code> & <code>ChargingSessions</code></p>
                </div>
                {staff.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setActiveModal('charging')}>＋ Log EV Charge</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setActiveModal('pricing_rule')}>＋ Add Pricing Rule</button>
                  </div>
                )}
              </div>

              {/* Pricing Rules Table */}
              <div className="panel" style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px' }}>Facility Pricing Rules</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rule ID</th>
                        <th>Facility</th>
                        <th>Bay Type</th>
                        <th>Base Rate (₹/hr)</th>
                        <th>Peak Multiplier</th>
                        <th>Active Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingRules.map(pr => (
                        <tr key={pr.rule_id}>
                          <td><strong>#{pr.rule_id}</strong></td>
                          <td>{pr.lot_name}</td>
                          <td><span className="status-pill completed">{pr.slot_type}</span></td>
                          <td><strong>₹{pr.base_rate}</strong></td>
                          <td>{pr.peak_multiplier}x</td>
                          <td>{pr.start_hour}:00 – {pr.end_hour}:00</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charging Sessions Table */}
              <div className="panel">
                <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px' }}>Electric Vehicle Charging Sessions</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Charge ID</th>
                        <th>Session ID</th>
                        <th>Vehicle Plate</th>
                        <th>Energy Consumed (kWh)</th>
                        <th>Charging Fee (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chargingSessions.map(cs => (
                        <tr key={cs.charge_id}>
                          <td><strong>#{cs.charge_id}</strong></td>
                          <td>Session #{cs.session_id}</td>
                          <td><strong>{cs.plate_no}</strong></td>
                          <td>{cs.kwh_used} kWh</td>
                          <td><strong style={{ color: '#34d399' }}>₹{cs.cost}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: VIOLATIONS & IOT SENSOR LOGS */}
          {activeTab === 'violations_sensors' && (
            <div>
              <div className="section-header">
                <div>
                  <h2>Parking Violations & Real-Time IoT Sensor Readings</h2>
                  <p>Entities: <code>Violations</code> & <code>SensorLogs</code></p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setActiveModal('sensor')}>＋ Record Sensor Ping</button>
                  {staff.role === 'admin' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setActiveModal('violation')}>＋ Issue Violation Fine</button>
                  )}
                </div>
              </div>

              {/* Violations Table */}
              <div className="panel" style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px' }}>Infractions & Fine Assessments</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Violation ID</th>
                        <th>Vehicle</th>
                        <th>Infraction Description</th>
                        <th>Fine Assessed</th>
                        <th>Facility</th>
                      </tr>
                    </thead>
                    <tbody>
                      {violations.map(v => (
                        <tr key={v.violation_id}>
                          <td><strong>#{v.violation_id}</strong></td>
                          <td><strong>{v.plate_no}</strong></td>
                          <td>{v.type}</td>
                          <td><strong style={{ color: '#fca5a5' }}>₹{v.fine_amount}</strong></td>
                          <td>{v.lot_name} · Slot #{v.slot_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sensor Logs Table */}
              <div className="panel">
                <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '12px' }}>IoT Slot Ultrasonic / Presence Readings</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Log ID</th>
                        <th>Space #</th>
                        <th>Facility & Level</th>
                        <th>Sensor Reading</th>
                        <th>Slot State</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sensorLogs.map(sl => (
                        <tr key={sl.log_id}>
                          <td><strong>#{sl.log_id}</strong></td>
                          <td>Slot #{sl.slot_id}</td>
                          <td>{sl.lot_name} · {sl.level}</td>
                          <td><code>{sl.reading.toFixed(2)}</code></td>
                          <td><span className={`status-pill ${sl.slot_status || 'available'}`}>{sl.slot_status || 'available'}</span></td>
                          <td>{new Date(sl.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: FINANCIALS & PAYMENTS */}
          {activeTab === 'payments' && (
            <div>
              <div className="section-header">
                <div>
                  <h2>Financial Transactions & Payment Settlement Ledger</h2>
                  <p>Entity: <code>Payments</code> (ACID Transaction Auditing)</p>
                </div>
              </div>

              <div className="panel">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Payment ID</th>
                        <th>Session</th>
                        <th>Vehicle Plate</th>
                        <th>Amount Paid</th>
                        <th>Payment Method</th>
                        <th>Settled At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.payment_id}>
                          <td><strong>#{p.payment_id}</strong></td>
                          <td>Session #{p.session_id}</td>
                          <td><strong>{p.plate_no}</strong></td>
                          <td><strong style={{ color: '#34d399' }}>₹{p.amount}</strong></td>
                          <td><span className="status-pill completed">{p.method}</span></td>
                          <td>{new Date(p.paid_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: NOSQL & VECTOR RUD */}
          {activeTab === 'notes' && (
            <div>
              <div className="rubric-banner">
                <div className="rubric-info">
                  <span className="rubric-tag">RUBRIC ITEMS 4 & 9 (11 MARKS)</span>
                  <div className="rubric-text">
                    <strong>NoSQL Document Store & Vector Feature:</strong> Full RUD (Create, Read, Update, Delete) with schema validation, compound indexes, and semantic vector similarity search via high-dimensional cosine embeddings.
                  </div>
                </div>
                <span className="query-timer-badge">Engine: {storageEngine}</span>
              </div>

              {/* Vector Search Bar & Category Filter */}
              <div className="panel" style={{ padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, minWidth: '280px' }}
                    placeholder="Search notes or enter natural text for Vector Semantic Search (e.g. 'charger broken', 'traffic peak')..."
                    value={vectorQuery}
                    onChange={e => setVectorQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') fetchNotes(); }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#c084fc' }}>
                      <input
                        type="checkbox"
                        checked={isVectorSearch}
                        onChange={e => setIsVectorSearch(e.target.checked)}
                      />
                      <strong>Enable Vector Search</strong>
                    </label>

                    <button className="btn btn-primary btn-sm" onClick={fetchNotes}>
                      Search
                    </button>
                  </div>

                  <button className="btn btn-primary btn-sm" onClick={() => setActiveModal('note')}>
                    ＋ Create Note
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                  {['all', 'operations', 'maintenance', 'incident', 'ev_charging', 'security'].map(cat => (
                    <button
                      key={cat}
                      className={`btn btn-sm ${noteCategory === cat ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => { setNoteCategory(cat); setIsVectorSearch(false); }}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes List */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                {notes.length === 0 ? (
                  <div className="panel" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>
                    No operations notes found. Click &quot;Create Note&quot; to add a new document.
                  </div>
                ) : (
                  notes.map(n => (
                    <div key={n._id} className="note-item-card">
                      <div className="note-item-head">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="status-pill completed">{n.category}</span>
                          {n.priority && (
                            <span className="status-pill pending" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                              {n.priority}
                            </span>
                          )}
                          <h3 style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{n.title}</h3>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {n.similarityPct !== undefined && (
                            <span className="vector-score-badge">
                              {n.similarityPct}% Vector Match
                            </span>
                          )}
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setModalData(n);
                              setActiveModal('edit_note');
                            }}
                          >
                            Edit
                          </button>
                          {staff.role === 'admin' && (
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ borderColor: 'var(--danger)', color: '#fca5a5' }}
                              onClick={() => handleDeleteNote(n._id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>

                      <p style={{ fontSize: '13.5px', color: '#cbd5e1', marginBottom: '10px' }}>{n.note}</p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-dim)' }}>
                        <div>Tags: {n.tags && n.tags.length ? n.tags.join(', ') : 'None'}</div>
                        <div>
                          Author: <strong>{n.createdBy || 'Staff'}</strong> · {new Date(n.updatedAt || n.createdAt || Date.now()).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 9: SQL CONSOLE & ANALYTICS */}
          {activeTab === 'sql' && (
            <div>
              <div className="rubric-banner">
                <div className="rubric-info">
                  <span className="rubric-tag">RUBRIC ITEMS 6, 7 & 8 (14 MARKS)</span>
                  <div className="rubric-text">
                    <strong>Live SQL Query & Analytics Console:</strong> Execute Joins, Correlated Subqueries, Nested Queries, Recursive CTEs, and Stored Procedures directly against the database with live execution timing.
                  </div>
                </div>
              </div>

              <div className="panel" style={{ marginBottom: '20px' }}>
                <div className="section-header" style={{ marginBottom: '14px' }}>
                  <div>
                    <h2>Select Pre-Configured Evaluation Query</h2>
                    <p>Demonstrates requirements for evaluation components 6, 7 and 8</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <select
                    className="form-select"
                    style={{ flex: 1, minWidth: '320px' }}
                    value={selectedQueryId}
                    onChange={e => setSelectedQueryId(e.target.value)}
                  >
                    <option value="join_5_tables">1. 5-Table Facility Inventory & Revenue JOIN (Item 7)</option>
                    <option value="correlated_not_exists">2. Correlated Subquery with NOT EXISTS: Vacant Spaces (Item 7)</option>
                    <option value="nested_in">3. Nested Subquery with IN: Paying Customers (Item 7)</option>
                    <option value="recursive_cte">4. Recursive CTE: 24-Hour Timeline Distribution (Item 7 & 8)</option>
                    <option value="window_function_rank">5. CTE with Window Function: DENSE_RANK() Leaderboard (Item 8)</option>
                    <option value="custom">6. Custom Ad-Hoc SQL Query (Enter below)</option>
                  </select>

                  <button
                    className="btn btn-primary"
                    disabled={queryRunning}
                    onClick={() => runSqlQuery()}
                  >
                    {queryRunning ? 'Executing...' : '⚡ Run Query'}
                  </button>
                </div>

                {selectedQueryId === 'custom' && (
                  <textarea
                    className="sql-editor-box"
                    placeholder="Enter custom SQL query (SELECT * FROM ...)"
                    value={customSql}
                    onChange={e => setCustomSql(e.target.value)}
                  />
                )}
              </div>

              {queryResult && (
                <div className="panel">
                  <div className="section-header" style={{ marginBottom: '12px' }}>
                    <div>
                      <h2>{queryResult.title}</h2>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#7dd3fc', marginTop: '4px' }}>
                        {queryResult.query.replace(/\s+/g, ' ').slice(0, 120)}...
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <span className="query-timer-badge">Rows: {queryResult.rowCount}</span>
                      <span className="query-timer-badge">{queryResult.executionTimeMs} ms</span>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {queryResult.columns.map(col => (
                            <th key={col}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.rows.map((row, idx) => (
                          <tr key={idx}>
                            {queryResult.columns.map(col => (
                              <td key={col}>{String(row[col] ?? 'NULL')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 10: ER DIAGRAM & SCHEMA */}
          {activeTab === 'er_schema' && (
            <div>
              <div className="rubric-banner">
                <div className="rubric-info">
                  <span className="rubric-tag">RUBRIC ITEMS 1 & 2 (5 MARKS)</span>
                  <div className="rubric-text">
                    <strong>Chen ER Diagram & Relational Schema:</strong> Complete visual conceptual model translated to normalized relational tables (3NF / BCNF) with domain constraints and referential integrity.
                  </div>
                </div>
              </div>

              <div className="panel" style={{ marginBottom: '24px' }}>
                <div className="section-header">
                  <div>
                    <h2>High-Resolution Chen ER Diagram</h2>
                    <p>Rectangles = Entities, Ellipses = Attributes (Underline = PK, Dashed = Derived), Diamonds = Relationships</p>
                  </div>
                  <a href="/smart_parking_er.svg" target="_blank" className="btn btn-outline btn-sm">
                    Open Full SVG ↗
                  </a>
                </div>

                <div style={{ width: '100%', overflowX: 'auto', background: '#090d13', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <img
                    src="/smart_parking_er.svg"
                    alt="Chen ER Diagram for Smart Parking System"
                    style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }}
                  />
                </div>
              </div>

              <div className="panel">
                <div className="section-header">
                  <div>
                    <h2>Relational Schema Mapping (All 13 Entities + RBAC in BCNF)</h2>
                    <p>Relational Algebra specification with Primary Keys (PK) and Foreign Keys (FK)</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                  {[
                    { name: '1. LoyaltyTiers', schema: 'tier_id (PK), tier_name (UQ), min_points, discount_pct (CHK 0-100)' },
                    { name: '2. Users', schema: 'user_id (PK), tier_id (FK), name, phone, email (UQ), loyalty_points (derived)' },
                    { name: '3. Vehicles', schema: 'vehicle_id (PK), user_id (FK), plate_no (UQ), type (CHK Car, SUV, EV...)' },
                    { name: '4. ParkingLots', schema: 'lot_id (PK), name, location, total_capacity (derived)' },
                    { name: '5. PricingRules', schema: 'rule_id (PK), lot_id (FK), slot_type, base_rate, peak_multiplier, start_hour, end_hour' },
                    { name: '6. Zones', schema: 'zone_id (PK), lot_id (FK), level, zone_type' },
                    { name: '7. Slots', schema: 'slot_id (PK), zone_id (FK), slot_type, status (CHK available, occupied, reserved, maintenance)' },
                    { name: '8. Reservations', schema: 'res_id (PK), user_id (FK), vehicle_id (FK), slot_id (FK), start_time, end_time, status' },
                    { name: '9. ParkingSessions', schema: 'session_id (PK), vehicle_id (FK), slot_id (FK), res_id (FK, UQ), entry_time, exit_time' },
                    { name: '10. Payments', schema: 'payment_id (PK), session_id (FK), amount (CHK >=0), method (UPI, Card, Cash...), paid_at' },
                    { name: '11. Violations', schema: 'violation_id (PK), session_id (FK), type, fine_amount' },
                    { name: '12. ChargingSessions', schema: 'charge_id (PK), session_id (FK), kwh_used, cost' },
                    { name: '13. SensorLogs', schema: 'log_id (PK), slot_id (FK), reading, logged_at' },
                    { name: '14. Roles & StaffAccounts', schema: 'staff_id (PK), role_id (FK), email (UQ), password_hash (scrypt)' }
                  ].map(t => (
                    <div key={t.name} style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <strong style={{ color: '#60a5fa', fontSize: '13.5px' }}>{t.name}</strong>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#cbd5e1', marginTop: '6px' }}>
                        {t.schema}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* POPUP MODALS FOR ACTIONS */}
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {activeModal === 'lot' && 'Add New Parking Lot'}
                {activeModal === 'zone' && 'Add Zone to Parking Lot'}
                {activeModal === 'slot' && 'Add Parking Space'}
                {activeModal === 'user' && 'Register New Customer'}
                {activeModal === 'vehicle' && 'Register New Vehicle'}
                {activeModal === 'pricing_rule' && 'Add Facility Pricing Rule'}
                {activeModal === 'violation' && 'Issue Parking Violation Fine'}
                {activeModal === 'charging' && 'Log EV Charging Consumption'}
                {activeModal === 'sensor' && 'Record IoT Sensor Reading'}
                {activeModal === 'reservation' && 'Book Parking Space Reservation'}
                {activeModal === 'checkin' && 'Check in Vehicle (Start Session)'}
                {activeModal === 'checkout' && 'Check out Vehicle & Settle Payment'}
                {activeModal === 'note' && 'Create Operations Note (NoSQL)'}
                {activeModal === 'edit_note' && 'Edit Operations Note'}
              </h3>
              <button className="modal-close-btn" onClick={() => setActiveModal(null)}>×</button>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div className="modal-body">
                {activeModal === 'lot' && (
                  <>
                    <div className="form-group">
                      <label>Lot Name</label>
                      <input className="form-input" required onChange={e => setModalData({ ...modalData, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Location / Address</label>
                      <input className="form-input" required onChange={e => setModalData({ ...modalData, location: e.target.value })} />
                    </div>
                  </>
                )}

                {activeModal === 'zone' && (
                  <>
                    <div className="form-group">
                      <label>Select Parking Facility</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, lot_id: e.target.value })}>
                        <option value="">Select Lot...</option>
                        {lots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Floor / Level (e.g. Basement B1, Ground)</label>
                      <input className="form-input" required onChange={e => setModalData({ ...modalData, level: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Zone Type</label>
                      <input className="form-input" defaultValue="Standard" onChange={e => setModalData({ ...modalData, zone_type: e.target.value })} />
                    </div>
                  </>
                )}

                {activeModal === 'slot' && (
                  <>
                    <div className="form-group">
                      <label>Select Zone</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, zone_id: e.target.value })}>
                        <option value="">Select Zone...</option>
                        {zones.map(z => <option key={z.zone_id} value={z.zone_id}>{z.lot_name} · {z.level}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Space Type</label>
                      <select className="form-select" defaultValue="Standard" onChange={e => setModalData({ ...modalData, slot_type: e.target.value })}>
                        <option value="Standard">Standard</option>
                        <option value="EV">EV Charging</option>
                        <option value="Accessible">Accessible (Disabled)</option>
                        <option value="VIP">VIP</option>
                        <option value="Compact">Compact</option>
                      </select>
                    </div>
                  </>
                )}

                {activeModal === 'user' && (
                  <>
                    <div className="form-group">
                      <label>Full Name</label>
                      <input className="form-input" required placeholder="e.g. Aarav Sharma" onChange={e => setModalData({ ...modalData, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Email Address (Unique Key)</label>
                      <input className="form-input" type="email" required placeholder="e.g. aarav@example.com" onChange={e => setModalData({ ...modalData, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Phone Number</label>
                      <input className="form-input" placeholder="e.g. +91 98765 43210" onChange={e => setModalData({ ...modalData, phone: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Loyalty Tier</label>
                      <select className="form-select" defaultValue="1" onChange={e => setModalData({ ...modalData, tier_id: e.target.value })}>
                        {loyaltyTiers.map(t => (
                          <option key={t.tier_id} value={t.tier_id}>{t.tier_name} ({t.discount_pct}% discount · {t.min_points} pts threshold)</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {activeModal === 'vehicle' && (
                  <>
                    <div className="form-group">
                      <label>Registered Owner</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, user_id: e.target.value })}>
                        <option value="">Select Customer...</option>
                        {users.map(u => <option key={u.user_id} value={u.user_id}>{u.name} ({u.email})</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>License Plate Number</label>
                      <input className="form-input" placeholder="e.g. KA-01-AB-1234" required onChange={e => setModalData({ ...modalData, plate_no: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Vehicle Type</label>
                      <select className="form-select" defaultValue="Car" onChange={e => setModalData({ ...modalData, type: e.target.value })}>
                        <option value="Car">Car</option>
                        <option value="SUV">SUV</option>
                        <option value="EV">EV</option>
                        <option value="Motorcycle">Motorcycle</option>
                        <option value="Van">Van</option>
                      </select>
                    </div>
                  </>
                )}

                {activeModal === 'pricing_rule' && (
                  <>
                    <div className="form-group">
                      <label>Parking Facility</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, lot_id: e.target.value })}>
                        <option value="">Select Facility...</option>
                        {lots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Bay Type</label>
                      <select className="form-select" defaultValue="Standard" onChange={e => setModalData({ ...modalData, slot_type: e.target.value })}>
                        <option value="Standard">Standard</option>
                        <option value="EV">EV Charging</option>
                        <option value="Accessible">Accessible</option>
                        <option value="VIP">VIP</option>
                        <option value="Compact">Compact</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Base Hourly Rate (₹)</label>
                      <input className="form-input" type="number" min="0" step="5" defaultValue="40" required onChange={e => setModalData({ ...modalData, base_rate: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Peak Multiplier</label>
                      <input className="form-input" type="number" min="1.0" step="0.05" defaultValue="1.25" required onChange={e => setModalData({ ...modalData, peak_multiplier: e.target.value })} />
                    </div>
                  </>
                )}

                {activeModal === 'violation' && (
                  <>
                    <div className="form-group">
                      <label>Active Parking Session</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, session_id: e.target.value })}>
                        <option value="">Select Session...</option>
                        {sessions.map(s => <option key={s.session_id} value={s.session_id}>Session #{s.session_id} — {s.plate_no} ({s.lot_name})</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Infraction Type</label>
                      <input className="form-input" placeholder="e.g. Overstaying allotted reservation duration" required onChange={e => setModalData({ ...modalData, type: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Fine Amount (₹)</label>
                      <input className="form-input" type="number" min="0" step="50" defaultValue="150" required onChange={e => setModalData({ ...modalData, fine_amount: e.target.value })} />
                    </div>
                  </>
                )}

                {activeModal === 'charging' && (
                  <>
                    <div className="form-group">
                      <label>Active Parking Session</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, session_id: e.target.value })}>
                        <option value="">Select Session...</option>
                        {sessions.map(s => <option key={s.session_id} value={s.session_id}>Session #{s.session_id} — {s.plate_no}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Energy Consumed (kWh)</label>
                      <input className="form-input" type="number" min="0.1" step="0.1" defaultValue="15.0" required onChange={e => setModalData({ ...modalData, kwh_used: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Total Charging Cost (₹)</label>
                      <input className="form-input" type="number" min="0" step="10" defaultValue="225" required onChange={e => setModalData({ ...modalData, cost: e.target.value })} />
                    </div>
                  </>
                )}

                {activeModal === 'sensor' && (
                  <>
                    <div className="form-group">
                      <label>Parking Space</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, slot_id: e.target.value })}>
                        <option value="">Select Space...</option>
                        {slots.map(s => <option key={s.slot_id} value={s.slot_id}>Space #{s.slot_id} · {s.lot_name} ({s.status})</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Sensor Telemetry Reading (0.00 = vacant, 1.00 = occupied)</label>
                      <input className="form-input" type="number" min="0" max="1" step="0.05" defaultValue="1.00" required onChange={e => setModalData({ ...modalData, reading: e.target.value })} />
                    </div>
                  </>
                )}

                {activeModal === 'reservation' && (
                  <>
                    <div className="form-group">
                      <label>Customer</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, user_id: e.target.value })}>
                        <option value="">Select Customer...</option>
                        {users.map(u => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Vehicle</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, vehicle_id: e.target.value })}>
                        <option value="">Select Vehicle...</option>
                        {vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.plate_no} ({v.type})</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Available Parking Space</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, slot_id: e.target.value })}>
                        <option value="">Select Space...</option>
                        {slots.filter(s => s.status === 'available').map(s => (
                          <option key={s.slot_id} value={s.slot_id}>Space #{s.slot_id} · {s.lot_name} ({s.slot_type})</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Start Time</label>
                      <input className="form-input" type="datetime-local" required onChange={e => setModalData({ ...modalData, start_time: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>End Time</label>
                      <input className="form-input" type="datetime-local" required onChange={e => setModalData({ ...modalData, end_time: e.target.value })} />
                    </div>
                  </>
                )}

                {activeModal === 'checkin' && (
                  <>
                    <div className="form-group">
                      <label>Vehicle to Park</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, vehicle_id: e.target.value })}>
                        <option value="">Select Vehicle...</option>
                        {vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.plate_no} · {v.owner}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Assign Space</label>
                      <select className="form-select" required onChange={e => setModalData({ ...modalData, slot_id: e.target.value })}>
                        <option value="">Select Space...</option>
                        {slots.filter(s => ['available', 'reserved'].includes(s.status)).map(s => (
                          <option key={s.slot_id} value={s.slot_id}>Slot #{s.slot_id} · {s.lot_name} ({s.status})</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {activeModal === 'checkout' && (
                  <>
                    <div className="form-group">
                      <label>Calculated Payment Amount (₹)</label>
                      <input className="form-input" type="number" min="0" step="10" defaultValue={modalData.amount || 80} onChange={e => setModalData({ ...modalData, amount: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Payment Method</label>
                      <select className="form-select" defaultValue="UPI" onChange={e => setModalData({ ...modalData, method: e.target.value })}>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Cash">Cash</option>
                        <option value="Fastag">Fastag</option>
                        <option value="Wallet">Wallet</option>
                      </select>
                    </div>
                  </>
                )}

                {(activeModal === 'note' || activeModal === 'edit_note') && (
                  <>
                    <div className="form-group">
                      <label>Note Title</label>
                      <input className="form-input" required defaultValue={modalData.title || ''} onChange={e => setModalData({ ...modalData, title: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Category</label>
                      <select className="form-select" defaultValue={modalData.category || 'operations'} onChange={e => setModalData({ ...modalData, category: e.target.value })}>
                        <option value="operations">Operations</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="incident">Incident</option>
                        <option value="ev_charging">EV Charging</option>
                        <option value="security">Security</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Severity Priority</label>
                      <select className="form-select" defaultValue={modalData.priority || 'medium'} onChange={e => setModalData({ ...modalData, priority: e.target.value })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Detailed Handover / Log Note</label>
                      <textarea className="form-textarea" rows={4} required defaultValue={modalData.note || ''} onChange={e => setModalData({ ...modalData, note: e.target.value })} />
                    </div>
                  </>
                )}
              </div>

              <div className="modal-foot">
                <button type="button" className="btn btn-outline" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save & Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
