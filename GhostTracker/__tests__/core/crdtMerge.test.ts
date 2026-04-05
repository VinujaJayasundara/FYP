/**
 * Unit Tests: CRDT Merge Engine
 * Tests the full merge pipeline including leaderboard conflict resolution.
 */

import { mergeWithRemote, verifyConvergence } from '../../src/core/crdt/mergeEngine';
import { GCounter } from '../../src/core/crdt/gCounter';
import { LeaderboardEntry, SyncPayload } from '../../src/data/models';

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

function makeEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    id: 'entry-1',
    deviceId: 'device-A',
    userAlias: 'Alice',
    routeId: 'route-1',
    riiScore: 1.0,
    totalTimeS: 600,
    syncedAt: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('CRDT Merge Engine', () => {
  describe('mergeWithRemote', () => {
    test('should merge CRDT states correctly', () => {
      const localState = { 'device-A': 5, 'device-B': 3 };
      const remotePayload: SyncPayload = {
        deviceId: 'device-B',
        timestamp: Date.now(),
        crdtState: { 'device-A': 3, 'device-B': 7 },
        leaderboardEntries: [],
        version: 1,
      };

      const result = mergeWithRemote(localState, [], remotePayload, 'device-A');

      // MAX: device-A = max(5, 3) = 5, device-B = max(3, 7) = 7
      expect(result.mergedCRDTState['device-A']).toBe(5);
      expect(result.mergedCRDTState['device-B']).toBe(7);
    });

    test('should add new leaderboard entries from peer', () => {
      const remotePayload: SyncPayload = {
        deviceId: 'device-B',
        timestamp: Date.now(),
        crdtState: {},
        leaderboardEntries: [
          makeEntry({ id: 'entry-B', deviceId: 'device-B', userAlias: 'Bob', riiScore: 1.15 }),
        ],
        version: 1,
      };

      const result = mergeWithRemote({}, [], remotePayload, 'device-A');

      expect(result.newEntriesCount).toBe(1);
      expect(result.mergedLeaderboard.length).toBe(1);
      expect(result.mergedLeaderboard[0].userAlias).toBe('Bob');
    });

    test('should keep higher RII when merging duplicate entries', () => {
      const localEntries = [
        makeEntry({ riiScore: 1.1 }),
      ];
      const remotePayload: SyncPayload = {
        deviceId: 'device-B',
        timestamp: Date.now(),
        crdtState: {},
        leaderboardEntries: [
          makeEntry({ riiScore: 1.2 }), // Higher RII from peer
        ],
        version: 1,
      };

      const result = mergeWithRemote({}, localEntries, remotePayload, 'device-A');

      expect(result.mergedLeaderboard.length).toBe(1);
      expect(result.mergedLeaderboard[0].riiScore).toBe(1.2); // Higher wins
      expect(result.updatedEntriesCount).toBe(1);
    });

    test('should not downgrade RII when peer has lower score', () => {
      const localEntries = [
        makeEntry({ riiScore: 1.5 }),
      ];
      const remotePayload: SyncPayload = {
        deviceId: 'device-B',
        timestamp: Date.now(),
        crdtState: {},
        leaderboardEntries: [
          makeEntry({ riiScore: 1.2 }), // Lower RII from peer
        ],
        version: 1,
      };

      const result = mergeWithRemote({}, localEntries, remotePayload, 'device-A');

      expect(result.mergedLeaderboard[0].riiScore).toBe(1.5); // Local higher, kept
      expect(result.updatedEntriesCount).toBe(0);
    });
  });

  describe('verifyConvergence', () => {
    test('should return true for identical states', () => {
      const state = { 'device-A': 5, 'device-B': 3 };
      expect(verifyConvergence(state, { ...state })).toBe(true);
    });

    test('should return false for different states', () => {
      expect(verifyConvergence({ 'device-A': 5 }, { 'device-A': 3 })).toBe(false);
    });

    test('should return false for different key sets', () => {
      expect(verifyConvergence({ 'device-A': 5 }, { 'device-B': 5 })).toBe(false);
    });
  });

  describe('Full Bidirectional Merge Convergence', () => {
    test('100 random trials should all converge', () => {
      const TRIALS = 100;
      let converged = 0;

      for (let t = 0; t < TRIALS; t++) {
        const nodeA = new GCounter('device-A');
        const nodeB = new GCounter('device-B');

        // Random operations
        for (let i = 0; i < Math.floor(Math.random() * 20) + 1; i++) {
          nodeA.increment(Math.floor(Math.random() * 100));
        }
        for (let i = 0; i < Math.floor(Math.random() * 20) + 1; i++) {
          nodeB.increment(Math.floor(Math.random() * 100));
        }

        // Create sync payloads
        const payloadA: SyncPayload = {
          deviceId: 'device-A',
          timestamp: Date.now(),
          crdtState: nodeA.getState(),
          leaderboardEntries: [
            makeEntry({ deviceId: 'device-A', riiScore: Math.random() * 2 }),
          ],
          version: 1,
        };
        const payloadB: SyncPayload = {
          deviceId: 'device-B',
          timestamp: Date.now(),
          crdtState: nodeB.getState(),
          leaderboardEntries: [
            makeEntry({ id: 'entry-B', deviceId: 'device-B', userAlias: 'Bob', riiScore: Math.random() * 2 }),
          ],
          version: 1,
        };

        // Bidirectional merge
        const resultA = mergeWithRemote(nodeA.getState(), payloadA.leaderboardEntries, payloadB, 'device-A');
        const resultB = mergeWithRemote(nodeB.getState(), payloadB.leaderboardEntries, payloadA, 'device-B');

        if (verifyConvergence(resultA.mergedCRDTState, resultB.mergedCRDTState)) {
          converged++;
        }
      }

      expect(converged).toBe(TRIALS);
    });
  });
});
