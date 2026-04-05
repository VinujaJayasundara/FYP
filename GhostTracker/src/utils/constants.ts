/**
 * Ghost-Tracker Constants
 * Central configuration for the PEC Framework
 */

// ============================================================
// GPS & Spatial Constants
// ============================================================
export const EARTH_RADIUS_KM = 6371;
export const EARTH_RADIUS_M = 6371000;

/** Maximum valid velocity in km/h. Points above this are rejected as GPS spikes or vehicle spoofing */
export const MAX_VELOCITY_KMH = 25;

/** Maximum acceptable GPS accuracy in meters. Points with worse accuracy are rejected */
export const MAX_ACCURACY_M = 50;

/** GPS sampling rate in Hz */
export const GPS_SAMPLE_RATE_HZ = 1;

/** GPS sampling interval in milliseconds */
export const GPS_SAMPLE_INTERVAL_MS = 1000;

// ============================================================
// BLE Constants (Phase 4)
// ============================================================
/** Custom BLE Service UUID for Ghost-Tracker sync */
export const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/** BLE Characteristic UUID for reading state vectors */
export const BLE_STATE_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

/** BLE Characteristic UUID for writing sync payloads */
export const BLE_SYNC_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** Maximum BLE payload size in bytes (conservative MTU) */
export const BLE_MAX_PAYLOAD_BYTES = 512;

// ============================================================
// Database Constants
// ============================================================
export const DB_NAME = 'ghost_tracker.db';
export const DB_VERSION = 1;

// ============================================================
// RII Constants
// ============================================================
/** RII threshold indicating the user is outperforming their Ghost */
export const RII_OUTPERFORMING = 1.0;

/** Minimum number of data points required to calculate a valid RII */
export const RII_MIN_POINTS = 5;

// ============================================================
// UI Constants
// ============================================================
/** Target frame rate for UI rendering */
export const TARGET_FPS = 60;

/** Frame budget in milliseconds (1000ms / 60fps ≈ 16.67ms) */
export const FRAME_BUDGET_MS = 1000 / TARGET_FPS;
