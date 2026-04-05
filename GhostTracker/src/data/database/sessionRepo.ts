/**
 * Session Repository
 * 
 * CRUD operations for run_sessions table.
 */

import { RunSession } from '../models';
import { dbManager } from './dbManager';
import { generateUUID } from '../../utils/uuid';
import { Logger } from '../../utils/logger';

const log = Logger.create('SessionRepo');

/**
 * Create a new run session.
 */
export async function createSession(
  routeId: string,
): Promise<RunSession> {
  const session: RunSession = {
    id: generateUUID(),
    startedAt: Date.now(),
    endedAt: null,
    totalDistanceM: 0,
    avgPaceSPerKm: null,
    riiScore: null,
    isPB: false,
    routeId,
    createdAt: Date.now(),
  };

  await dbManager.execute(
    `INSERT INTO run_sessions (id, started_at, ended_at, total_distance_m, avg_pace_s_per_km, rii_score, is_pb, route_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.startedAt,
      session.endedAt,
      session.totalDistanceM,
      session.avgPaceSPerKm,
      session.riiScore,
      session.isPB ? 1 : 0,
      session.routeId,
      session.createdAt,
    ],
  );

  log.info(`Created session ${session.id} for route ${routeId}`);
  return session;
}

/**
 * Finalize a session with computed metrics.
 */
export async function finalizeSession(
  sessionId: string,
  totalDistanceM: number,
  avgPaceSPerKm: number,
  riiScore: number | null,
): Promise<void> {
  await dbManager.execute(
    `UPDATE run_sessions
     SET ended_at = ?, total_distance_m = ?, avg_pace_s_per_km = ?, rii_score = ?
     WHERE id = ?`,
    [Date.now(), totalDistanceM, avgPaceSPerKm, riiScore, sessionId],
  );
  log.info(`Finalized session ${sessionId}: ${totalDistanceM.toFixed(0)}m, RII=${riiScore?.toFixed(2)}`);
}

/**
 * Mark a session as the Personal Best for its route.
 * Clears the previous PB for the same route.
 */
export async function markAsPB(sessionId: string, routeId: string): Promise<void> {
  await dbManager.executeTransaction([
    { sql: 'UPDATE run_sessions SET is_pb = 0 WHERE route_id = ? AND is_pb = 1', params: [routeId] },
    { sql: 'UPDATE run_sessions SET is_pb = 1 WHERE id = ?', params: [sessionId] },
  ]);
  log.info(`Session ${sessionId} marked as PB for route ${routeId}`);
}

/**
 * Get the current PB session for a route.
 */
export async function getPBSession(routeId: string): Promise<RunSession | null> {
  const rows = await dbManager.query<any>(
    `SELECT * FROM run_sessions WHERE route_id = ? AND is_pb = 1 LIMIT 1`,
    [routeId],
  );
  return rows.length > 0 ? mapRowToSession(rows[0]) : null;
}

/**
 * Get a session by ID.
 */
export async function getSession(sessionId: string): Promise<RunSession | null> {
  const rows = await dbManager.query<any>(
    'SELECT * FROM run_sessions WHERE id = ?',
    [sessionId],
  );
  return rows.length > 0 ? mapRowToSession(rows[0]) : null;
}

/**
 * Get all sessions for a route, ordered by most recent first.
 */
export async function getRouteSessions(routeId: string): Promise<RunSession[]> {
  const rows = await dbManager.query<any>(
    'SELECT * FROM run_sessions WHERE route_id = ? ORDER BY started_at DESC',
    [routeId],
  );
  return rows.map(mapRowToSession);
}

/**
 * Get all sessions, ordered by most recent first.
 */
export async function getAllSessions(): Promise<RunSession[]> {
  const rows = await dbManager.query<any>(
    'SELECT * FROM run_sessions ORDER BY started_at DESC',
  );
  return rows.map(mapRowToSession);
}

/**
 * Delete a session and all its telemetry.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await dbManager.executeTransaction([
    { sql: 'DELETE FROM telemetry_points WHERE session_id = ?', params: [sessionId] },
    { sql: 'DELETE FROM run_sessions WHERE id = ?', params: [sessionId] },
  ]);
  log.info(`Deleted session ${sessionId}`);
}

function mapRowToSession(row: any): RunSession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalDistanceM: row.total_distance_m,
    avgPaceSPerKm: row.avg_pace_s_per_km,
    riiScore: row.rii_score,
    isPB: row.is_pb === 1,
    routeId: row.route_id,
    createdAt: row.created_at,
  };
}
