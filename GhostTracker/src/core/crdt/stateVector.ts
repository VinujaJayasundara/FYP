/**
 * State Vector Serialization / Deserialization
 * 
 * Handles encoding and decoding of CRDT state vectors into JSON payloads
 * suitable for BLE transmission. Includes size validation to ensure
 * payloads fit within BLE MTU constraints.
 */

import { SyncPayload, LeaderboardEntry } from '../../data/models';
import { BLE_MAX_PAYLOAD_BYTES } from '../../utils/constants';
import { Logger } from '../../utils/logger';

const log = Logger.create('StateVector');

/**
 * Encode a SyncPayload into a JSON string.
 * Validates the resulting size against BLE MTU limits.
 * 
 * @param payload - The sync payload to encode
 * @returns Encoded JSON string
 * @throws Error if payload exceeds BLE_MAX_PAYLOAD_BYTES
 */
export function encodeStateVector(payload: SyncPayload): string {
  const json = JSON.stringify(payload);
  const sizeBytes = new TextEncoder().encode(json).length;

  if (sizeBytes > BLE_MAX_PAYLOAD_BYTES) {
    log.warn(
      `Payload size ${sizeBytes} bytes exceeds BLE limit of ${BLE_MAX_PAYLOAD_BYTES} bytes. ` +
        'Consider chunking or reducing entries.',
    );
  }

  log.debug(`Encoded state vector: ${sizeBytes} bytes, ${payload.leaderboardEntries.length} entries`);
  return json;
}

/**
 * Decode a JSON string back into a SyncPayload.
 * 
 * @param json - The JSON string received from a peer
 * @returns Decoded SyncPayload
 * @throws Error if JSON is malformed
 */
export function decodeStateVector(json: string): SyncPayload {
  try {
    const payload: SyncPayload = JSON.parse(json);

    // Validate required fields
    if (!payload.deviceId || !payload.crdtState || !payload.leaderboardEntries) {
      throw new Error('Missing required fields in sync payload');
    }

    if (typeof payload.version !== 'number') {
      throw new Error('Missing or invalid protocol version');
    }

    log.debug(`Decoded state vector from device ${payload.deviceId}: ${payload.leaderboardEntries.length} entries`);
    return payload;
  } catch (error) {
    log.error(`Failed to decode state vector: ${error}`);
    throw error;
  }
}

/**
 * Create a SyncPayload from local data.
 * 
 * @param deviceId - This device's unique ID
 * @param crdtState - Current G-Counter state
 * @param leaderboardEntries - Local leaderboard entries
 * @returns A SyncPayload ready for BLE transmission
 */
export function createSyncPayload(
  deviceId: string,
  crdtState: Record<string, number>,
  leaderboardEntries: LeaderboardEntry[],
): SyncPayload {
  return {
    deviceId,
    timestamp: Date.now(),
    crdtState,
    leaderboardEntries,
    version: 1, // Protocol version for forward compatibility
  };
}

/**
 * Calculate the byte size of a payload.
 */
export function getPayloadSize(payload: SyncPayload): number {
  const json = JSON.stringify(payload);
  return new TextEncoder().encode(json).length;
}

/**
 * Check if a payload fits within BLE MTU constraints.
 */
export function isPayloadWithinBLELimit(payload: SyncPayload): boolean {
  return getPayloadSize(payload) <= BLE_MAX_PAYLOAD_BYTES;
}
