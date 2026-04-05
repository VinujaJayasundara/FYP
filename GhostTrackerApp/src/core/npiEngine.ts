/**
 * Ghost-Tracker — Normalized Performance Index (NPI) Engine
 * ==========================================================
 *
 * Uses a trained multiple linear regression model to predict a runner's
 * expected pace based on their physical profile and environmental conditions,
 * then calculates a z-score (NPI) measuring how many standard deviations
 * better or worse they performed vs expectation.
 *
 * Formula:
 *   Expected_pace = β₀ + β₁×age + β₂×BMI + β₃×altitude + β₄×distance + β₅×gender
 *   NPI = (Expected_pace - Actual_pace) / σ
 *
 * Interpretation:
 *   NPI > 0   → performed better than expected for your profile
 *   NPI = 0   → performed exactly as expected
 *   NPI < 0   → performed worse than expected
 *   NPI > 2.0 → exceptional (top ~2.5% for your profile)
 *
 * Model trained on 1,200 synthetic data points (200 runners × 6 sessions)
 * covering ages 18-62, BMI 15-37, altitudes 3-2160m, distances 1-10km.
 *
 * Model Quality:
 *   R² = 0.7507 (explains 75% of pace variance)
 *   All coefficients significant at p < 0.001
 *   F-statistic = 718.9
 */

// ── Trained Model Coefficients ────────────────────────────
// Extracted from: scripts/analysis_output/npi_model_coefficients.json
// Trained on: 1,200 synthetic sessions across 200 diverse profiles

const NPI_MODEL = {
  intercept: 190.2703,
  age: 1.7579,             // +1.76 s/km per year of age
  bmi: 3.3918,             // +3.39 s/km per BMI unit
  altitude_m: 0.036477,    // +0.036 s/km per meter altitude
  distance_m: 0.0047,      // +0.005 s/km per meter distance
  gender_female: 13.8648,  // +13.86 s/km for female runners
  sigma: 24.158,           // standard error of residuals (s/km)
};

// ── Types ─────────────────────────────────────────────────

export interface RunnerProfile {
  age: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  gender: 'M' | 'F';
}

export interface RunContext {
  altitudeM: number;
  distanceM: number;
  avgPaceSPerKm: number;
}

export interface NPIResult {
  npi: number;
  expectedPace: number;
  actualPace: number;
  status: NPIStatus;
}

export interface NPIStatus {
  label: string;
  emoji: string;
  color: string;
  percentile: string;
}

// ── Core Functions ────────────────────────────────────────

/**
 * Calculate BMI from weight and height.
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  if (heightM <= 0 || weightKg <= 0) return 0;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

/**
 * Predict the expected pace for a runner based on their profile.
 *
 * @param profile - Runner's physical characteristics
 * @param context - Environmental and run conditions
 * @returns Expected pace in seconds per kilometer
 */
export function predictExpectedPace(
  profile: RunnerProfile,
  context: RunContext,
): number {
  return (
    NPI_MODEL.intercept +
    NPI_MODEL.age * profile.age +
    NPI_MODEL.bmi * profile.bmi +
    NPI_MODEL.altitude_m * context.altitudeM +
    NPI_MODEL.distance_m * context.distanceM +
    NPI_MODEL.gender_female * (profile.gender === 'F' ? 1 : 0)
  );
}

/**
 * Calculate the Normalized Performance Index (NPI).
 *
 * NPI = (Expected_pace - Actual_pace) / σ
 *
 * Positive NPI = faster than expected (good)
 * Negative NPI = slower than expected
 *
 * @param profile - Runner's physical characteristics
 * @param context - Environmental conditions + actual performance
 * @returns NPI result with score, expected pace, and status
 */
export function calculateNPI(
  profile: RunnerProfile,
  context: RunContext,
): NPIResult {
  const expectedPace = predictExpectedPace(profile, context);
  const npi = (expectedPace - context.avgPaceSPerKm) / NPI_MODEL.sigma;

  return {
    npi: Math.round(npi * 1000) / 1000,
    expectedPace: Math.round(expectedPace * 10) / 10,
    actualPace: context.avgPaceSPerKm,
    status: getNPIStatus(npi),
  };
}

/**
 * Get human-readable NPI status with color and emoji.
 */
export function getNPIStatus(npi: number): NPIStatus {
  if (npi >= 2.0) {
    return { label: 'Exceptional', emoji: '🏆', color: '#FFD700', percentile: 'Top 2.5%' };
  }
  if (npi >= 1.5) {
    return { label: 'Outstanding', emoji: '⭐', color: '#FF6B35', percentile: 'Top 7%' };
  }
  if (npi >= 1.0) {
    return { label: 'Above Average', emoji: '🔥', color: '#22c55e', percentile: 'Top 16%' };
  }
  if (npi >= 0.0) {
    return { label: 'As Expected', emoji: '✅', color: '#3b82f6', percentile: 'Top 50%' };
  }
  if (npi >= -1.0) {
    return { label: 'Below Average', emoji: '😤', color: '#f59e0b', percentile: 'Bottom 16%' };
  }
  return { label: 'Needs Improvement', emoji: '👻', color: '#ef4444', percentile: 'Bottom 2.5%' };
}

/**
 * Format NPI score for display.
 */
export function formatNPI(npi: number): string {
  if (!isFinite(npi)) return '-.--';
  const sign = npi >= 0 ? '+' : '';
  return `${sign}${npi.toFixed(2)}`;
}

/**
 * Get the model's coefficient interpretation for display.
 * Useful for showing users how factors affect their expected pace.
 */
export function getModelInterpretation(): {
  factor: string;
  effect: string;
  coefficient: number;
}[] {
  return [
    { factor: 'Age', effect: `+${NPI_MODEL.age.toFixed(1)} s/km per year`, coefficient: NPI_MODEL.age },
    { factor: 'BMI', effect: `+${NPI_MODEL.bmi.toFixed(1)} s/km per unit`, coefficient: NPI_MODEL.bmi },
    { factor: 'Altitude', effect: `+${(NPI_MODEL.altitude_m * 100).toFixed(1)} s/km per 100m`, coefficient: NPI_MODEL.altitude_m },
    { factor: 'Distance', effect: `+${(NPI_MODEL.distance_m * 1000).toFixed(1)} s/km per km`, coefficient: NPI_MODEL.distance_m },
    { factor: 'Gender (F)', effect: `+${NPI_MODEL.gender_female.toFixed(1)} s/km`, coefficient: NPI_MODEL.gender_female },
  ];
}

/**
 * Get the model quality metrics for display.
 */
export function getModelQuality(): { metric: string; value: string }[] {
  return [
    { metric: 'R²', value: '0.7507' },
    { metric: 'Adjusted R²', value: '0.7496' },
    { metric: 'Standard Error', value: `${NPI_MODEL.sigma.toFixed(1)} s/km` },
    { metric: 'Training Samples', value: '1,200' },
    { metric: 'F-statistic', value: '718.9' },
  ];
}
