/**
 * Ghost-Tracker Core Algorithms
 * Pure TypeScript — no native dependencies
 */

const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_M = 6371000;

// ── Haversine ─────────────────────────────────────────────

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function haversineDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineDistanceM(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  return haversineDistanceKm(lat1, lon1, lat2, lon2) * 1000;
}

// ── RII Engine ────────────────────────────────────────────

export function calculateRII(pbPace: number, currentPace: number): number {
  if (pbPace <= 0 || currentPace <= 0 || !isFinite(pbPace) || !isFinite(currentPace)) return 0;
  return pbPace / currentPace;
}

export function getRIIStatus(rii: number): { label: string; emoji: string; color: string } {
  if (rii <= 0) return { label: 'Calculating...', emoji: '⏳', color: '#888' };
  if (rii >= 1.1) return { label: 'Crushing It!', emoji: '🔥', color: '#22c55e' };
  if (rii >= 1.0) return { label: 'On Pace', emoji: '✅', color: '#3b82f6' };
  if (rii >= 0.95) return { label: 'Slightly Behind', emoji: '😤', color: '#f59e0b' };
  return { label: 'Behind Ghost', emoji: '👻', color: '#ef4444' };
}

// ── Pace Calculator ───────────────────────────────────────

export function calculatePace(distanceM: number, timeS: number): number {
  if (distanceM <= 0 || timeS <= 0) return Infinity;
  return timeS / (distanceM / 1000);
}

export function formatPace(sPerKm: number): string {
  if (!isFinite(sPerKm) || sPerKm <= 0) return '--:--';
  const min = Math.floor(sPerKm / 60);
  const sec = Math.floor(sPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function formatTime(totalSeconds: number): string {
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── GPS Filter ────────────────────────────────────────────

export function isValidGPS(velocityMs: number | null, accuracyM: number | null): boolean {
  if (velocityMs !== null && velocityMs * 3.6 > 25) return false;
  if (accuracyM !== null && accuracyM > 50) return false;
  return true;
}

// ── G-Counter CRDT ────────────────────────────────────────

export class GCounter {
  private state: Record<string, number> = {};

  constructor(private replicaId: string) {
    this.state[replicaId] = 0;
  }

  increment(amount: number = 1): void {
    this.state[this.replicaId] = (this.state[this.replicaId] || 0) + amount;
  }

  value(): number {
    return Object.values(this.state).reduce((sum, v) => sum + v, 0);
  }

  merge(remoteState: Record<string, number>): void {
    const allKeys = new Set([...Object.keys(this.state), ...Object.keys(remoteState)]);
    for (const key of allKeys) {
      this.state[key] = Math.max(this.state[key] || 0, remoteState[key] || 0);
    }
  }

  getState(): Record<string, number> {
    return { ...this.state };
  }
}
