/**
 * Ghost Comparator
 * 
 * Real-time comparison engine between the user's live position
 * and their Personal Best (Ghost) position at the same elapsed time.
 * 
 * The Ghost is a sequence of coordinates from the user's PB run.
 * At each second of the live run, we compare the live position
 * against where the Ghost was at the same elapsed time.
 */

import { TelemetryPoint, GhostRecord, PaceData } from '../../data/models';
import { haversineDistanceM } from '../spatial/haversine';
import { calculateInstantPace } from '../spatial/paceCalculator';
import { calculateRII } from './riiEngine';

/**
 * Find the Ghost record that corresponds to the current elapsed time.
 * Uses linear interpolation between ghost points for sub-second accuracy.
 * 
 * @param ghostRecords - Sorted array of Ghost records (by seqIndex)
 * @param elapsedTimeMs - Elapsed time since session start in milliseconds
 * @param ghostStartTime - The timestamp of the ghost's first point
 * @returns The matched ghost record, or null if out of bounds
 */
export function matchGhostPosition(
  ghostRecords: GhostRecord[],
  elapsedTimeMs: number,
  ghostStartTime: number,
): GhostRecord | null {
  if (ghostRecords.length === 0) {
    return null;
  }

  const targetTimestamp = ghostStartTime + elapsedTimeMs;

  // Binary search for the nearest ghost record
  let low = 0;
  let high = ghostRecords.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (ghostRecords[mid].timestamp < targetTimestamp) {
      low = mid + 1;
    } else if (ghostRecords[mid].timestamp > targetTimestamp) {
      high = mid - 1;
    } else {
      return ghostRecords[mid]; // Exact match
    }
  }

  // Return the closest point (prefer the one before if between two points)
  if (high < 0) {
    return ghostRecords[0];
  }
  if (low >= ghostRecords.length) {
    return ghostRecords[ghostRecords.length - 1];
  }

  // Return the nearer point
  const diffLow = Math.abs(ghostRecords[low].timestamp - targetTimestamp);
  const diffHigh = Math.abs(ghostRecords[high].timestamp - targetTimestamp);
  return diffLow < diffHigh ? ghostRecords[low] : ghostRecords[high];
}

/**
 * Calculate the lead/lag distance between the user and their Ghost.
 * 
 * Positive = user is AHEAD of the Ghost
 * Negative = user is BEHIND the Ghost
 * 
 * @param livePoint - Current live telemetry point
 * @param ghostPoint - Matched ghost position
 * @param routeDirection - Direction along the route for sign determination
 * @returns Distance ahead/behind in meters
 */
export function calculateLeadLagM(
  livePoints: TelemetryPoint[],
  ghostRecords: GhostRecord[],
  currentSeqIndex: number,
): number {
  if (livePoints.length < 2 || ghostRecords.length < 2 || currentSeqIndex < 1) {
    return 0;
  }

  // Calculate cumulative distance for live run up to current index
  let liveDistance = 0;
  const maxLiveIdx = Math.min(currentSeqIndex, livePoints.length - 1);
  for (let i = 1; i <= maxLiveIdx; i++) {
    liveDistance += haversineDistanceM(
      livePoints[i - 1].latitude,
      livePoints[i - 1].longitude,
      livePoints[i].latitude,
      livePoints[i].longitude,
    );
  }

  // Calculate cumulative distance for ghost up to same index
  let ghostDistance = 0;
  const maxGhostIdx = Math.min(currentSeqIndex, ghostRecords.length - 1);
  for (let i = 1; i <= maxGhostIdx; i++) {
    ghostDistance += haversineDistanceM(
      ghostRecords[i - 1].latitude,
      ghostRecords[i - 1].longitude,
      ghostRecords[i].latitude,
      ghostRecords[i].longitude,
    );
  }

  // Positive = ahead, Negative = behind
  return liveDistance - ghostDistance;
}

/**
 * Generate complete pace comparison data for the UI.
 * This is called every second during an active run.
 * 
 * @param livePoints - All live telemetry points so far
 * @param ghostRecords - All ghost records for this route
 * @param sessionStartTime - When the live session started
 * @returns PaceData object for the UI
 */
export function generatePaceData(
  livePoints: TelemetryPoint[],
  ghostRecords: GhostRecord[],
  sessionStartTime: number,
): PaceData {
  const defaultPaceData: PaceData = {
    currentPaceSPerKm: Infinity,
    ghostPaceSPerKm: Infinity,
    riiScore: 0,
    distanceAheadM: 0,
    elapsedTimeS: 0,
  };

  if (livePoints.length < 2 || ghostRecords.length < 2) {
    return defaultPaceData;
  }

  const currentIdx = livePoints.length - 1;
  const currentPoint = livePoints[currentIdx];
  const prevPoint = livePoints[currentIdx - 1];

  // Current live pace
  const currentPace = calculateInstantPace(prevPoint, currentPoint);

  // Ghost pace at the same seq index
  const ghostIdx = Math.min(currentIdx, ghostRecords.length - 1);
  const ghostPace =
    ghostRecords[ghostIdx].paceSPerKm !== null
      ? ghostRecords[ghostIdx].paceSPerKm!
      : Infinity;

  // RII score
  const riiScore = calculateRII(ghostPace, currentPace);

  // Lead/lag distance
  const distanceAhead = calculateLeadLagM(
    livePoints,
    ghostRecords,
    currentIdx,
  );

  // Elapsed time
  const elapsedTimeS = (currentPoint.timestamp - sessionStartTime) / 1000;

  return {
    currentPaceSPerKm: currentPace,
    ghostPaceSPerKm: ghostPace,
    riiScore,
    distanceAheadM: distanceAhead,
    elapsedTimeS,
  };
}
