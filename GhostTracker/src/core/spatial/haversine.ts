/**
 * Haversine Distance Calculator
 * 
 * Calculates the great-circle distance between two GPS coordinates
 * on Earth's surface. Uses the Haversine formula which treats Earth
 * as a sphere (sufficient accuracy for fitness tracking).
 * 
 * Reference: https://en.wikipedia.org/wiki/Haversine_formula
 */

import { EARTH_RADIUS_KM, EARTH_RADIUS_M } from '../../utils/constants';

/**
 * Convert degrees to radians.
 */
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the great-circle distance between two coordinates in KILOMETERS.
 * 
 * @param lat1 - Latitude of point 1 (degrees)
 * @param lon1 - Longitude of point 1 (degrees)
 * @param lat2 - Latitude of point 2 (degrees)
 * @param lon2 - Longitude of point 2 (degrees)
 * @returns Distance in kilometers
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate the great-circle distance between two coordinates in METERS.
 * This is the primary function used by the app (meters are more useful
 * for short-distance fitness tracking).
 * 
 * @param lat1 - Latitude of point 1 (degrees)
 * @param lon1 - Longitude of point 1 (degrees)
 * @param lat2 - Latitude of point 2 (degrees)
 * @param lon2 - Longitude of point 2 (degrees)
 * @returns Distance in meters
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return haversineDistanceKm(lat1, lon1, lat2, lon2) * 1000;
}

/**
 * Calculate the cumulative distance of a GPS track (array of coordinates).
 * Sums the Haversine distance between each consecutive pair of points.
 * 
 * @param coordinates - Array of {latitude, longitude} objects
 * @returns Total track distance in meters
 */
export function calculateTrackDistanceM(
  coordinates: Array<{ latitude: number; longitude: number }>,
): number {
  if (coordinates.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    totalDistance += haversineDistanceM(
      coordinates[i - 1].latitude,
      coordinates[i - 1].longitude,
      coordinates[i].latitude,
      coordinates[i].longitude,
    );
  }

  return totalDistance;
}
