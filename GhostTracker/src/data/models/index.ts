/**
 * Ghost-Tracker Data Models
 * TypeScript interfaces for all domain entities.
 * These are the canonical shapes used across the entire application.
 */

// ============================================================
// Telemetry Point — A single GPS reading at 1Hz
// ============================================================
export interface TelemetryPoint {
  id: string;
  sessionId: string;
  latitude: number;
  longitude: number;
  timestamp: number;      // Unix timestamp in milliseconds
  velocity: number | null; // m/s from GNSS sensor
  accuracy: number | null; // GPS accuracy in meters
  seqIndex: number;        // 0-indexed sequential position (1Hz)
}

// ============================================================
// Run Session — A complete running session
// ============================================================
export interface RunSession {
  id: string;
  startedAt: number;       // Unix timestamp in milliseconds
  endedAt: number | null;
  totalDistanceM: number;  // Total distance in meters
  avgPaceSPerKm: number | null; // Average pace in seconds per kilometer
  riiScore: number | null; // Final RII score for this session
  isPB: boolean;           // Is this the current Personal Best?
  routeId: string;         // Identifies which route/track was run
  createdAt: number;
}

// ============================================================
// Ghost Record — A PB data point for ghost comparison
// ============================================================
export interface GhostRecord {
  id: string;
  routeId: string;
  sessionId: string;       // The PB session this ghost belongs to
  seqIndex: number;        // Sequential index matching telemetry
  latitude: number;
  longitude: number;
  timestamp: number;
  paceSPerKm: number | null; // Pace at this point in seconds per km
}

// ============================================================
// Leaderboard Entry — An RII-ranked competitive record
// ============================================================
export interface LeaderboardEntry {
  id: string;
  deviceId: string;        // Unique device UUID (CRDT replica ID)
  userAlias: string;       // Display name for the user
  routeId: string;
  riiScore: number;
  totalTimeS: number;      // Total run time in seconds
  syncedAt: number | null; // When this was received via BLE sync
  createdAt: number;
}

// ============================================================
// CRDT State — A single G-Counter entry
// ============================================================
export interface CRDTState {
  key: string;             // e.g., "leaderboard:route_123:device_abc"
  counter: number;
  updatedAt: number;
}

// ============================================================
// Coordinate — A simple lat/lon pair
// ============================================================
export interface Coordinate {
  latitude: number;
  longitude: number;
}

// ============================================================
// Pace Data — Live pace information for UI display
// ============================================================
export interface PaceData {
  currentPaceSPerKm: number;
  ghostPaceSPerKm: number;
  riiScore: number;
  distanceAheadM: number;  // Positive = ahead of ghost, Negative = behind
  elapsedTimeS: number;
}

// ============================================================
// Sync Payload — The JSON structure exchanged via BLE
// ============================================================
export interface SyncPayload {
  deviceId: string;
  timestamp: number;
  crdtState: Record<string, number>; // G-Counter state vector
  leaderboardEntries: LeaderboardEntry[];
  version: number;         // Protocol version for forward compatibility
}

// ============================================================
// Device Profile — Local user profile stored on device
// ============================================================
export interface DeviceProfile {
  deviceId: string;
  userAlias: string;
  createdAt: number;
}
