/**
 * GPS Noise Filter
 * 
 * Filters out invalid GPS readings caused by:
 * - Multipath interference (signal bouncing off buildings)
 * - GPS drift when stationary
 * - Vehicle spoofing (moving too fast for a runner)
 * - Low-accuracy satellite fixes
 * 
 * This is a critical anti-cheat component and data quality gate.
 */

import { MAX_VELOCITY_KMH, MAX_ACCURACY_M } from '../../utils/constants';
import { TelemetryPoint } from '../../data/models';
import { haversineDistanceM } from './haversine';

/**
 * Result of a GPS validation check.
 */
export interface ValidationResult {
  isValid: boolean;
  rejectionReason: string | null;
}

/**
 * Validate a single telemetry point against quality thresholds.
 * 
 * @param point - The telemetry point to validate
 * @returns Validation result with reason if rejected
 */
export function validateTelemetryPoint(point: TelemetryPoint): ValidationResult {
  // 1. Check for null/invalid coordinates
  if (
    point.latitude === null ||
    point.longitude === null ||
    isNaN(point.latitude) ||
    isNaN(point.longitude)
  ) {
    return { isValid: false, rejectionReason: 'NULL_COORDINATES' };
  }

  // 2. Check latitude bounds (-90 to 90)
  if (point.latitude < -90 || point.latitude > 90) {
    return { isValid: false, rejectionReason: 'LATITUDE_OUT_OF_BOUNDS' };
  }

  // 3. Check longitude bounds (-180 to 180)
  if (point.longitude < -180 || point.longitude > 180) {
    return { isValid: false, rejectionReason: 'LONGITUDE_OUT_OF_BOUNDS' };
  }

  // 4. Check velocity threshold (anti-spoofing / spike rejection)
  if (point.velocity !== null && point.velocity * 3.6 > MAX_VELOCITY_KMH) {
    return {
      isValid: false,
      rejectionReason: `VELOCITY_EXCEEDED: ${(point.velocity * 3.6).toFixed(1)} km/h > ${MAX_VELOCITY_KMH} km/h`,
    };
  }

  // 5. Check GPS accuracy
  if (point.accuracy !== null && point.accuracy > MAX_ACCURACY_M) {
    return {
      isValid: false,
      rejectionReason: `LOW_ACCURACY: ${point.accuracy.toFixed(1)}m > ${MAX_ACCURACY_M}m threshold`,
    };
  }

  return { isValid: true, rejectionReason: null };
}

/**
 * Validate a telemetry point against its predecessor (temporal consistency).
 * Detects impossible teleportation (GPS spikes).
 * 
 * @param prev - Previous telemetry point
 * @param curr - Current telemetry point
 * @returns Validation result 
 */
export function validatePointPair(
  prev: TelemetryPoint,
  curr: TelemetryPoint,
): ValidationResult {
  // Check temporal ordering
  if (curr.timestamp <= prev.timestamp) {
    return { isValid: false, rejectionReason: 'TIMESTAMP_NOT_MONOTONIC' };
  }

  // Calculate implied velocity between points
  const distanceM = haversineDistanceM(
    prev.latitude,
    prev.longitude,
    curr.latitude,
    curr.longitude,
  );
  const timeDeltaS = (curr.timestamp - prev.timestamp) / 1000;

  if (timeDeltaS > 0) {
    const impliedSpeedKmh = (distanceM / timeDeltaS) * 3.6;
    if (impliedSpeedKmh > MAX_VELOCITY_KMH) {
      return {
        isValid: false,
        rejectionReason: `IMPLIED_SPEED_EXCEEDED: ${impliedSpeedKmh.toFixed(1)} km/h (teleportation detected)`,
      };
    }
  }

  return { isValid: true, rejectionReason: null };
}

/**
 * Filter an array of telemetry points, removing invalid readings.
 * Returns only valid points that pass both individual and pair-wise validation.
 * 
 * @param points - Array of raw telemetry points
 * @returns Object containing valid points and rejection log
 */
export function filterTelemetry(points: TelemetryPoint[]): {
  validPoints: TelemetryPoint[];
  rejectedCount: number;
  rejectionLog: Array<{ seqIndex: number; reason: string }>;
} {
  const validPoints: TelemetryPoint[] = [];
  const rejectionLog: Array<{ seqIndex: number; reason: string }> = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];

    // Individual point validation
    const pointResult = validateTelemetryPoint(point);
    if (!pointResult.isValid) {
      rejectionLog.push({
        seqIndex: point.seqIndex,
        reason: pointResult.rejectionReason!,
      });
      continue;
    }

    // Pair-wise validation (compare to last accepted valid point)
    if (validPoints.length > 0) {
      const pairResult = validatePointPair(
        validPoints[validPoints.length - 1],
        point,
      );
      if (!pairResult.isValid) {
        rejectionLog.push({
          seqIndex: point.seqIndex,
          reason: pairResult.rejectionReason!,
        });
        continue;
      }
    }

    validPoints.push(point);
  }

  return {
    validPoints,
    rejectedCount: rejectionLog.length,
    rejectionLog,
  };
}
