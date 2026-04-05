/**
 * Unit Tests: Pace Calculator
 */

import { calculateInstantPace, calculateAvgPace, formatPace, paceToSpeed, speedToPace } from '../../src/core/spatial/paceCalculator';
import { TelemetryPoint } from '../../src/data/models';

function makePoint(overrides: Partial<TelemetryPoint> = {}): TelemetryPoint {
  return {
    id: 'test',
    sessionId: 'session',
    latitude: 6.8413,
    longitude: 79.8815,
    timestamp: 1000,
    velocity: null,
    accuracy: null,
    seqIndex: 0,
    ...overrides,
  };
}

describe('Pace Calculator', () => {
  describe('calculateInstantPace', () => {
    test('should calculate pace for a known distance/time', () => {
      // Two points ~100m apart, 20s between them
      // Pace = 20s / 0.1km = 200 s/km = 3:20 min/km
      const prev = makePoint({ latitude: 6.8413, longitude: 79.8815, timestamp: 0 });
      const curr = makePoint({ latitude: 6.8422, longitude: 79.8815, timestamp: 20000 }); // ~100m, 20s
      const pace = calculateInstantPace(prev, curr);
      expect(pace).toBeGreaterThan(150);
      expect(pace).toBeLessThan(250);
    });

    test('should return Infinity for zero distance', () => {
      const prev = makePoint({ timestamp: 0 });
      const curr = makePoint({ timestamp: 1000 }); // Same location
      expect(calculateInstantPace(prev, curr)).toBe(Infinity);
    });

    test('should return Infinity for zero time delta', () => {
      const prev = makePoint({ latitude: 6.8413, timestamp: 1000 });
      const curr = makePoint({ latitude: 6.8422, timestamp: 1000 });
      expect(calculateInstantPace(prev, curr)).toBe(Infinity);
    });
  });

  describe('calculateAvgPace', () => {
    test('should calculate 5:00 min/km for 5km in 25min', () => {
      const pace = calculateAvgPace(5000, 1500); // 5km, 1500s
      expect(pace).toBe(300); // 300 s/km = 5:00 min/km
    });

    test('should return Infinity for zero distance', () => {
      expect(calculateAvgPace(0, 1500)).toBe(Infinity);
    });
  });

  describe('formatPace', () => {
    test('should format 300 s/km as 5:00 /km', () => {
      expect(formatPace(300)).toBe('5:00 /km');
    });

    test('should format 330 s/km as 5:30 /km', () => {
      expect(formatPace(330)).toBe('5:30 /km');
    });

    test('should handle single-digit seconds padding', () => {
      expect(formatPace(305)).toBe('5:05 /km');
    });

    test('should return placeholder for Infinity', () => {
      expect(formatPace(Infinity)).toBe('--:-- /km');
    });
  });

  describe('paceToSpeed / speedToPace', () => {
    test('should convert 300 s/km to 12 km/h', () => {
      expect(paceToSpeed(300)).toBe(12);
    });

    test('should convert 12 km/h to 300 s/km', () => {
      expect(speedToPace(12)).toBe(300);
    });

    test('should be inverse operations', () => {
      const pace = 330;
      expect(speedToPace(paceToSpeed(pace))).toBeCloseTo(pace, 5);
    });
  });
});
