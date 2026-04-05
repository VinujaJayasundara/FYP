/**
 * Leaderboard Repository
 * 
 * CRUD operations for leaderboard table.
 * Handles RII-ranked competitive entries and CRDT state persistence.
 */

import { LeaderboardEntry, CRDTState } from '../models';
import { dbManager } from './dbManager';
import { generateUUID } from '../../utils/uuid';
import { Logger } from '../../utils/logger';

const log = Logger.create('LeaderboardRepo');

// ============================================================
// Leaderboard Operations
// ============================================================

/**
 * Upsert a leaderboard entry.
 * If an entry exists for the same (device_id, route_id), update it if the RII score is higher.
 */
export async function upsertLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id'>): Promise<string> {
  const existing = await dbManager.query<any>(
    'SELECT id, rii_score FROM leaderboard WHERE device_id = ? AND route_id = ?',
    [entry.deviceId, entry.routeId],
  );

  if (existing.length > 0) {
    if (entry.riiScore > existing[0].rii_score) {
      await dbManager.execute(
        `UPDATE leaderboard SET rii_score = ?, total_time_s = ?, user_alias = ?, synced_at = ?, created_at = ?
         WHERE id = ?`,
        [entry.riiScore, entry.totalTimeS, entry.userAlias, entry.syncedAt, entry.createdAt, existing[0].id],
      );
      log.info(`Updated leaderboard entry for ${entry.deviceId} on route ${entry.routeId}: RII=${entry.riiScore.toFixed(2)}`);
      return existing[0].id;
    }
    return existing[0].id; // Existing score is higher, no update needed
  }

  const id = generateUUID();
  await dbManager.execute(
    `INSERT INTO leaderboard (id, device_id, user_alias, route_id, rii_score, total_time_s, synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, entry.deviceId, entry.userAlias, entry.routeId, entry.riiScore, entry.totalTimeS, entry.syncedAt, entry.createdAt],
  );
  log.info(`Inserted leaderboard entry for ${entry.deviceId} on route ${entry.routeId}: RII=${entry.riiScore.toFixed(2)}`);
  return id;
}

/**
 * Get leaderboard for a route, sorted by RII score descending.
 */
export async function getRouteLeaderboard(routeId: string): Promise<LeaderboardEntry[]> {
  const rows = await dbManager.query<any>(
    'SELECT * FROM leaderboard WHERE route_id = ? ORDER BY rii_score DESC',
    [routeId],
  );
  return rows.map(mapRowToLeaderboardEntry);
}

/**
 * Get all leaderboard entries (for BLE sync payload).
 */
export async function getAllLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  const rows = await dbManager.query<any>(
    'SELECT * FROM leaderboard ORDER BY route_id, rii_score DESC',
  );
  return rows.map(mapRowToLeaderboardEntry);
}

/**
 * Replace the entire leaderboard with merged entries (post-CRDT merge).
 */
export async function replaceLeaderboard(entries: LeaderboardEntry[]): Promise<void> {
  const statements = [
    { sql: 'DELETE FROM leaderboard', params: [] as any[] },
    ...entries.map((entry) => ({
      sql: `INSERT INTO leaderboard (id, device_id, user_alias, route_id, rii_score, total_time_s, synced_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [entry.id, entry.deviceId, entry.userAlias, entry.routeId, entry.riiScore, entry.totalTimeS, entry.syncedAt, entry.createdAt],
    })),
  ];

  await dbManager.executeTransaction(statements);
  log.info(`Replaced leaderboard with ${entries.length} merged entries`);
}

// ============================================================
// CRDT State Operations
// ============================================================

/**
 * Get the full CRDT state as a key-value map.
 */
export async function getCRDTState(): Promise<Record<string, number>> {
  const rows = await dbManager.query<any>('SELECT key, counter FROM crdt_state');
  const state: Record<string, number> = {};
  for (const row of rows) {
    state[row.key] = row.counter;
  }
  return state;
}

/**
 * Save the full CRDT state (replaces all existing entries).
 */
export async function saveCRDTState(state: Record<string, number>): Promise<void> {
  const now = Date.now();
  const statements = [
    { sql: 'DELETE FROM crdt_state', params: [] as any[] },
    ...Object.entries(state).map(([key, counter]) => ({
      sql: 'INSERT INTO crdt_state (key, counter, updated_at) VALUES (?, ?, ?)',
      params: [key, counter, now] as any[],
    })),
  ];

  await dbManager.executeTransaction(statements);
  log.debug(`Saved CRDT state with ${Object.keys(state).length} keys`);
}

function mapRowToLeaderboardEntry(row: any): LeaderboardEntry {
  return {
    id: row.id,
    deviceId: row.device_id,
    userAlias: row.user_alias,
    routeId: row.route_id,
    riiScore: row.rii_score,
    totalTimeS: row.total_time_s,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
  };
}
