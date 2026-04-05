"""
Ghost-Tracker — NPI Synthetic Training Data Generator
=====================================================

Generates 200 diverse runner profiles × 6 sessions each = 1,200 data points
for training the Normalized Performance Index (NPI) regression model.

Each runner has:
  - Physical profile: age, gender, height, weight, BMI
  - Environmental context: altitude, route distance
  - Performance: pace that realistically depends on all factors

Ground-truth pace model:
  pace = β0 + β1×age + β2×BMI + β3×altitude + β4×distance + β5×gender + noise

This known ground-truth allows us to verify the regression recovers
the correct coefficients, proving the model works.

Output:
  - analysis_output/npi_training_data.csv
  - analysis_output/npi_runner_profiles.json
  - analysis_output/npi_data_summary.txt
"""

import json
import csv
import os
import random
import math
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, 'analysis_output')

# ── Ground-Truth Model Parameters ────────────────────────────
# These are the "true" coefficients. The regression should recover
# values close to these from the synthetic data.

TRUE_COEFFICIENTS = {
    'intercept': 205.0,      # Base pace for ideal conditions (s/km)
    'age': 1.85,             # +1.85 s/km per year of age
    'bmi': 3.50,             # +3.50 s/km per BMI unit
    'altitude_m': 0.038,     # +0.038 s/km per meter of altitude
    'distance_m': 0.0050,    # +0.005 s/km per meter of route distance (fatigue)
    'gender_female': 15.0,   # +15 s/km for female runners
    'noise_sigma': 12.0,     # Standard deviation of random variation
}

# ── Location Templates ───────────────────────────────────────

LOCATIONS = [
    {'name': 'Bellanwila Park', 'altitude': 15, 'lat': 6.84, 'lon': 79.88},
    {'name': 'KDU Clubhouse', 'altitude': 45, 'lat': 7.00, 'lon': 79.95},
    {'name': 'Viharamahadevi Park', 'altitude': 8, 'lat': 6.91, 'lon': 79.86},
    {'name': 'Diyatha Uyana', 'altitude': 12, 'lat': 6.88, 'lon': 79.90},
    {'name': 'Kandy Lake', 'altitude': 510, 'lat': 7.29, 'lon': 80.64},
    {'name': 'Nuwara Eliya Track', 'altitude': 1868, 'lat': 6.97, 'lon': 80.77},
    {'name': 'Horton Plains', 'altitude': 2160, 'lat': 6.80, 'lon': 80.80},
    {'name': 'Ella Mountain Trail', 'altitude': 1041, 'lat': 6.87, 'lon': 81.05},
    {'name': 'Galle Face Green', 'altitude': 3, 'lat': 6.92, 'lon': 79.85},
    {'name': 'Sigiriya Base', 'altitude': 370, 'lat': 7.96, 'lon': 80.76},
]

# ── Sri Lankan Names ─────────────────────────────────────────

MALE_NAMES = [
    'Vinuja', 'Tharindu', 'Supun', 'Kasun', 'Malith', 'Nuwan', 'Kamal',
    'Dilshan', 'Chamara', 'Asanka', 'Ruwan', 'Pradeep', 'Harsha', 'Saman',
    'Lasith', 'Dinesh', 'Aravinda', 'Sanath', 'Kumara', 'Mahela',
    'Nimal', 'Buddhi', 'Chamath', 'Thisara', 'Dimuth', 'Dhananjaya',
    'Wanindu', 'Pathum', 'Charith', 'Bhanuka',
]

FEMALE_NAMES = [
    'Sachini', 'Kavisha', 'Nethmi', 'Dilhani', 'Chamari', 'Oshadi',
    'Harshani', 'Inoka', 'Gayathri', 'Nilmini', 'Sanduni', 'Imalka',
    'Hasini', 'Udeshika', 'Shashikala', 'Anoma', 'Kumari', 'Deepika',
    'Rashmi', 'Pavithra', 'Thilini', 'Sewwandi', 'Nadeesha', 'Chathurika',
    'Ama', 'Iresha', 'Dulani', 'Hansika', 'Lakshani', 'Methma',
]


def calculate_bmi(weight_kg, height_cm):
    """BMI = weight / height² (in meters)."""
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 1)


