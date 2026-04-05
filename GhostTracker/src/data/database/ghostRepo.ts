/**
 * Ghost Repository
 * 
 * CRUD operations for ghost_records table.
 * Manages Personal Best (PB) data points that form the Ghost.
 */

import { GhostRecord } from '../models';
import { dbManager } from './dbManager';
import { generateUUID } from '../../utils/uuid';
import { Logger } from '../../utils/logger';

const log = Logger.create('GhostRepo');

/**
 * Create ghost records from a PB session's telemetry.
 * Copies telemetry points into ghost_records for a specific route.
 */
export async function createGhostFromSession(
  routeId: string,
  sessionId: string,
  points: Array<{
    seqIndex: number;
    latitude: number;
    longitude: number;
    timestamp: number;
    paceSPerKm: number | null;
  }>,
): Promise<number> {
  // First, clear any existing ghost for this route
  await dbManager.execute(
    'DELETE FROM ghost_records WHERE route_id = ?',
    [routeId],
  );

  // Insert new ghost records
  const statements = points.map((point) => ({
    sql: `INSERT INTO ghost_records (id, route_id, session_id, seq_index, latitude, longitude, timestamp, pace_s_per_km)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      generateUUID(),
      routeId,
      sessionId,
      point.seqIndex,
      point.latitude,
      point.longitude,
      point.timestamp,
      point.paceSPerKm,
    ],
  }));

  await dbManager.executeTransaction(statements);
  log.info(`Created ghost with ${points.length} points for route ${routeId}`);
  return points.length;
}

/**
 * Get all ghost records for a route, ordered by sequence index.
 */
export async function getRouteGhost(routeId: string): Promise<GhostRecord[]> {
  const rows = await dbManager.query<any>(
    `SELECT id, route_id, session_id, seq_index, latitude, longitude, timestamp, pace_s_per_km
     FROM ghost_records
     WHERE route_id = ?
     ORDER BY seq_index ASC`,
    [routeId],
  );

  return rows.map(mapRowToGhostRecord);
}

/**
 * Check if a ghost exists for a route.
 */
export async function hasGhost(routeId: string): Promise<boolean> {
  const rows = await dbManager.query<any>(
    'SELECT COUNT(*) as count FROM ghost_records WHERE route_id = ?',
    [routeId],
  );
  return (rows[0]?.count || 0) > 0;
}

/**
 * Delete ghost records for a route.
 */
export async function deleteRouteGhost(routeId: string): Promise<number> {
  const result = await dbManager.execute(
    'DELETE FROM ghost_records WHERE route_id = ?',
    [routeId],
  );
  return result.rowsAffected;
}

/**
 * Map a database row to a GhostRecord object.
 */
function mapRowToGhostRecord(row: any): GhostRecord {
  return {
    id: row.id,
    routeId: row.route_id,
    sessionId: row.session_id,
    seqIndex: row.seq_index,
    latitude: row.latitude,
    longitude: row.longitude,
    timestamp: row.timestamp,
    paceSPerKm: row.pace_s_per_km,
  };
}
