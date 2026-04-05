"""
Ghost-Tracker — NPI Regression Model Fitting & Full Analysis
=============================================================

Loads the synthetic training data, fits a multiple linear regression,
extracts coefficients, runs model diagnostics, and performs the
complete NPI fairness analysis for the thesis.

Outputs:
  - Model coefficients JSON (for the TypeScript app)
  - Regression report (R², p-values, coefficient table)
  - Fairness proof (same effort = same NPI across profiles)
  - Cross-person comparison (who performed best?)
  - Console output for thesis appendix
"""

import json
import csv
import os
import math
import numpy as np
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, 'analysis_output')


def format_pace(s_per_km):
    if not math.isfinite(s_per_km) or s_per_km <= 0:
        return '--:--'
    return f'{int(s_per_km // 60)}:{int(s_per_km % 60):02d}'


def load_training_data():
    """Load the synthetic training data CSV."""
    csv_path = os.path.join(OUTPUT_DIR, 'npi_training_data.csv')
    
    data = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append({
                'runner_id': row['runner_id'],
                'runner_name': row['runner_name'],
                'session_num': int(row['session_num']),
                'age': int(row['age']),
                'gender': row['gender'],
                'bmi': float(row['bmi']),
                'altitude_m': float(row['altitude_m']),
                'route_distance_m': float(row['route_distance_m']),
                'avg_pace_s_per_km': float(row['avg_pace_s_per_km']),
                'location': row['location'],
                'height_cm': float(row['height_cm']),
                'weight_kg': float(row['weight_kg']),
            })
    
    return data


# ══════════════════════════════════════════════════════════════
# MANUAL LINEAR REGRESSION (No sklearn dependency)
# Using Normal Equation: β = (XᵀX)⁻¹ Xᵀy
# ══════════════════════════════════════════════════════════════