def generate_pace(age, bmi, altitude_m, distance_m, is_female, session_improvement_pct):
    """
    Generate a realistic pace using the ground-truth model.
    Includes Gaussian noise to simulate natural variation.
    """
    c = TRUE_COEFFICIENTS
    
    base_pace = (
        c['intercept']
        + c['age'] * age
        + c['bmi'] * bmi
        + c['altitude_m'] * altitude_m
        + c['distance_m'] * distance_m
        + c['gender_female'] * (1 if is_female else 0)
    )
    
    # Apply session improvement (negative = faster)
    improved_pace = base_pace * (1 - session_improvement_pct / 100)
    
    # Add Gaussian noise
    noise = random.gauss(0, c['noise_sigma'])
    final_pace = improved_pace + noise
    
    # Clamp to realistic range (2:30/km to 12:00/km)
    final_pace = max(150, min(720, final_pace))
    
    return round(final_pace, 1)


def generate_runner_profile(runner_id, name, gender):
    """Generate a single runner profile with realistic characteristics."""
    is_female = gender == 'F'
    
    # Physical attributes
    age = random.randint(18, 62)
    
    if is_female:
        height_cm = round(random.gauss(162, 7), 1)
        weight_kg = round(random.gauss(60, 10), 1)
    else:
        height_cm = round(random.gauss(172, 8), 1)
        weight_kg = round(random.gauss(75, 12), 1)
    
    # Clamp to realistic values
    height_cm = max(148, min(198, height_cm))
    weight_kg = max(45, min(115, weight_kg))
    
    bmi = calculate_bmi(weight_kg, height_cm)
    
    # Location (random from templates)
    location = random.choice(LOCATIONS)
    
    # Route distance: 1km to 10km
    route_distance_m = random.choice([1000, 1500, 1800, 2000, 2500, 3000, 4000, 5000, 7000, 10000])
    
    # Improvement rate: how much this runner improves per session (0.5% to 4%)
    improvement_rate = round(random.uniform(0.5, 4.0), 2)
    
    return {
        'runner_id': f'runner-{runner_id:03d}',
        'name': name,
        'gender': gender,
        'age': age,
        'height_cm': height_cm,
        'weight_kg': weight_kg,
        'bmi': bmi,
        'location': location['name'],
        'altitude_m': location['altitude'],
        'latitude': location['lat'],
        'longitude': location['lon'],
        'route_distance_m': route_distance_m,
        'improvement_rate_pct': improvement_rate,
    }


def generate_sessions(profile):
    """Generate 6 sessions for a runner with progressive improvement."""
    sessions = []
    start_date = datetime(2026, 1, 5)
    
    for session_num in range(1, 7):
        # Cumulative improvement
        improvement_pct = profile['improvement_rate_pct'] * (session_num - 1)
        
        pace = generate_pace(
            age=profile['age'],
            bmi=profile['bmi'],
            altitude_m=profile['altitude_m'],
            distance_m=profile['route_distance_m'],
            is_female=(profile['gender'] == 'F'),
            session_improvement_pct=improvement_pct,
        )
        
        # Total time for this session
        total_time_s = round(pace * profile['route_distance_m'] / 1000, 1)
        
        session_date = start_date + timedelta(days=(session_num - 1) * 7)
        
        sessions.append({
            'runner_id': profile['runner_id'],
            'runner_name': profile['name'],
            'session_num': session_num,
            'date': session_date.strftime('%Y-%m-%d'),
            
            # Physical profile
            'age': profile['age'],
            'gender': profile['gender'],
            'height_cm': profile['height_cm'],
            'weight_kg': profile['weight_kg'],
            'bmi': profile['bmi'],
            
            # Environmental
            'location': profile['location'],
            'altitude_m': profile['altitude_m'],
            'latitude': profile['latitude'],
            'longitude': profile['longitude'],
            'route_distance_m': profile['route_distance_m'],
            
            # Performance
            'avg_pace_s_per_km': pace,
            'total_time_s': total_time_s,
            'improvement_pct': round(improvement_pct, 2),
        })
    
    return sessions


