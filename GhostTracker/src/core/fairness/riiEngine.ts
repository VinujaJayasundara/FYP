/**
 * Relative Improvement Index (RII) Engine
 * 
 * The core fairness metric of Ghost-Tracker.
 * 
 * Formula: RII = PB_pace / Current_pace
 * 
 * Interpretation:
 *   RII > 1.0  →  User is OUTPERFORMING their Ghost (faster than PB)
 *   RII = 1.0  →  User is MATCHING their Ghost (equal to PB)
 *   RII < 1.0  →  User is BEHIND their Ghost (slower than PB)
 * 
 * This metric normalizes competition against the user's own baseline,
 * creating a fair system where a beginner improving by 10% scores equally
 * to an elite athlete improving by 10%.
 */

import { RII_MIN_POINTS } from '../../utils/constants';

/**
 * Calculate the Relative Improvement Index.
 * 
 * @param pbPaceSPerKm - Personal Best pace in seconds per kilometer
 * @param currentPaceSPerKm - Current session pace in seconds per kilometer
 * @returns RII score (>1.0 = outperforming Ghost)
 */
export function calculateRII(
  pbPaceSPerKm: number,
  currentPaceSPerKm: number,
): number {
  // Guard: invalid or zero pace values
  if (
    !isFinite(pbPaceSPerKm) ||
    !isFinite(currentPaceSPerKm) ||
    pbPaceSPerKm <= 0 ||
    currentPaceSPerKm <= 0
  ) {
    return 0;
  }

  return pbPaceSPerKm / currentPaceSPerKm;
}

/**
 * Calculate a running (cumulative) RII score from arrays of pace values.
 * Compares the average pace of the current session against the average PB pace
 * up to the same point in the run.
 * 
 * @param pbPaces - Array of PB pace values (s/km) indexed by seq position
 * @param currentPaces - Array of current pace values (s/km) indexed by seq position
 * @returns Current cumulative RII score
 */
export function calculateCumulativeRII(
  pbPaces: number[],
  currentPaces: number[],
): number {
  // Need minimum data points for a meaningful RII
  if (currentPaces.length < RII_MIN_POINTS || pbPaces.length < RII_MIN_POINTS) {
    return 0;
  }

  // Use the minimum length (can't compare beyond what both have)
  const length = Math.min(pbPaces.length, currentPaces.length);

  // Calculate average pace for each
  let pbSum = 0;
  let currentSum = 0;
  let validCount = 0;

  for (let i = 0; i < length; i++) {
    if (isFinite(pbPaces[i]) && isFinite(currentPaces[i]) && pbPaces[i] > 0 && currentPaces[i] > 0) {
      pbSum += pbPaces[i];
      currentSum += currentPaces[i];
      validCount++;
    }
  }

  if (validCount < RII_MIN_POINTS) {
    return 0;
  }

  const avgPbPace = pbSum / validCount;
  const avgCurrentPace = currentSum / validCount;

  return calculateRII(avgPbPace, avgCurrentPace);
}

/**
 * Get a human-readable RII status.
 */
export function getRIIStatus(riiScore: number): {
  label: string;
  emoji: string;
  color: string;
} {
  if (riiScore <= 0) {
    return { label: 'Calculating...', emoji: '⏳', color: '#888888' };
  }
  if (riiScore >= 1.1) {
    return { label: 'Crushing It!', emoji: '🔥', color: '#22c55e' };
  }
  if (riiScore >= 1.0) {
    return { label: 'On Pace', emoji: '✅', color: '#3b82f6' };
  }
  if (riiScore >= 0.95) {
    return { label: 'Slightly Behind', emoji: '😤', color: '#f59e0b' };
  }
  return { label: 'Behind Ghost', emoji: '👻', color: '#ef4444' };
}

/**
 * Format RII score for display.
 */
export function formatRII(riiScore: number): string {
  if (riiScore <= 0) {
    return '-.--';
  }
  return riiScore.toFixed(2);
}