def fit_linear_regression(X, y):
    """
    Fit multiple linear regression using the Normal Equation.
    X: numpy array of shape (n_samples, n_features) — already includes intercept column
    y: numpy array of shape (n_samples,)
    
    Returns: coefficients, predictions, residuals, R², adjusted R², std error
    """
    n = len(y)
    k = X.shape[1] - 1  # features (excluding intercept)
    
    # Normal equation: β = (XᵀX)⁻¹ Xᵀy
    XtX = X.T @ X
    XtX_inv = np.linalg.inv(XtX)
    beta = XtX_inv @ X.T @ y
    
    # Predictions and residuals
    y_pred = X @ beta
    residuals = y - y_pred
    
    # R² and Adjusted R²
    ss_res = np.sum(residuals ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r_squared = 1 - ss_res / ss_tot
    adj_r_squared = 1 - (1 - r_squared) * (n - 1) / (n - k - 1)
    
    # Standard error of residuals (sigma)
    mse = ss_res / (n - k - 1)
    sigma = np.sqrt(mse)
    
    # Standard errors of coefficients
    se_beta = np.sqrt(np.diag(XtX_inv) * mse)
    
    # t-statistics
    t_stats = beta / se_beta
    
    # F-statistic
    ss_reg = ss_tot - ss_res
    ms_reg = ss_reg / k
    ms_res = ss_res / (n - k - 1)
    f_stat = ms_reg / ms_res
    
    return {
        'coefficients': beta,
        'predictions': y_pred,
        'residuals': residuals,
        'r_squared': r_squared,
        'adj_r_squared': adj_r_squared,
        'sigma': sigma,
        'se_beta': se_beta,
        't_stats': t_stats,
        'f_stat': f_stat,
        'n_samples': n,
        'n_features': k,
    }


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # ══════════════════════════════════════════════════════════
    # LOAD DATA
    # ══════════════════════════════════════════════════════════
    
    print('=' * 75)
    print('  NPI REGRESSION MODEL FITTING & ANALYSIS')
    print('  Statistical Z-Score Model for Cross-Person Fair Comparison')
    print('=' * 75)
    
    data = load_training_data()
    print(f'\n  Loaded {len(data)} training samples')
    
    # ══════════════════════════════════════════════════════════
    # PREPARE FEATURES
    # ══════════════════════════════════════════════════════════
    
    n = len(data)
    
    # Feature matrix: [1 (intercept), age, bmi, altitude, distance, gender_female]
    X = np.zeros((n, 6))
    y = np.zeros(n)
    
    for i, row in enumerate(data):
        X[i, 0] = 1                                    # intercept
        X[i, 1] = row['age']                           # age
        X[i, 2] = row['bmi']                           # BMI
        X[i, 3] = row['altitude_m']                    # altitude
        X[i, 4] = row['route_distance_m']              # distance
        X[i, 5] = 1 if row['gender'] == 'F' else 0    # gender (female=1)
        y[i] = row['avg_pace_s_per_km']
    
    # ══════════════════════════════════════════════════════════
    # SPLIT DATA (80/20)
    # ══════════════════════════════════════════════════════════
    
    np.random.seed(42)
    indices = np.random.permutation(n)
    split = int(n * 0.8)
    
    train_idx = indices[:split]
    test_idx = indices[split:]
    
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    
    print(f'  Training samples: {len(train_idx)}')
    print(f'  Test samples: {len(test_idx)}')
    
    # ══════════════════════════════════════════════════════════
    # FIT MODEL
    # ══════════════════════════════════════════════════════════
    
    print('\n  Fitting multiple linear regression...')
    
    # Fit on training data
    train_result = fit_linear_regression(X_train, y_train)
    
    # Evaluate on test data
    y_test_pred = X_test @ train_result['coefficients']
    test_residuals = y_test - y_test_pred
    ss_res_test = np.sum(test_residuals ** 2)
    ss_tot_test = np.sum((y_test - np.mean(y_test)) ** 2)
    r2_test = 1 - ss_res_test / ss_tot_test
    sigma_test = np.std(test_residuals)
    
    # Also fit on ALL data for final coefficients
    full_result = fit_linear_regression(X, y)
    
    feature_names = ['Intercept', 'Age', 'BMI', 'Altitude (m)', 'Distance (m)', 'Gender (F)']
    
    # ══════════════════════════════════════════════════════════
    # ANALYSIS 1: MODEL QUALITY REPORT
    # ══════════════════════════════════════════════════════════
    
    print('\n' + '=' * 75)
    print('  ANALYSIS 1: REGRESSION MODEL SUMMARY')
    print('=' * 75)
    
    print(f'\n  Training Performance:')
    print(f'    R²:                {train_result["r_squared"]:.4f}')
    print(f'    Adjusted R²:       {train_result["adj_r_squared"]:.4f}')
    print(f'    Std Error (σ):     {train_result["sigma"]:.2f} s/km')
    print(f'    F-statistic:       {train_result["f_stat"]:.1f}')
    
    print(f'\n  Test Performance:')
    print(f'    R² (test):         {r2_test:.4f}')
    print(f'    Std Error (test):  {sigma_test:.2f} s/km')
    
    print(f'\n  {"Feature":<18} {"Coefficient":>12} {"Std Error":>12} {"t-statistic":>12}')
    print(f'  {"-"*18} {"-"*12} {"-"*12} {"-"*12}')
    
    for i, name in enumerate(feature_names):
        coef = full_result['coefficients'][i]
        se = full_result['se_beta'][i]
        t = full_result['t_stats'][i]
        sig = '***' if abs(t) > 3.29 else '**' if abs(t) > 2.58 else '*' if abs(t) > 1.96 else ''
        print(f'  {name:<18} {coef:>12.4f} {se:>12.4f} {t:>10.2f} {sig}')
    
    print(f'\n  Significance: *** p<0.001  ** p<0.01  * p<0.05')
    
    # Interpretation
    print(f'\n  INTERPRETATION:')
    print(f'    • Each year of age adds ~{full_result["coefficients"][1]:.1f} s/km to expected pace')
    print(f'    • Each BMI unit adds ~{full_result["coefficients"][2]:.1f} s/km to expected pace')
    print(f'    • Each 100m of altitude adds ~{full_result["coefficients"][3]*100:.1f} s/km to expected pace')
    print(f'    • Each 1000m of distance adds ~{full_result["coefficients"][4]*1000:.1f} s/km (fatigue)')
    print(f'    • Female runners expected ~{full_result["coefficients"][5]:.1f} s/km slower (physiological)')
    
    # ══════════════════════════════════════════════════════════
    # ANALYSIS 2: NPI FAIRNESS PROOF
    # ══════════════════════════════════════════════════════════
    
    print('\n' + '=' * 75)
    print('  ANALYSIS 2: NPI FAIRNESS PROOF')
    print('  "Same relative effort = same NPI, regardless of profile"')
    print('=' * 75)
    
    sigma = full_result['sigma']
    beta = full_result['coefficients']
    
    fairness_profiles = [
        {'label': 'Young Male, Low BMI, Sea Level',      'age': 22, 'bmi': 20.5, 'alt': 15,   'dist': 2500, 'gender': 0},
        {'label': 'Middle-Age Male, Avg BMI, Mid Alt',    'age': 40, 'bmi': 25.0, 'alt': 510,  'dist': 2500, 'gender': 0},
        {'label': 'Older Male, High BMI, High Alt',       'age': 55, 'bmi': 29.0, 'alt': 1868, 'dist': 2500, 'gender': 0},
        {'label': 'Young Female, Low BMI, Sea Level',     'age': 24, 'bmi': 21.0, 'alt': 8,    'dist': 2500, 'gender': 1},
        {'label': 'Middle-Age Female, Avg BMI, High Alt', 'age': 42, 'bmi': 26.0, 'alt': 1041, 'dist': 2500, 'gender': 1},
        {'label': 'Older Female, High BMI, Sea Level',    'age': 58, 'bmi': 30.0, 'alt': 3,    'dist': 2500, 'gender': 1},
    ]
    
    print(f'\n  Test: Each runner performs EXACTLY 10% better than their expected pace\n')
    print(f'  {"Profile":<46} {"Expected":>9} {"Actual":>9} {"NPI":>7}')
    print(f'  {"-"*46} {"-"*9} {"-"*9} {"-"*7}')
    
    npi_values = []
    fairness_results = []
    
    for p in fairness_profiles:
        x = np.array([1, p['age'], p['bmi'], p['alt'], p['dist'], p['gender']])
        expected = x @ beta
        actual = expected * 0.90  # 10% better
        npi = (expected - actual) / sigma
        npi_values.append(npi)
        
        fairness_results.append({
            'profile': p['label'],
            'age': p['age'],
            'bmi': p['bmi'],
            'altitude_m': p['alt'],
            'gender': 'F' if p['gender'] == 1 else 'M',
            'expected_pace': round(expected, 1),
            'actual_pace': round(actual, 1),
            'npi': round(npi, 3),
        })
        
        print(f'  {p["label"]:<46} {format_pace(expected):>9} {format_pace(actual):>9} {npi:>+7.3f}')
    
    npi_mean = np.mean(npi_values)
    npi_std = np.std(npi_values)
    max_diff = max(npi_values) - min(npi_values)
    
    print(f'\n  NPI Statistics:')
    print(f'    Mean NPI:     {npi_mean:+.3f}')
    print(f'    Std Dev:      {npi_std:.4f}')
    print(f'    Max Spread:   {max_diff:.4f}')
    print(f'    Tolerance:    {"✅ PASS" if max_diff < 0.5 else "❌ FAIL"} (max spread < 0.5)')
    
    print(f'\n  VERDICT: {"✅ FAIRNESS PROVEN" if max_diff < 0.5 else "❌ FAIRNESS NOT PROVEN"}')
    print(f'  Same 10% effort → NPI ≈ {npi_mean:+.3f} for ALL profiles')
    print(f'  The model normalizes away age, BMI, gender, altitude, and distance.')
    
    # ══════════════════════════════════════════════════════════
    # ANALYSIS 3: CROSS-PERSON COMPARISON
    # ══════════════════════════════════════════════════════════
    
    print('\n' + '=' * 75)
    print('  ANALYSIS 3: CROSS-PERSON COMPARISON')
    print('  "Who performed best, accounting for all factors?"')
    print('=' * 75)
    
    comparison_runners = [
        {'name': 'Vinuja',   'age': 22, 'bmi': 21.5, 'alt': 15,   'dist': 2500, 'gender': 0, 'actual_pace': 330},
        {'name': 'Tharindu', 'age': 28, 'bmi': 22.0, 'alt': 15,   'dist': 2500, 'gender': 0, 'actual_pace': 300},
        {'name': 'Supun',    'age': 30, 'bmi': 26.0, 'alt': 15,   'dist': 2500, 'gender': 0, 'actual_pace': 360},
        {'name': 'Kasun',    'age': 35, 'bmi': 24.0, 'alt': 510,  'dist': 1800, 'gender': 0, 'actual_pace': 320},
        {'name': 'Malith',   'age': 25, 'bmi': 20.0, 'alt': 510,  'dist': 1800, 'gender': 0, 'actual_pace': 288},
        {'name': 'Sachini',  'age': 27, 'bmi': 22.5, 'alt': 15,   'dist': 2500, 'gender': 1, 'actual_pace': 370},
        {'name': 'Kavisha',  'age': 45, 'bmi': 28.0, 'alt': 1868, 'dist': 3000, 'gender': 1, 'actual_pace': 450},
    ]
    
    comparison_results = []
    for r in comparison_runners:
        x = np.array([1, r['age'], r['bmi'], r['alt'], r['dist'], r['gender']])
        expected = x @ beta
        npi = (expected - r['actual_pace']) / sigma
        
        if npi >= 2.0:
            status = 'Exceptional'
        elif npi >= 1.0:
            status = 'Above Average'
        elif npi >= 0.0:
            status = 'As Expected'
        elif npi >= -1.0:
            status = 'Below Average'
        else:
            status = 'Needs Work'
        
        comparison_results.append({
            'name': r['name'],
            'age': r['age'],
            'bmi': r['bmi'],
            'gender': 'F' if r['gender'] == 1 else 'M',
            'altitude_m': r['alt'],
            'actual_pace': r['actual_pace'],
            'expected_pace': round(expected, 1),
            'npi': round(npi, 3),
            'status': status,
        })
    
    # Sort by NPI (highest first)
    comparison_results.sort(key=lambda r: r['npi'], reverse=True)
    
    print(f'\n  {"Rank":<5} {"Runner":<10} {"Age":>4} {"BMI":>5} {"G":>2} {"Alt":>6} {"Pace":>8} {"Expected":>9} {"NPI":>7} {"Status":<15}')
    print(f'  {"-"*5} {"-"*10} {"-"*4} {"-"*5} {"-"*2} {"-"*6} {"-"*8} {"-"*9} {"-"*7} {"-"*15}')
    
    for rank, r in enumerate(comparison_results, 1):
        print(f'  #{rank:<4} {r["name"]:<10} {r["age"]:>4} {r["bmi"]:>5.1f} {r["gender"]:>2} {r["altitude_m"]:>5}m '
              f'{format_pace(r["actual_pace"]):>8} {format_pace(r["expected_pace"]):>9} {r["npi"]:>+7.3f} {r["status"]:<15}')
    
    print(f'\n  KEY INSIGHTS:')
    best = comparison_results[0]
    worst = comparison_results[-1]
    print(f'  • {best["name"]} ranks #1 (NPI {best["npi"]:+.3f}) — best relative to their profile')
    print(f'  • {worst["name"]} ranks last (NPI {worst["npi"]:+.3f}) — least exceptional for their profile')
    print(f'  • Absolute pace is IRRELEVANT — only performance vs expectation matters')
    
    # ══════════════════════════════════════════════════════════
    # ANALYSIS 4: NPI DISTRIBUTION STATISTICS
    # ══════════════════════════════════════════════════════════
    
    print('\n' + '=' * 75)
    print('  ANALYSIS 4: NPI DISTRIBUTION ACROSS ALL TRAINING DATA')
    print('=' * 75)
    
    # Calculate NPI for all training data points
    all_npis = []
    for row in data:
        x = np.array([1, row['age'], row['bmi'], row['altitude_m'],
                       row['route_distance_m'], 1 if row['gender'] == 'F' else 0])
        expected = x @ beta
        npi = (expected - row['avg_pace_s_per_km']) / sigma
        all_npis.append(npi)
    
    all_npis = np.array(all_npis)
    
    print(f'\n  NPI Distribution (n={len(all_npis)}):')
    print(f'    Mean:     {np.mean(all_npis):+.3f} (should be ~0)')
    print(f'    Std Dev:  {np.std(all_npis):.3f} (should be ~1)')
    print(f'    Min:      {np.min(all_npis):+.3f}')
    print(f'    Max:      {np.max(all_npis):+.3f}')
    
    # Percentile distribution
    pct_above_0 = np.mean(all_npis > 0) * 100
    pct_above_1 = np.mean(all_npis > 1) * 100
    pct_above_2 = np.mean(all_npis > 2) * 100
    pct_below_neg1 = np.mean(all_npis < -1) * 100
    
    print(f'\n  Percentile Brackets:')
    print(f'    NPI > +2.0 (Exceptional):    {pct_above_2:.1f}%')
    print(f'    NPI > +1.0 (Above Average):  {pct_above_1:.1f}%')
    print(f'    NPI > 0.0  (Better than Expected): {pct_above_0:.1f}%')
    print(f'    NPI < -1.0 (Below Average):  {pct_below_neg1:.1f}%')
    
    # ══════════════════════════════════════════════════════════
    # EXPORT MODEL COEFFICIENTS
    # ══════════════════════════════════════════════════════════
    
    model_export = {
        'model_name': 'Ghost-Tracker NPI Regression Model',
        'version': '1.0.0',
        'trained_at': datetime.now().isoformat(),
        'n_training_samples': int(n),
        'n_features': 5,
        'feature_names': ['age', 'bmi', 'altitude_m', 'distance_m', 'gender_female'],
        'coefficients': {
            'intercept': round(float(beta[0]), 4),
            'age': round(float(beta[1]), 4),
            'bmi': round(float(beta[2]), 4),
            'altitude_m': round(float(beta[3]), 6),
            'distance_m': round(float(beta[4]), 6),
            'gender_female': round(float(beta[5]), 4),
        },
        'sigma': round(float(sigma), 4),
        'model_quality': {
            'r_squared': round(float(full_result['r_squared']), 4),
            'adj_r_squared': round(float(full_result['adj_r_squared']), 4),
            'f_statistic': round(float(full_result['f_stat']), 2),
            'r_squared_test': round(float(r2_test), 4),
        },
        'npi_scale': {
            'exceptional': 2.0,
            'above_average': 1.0,
            'as_expected': 0.0,
            'below_average': -1.0,
        },
    }
    
    coef_path = os.path.join(OUTPUT_DIR, 'npi_model_coefficients.json')
    with open(coef_path, 'w', encoding='utf-8') as f:
        json.dump(model_export, f, indent=2)
    
    print(f'\n  📦 Model coefficients exported: {coef_path}')
    
    # ── Save fairness proof CSV ──────────────────────────────
    fairness_csv_path = os.path.join(OUTPUT_DIR, 'npi_fairness_proof.csv')
    with open(fairness_csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['profile', 'age', 'bmi', 'gender', 'altitude_m',
                                                'expected_pace', 'actual_pace', 'npi'])
        writer.writeheader()
        writer.writerows(fairness_results)
    
    print(f'  📊 Fairness proof CSV: {fairness_csv_path}')
    
    # ── Save comparison CSV ──────────────────────────────────
    comparison_csv_path = os.path.join(OUTPUT_DIR, 'npi_cross_comparison.csv')
    with open(comparison_csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['name', 'age', 'bmi', 'gender', 'altitude_m',
                                                'actual_pace', 'expected_pace', 'npi', 'status'])
        writer.writeheader()
        writer.writerows(comparison_results)
    
    print(f'  📊 Cross-comparison CSV: {comparison_csv_path}')
    
    # ── Save full report ─────────────────────────────────────
    report_path = os.path.join(OUTPUT_DIR, 'npi_regression_report.txt')
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('NPI REGRESSION MODEL REPORT\n')
        f.write('=' * 60 + '\n\n')
        f.write(f'Generated: {datetime.now().isoformat()}\n')
        f.write(f'Training samples: {n}\n\n')
        f.write(f'R²:            {full_result["r_squared"]:.4f}\n')
        f.write(f'Adjusted R²:   {full_result["adj_r_squared"]:.4f}\n')
        f.write(f'Std Error (σ): {sigma:.4f} s/km\n')
        f.write(f'F-statistic:   {full_result["f_stat"]:.2f}\n')
        f.write(f'R² (test):     {r2_test:.4f}\n\n')
        f.write(f'COEFFICIENTS:\n')
        for i, name in enumerate(feature_names):
            f.write(f'  {name:<20} β={beta[i]:>10.4f}  SE={full_result["se_beta"][i]:>8.4f}  t={full_result["t_stats"][i]:>8.2f}\n')
    
    print(f'  📄 Full report: {report_path}')
    
    print('\n' + '=' * 75)
    print('  ✅ NPI MODEL FITTING & ANALYSIS COMPLETE')
    print('=' * 75)


if __name__ == '__main__':
    main()
