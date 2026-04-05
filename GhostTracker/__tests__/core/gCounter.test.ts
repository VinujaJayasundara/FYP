/**
 * Unit Tests: G-Counter CRDT
 * 
 * Tests the core distributed data type used for P2P leaderboard sync.
 * Validates the three mathematical properties required for Strong Eventual Consistency:
 *   1. Commutativity: merge(A, B) = merge(B, A)
 *   2. Associativity: merge(A, merge(B, C)) = merge(merge(A, B), C)
 *   3. Idempotency: merge(A, A) = A
 */

import { GCounter } from '../../src/core/crdt/gCounter';

// Suppress logger output during tests
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

describe('G-Counter CRDT', () => {
  // ── Basic Operations ────────────────────────────────────────
  describe('Basic Operations', () => {
    test('should initialize with 0 value', () => {
      const counter = new GCounter('node-A');
      expect(counter.value()).toBe(0);
    });

    test('should increment the local counter', () => {
      const counter = new GCounter('node-A');
      counter.increment();
      counter.increment();
      counter.increment();
      expect(counter.value()).toBe(3);
    });

    test('should increment by a custom amount', () => {
      const counter = new GCounter('node-A');
      counter.increment(5);
      expect(counter.value()).toBe(5);
    });

    test('should ignore negative increments (G-Counter only grows)', () => {
      const counter = new GCounter('node-A');
      counter.increment(5);
      counter.increment(-3); // Should be ignored
      expect(counter.value()).toBe(5);
    });

    test('should only modify the local replica counter', () => {
      const counter = new GCounter('node-A');
      counter.increment(3);
      const state = counter.getState();
      expect(state['node-A']).toBe(3);
      expect(Object.keys(state).length).toBe(1);
    });

    test('should return the correct local value', () => {
      const counter = new GCounter('node-A');
      counter.increment(7);
      expect(counter.getLocalValue()).toBe(7);
    });
  });

  // ── Merge Operations ────────────────────────────────────────
  describe('Merge Operations', () => {
    test('should merge two independent counters', () => {
      const counterA = new GCounter('node-A');
      const counterB = new GCounter('node-B');

      counterA.increment(3);
      counterB.increment(5);

      counterA.merge(counterB.getState());

      expect(counterA.value()).toBe(8); // 3 + 5
    });

    test('should take MAX for overlapping keys during merge', () => {
      const counterA = new GCounter('node-A');
      const counterB = new GCounter('node-A'); // Same replica ID

      counterA.increment(3);
      counterB.increment(5); // node-A has 5 in B's view

      counterA.merge(counterB.getState());

      expect(counterA.value()).toBe(5); // max(3, 5)
    });

    test('should handle merge with empty state', () => {
      const counter = new GCounter('node-A');
      counter.increment(5);
      counter.merge({});
      expect(counter.value()).toBe(5);
    });
  });

  // ── CRDT Mathematical Properties ───────────────────────────
  describe('Commutativity: merge(A,B) = merge(B,A)', () => {
    test('should produce identical state regardless of merge direction', () => {
      const counterA = new GCounter('node-A');
      const counterB = new GCounter('node-B');

      counterA.increment(3);
      counterB.increment(7);

      // Direction 1: A merges B
      const copy1 = new GCounter('node-A', counterA.getState());
      copy1.merge(counterB.getState());

      // Direction 2: B merges A
      const copy2 = new GCounter('node-B', counterB.getState());
      copy2.merge(counterA.getState());

      // Both should have identical values
      expect(copy1.value()).toBe(copy2.value());
      expect(copy1.getState()['node-A']).toBe(copy2.getState()['node-A']);
      expect(copy1.getState()['node-B']).toBe(copy2.getState()['node-B']);
    });
  });

  describe('Associativity: merge(A, merge(B,C)) = merge(merge(A,B), C)', () => {
    test('should produce identical state regardless of merge grouping', () => {
      const counterA = new GCounter('node-A');
      const counterB = new GCounter('node-B');
      const counterC = new GCounter('node-C');

      counterA.increment(2);
      counterB.increment(4);
      counterC.increment(6);

      // Grouping 1: merge(A, merge(B, C))
      const bcMerge = new GCounter('node-B', counterB.getState());
      bcMerge.merge(counterC.getState());
      const result1 = new GCounter('node-A', counterA.getState());
      result1.merge(bcMerge.getState());

      // Grouping 2: merge(merge(A, B), C)
      const abMerge = new GCounter('node-A', counterA.getState());
      abMerge.merge(counterB.getState());
      const result2 = new GCounter('node-A', abMerge.getState());
      result2.merge(counterC.getState());

      // Both should have identical values
      expect(result1.value()).toBe(result2.value());
      expect(result1.value()).toBe(12); // 2 + 4 + 6
    });
  });

  describe('Idempotency: merge(A, A) = A', () => {
    test('should not change state when merging with itself', () => {
      const counter = new GCounter('node-A');
      counter.increment(5);

      const stateBefore = counter.getState();
      const valueBefore = counter.value();

      counter.merge(counter.getState());

      expect(counter.value()).toBe(valueBefore);
      expect(counter.getState()).toEqual(stateBefore);
    });

    test('should remain stable after repeated self-merges', () => {
      const counter = new GCounter('node-A');
      counter.increment(10);

      for (let i = 0; i < 100; i++) {
        counter.merge(counter.getState());
      }

      expect(counter.value()).toBe(10);
    });
  });

  // ── Convergence Simulation ──────────────────────────────────
  describe('Convergence (Strong Eventual Consistency)', () => {
    test('should converge to identical state after bidirectional merge', () => {
      const counterA = new GCounter('node-A');
      const counterB = new GCounter('node-B');

      // Independent operations
      counterA.increment(10);
      counterA.increment(5);
      counterB.increment(3);
      counterB.increment(7);

      // Save states before merge
      const stateA = counterA.getState();
      const stateB = counterB.getState();

      // Bidirectional merge
      counterA.merge(stateB);
      counterB.merge(stateA);

      // Both should now be identical
      expect(counterA.value()).toBe(counterB.value());
      expect(counterA.getState()).toEqual(counterB.getState());
      expect(counterA.value()).toBe(25); // 15 + 10
    });

    test('should converge with 100 random operations and merge orderings', () => {
      // This is the CORE PROOF for the thesis:
      // 100 random trials, all must converge identically
      const TRIALS = 100;
      let convergenceCount = 0;

      for (let trial = 0; trial < TRIALS; trial++) {
        const nodeA = new GCounter('node-A');
        const nodeB = new GCounter('node-B');

        // Random number of increments for each node
        const opsA = Math.floor(Math.random() * 50) + 1;
        const opsB = Math.floor(Math.random() * 50) + 1;

        for (let i = 0; i < opsA; i++) {
          nodeA.increment(Math.floor(Math.random() * 10) + 1);
        }
        for (let i = 0; i < opsB; i++) {
          nodeB.increment(Math.floor(Math.random() * 10) + 1);
        }

        // Save pre-merge states
        const preStateA = nodeA.getState();
        const preStateB = nodeB.getState();

        // Bidirectional merge
        nodeA.merge(preStateB);
        nodeB.merge(preStateA);

        // Check convergence using sorted key comparison 
        // (JSON.stringify doesn't guarantee key ordering)
        const stateA = nodeA.getState();
        const stateB = nodeB.getState();
        const keysA = Object.keys(stateA).sort();
        const keysB = Object.keys(stateB).sort();
        const keysMatch = keysA.length === keysB.length && keysA.every((k, i) => k === keysB[i]);
        const valsMatch = keysMatch && keysA.every(k => stateA[k] === stateB[k]);

        if (nodeA.value() === nodeB.value() && valsMatch) {
          convergenceCount++;
        }
      }

      expect(convergenceCount).toBe(TRIALS);
    });
  });

  // ── Serialization ───────────────────────────────────────────
  describe('Serialization', () => {
    test('should serialize and deserialize correctly', () => {
      const counter = new GCounter('node-A');
      counter.increment(42);

      const json = counter.serialize();
      const deserialized = GCounter.deserialize(json);

      expect(deserialized.value()).toBe(42);
      expect(deserialized.getReplicaId()).toBe('node-A');
      expect(deserialized.getState()).toEqual(counter.getState());
    });

    test('should preserve multi-node state through serialization', () => {
      const counterA = new GCounter('node-A');
      const counterB = new GCounter('node-B');
      counterA.increment(10);
      counterB.increment(20);
      counterA.merge(counterB.getState());

      const json = counterA.serialize();
      const restored = GCounter.deserialize(json);

      expect(restored.value()).toBe(30);
      expect(restored.getState()['node-A']).toBe(10);
      expect(restored.getState()['node-B']).toBe(20);
    });
  });
});
