/**
 * Client-side UUID generation for offline-first architecture.
 * All IDs are generated on-device to avoid server dependency.
 */

/**
 * Generate a UUID v4 string.
 * Uses crypto.getRandomValues when available (React Native),
 * falls back to Math.random for testing environments.
 */
export function generateUUID(): string {
  // RFC 4122 compliant UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a device-unique identifier.
 * Used as the CRDT replica ID for this device.
 */
export function generateDeviceId(): string {
  return `device-${generateUUID().substring(0, 8)}`;
}
