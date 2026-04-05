/**
 * G-Counter (Grow-Only Counter) — State-Based CRDT
 * 
 * The fundamental conflict-free data type used in Ghost-Tracker for
 * P2P leaderboard synchronization.
 * 
 * A G-Counter is a distributed counter where:
 * - Each replica (device) maintains its own independent counter
 * - The state is a map: { replicaId → count }
 * - Increment: Only the local replica's counter is incremented
 * - Merge: Take the MAX of each replica's counter from both states
 * - Query: Sum all counters to get the total value
 * 
 * Mathematical Properties (guaranteeing Strong Eventual Consistency):
 *   - Commutative:  merge(A, B) = merge(B, A)
 *   - Associative:  merge(A, merge(B, C)) = merge(merge(A, B), C)
 *   - Idempotent:   merge(A, A) = A
 * 
 * Reference: Shapiro et al., "Conflict-free Replicated Data Types" (2011)
 */

import { Logger } from '../../utils/logger';

const log = Logger.create('GCounter');

export class GCounter {
  private state: Record<string, number>;
  private readonly replicaId: string;

  /**
   * Create a new G-Counter instance.
   * 
   * @param replicaId - Unique identifier for this replica (device UUID)
   * @param initialState - Optional initial state (for restoring from DB)
   */
  constructor(replicaId: string, initialState?: Record<string, number>) {
    this.replicaId = replicaId;
    this.state = initialState ? { ...initialState } : { [replicaId]: 0 };
  }

  /**
   * Increment this replica's counter.
   * Only this device's counter is modified — never a remote counter.
   * 
   * @param amount - Amount to increment by (default: 1)
   */
  increment(amount: number = 1): void {
    if (amount < 0) {
      log.warn('G-Counter cannot decrement. Ignoring negative amount.');
      return;
    }
    this.state[this.replicaId] = (this.state[this.replicaId] || 0) + amount;
  }

  /**
   * Query the total counter value.
   * The global count is the sum of all replica counters.
   * 
   * @returns Total aggregated count across all replicas
   */
  value(): number {
    return Object.values(this.state).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Merge another replica's state into this one.
   * 
   * For each replica ID present in either state, we take the MAX value.
   * This guarantees convergence regardless of merge order.
   * 
   * Proof of correctness:
   *   max(a, b) is commutative:  max(3, 5) = max(5, 3) = 5 ✓
   *   max(a, b) is associative:  max(3, max(4, 5)) = max(max(3, 4), 5) = 5 ✓
   *   max(a, a) is idempotent:   max(3, 3) = 3 ✓
   * 
   * @param remoteState - The state vector received from a peer device
   */
  merge(remoteState: Record<string, number>): void {
    const allKeys = new Set([
      ...Object.keys(this.state),
      ...Object.keys(remoteState),
    ]);

    for (const key of allKeys) {
      const localVal = this.state[key] || 0;
      const remoteVal = remoteState[key] || 0;
      this.state[key] = Math.max(localVal, remoteVal);
    }

    log.debug(`Merged state. New value: ${this.value()}`);
  }

  /**
   * Get the current state vector.
   * Returns a copy to prevent external mutation.
   * 
   * @returns A shallow copy of the internal state map
   */
  getState(): Record<string, number> {
    return { ...this.state };
  }

  /**
   * Get this replica's ID.
   */
  getReplicaId(): string {
    return this.replicaId;
  }

  /**
   * Get only this replica's counter value.
   */
  getLocalValue(): number {
    return this.state[this.replicaId] || 0;
  }

  /**
   * Serialize the counter state to a JSON string.
   * Used for BLE payload transmission.
   */
  serialize(): string {
    return JSON.stringify({
      replicaId: this.replicaId,
      state: this.state,
    });
  }

  /**
   * Deserialize a JSON string back into a G-Counter.
   * Used when receiving BLE payloads.
   */
  static deserialize(json: string): GCounter {
    const data = JSON.parse(json);
    return new GCounter(data.replicaId, data.state);
  }
}
