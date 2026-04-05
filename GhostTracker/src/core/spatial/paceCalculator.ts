/**
 * Pace Calculator
 * 
 * Converts raw GPS coordinates and timestamps into pace metrics
 * (seconds per kilometer) used by the RII engine.
 * 
 * Pace = time_to_cover_1km (in seconds)
 * Lower pace = faster running. E.g., 300 s/km = 5:00 min/km
 */

import { haversineDistanceM } from './haversine';
import { TelemetryPoint } from '../../data/models';

/**
 * Calculate instantaneous pace between two consecutive telemetry points.
 * 
 * @param prev - Previous GPS point
 * @param curr - Current GPS point
 * @returns Pace in seconds per kilometer. Returns Infinity if no distance covered.
 */
export function calculateInstantPace(
  prev: TelemetryPoint,
  curr: TelemetryPoint,
): number {
  const distanceM = haversineDistanceM(
    prev.latitude,
    prev.longitude,
    curr.latitude,
    curr.longitude,
  );

  if (distanceM <= 0) {
    return Infinity;
  }

  const timeDeltaS = (curr.timestamp - prev.timestamp) / 1000;

  if (timeDeltaS <= 0) {
    return Infinity;
  }

  // Convert: pace (s/km) = timeDelta (s) / distance (km)
  const distanceKm = distanceM / 1000;
  return timeDeltaS / distanceKm;
}

/**
 * Calculate rolling average pace over a window of telemetry points.
 * Uses the first and last point in the window for a smoother reading.
 * 
 * @param points - Array of recent telemetry points (sliding window)
 * @returns Average pace in seconds per kilometer
 */
export function calculateRollingPace(points: TelemetryPoint[]): number {
  if (points.length < 2) {
    return Infinity;
  }

  const first = points[0];
  const last = points[points.length - 1];

  let totalDistanceM = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistanceM += haversineDistanceM(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    );
  }

  if (totalDistanceM <= 0) {
    return Infinity;
  }

  const totalTimeS = (last.timestamp - first.timestamp) / 1000;
  const totalDistanceKm = totalDistanceM / 1000;

  return totalTimeS / totalDistanceKm;
}

/**
 * Calculate average pace for an entire session.
 * 
 * @param totalDistanceM - Total distance covered in meters
 * @param totalTimeS - Total elapsed time in seconds
 * @returns Average pace in seconds per kilometer
 */
export function calculateAvgPace(
  totalDistanceM: number,
  totalTimeS: number,
): number {
  if (totalDistanceM <= 0 || totalTimeS <= 0) {
    return Infinity;
  }

  const totalDistanceKm = totalDistanceM / 1000;
  return totalTimeS / totalDistanceKm;
}

/**
 * Format pace value to human-readable string (e.g., "5:30 /km").
 * 
 * @param paceSPerKm - Pace in seconds per kilometer
 * @returns Formatted pace string
 */
export function formatPace(paceSPerKm: number): string {
  if (!isFinite(paceSPerKm) || paceSPerKm <= 0) {
    return '--:-- /km';
  }

  const minutes = Math.floor(paceSPerKm / 60);
  const seconds = Math.floor(paceSPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

/**
 * Convert pace (s/km) to speed (km/h).
 */
export function paceToSpeed(paceSPerKm: number): number {
  if (!isFinite(paceSPerKm) || paceSPerKm <= 0) {
    return 0;
  }
  return 3600 / paceSPerKm;
}

/**
 * Convert speed (km/h) to pace (s/km).
 */
export function speedToPace(speedKmh: number): number {
  if (speedKmh <= 0) {
    return Infinity;
  }
  return 3600 / speedKmh;
}
