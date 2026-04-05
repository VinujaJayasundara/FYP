/**
 * Ghost-Tracker — SQLite Database Layer
 * Uses expo-sqlite for on-device persistence.
 * Schema mirrors the bare RN project's schema.ts
 */

import * as SQLite from 'expo-sqlite';

// ── Types ─────────────────────────────────────────────────

export interface DBSession {
  id: string;
  started_at: number;
  ended_at: number | null;
  total_distance_m: number;
  avg_pace_s_per_km: number | null;
  rii_score: number | null;
  is_pb: number; // 0 or 1
  route_id: string;
  created_at: number;
}

export interface DBTelemetryPoint {
  id: string;
  session_id: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  velocity: number | null;
  accuracy: number | null;
  seq_index: number;
}

export interface DBGhostRecord {
  id: string;
  route_id: string;
  session_id: string;
  seq_index: number;
  latitude: number;
  longitude: number;
  timestamp: number;
  pace_s_per_km: number | null;
}

export interface DBLeaderboardEntry {
  id: string;
  device_id: string;
  user_alias: string;
  route_id: string;
  rii_score: number;
  total_time_s: number;
  synced_at: number | null;
  created_at: number;
}

// ── Database Manager ──────────────────────────────────────

let db: SQLite.SQLiteDatabase | null = null;

