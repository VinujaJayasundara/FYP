/**
 * Unit Tests: Haversine Distance Calculator
 * 
 * Tests the great-circle distance calculation against known values.
 * Known distances sourced from geographic reference data.
 */

import { haversineDistanceKm, haversineDistanceM, calculateTrackDistanceM } from '../../src/core/spatial/haversine';

describe('Haversine Distance Calculator', () => {
  // ── Known Distance Tests ────────────────────────────────────
  describe('haversineDistanceKm', () => {
    test('should calculate distance between London and Paris (~340 km)', () => {
      // London: 51.5074°N, 0.1278°W
      // Paris: 48.8566°N, 2.3522°E
      const distance = haversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
      expect(distance).toBeGreaterThan(330);
      expect(distance).toBeLessThan(350);
    });

    test('should calculate distance between New York and Los Angeles (~3944 km)', () => {
      const distance = haversineDistanceKm(40.7128, -74.0060, 34.0522, -118.2437);
      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });

    test('should return 0 for same coordinates', () => {
      const distance = haversineDistanceKm(6.8413, 79.8815, 6.8413, 79.8815);
      expect(distance).toBe(0);
    });

    test('should calculate short distance at Bellanwila Park (~100m)', () => {
      // Two points approximately 100m apart at Bellanwila Park
      const distance = haversineDistanceKm(6.8413, 79.8815, 6.8422, 79.8815);
      expect(distance).toBeGreaterThan(0.09);
      expect(distance).toBeLessThan(0.11);
    });

    test('should handle antipodal points (~20000 km)', () => {
      // Opposite sides of the Earth
      const distance = haversineDistanceKm(0, 0, 0, 180);
      expect(distance).toBeGreaterThan(19900);
      expect(distance).toBeLessThan(20100);
    });

    test('should be symmetric (A→B = B→A)', () => {
      const d1 = haversineDistanceKm(6.8413, 79.8815, 7.2906, 80.6337);
      const d2 = haversineDistanceKm(7.2906, 80.6337, 6.8413, 79.8815);
      expect(d1).toBeCloseTo(d2, 10);
    });
  });

  describe('haversineDistanceM', () => {
    test('should return distance in meters (1000x km)', () => {
      const distKm = haversineDistanceKm(6.8413, 79.8815, 6.8422, 79.8815);
      const distM = haversineDistanceM(6.8413, 79.8815, 6.8422, 79.8815);
      expect(distM).toBeCloseTo(distKm * 1000, 5);
    });
  });

  // ── Track Distance Tests ────────────────────────────────────
  describe('calculateTrackDistanceM', () => {
    test('should return 0 for empty array', () => {
      expect(calculateTrackDistanceM([])).toBe(0);
    });

    test('should return 0 for single point', () => {
      expect(calculateTrackDistanceM([{ latitude: 6.8413, longitude: 79.8815 }])).toBe(0);
    });

    test('should calculate cumulative distance for a track', () => {
      const track = [
        { latitude: 6.8413, longitude: 79.8815 },
        { latitude: 6.8422, longitude: 79.8815 }, // ~100m north
        { latitude: 6.8422, longitude: 79.8825 }, // ~100m east
      ];
      const distance = calculateTrackDistanceM(track);
      expect(distance).toBeGreaterThan(180);
      expect(distance).toBeLessThan(220);
    });

    test('should be additive (A→B→C = A→B + B→C)', () => {
      const A = { latitude: 6.8413, longitude: 79.8815 };
      const B = { latitude: 6.8422, longitude: 79.8815 };
      const C = { latitude: 6.8422, longitude: 79.8825 };

      const totalDist = calculateTrackDistanceM([A, B, C]);
      const segAB = haversineDistanceM(A.latitude, A.longitude, B.latitude, B.longitude);
      const segBC = haversineDistanceM(B.latitude, B.longitude, C.latitude, C.longitude);

      expect(totalDist).toBeCloseTo(segAB + segBC, 5);
    });
  });
});
