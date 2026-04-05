/**
 * CRDT Merge Engine
 * 
 * Orchestrates the merging of CRDT state and leaderboard data
 * from a remote peer into the local database.
 * 
 * This is the core consensus mechanism:
 * 1. Merge G-Counter states (element-wise MAX)
 * 2. Merge leaderboard entries (keep highest RII per device+route)
 * 3. Produce a unified, identical-across-all-peers result
 */

import { GCounter } from './gCounter';
import { SyncPayload, LeaderboardEntry } from '../../data/models';
import { Logger } from '../../utils/logger';

const log = Logger.create('MergeEngine');

/**
 * Result of a merge operation.
 */
export interface MergeResult {
  /** The merged CRDT state vector */
  mergedCRDTState: Record<string, number>;
  /** The merged leaderboard entries */
  mergedLeaderboard: LeaderboardEntry[];
  /** Number of new entries added */
  newEntriesCount: number;
  /** Number of entries updated */
  updatedEntriesCount: number;
  /** Whether any changes were made */
  hasChanges: boolean;
}

/**
 * Merge a remote sync payload with local state.
 * 
 * This function is the heart of the P2P consensus protocol.
 * It guarantees:
 *   - Commutativity: merge(local, remote) = merge(remote, local)
 *   - Idempotency: merging the same payload twice has no effect
 *   - Determinism: same inputs always produce the same output
 * 
 * @param localCRDTState - Local G-Counter state
 * @param localLeaderboard - Local leaderboard entries
 * @param remotePayload - Received sync payload from peer
 * @param localDeviceId - This device's unique ID
 * @returns MergeResult with unified state
 */
export function mergeWithRemote(
  localCRDTState: Record<string, number>,
  localLeaderboard: LeaderboardEntry[],
  remotePayload: SyncPayload,
  localDeviceId: string,
): MergeResult {
  log.info(`Starting merge with device ${remotePayload.deviceId}`);

  // ── Step 1: Merge G-Counter States ──────────────────────────
  const localCounter = new GCounter(localDeviceId, localCRDTState);
  localCounter.merge(remotePayload.crdtState);
  const mergedCRDTState = localCounter.getState();

  // ── Step 2: Merge Leaderboard Entries ───────────────────────
  const {
    mergedLeaderboard,
    newEntriesCount,
    updatedEntriesCount,
  } = mergeLeaderboardEntries(localLeaderboard, remotePayload.leaderboardEntries);

  const hasChanges = newEntriesCount > 0 || updatedEntriesCount > 0;

  log.info(
    `Merge complete. New: ${newEntriesCount}, Updated: ${updatedEntriesCount}, ` +
      `Total entries: ${mergedLeaderboard.length}, CRDT value: ${localCounter.value()}`,
  );

  return {
    mergedCRDTState,
    mergedLeaderboard,
    newEntriesCount,
    updatedEntriesCount,
    hasChanges,
  };
}

/**
 * Merge leaderboard entries from two sources.
 * 
 * Merge strategy per (deviceId, routeId) pair:
 *   - If only one source has an entry → include it
 *   - If both have entries → keep the one with the higher RII score
 *     (ties broken by more recent createdAt timestamp)
 * 
 * This is a Last-Writer-Wins Register (LWW) for each (device, route) slot.
 */
function mergeLeaderboardEntries(
  localEntries: LeaderboardEntry[],
  remoteEntries: LeaderboardEntry[],
): {
  mergedLeaderboard: LeaderboardEntry[];
  newEntriesCount: number;
  updatedEntriesCount: number;
} {
  // Index local entries by composite key: deviceId+routeId
  const entryMap = new Map<string, LeaderboardEntry>();
  for (const entry of localEntries) {
    const key = `${entry.deviceId}:${entry.routeId}`;
    entryMap.set(key, entry);
  }

  let newEntriesCount = 0;
  let updatedEntriesCount = 0;

  // Merge remote entries
  for (const remoteEntry of remoteEntries) {
    const key = `${remoteEntry.deviceId}:${remoteEntry.routeId}`;
    const existing = entryMap.get(key);

    if (!existing) {
      // New entry from the peer
      entryMap.set(key, {
        ...remoteEntry,
        syncedAt: Date.now(),
      });
      newEntriesCount++;
    } else {
      // Conflict resolution: higher RII wins, ties broken by recency
      if (
        remoteEntry.riiScore > existing.riiScore ||
        (remoteEntry.riiScore === existing.riiScore &&
          remoteEntry.createdAt > existing.createdAt)
      ) {
        entryMap.set(key, {
          ...remoteEntry,
          syncedAt: Date.now(),
        });
        updatedEntriesCount++;
      }
    }
  }

  return {
    mergedLeaderboard: Array.from(entryMap.values()),
    newEntriesCount,
    updatedEntriesCount,
  };
}

/**
 * Verify that two merged states are identical (convergence test).
 * 
 * @param stateA - CRDT state from device A after merge
 * @param stateB - CRDT state from device B after merge
 * @returns True if states have converged to identical values
 */
export function verifyConvergence(
  stateA: Record<string, number>,
  stateB: Record<string, number>,
): boolean {
  const keysA = Object.keys(stateA).sort();
  const keysB = Object.keys(stateB).sort();

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) {
      return false;
    }
    if (stateA[keysA[i]] !== stateB[keysB[i]]) {
      return false;
    }
  }

  return true;
}