function generateId(): string {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('ghost_tracker.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = 2000;

    CREATE TABLE IF NOT EXISTS run_sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      total_distance_m REAL DEFAULT 0,
      avg_pace_s_per_km REAL,
      rii_score REAL,
      is_pb INTEGER DEFAULT 0,
      route_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_points (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      velocity REAL,
      accuracy REAL,
      seq_index INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES run_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS ghost_records (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      seq_index INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      pace_s_per_km REAL
    );

    CREATE TABLE IF NOT EXISTS leaderboard (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      user_alias TEXT NOT NULL,
      route_id TEXT NOT NULL,
      rii_score REAL NOT NULL,
      total_time_s REAL NOT NULL,
      synced_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crdt_state (
      key TEXT PRIMARY KEY,
      counter REAL NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_profile (
      device_id TEXT PRIMARY KEY,
      user_alias TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_points(session_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_seq ON telemetry_points(session_id, seq_index);
    CREATE INDEX IF NOT EXISTS idx_ghost_route ON ghost_records(route_id);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_route ON leaderboard(route_id, rii_score DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_route ON run_sessions(route_id);
  `);

  console.log('[DB] Database initialized with WAL mode');
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ── Session Repository ────────────────────────────────────

export async function createSession(routeId: string): Promise<string> {
  const id = generateId();
  const now = Date.now();
  await getDb().runAsync(
    `INSERT INTO run_sessions (id, started_at, total_distance_m, route_id, created_at)
     VALUES (?, ?, 0, ?, ?)`,
    [id, now, routeId, now],
  );
  return id;
}

export async function finalizeSession(
  sessionId: string,
  distanceM: number,
  avgPace: number | null,
  riiScore: number | null,
): Promise<void> {
  await getDb().runAsync(
    `UPDATE run_sessions SET ended_at = ?, total_distance_m = ?, avg_pace_s_per_km = ?, rii_score = ?
     WHERE id = ?`,
    [Date.now(), distanceM, avgPace, riiScore, sessionId],
  );
}

export async function markAsPB(sessionId: string, routeId: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE run_sessions SET is_pb = 0 WHERE route_id = ?`,
    [routeId],
  );
  await getDb().runAsync(
    `UPDATE run_sessions SET is_pb = 1 WHERE id = ?`,
    [sessionId],
  );
}

export async function getPBSession(routeId: string): Promise<DBSession | null> {
  const row = await getDb().getFirstAsync<DBSession>(
    `SELECT * FROM run_sessions WHERE route_id = ? AND is_pb = 1`,
    [routeId],
  );
  return row || null;
}

export async function getAllSessions(): Promise<DBSession[]> {
  return await getDb().getAllAsync<DBSession>(
    `SELECT * FROM run_sessions ORDER BY created_at DESC`,
  );
}

export async function getRouteSessions(routeId: string): Promise<DBSession[]> {
  return await getDb().getAllAsync<DBSession>(
    `SELECT * FROM run_sessions WHERE route_id = ? ORDER BY created_at DESC`,
    [routeId],
  );
}

// ── Telemetry Repository ──────────────────────────────────

export async function insertTelemetry(
  sessionId: string,
  lat: number,
  lon: number,
  timestamp: number,
  velocity: number | null,
  accuracy: number | null,
  seqIndex: number,
): Promise<void> {
  const id = generateId();
  await getDb().runAsync(
    `INSERT INTO telemetry_points (id, session_id, latitude, longitude, timestamp, velocity, accuracy, seq_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, lat, lon, timestamp, velocity, accuracy, seqIndex],
  );
}

export async function getSessionTelemetry(sessionId: string): Promise<DBTelemetryPoint[]> {
  return await getDb().getAllAsync<DBTelemetryPoint>(
    `SELECT * FROM telemetry_points WHERE session_id = ? ORDER BY seq_index`,
    [sessionId],
  );
}

// ── Ghost Repository ──────────────────────────────────────

export async function saveGhostFromSession(
  routeId: string,
  sessionId: string,
  telemetry: DBTelemetryPoint[],
  paces: (number | null)[],
): Promise<void> {
  // Clear existing ghosts for this route
  await getDb().runAsync(`DELETE FROM ghost_records WHERE route_id = ?`, [routeId]);

  for (let i = 0; i < telemetry.length; i++) {
    const t = telemetry[i];
    const id = generateId();
    await getDb().runAsync(
      `INSERT INTO ghost_records (id, route_id, session_id, seq_index, latitude, longitude, timestamp, pace_s_per_km)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, routeId, sessionId, t.seq_index, t.latitude, t.longitude, t.timestamp, paces[i] ?? null],
    );
  }
}

export async function getGhostRecords(routeId: string): Promise<DBGhostRecord[]> {
  return await getDb().getAllAsync<DBGhostRecord>(
    `SELECT * FROM ghost_records WHERE route_id = ? ORDER BY seq_index`,
    [routeId],
  );
}

// ── Leaderboard Repository ────────────────────────────────

export async function upsertLeaderboard(
  deviceId: string,
  userAlias: string,
  routeId: string,
  riiScore: number,
  totalTimeS: number,
): Promise<void> {
  const existing = await getDb().getFirstAsync<{ id: string; rii_score: number }>(
    `SELECT id, rii_score FROM leaderboard WHERE device_id = ? AND route_id = ?`,
    [deviceId, routeId],
  );

  if (existing) {
    if (riiScore > existing.rii_score) {
      await getDb().runAsync(
        `UPDATE leaderboard SET rii_score = ?, total_time_s = ?, user_alias = ? WHERE id = ?`,
        [riiScore, totalTimeS, userAlias, existing.id],
      );
    }
  } else {
    const id = generateId();
    await getDb().runAsync(
      `INSERT INTO leaderboard (id, device_id, user_alias, route_id, rii_score, total_time_s, synced_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, deviceId, userAlias, routeId, riiScore, totalTimeS, Date.now()],
    );
  }
}

export async function getLeaderboard(routeId?: string): Promise<DBLeaderboardEntry[]> {
  if (routeId) {
    return await getDb().getAllAsync<DBLeaderboardEntry>(
      `SELECT * FROM leaderboard WHERE route_id = ? ORDER BY rii_score DESC`,
      [routeId],
    );
  }
  return await getDb().getAllAsync<DBLeaderboardEntry>(
    `SELECT * FROM leaderboard ORDER BY rii_score DESC`,
  );
}

// ── CRDT State ────────────────────────────────────────────

export async function getCRDTState(): Promise<Record<string, number>> {
  const rows = await getDb().getAllAsync<{ key: string; counter: number }>(
    `SELECT key, counter FROM crdt_state`,
  );
  const state: Record<string, number> = {};
  for (const row of rows) state[row.key] = row.counter;
  return state;
}

export async function saveCRDTState(state: Record<string, number>): Promise<void> {
  await getDb().runAsync(`DELETE FROM crdt_state`);
  const now = Date.now();
  for (const [key, counter] of Object.entries(state)) {
    await getDb().runAsync(
      `INSERT INTO crdt_state (key, counter, updated_at) VALUES (?, ?, ?)`,
      [key, counter, now],
    );
  }
}

// ── Device Profile ────────────────────────────────────────

export async function getOrCreateDeviceProfile(alias: string = 'Runner'): Promise<{ deviceId: string; userAlias: string }> {
  const existing = await getDb().getFirstAsync<{ device_id: string; user_alias: string }>(
    `SELECT device_id, user_alias FROM device_profile LIMIT 1`,
  );
  if (existing) return { deviceId: existing.device_id, userAlias: existing.user_alias };

  const deviceId = generateId() + '-' + generateId();
  await getDb().runAsync(
    `INSERT INTO device_profile (device_id, user_alias, created_at) VALUES (?, ?, ?)`,
    [deviceId, alias, Date.now()],
  );
  return { deviceId, userAlias: alias };
}

// ── Stats ─────────────────────────────────────────────────

export async function getSessionCount(): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM run_sessions WHERE ended_at IS NOT NULL`,
  );
  return row?.count ?? 0;
}

export async function getTotalDistance(): Promise<number> {
  const row = await getDb().getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(total_distance_m), 0) as total FROM run_sessions WHERE ended_at IS NOT NULL`,
  );
  return row?.total ?? 0;
}