def main():
    random.seed(42)  # Reproducible results
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print('=' * 70)
    print('  NPI TRAINING DATA GENERATOR')
    print('  Generating 200 runner profiles × 6 sessions = 1,200 data points')
    print('=' * 70)
    
    # ── Generate 200 profiles ────────────────────────────────
    profiles = []
    all_sessions = []
    
    for i in range(200):
        if i < 100:
            gender = 'M'
            name = MALE_NAMES[i % len(MALE_NAMES)] + (f' {i // len(MALE_NAMES) + 1}' if i >= len(MALE_NAMES) else '')
        else:
            gender = 'F'
            j = i - 100
            name = FEMALE_NAMES[j % len(FEMALE_NAMES)] + (f' {j // len(FEMALE_NAMES) + 1}' if j >= len(FEMALE_NAMES) else '')
        
        profile = generate_runner_profile(i + 1, name.strip(), gender)
        profiles.append(profile)
        
        sessions = generate_sessions(profile)
        all_sessions.extend(sessions)
    
    print(f'\n  Generated {len(profiles)} runner profiles')
    print(f'  Generated {len(all_sessions)} total sessions')
    
    # ── Statistics ───────────────────────────────────────────
    ages = [p['age'] for p in profiles]
    bmis = [p['bmi'] for p in profiles]
    altitudes = [p['altitude_m'] for p in profiles]
    paces = [s['avg_pace_s_per_km'] for s in all_sessions]
    
    print(f'\n  Profile Statistics:')
    print(f'    Age:      min={min(ages)}, max={max(ages)}, mean={sum(ages)/len(ages):.1f}')
    print(f'    BMI:      min={min(bmis)}, max={max(bmis)}, mean={sum(bmis)/len(bmis):.1f}')
    print(f'    Altitude: min={min(altitudes)}m, max={max(altitudes)}m')
    print(f'    Pace:     min={min(paces):.0f}s ({int(min(paces)//60)}:{int(min(paces)%60):02d}), '
          f'max={max(paces):.0f}s ({int(max(paces)//60)}:{int(max(paces)%60):02d}), '
          f'mean={sum(paces)/len(paces):.0f}s')
    
    gender_m = sum(1 for p in profiles if p['gender'] == 'M')
    gender_f = sum(1 for p in profiles if p['gender'] == 'F')
    print(f'    Gender:   {gender_m} Male, {gender_f} Female')
    
    locations_used = set(p['location'] for p in profiles)
    print(f'    Locations: {len(locations_used)} unique ({", ".join(sorted(locations_used))})')
    
    # ── Save CSV ─────────────────────────────────────────────
    csv_path = os.path.join(OUTPUT_DIR, 'npi_training_data.csv')
    fieldnames = [
        'runner_id', 'runner_name', 'session_num', 'date',
        'age', 'gender', 'height_cm', 'weight_kg', 'bmi',
        'location', 'altitude_m', 'latitude', 'longitude',
        'route_distance_m', 'avg_pace_s_per_km', 'total_time_s',
        'improvement_pct',
    ]
    
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_sessions)
    
    print(f'\n  📄 CSV saved: {csv_path}')
    
    # ── Save Profiles JSON ───────────────────────────────────
    json_path = os.path.join(OUTPUT_DIR, 'npi_runner_profiles.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({
            'generated_at': datetime.now().isoformat(),
            'ground_truth_coefficients': TRUE_COEFFICIENTS,
            'total_profiles': len(profiles),
            'total_sessions': len(all_sessions),
            'profiles': profiles,
        }, f, indent=2)
    
    print(f'  📄 Profiles JSON saved: {json_path}')
    
    # ── Save Summary ─────────────────────────────────────────
    summary_path = os.path.join(OUTPUT_DIR, 'npi_data_summary.txt')
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write('NPI Training Data Summary\n')
        f.write('=' * 50 + '\n\n')
        f.write(f'Generated: {datetime.now().isoformat()}\n')
        f.write(f'Total profiles: {len(profiles)}\n')
        f.write(f'Total sessions: {len(all_sessions)}\n')
        f.write(f'Sessions per runner: 6\n\n')
        f.write('Ground-Truth Coefficients:\n')
        for k, v in TRUE_COEFFICIENTS.items():
            f.write(f'  {k}: {v}\n')
        f.write(f'\nAge range: {min(ages)} - {max(ages)} (mean: {sum(ages)/len(ages):.1f})\n')
        f.write(f'BMI range: {min(bmis):.1f} - {max(bmis):.1f} (mean: {sum(bmis)/len(bmis):.1f})\n')
        f.write(f'Altitude range: {min(altitudes)}m - {max(altitudes)}m\n')
        f.write(f'Pace range: {min(paces):.0f} - {max(paces):.0f} s/km\n')
        f.write(f'Gender: {gender_m} Male, {gender_f} Female\n')
        f.write(f'Locations: {len(locations_used)}\n')
    
    print(f'  📄 Summary saved: {summary_path}')
    
    print('\n' + '=' * 70)
    print('  ✅ NPI TRAINING DATA GENERATION COMPLETE')
    print('=' * 70)


if __name__ == '__main__':
    main()
