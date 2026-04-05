/**
 * Unit Tests: GPS Noise Filter
 */

import { validateTelemetryPoint, validatePointPair, filterTelemetry } from '../../src/core/spatial/gpsFilter';
import { TelemetryPoint } from '../../src/data/models';

function makePoint(overrides: Partial<TelemetryPoint> = {}): TelemetryPoint {
  return {
    id: 'test-id',
    sessionId: 'test-session',
    latitude: 6.8413,
    longitude: 79.8815,
    timestamp: Date.now(),
    velocity: 2.5, // ~9 km/h — normal running speed
    accuracy: 5,
    seqIndex: 0,
    ...overrides,
  };
}

describe('GPS Noise Filter', () => {
  describe('validateTelemetryPoint', () => {
    test('should accept valid running point', () => {
      const result = validateTelemetryPoint(makePoint());
      expect(result.isValid).toBe(true);
    });

    test('should reject null coordinates', () => {
      const result = validateTelemetryPoint(makePoint({ latitude: NaN }));
      expect(result.isValid).toBe(false);
      expect(result.rejectionReason).toBe('NULL_COORDINATES');
    });

    test('should reject out-of-bounds latitude', () => {
      const result = validateTelemetryPoint(makePoint({ latitude: 91 }));
      expect(result.isValid).toBe(false);
      expect(result.rejectionReason).toBe('LATITUDE_OUT_OF_BOUNDS');
    });

    test('should reject out-of-bounds longitude', () => {
      const result = validateTelemetryPoint(makePoint({ longitude: -181 }));
      expect(result.isValid).toBe(false);
      expect(result.rejectionReason).toBe('LONGITUDE_OUT_OF_BOUNDS');
    });

    test('should reject velocity > 25 km/h (vehicle spoofing)', () => {
      // 25 km/h = 6.944 m/s
      const result = validateTelemetryPoint(makePoint({ velocity: 8.0 })); // 28.8 km/h
      expect(result.isValid).toBe(false);
      expect(result.rejectionReason).toContain('VELOCITY_EXCEEDED');
    });

    test('should accept velocity just under threshold', () => {
      const result = validateTelemetryPoint(makePoint({ velocity: 6.9 })); // 24.84 km/h
      expect(result.isValid).toBe(true);
    });

    test('should reject low accuracy readings', () => {
      const result = validateTelemetryPoint(makePoint({ accuracy: 60 })); // >50m threshold
      expect(result.isValid).toBe(false);
      expect(result.rejectionReason).toContain('LOW_ACCURACY');
    });

    test('should accept null velocity (GNSS may not report it)', () => {
      const result = validateTelemetryPoint(makePoint({ velocity: null }));
      expect(result.isValid).toBe(true);
    });
  });

  describe('validatePointPair', () => {
    test('should accept normally spaced points', () => {
      const prev = makePoint({ timestamp: 1000, latitude: 6.8413, seqIndex: 0 });
      const curr = makePoint({ timestamp: 2000, latitude: 6.84135, seqIndex: 1 }); // ~5.5m in 1s = ~20 km/h
      const result = validatePointPair(prev, curr);
      expect(result.isValid).toBe(true);
    });

    test('should reject teleportation (GPS spike)', () => {
      const prev = makePoint({ timestamp: 1000, latitude: 6.8413 });
      const curr = makePoint({ timestamp: 2000, latitude: 6.8500 }); // ~967m in 1s — impossible for running
      const result = validatePointPair(prev, curr);
      expect(result.isValid).toBe(false);
      expect(result.rejectionReason).toContain('IMPLIED_SPEED_EXCEEDED');
    });

    test('should reject non-monotonic timestamps', () => {
      const prev = makePoint({ timestamp: 2000 });
      const curr = makePoint({ timestamp: 1000 });
      const result = validatePointPair(prev, curr);
      expect(result.isValid).toBe(false);
      expect(result.rejectionReason).toBe('TIMESTAMP_NOT_MONOTONIC');
    });
  });

  describe('filterTelemetry', () => {
    test('should pass through all valid points', () => {
      const points = Array.from({ length: 10 }, (_, i) =>
        makePoint({
          seqIndex: i,
          timestamp: 1000 + i * 1000,
          latitude: 6.8413 + i * 0.00001, // ~1.1m per step
        }),
      );
      const result = filterTelemetry(points);
      expect(result.validPoints.length).toBe(10);
      expect(result.rejectedCount).toBe(0);
    });

    test('should filter out GPS spikes while keeping adjacent valid points', () => {
      const points = [
        makePoint({ seqIndex: 0, timestamp: 1000, latitude: 6.8413 }),
        makePoint({ seqIndex: 1, timestamp: 2000, latitude: 6.8414 }),
        makePoint({ seqIndex: 2, timestamp: 3000, latitude: 6.9000 }), // SPIKE — ~6.5km jump
        makePoint({ seqIndex: 3, timestamp: 4000, latitude: 6.8415 }),
        makePoint({ seqIndex: 4, timestamp: 5000, latitude: 6.8416 }),
      ];
      const result = filterTelemetry(points);
      expect(result.rejectedCount).toBeGreaterThan(0);
      expect(result.rejectionLog.some(r => r.reason.includes('IMPLIED_SPEED_EXCEEDED'))).toBe(true);
    });
  });
});
