/**
 * SQLite Database Schema
 * 
 * Defines all table creation SQL for Ghost-Tracker.
 * All tables use TEXT PRIMARY KEY (UUID) for offline-first compatibility.
 * 
 * Tables:
 *   1. run_sessions     — Complete running session records
 *   2. telemetry_points — Individual 1Hz GPS readings
 *   3. ghost_records    — Personal Best data points (the Ghost)
 *   4. leaderboard      — RII-ranked competitive entries
 *   5. crdt_state       — G-Counter state persistence
 *   6. device_profile   — Local device identity
 */

/**
 * SQL statements to create all tables.
 * Executed in order (respects foreign key dependencies).
 */
export const CREATE_TABLES_SQL: string[] = [
  // ── Device Profile ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS device_profile (
    device_id   TEXT PRIMARY KEY,
    user_alias  TEXT NOT NULL DEFAULT 'Runner',
    created_at  INTEGER NOT NULL
  );`,

  // ── Run Sessions ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS run_sessions (
    id                TEXT PRIMARY KEY,
    started_at        INTEGER NOT NULL,
    ended_at          INTEGER,
    total_distance_m  REAL DEFAULT 0,
    avg_pace_s_per_km REAL,
    rii_score         REAL,
    is_pb             INTEGER DEFAULT 0,
    route_id          TEXT NOT NULL,
    created_at        INTEGER NOT NULL
  );`,

  // ── Telemetry Points ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS telemetry_points (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    latitude    REAL NOT NULL,
    longitude   REAL NOT NULL,
    timestamp   INTEGER NOT NULL,
    velocity    REAL,
    accuracy    REAL,
    seq_index   INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES run_sessions(id)
  );`,

  // ── Ghost Records ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ghost_records (
    id            TEXT PRIMARY KEY,
    route_id      TEXT NOT NULL,
    session_id    TEXT NOT NULL,
    seq_index     INTEGER NOT NULL,
    latitude      REAL NOT NULL,
    longitude     REAL NOT NULL,
    timestamp     INTEGER NOT NULL,
    pace_s_per_km REAL,
    FOREIGN KEY (session_id) REFERENCES run_sessions(id)
  );`,

  // ── Leaderboard ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS leaderboard (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    user_alias  TEXT NOT NULL,
    route_id    TEXT NOT NULL,
    rii_score   REAL NOT NULL,
    total_time_s REAL NOT NULL,
    synced_at   INTEGER,
    created_at  INTEGER NOT NULL
  );`,

  // ── CRDT State ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS crdt_state (
    key         TEXT PRIMARY KEY,
    counter     INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL
  );`,
];

/**
 * SQL statements to create performance indices.
 */
export const CREATE_INDICES_SQL: string[] = [
  // Fast telemetry queries by session + sequential order
  'CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_points(session_id, seq_index);',

  // Fast telemetry queries by timestamp range
  'CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_points(session_id, timestamp);',

  // Fast ghost lookups by route + sequential order
  'CREATE INDEX IF NOT EXISTS idx_ghost_route ON ghost_records(route_id, seq_index);',

  // Fast leaderboard queries by route + RII ranking
  'CREATE INDEX IF NOT EXISTS idx_leaderboard_route ON leaderboard(route_id, rii_score DESC);',

  // Fast leaderboard queries by device
  'CREATE INDEX IF NOT EXISTS idx_leaderboard_device ON leaderboard(device_id, route_id);',

  // Fast session lookups by route
  'CREATE INDEX IF NOT EXISTS idx_sessions_route ON run_sessions(route_id, is_pb);',
];

/**
 * SQL to drop all tables (for testing/reset purposes).
 */
export const DROP_ALL_TABLES_SQL: string[] = [
  'DROP TABLE IF EXISTS crdt_state;',
  'DROP TABLE IF EXISTS leaderboard;',
  'DROP TABLE IF EXISTS ghost_records;',
  'DROP TABLE IF EXISTS telemetry_points;',
  'DROP TABLE IF EXISTS run_sessions;',
  'DROP TABLE IF EXISTS device_profile;',
];

/**
 * Pragmas for optimizing SQLite performance.
 * WAL mode enables concurrent reads/writes without blocking the UI thread.
 */
export const PRAGMA_SQL: string[] = [
  'PRAGMA journal_mode = WAL;',           // Write-Ahead Logging for async writes
  'PRAGMA synchronous = NORMAL;',         // Balance between safety and speed
  'PRAGMA cache_size = -2000;',           // 2MB cache
  'PRAGMA foreign_keys = ON;',            // Enforce referential integrity
  'PRAGMA temp_store = MEMORY;',          // Keep temp tables in memory
];
