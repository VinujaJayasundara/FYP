/**
 * Unit Tests: Relative Improvement Index (RII) Engine
 * 
 * Validates the core fairness metric of Ghost-Tracker.
 */

import {
  calculateRII,
  calculateCumulativeRII,
  getRIIStatus,
  formatRII,
} from '../../src/core/fairness/riiEngine';

describe('RII Engine', () => {
  // ── Core RII Calculation ────────────────────────────────────
  describe('calculateRII', () => {
    test('should return 1.0 when current pace matches PB pace', () => {
      // 5:00 min/km = 300 s/km
      const rii = calculateRII(300, 300);
      expect(rii).toBe(1.0);
    });

    test('should return > 1.0 when outperforming Ghost', () => {
      // PB: 6:00 min/km, Current: 5:00 min/km (faster = lower pace)
      const rii = calculateRII(360, 300);
      expect(rii).toBe(1.2);
    });

    test('should return < 1.0 when behind Ghost', () => {
      // PB: 5:00 min/km, Current: 6:00 min/km (slower = higher pace)
      const rii = calculateRII(300, 360);
      expect(rii).toBeCloseTo(0.833, 3);
    });

    test('should demonstrate fairness: 10% improvement = same RII regardless of ability', () => {
      // Beginner: PB 7:00 (420s), now running 6:22 (382s) = 10% faster
      const beginnerRII = calculateRII(420, 382);

      // Elite: PB 3:30 (210s), now running 3:11 (191s) = 10% faster
      const eliteRII = calculateRII(210, 191);

      // Both should have approximately the same RII
      expect(beginnerRII).toBeCloseTo(eliteRII, 1);
      expect(beginnerRII).toBeGreaterThan(1.0);
      expect(eliteRII).toBeGreaterThan(1.0);
    });

    test('should return 0 for invalid inputs', () => {
      expect(calculateRII(0, 300)).toBe(0);
      expect(calculateRII(300, 0)).toBe(0);
      expect(calculateRII(-100, 300)).toBe(0);
      expect(calculateRII(Infinity, 300)).toBe(0);
      expect(calculateRII(300, Infinity)).toBe(0);
    });

    test('should handle very small pace differences', () => {
      const rii = calculateRII(300, 299);
      expect(rii).toBeGreaterThan(1.0);
      expect(rii).toBeLessThan(1.01);
    });
  });

  // ── Cumulative RII ──────────────────────────────────────────
  describe('calculateCumulativeRII', () => {
    test('should return 0 if not enough data points', () => {
      const rii = calculateCumulativeRII([300, 300], [300, 300]);
      expect(rii).toBe(0); // Less than RII_MIN_POINTS (5)
    });

    test('should calculate cumulative RII over multiple points', () => {
      const pbPaces = [300, 300, 300, 300, 300, 300];
      const currentPaces = [290, 290, 290, 290, 290, 290]; // Consistently faster

      const rii = calculateCumulativeRII(pbPaces, currentPaces);
      expect(rii).toBeGreaterThan(1.0);
    });

    test('should filter out Infinity values', () => {
      const pbPaces = [300, 300, Infinity, 300, 300, 300];
      const currentPaces = [290, 290, Infinity, 290, 290, 290];

      const rii = calculateCumulativeRII(pbPaces, currentPaces);
      expect(rii).toBeGreaterThan(1.0);
    });
  });

  // ── Status Labels ───────────────────────────────────────────
  describe('getRIIStatus', () => {
    test('should return "Crushing It!" for RII >= 1.1', () => {
      expect(getRIIStatus(1.15).label).toBe('Crushing It!');
      expect(getRIIStatus(1.15).emoji).toBe('🔥');
    });

    test('should return "On Pace" for RII between 1.0 and 1.1', () => {
      expect(getRIIStatus(1.05).label).toBe('On Pace');
    });

    test('should return "Behind Ghost" for RII < 0.95', () => {
      expect(getRIIStatus(0.8).label).toBe('Behind Ghost');
      expect(getRIIStatus(0.8).emoji).toBe('👻');
    });
  });

  // ── Formatting ──────────────────────────────────────────────
  describe('formatRII', () => {
    test('should format to 2 decimal places', () => {
      expect(formatRII(1.2345)).toBe('1.23');
      expect(formatRII(0.9)).toBe('0.90');
    });

    test('should return placeholder for invalid values', () => {
      expect(formatRII(0)).toBe('-.--');
      expect(formatRII(-1)).toBe('-.--');
    });
  });
});
