/**
 * Telemetry Repository
 * 
 * CRUD operations for telemetry_points table.
 * Handles 1Hz GPS coordinate persistence and retrieval.
 */

import { TelemetryPoint } from '../models';
import { dbManager } from './dbManager';
import { generateUUID } from '../../utils/uuid';
import { Logger } from '../../utils/logger';

const log = Logger.create('TelemetryRepo');

/**
 * Insert a single telemetry point.
 */
export async function insertTelemetryPoint(point: Omit<TelemetryPoint, 'id'>): Promise<string> {
  const id = generateUUID();
  await dbManager.execute(
    `INSERT INTO telemetry_points (id, session_id, latitude, longitude, timestamp, velocity, accuracy, seq_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, point.sessionId, point.latitude, point.longitude, point.timestamp, point.velocity, point.accuracy, point.seqIndex],
  );
  return id;
}

/**
 * Bulk insert telemetry points (optimized for batch operations).
 * Uses a transaction for atomicity and performance.
 */
export async function bulkInsertTelemetryPoints(
  points: Array<Omit<TelemetryPoint, 'id'>>,
): Promise<number> {
  const statements = points.map((point) => ({
    sql: `INSERT INTO telemetry_points (id, session_id, latitude, longitude, timestamp, velocity, accuracy, seq_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      generateUUID(),
      point.sessionId,
      point.latitude,
      point.longitude,
      point.timestamp,
      point.velocity,
      point.accuracy,
      point.seqIndex,
    ],
  }));

  await dbManager.executeTransaction(statements);
  log.info(`Bulk inserted ${points.length} telemetry points`);
  return points.length;
}

/**
 * Get all telemetry points for a session, ordered by sequence index.
 */
export async function getSessionTelemetry(sessionId: string): Promise<TelemetryPoint[]> {
  const rows = await dbManager.query<any>(
    `SELECT id, session_id, latitude, longitude, timestamp, velocity, accuracy, seq_index
     FROM telemetry_points
     WHERE session_id = ?
     ORDER BY seq_index ASC`,
    [sessionId],
  );

  return rows.map(mapRowToTelemetryPoint);
}

/**
 * Get the latest N telemetry points for a session (rolling window).
 */
export async function getLatestTelemetry(sessionId: string, count: number): Promise<TelemetryPoint[]> {
  const rows = await dbManager.query<any>(
    `SELECT id, session_id, latitude, longitude, timestamp, velocity, accuracy, seq_index
     FROM telemetry_points
     WHERE session_id = ?
     ORDER BY seq_index DESC
     LIMIT ?`,
    [sessionId, count],
  );

  return rows.map(mapRowToTelemetryPoint).reverse(); // Re-order chronologically
}

/**
 * Count telemetry points for a session.
 */
export async function countSessionTelemetry(sessionId: string): Promise<number> {
  const rows = await dbManager.query<any>(
    'SELECT COUNT(*) as count FROM telemetry_points WHERE session_id = ?',
    [sessionId],
  );
  return rows[0]?.count || 0;
}

/**
 * Delete all telemetry points for a session.
 */
export async function deleteSessionTelemetry(sessionId: string): Promise<number> {
  const result = await dbManager.execute(
    'DELETE FROM telemetry_points WHERE session_id = ?',
    [sessionId],
  );
  return result.rowsAffected;
}

/**
 * Map a database row to a TelemetryPoint object.
 */
function mapRowToTelemetryPoint(row: any): TelemetryPoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    latitude: row.latitude,
    longitude: row.longitude,
    timestamp: row.timestamp,
    velocity: row.velocity,
    accuracy: row.accuracy,
    seqIndex: row.seq_index,
  };
}
