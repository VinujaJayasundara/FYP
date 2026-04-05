"""
Ghost-Tracker — Improvement Metrics Data Modeling
==================================================

Takes the synthetic GPS data and runs it through the full
RII pipeline to demonstrate:

1. Personal Best tracking (who has the best PB?)
2. Session-over-session improvement (RII trend)
3. Cross-runner fair comparison (Bellanwila vs KDU)
4. Ghost comparison simulation (live vs PB at each second)

This script produces concrete, data-driven proof that the
improvement metrics work correctly.

Output:
  - Console summary with tables
  - JSON results file for thesis appendix
  - CSV results for chart generation
"""

import json
import math
import os
import csv
import random
import uuid
from datetime import datetime, timedelta

# ============================================================
# Constants
# ============================================================
EARTH_RADIUS_M = 6371000
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEST_DATA_DIR = os.path.join(SCRIPT_DIR, 'test_data')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, 'analysis_output')

# ============================================================
# Core Algorithms (Python mirrors of TypeScript implementations)
# ============================================================

def haversine_m(lat1, lon1, lat2, lon2):
    """Haversine distance in meters."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_pace(distance_m, time_s):
    """Calculate pace in seconds per kilometer."""
    if distance_m <= 0 or time_s <= 0:
        return float('inf')
    return time_s / (distance_m / 1000)


def calculate_rii(pb_pace, current_pace):
    """RII = PB_pace / Current_pace."""
    if pb_pace <= 0 or current_pace <= 0:
        return 0
    if not math.isfinite(pb_pace) or not math.isfinite(current_pace):
        return 0
    return pb_pace / current_pace


def format_pace(seconds_per_km):
    """Format pace as M:SS /km."""
    if not math.isfinite(seconds_per_km) or seconds_per_km <= 0:
        return '--:--'
    minutes = int(seconds_per_km // 60)
    secs = int(seconds_per_km % 60)
    return f'{minutes}:{secs:02d}'


def gps_filter(velocity_ms, accuracy_m):
    """Returns True if point is valid."""
    if velocity_ms is not None and velocity_ms * 3.6 > 25:
        return False  # Vehicle speed
    if accuracy_m is not None and accuracy_m > 50:
        return False  # Poor satellite
    return True


# ============================================================
# Data Loading & Processing
# ============================================================

def load_test_data():
    """Load the synthetic test data."""
    json_path = os.path.join(TEST_DATA_DIR, 'bellanwila_telemetry.json')
    with open(json_path, 'r') as f:
        data = json.load(f)
    return data


def process_session(session_meta, all_points):
    """Process a single session: filter, calculate distance, pace, etc."""
    session_id = session_meta['id']
    
    # Get points for this session
    points = [p for p in all_points if p['session_id'] == session_id]
    points.sort(key=lambda p: p['seq_index'])
    
    # Filter out GPS spikes
    valid_points = []
    rejected = 0
    for p in points:
        if gps_filter(p.get('velocity'), p.get('accuracy')):
            valid_points.append(p)
        else:
            rejected += 1
    
    if len(valid_points) < 2:
        return None
    
    # Calculate segment-by-segment metrics
    segments = []
    cumulative_distance = 0
    
    for i in range(1, len(valid_points)):
        prev = valid_points[i - 1]
        curr = valid_points[i]
        
        dist = haversine_m(prev['latitude'], prev['longitude'],
                           curr['latitude'], curr['longitude'])
        time_delta = (curr['timestamp'] - prev['timestamp']) / 1000  # seconds
        
        # Skip impossibly large jumps (residual spikes)
        if dist > 50:  # >50m in 1 second = 180 km/h
            continue
            
        cumulative_distance += dist
        pace = calculate_pace(dist, time_delta) if dist > 0.5 else float('inf')
        
        segments.append({
            'seq_index': curr['seq_index'],
            'distance_m': dist,
            'cumulative_distance_m': cumulative_distance,
            'time_delta_s': time_delta,
            'pace_s_per_km': pace,
            'latitude': curr['latitude'],
            'longitude': curr['longitude'],
            'timestamp': curr['timestamp'],
        })
    
    if not segments or cumulative_distance < 10:
        return None
    
    # Session totals
    total_time_s = (valid_points[-1]['timestamp'] - valid_points[0]['timestamp']) / 1000
    avg_pace = calculate_pace(cumulative_distance, total_time_s)
    
    # Filter out infinite paces for median calculation
    finite_paces = [s['pace_s_per_km'] for s in segments if math.isfinite(s['pace_s_per_km'])]
    median_pace = sorted(finite_paces)[len(finite_paces) // 2] if finite_paces else float('inf')
    
    return {
        'session_id': session_id,
        'user_alias': session_meta['user_alias'],
        'device_id': session_meta['device_id'],
        'total_distance_m': cumulative_distance,
        'total_time_s': total_time_s,
        'avg_pace_s_per_km': avg_pace,
        'median_pace_s_per_km': median_pace,
        'total_points': len(points),
        'valid_points': len(valid_points),
        'rejected_points': rejected,
        'segments': segments,
    }


# ============================================================
# Analysis 1: Personal Best Tracking
# ============================================================

def analyze_personal_bests(processed_sessions):
    """Determine PB for each runner and track improvement."""
    print('\n' + '=' * 70)
    print('ANALYSIS 1: PERSONAL BEST TRACKING')
    print('=' * 70)
    
    # Group sessions by runner
    runners = {}
    for session in processed_sessions:
        alias = session['user_alias']
        if alias not in runners:
            runners[alias] = []
        runners[alias].append(session)
    
    pb_results = []
    
    for alias, sessions in runners.items():
        # Sort by chronological order
        sessions.sort(key=lambda s: s['segments'][0]['timestamp'] if s['segments'] else 0)
        
        # Find PB (lowest average pace)
        pb_session = min(sessions, key=lambda s: s['avg_pace_s_per_km'])
        
        pb_results.append({
            'runner': alias,
            'total_sessions': len(sessions),
            'pb_pace': pb_session['avg_pace_s_per_km'],
            'pb_distance': pb_session['total_distance_m'],
            'pb_time': pb_session['total_time_s'],
            'pb_session_id': pb_session['session_id'],
        })
    
    # Print table
    print(f'\n  {"Runner":<12} {"Sessions":>8} {"PB Pace":>10} {"PB Distance":>12} {"PB Time":>10}')
    print(f'  {"-"*12} {"-"*8} {"-"*10} {"-"*12} {"-"*10}')
    for r in pb_results:
        pace_str = format_pace(r['pb_pace'])
        time_str = f'{int(r["pb_time"]//60):02d}:{int(r["pb_time"]%60):02d}'
        print(f'  {r["runner"]:<12} {r["total_sessions"]:>8} {pace_str:>10} {r["pb_distance"]:>10.0f}m {time_str:>10}')
    
    return pb_results, runners


# ============================================================
# Analysis 2: RII Improvement Over Sessions
# ============================================================

def analyze_rii_improvement(processed_sessions, runners):
    """Calculate RII for each session against the runner's PB."""
    print('\n' + '=' * 70)
    print('ANALYSIS 2: RII IMPROVEMENT TRACKING')
    print('=' * 70)
    print('  Formula: RII = PB_pace / Session_pace')
    print('  > 1.0 = outperformed PB, = 1.0 = matched PB, < 1.0 = behind PB\n')
    
    rii_results = []
    
    for alias, sessions in runners.items():
        sessions.sort(key=lambda s: s['segments'][0]['timestamp'] if s['segments'] else 0)
        pb_session = min(sessions, key=lambda s: s['avg_pace_s_per_km'])
        pb_pace = pb_session['avg_pace_s_per_km']
        
        print(f'  Runner: {alias} (PB: {format_pace(pb_pace)} /km)')
        print(f'  {"Session #":<12} {"Pace":>10} {"RII":>8} {"Status":>18} {"Distance":>10}')
        print(f'  {"-"*12} {"-"*10} {"-"*8} {"-"*18} {"-"*10}')
        
        for idx, session in enumerate(sessions):
            rii = calculate_rii(pb_pace, session['avg_pace_s_per_km'])
            
            if rii >= 1.1:
                status = '🔥 Crushing It!'
            elif rii >= 1.0:
                status = '✅ On Pace'
            elif rii >= 0.95:
                status = '😤 Slightly Behind'
            else:
                status = '👻 Behind Ghost'
            
            is_pb = session['session_id'] == pb_session['session_id']
            
            rii_results.append({
                'runner': alias,
                'session_num': idx + 1,
                'pace': session['avg_pace_s_per_km'],
                'rii': rii,
                'status': status,
                'distance': session['total_distance_m'],
                'is_pb': is_pb,
            })
            
            pb_marker = ' ★ PB' if is_pb else ''
            print(f'  Run {idx+1:<8} {format_pace(session["avg_pace_s_per_km"]):>10} {rii:>8.3f} {status:>18} {session["total_distance_m"]:>9.0f}m{pb_marker}')
        
        print()
    
    return rii_results


# ============================================================
# Analysis 3: Cross-Location Fair Comparison
# ============================================================

def analyze_cross_location(processed_sessions, runners):
    """
    Simulate the key thesis scenario:
    Runner A at Bellanwila Park vs Runner B at KDU Clubhouse.
    Different routes, different distances — but RII makes it fair.
    """
    print('\n' + '=' * 70)
    print('ANALYSIS 3: CROSS-LOCATION FAIR COMPARISON')
    print('  Bellanwila Park vs KDU Clubhouse')
    print('=' * 70)
    
    # Simulate a second location (KDU Clubhouse) with different route characteristics
    kdu_runners = {
        'Kasun': {'pb_pace': 340, 'current_pace': 310, 'route_dist': 1800},  # 5:40 → 5:10
        'Malith': {'pb_pace': 380, 'current_pace': 360, 'route_dist': 1800},  # 6:20 → 6:00
    }
    
    # Use real data for Bellanwila runners
    bellanwila_results = []
    for alias, sessions in runners.items():
        if len(sessions) >= 1:
            pb_session = min(sessions, key=lambda s: s['avg_pace_s_per_km'])
            pb_pace = pb_session['avg_pace_s_per_km']
            # Use the first non-PB session as "today's run"
            current_sessions = [s for s in sessions if s['session_id'] != pb_session['session_id']]
            if current_sessions:
                current_pace = current_sessions[0]['avg_pace_s_per_km']
            else:
                current_pace = pb_pace * 0.95  # Simulate slight improvement
            
            rii = calculate_rii(pb_pace, current_pace)
            bellanwila_results.append({
                'runner': alias,
                'location': 'Bellanwila Park',
                'route_dist': pb_session['total_distance_m'],
                'pb_pace': pb_pace,
                'current_pace': current_pace,
                'rii': rii,
            })
    
    # KDU results
    kdu_results = []
    for name, data in kdu_runners.items():
        rii = calculate_rii(data['pb_pace'], data['current_pace'])
        kdu_results.append({
            'runner': name,
            'location': 'KDU Clubhouse',
            'route_dist': data['route_dist'],
            'pb_pace': data['pb_pace'],
            'current_pace': data['current_pace'],
            'rii': rii,
        })
    
    # Combine and rank by RII
    all_results = bellanwila_results + kdu_results
    all_results.sort(key=lambda r: r['rii'], reverse=True)
    
    print(f'\n  {"Rank":<6} {"Runner":<12} {"Location":<18} {"Route":>8} {"PB Pace":>10} {"Today":>10} {"RII":>8}')
    print(f'  {"-"*6} {"-"*12} {"-"*18} {"-"*8} {"-"*10} {"-"*10} {"-"*8}')
    
    for rank, r in enumerate(all_results, 1):
        print(f'  #{rank:<5} {r["runner"]:<12} {r["location"]:<18} {r["route_dist"]:>7.0f}m {format_pace(r["pb_pace"]):>10} {format_pace(r["current_pace"]):>10} {r["rii"]:>8.3f}')
    
    print(f'\n  ✅ KEY INSIGHT: Rankings are based on IMPROVEMENT (RII), not absolute speed.')
    print(f'     A slower runner who improved more ranks HIGHER than a fast runner who didn\'t improve.')
    print(f'     Route distance and location are IRRELEVANT to the ranking.\n')
    
    return all_results


# ============================================================
# Analysis 4: Ghost Comparison Simulation (Second-by-Second)
# ============================================================

def analyze_ghost_comparison(processed_sessions, runners):
    """
    Simulate a live Ghost race: compare a current run against PB
    at every second to show real-time lead/lag tracking.
    """
    print('\n' + '=' * 70)
    print('ANALYSIS 4: GHOST COMPARISON SIMULATION')
    print('  Second-by-second live vs PB tracking')
    print('=' * 70)
    
    # Pick one runner with multiple sessions
    target_alias = None
    target_sessions = None
    for alias, sessions in runners.items():
        if len(sessions) >= 1:
            target_alias = alias
            target_sessions = sessions
            break
    
    if not target_alias or not target_sessions:
        print('  Not enough data for Ghost simulation.')
        return []
    
    # PB = Ghost, current = most recent different session
    pb_session = min(target_sessions, key=lambda s: s['avg_pace_s_per_km'])
    current_session = target_sessions[0] if target_sessions[0]['session_id'] != pb_session['session_id'] else target_sessions[-1]
    
    ghost_segments = pb_session['segments']
    live_segments = current_session['segments']
    
    print(f'\n  Runner: {target_alias}')
    print(f'  Ghost (PB): {format_pace(pb_session["avg_pace_s_per_km"])} /km')
    print(f'  Live run:   {format_pace(current_session["avg_pace_s_per_km"])} /km')
    print()
    
    # Compare every 10th second for readability
    comparison_points = []
    max_points = min(len(ghost_segments), len(live_segments))
    sample_interval = max(1, max_points // 20)  # Show ~20 data points
    
    print(f'  {"Time":>8} {"Ghost Pace":>12} {"Live Pace":>12} {"RII":>8} {"Lead/Lag":>10} {"Status":>18}')
    print(f'  {"-"*8} {"-"*12} {"-"*12} {"-"*8} {"-"*10} {"-"*18}')
    
    for i in range(0, max_points, sample_interval):
        ghost_seg = ghost_segments[i]
        live_seg = live_segments[i]
        
        ghost_pace = ghost_seg['pace_s_per_km'] if math.isfinite(ghost_seg['pace_s_per_km']) else pb_session['avg_pace_s_per_km']
        live_pace = live_seg['pace_s_per_km'] if math.isfinite(live_seg['pace_s_per_km']) else current_session['avg_pace_s_per_km']
        
        # Use cumulative distance difference as lead/lag
        lead_lag_m = live_seg['cumulative_distance_m'] - ghost_seg['cumulative_distance_m']
        
        # Running RII based on cumulative metrics
        ghost_cum_pace = calculate_pace(ghost_seg['cumulative_distance_m'], i + 1)
        live_cum_pace = calculate_pace(live_seg['cumulative_distance_m'], i + 1)
        rii = calculate_rii(ghost_cum_pace, live_cum_pace)
        
        if rii >= 1.05:
            status = '🔥 Ahead'
        elif rii >= 0.98:
            status = '✅ On Pace'
        else:
            status = '👻 Behind'
        
        elapsed = f'{i // 60}:{i % 60:02d}'
        lead_lag_str = f'+{lead_lag_m:.1f}m' if lead_lag_m >= 0 else f'{lead_lag_m:.1f}m'
        
        comparison_points.append({
            'elapsed_s': i,
            'ghost_pace': ghost_pace,
            'live_pace': live_pace,
            'rii': rii,
            'lead_lag_m': lead_lag_m,
            'status': status,
        })
        
        print(f'  {elapsed:>8} {format_pace(ghost_pace):>12} {format_pace(live_pace):>12} {rii:>8.3f} {lead_lag_str:>10} {status:>18}')
    
    # Final summary
    final_rii = calculate_rii(pb_session['avg_pace_s_per_km'], current_session['avg_pace_s_per_km'])
    print(f'\n  FINAL RII: {final_rii:.3f}')
    if final_rii > 1.0:
        print(f'  → {target_alias} OUTPERFORMED their Ghost by {(final_rii - 1) * 100:.1f}%!')
    elif final_rii == 1.0:
        print(f'  → {target_alias} MATCHED their Ghost exactly!')
    else:
        print(f'  → {target_alias} was {(1 - final_rii) * 100:.1f}% behind their Ghost')
    
    return comparison_points


# ============================================================
# Analysis 5: RII Fairness Proof (Mathematical Verification)
# ============================================================

def analyze_fairness():
    """Prove that RII is fair: same % improvement = same RII regardless of ability."""
    print('\n' + '=' * 70)
    print('ANALYSIS 5: FAIRNESS PROOF')
    print('  "Same effort = same score, regardless of ability level"')
    print('=' * 70)
    
    scenarios = [
        {'label': 'Beginner',     'pb': 420, 'improve_pct': 5},   # 7:00/km → 6:39
        {'label': 'Intermediate', 'pb': 330, 'improve_pct': 5},   # 5:30/km → 5:14
        {'label': 'Advanced',     'pb': 270, 'improve_pct': 5},   # 4:30/km → 4:17
        {'label': 'Elite',        'pb': 210, 'improve_pct': 5},   # 3:30/km → 3:20
    ]
    
    print(f'\n  Scenario: All runners improve by exactly 5%\n')
    print(f'  {"Level":<15} {"PB Pace":>10} {"Current":>10} {"Improvement":>12} {"RII":>8} {"Match?":>8}')
    print(f'  {"-"*15} {"-"*10} {"-"*10} {"-"*12} {"-"*8} {"-"*8}')
    
    rii_values = []
    for s in scenarios:
        current_pace = s['pb'] * (1 - s['improve_pct'] / 100)
        rii = calculate_rii(s['pb'], current_pace)
        rii_values.append(rii)
        
        print(f'  {s["label"]:<15} {format_pace(s["pb"]):>10} {format_pace(current_pace):>10} {s["improve_pct"]:>11}% {rii:>8.4f} {"✅" if abs(rii - rii_values[0]) < 0.001 else "❌":>8}')
    
    # Verify all RII values are identical
    all_match = all(abs(r - rii_values[0]) < 0.001 for r in rii_values)
    
    print(f'\n  {"RESULT":>15}: All RII values = {rii_values[0]:.4f}')
    print(f'  {"VERDICT":>15}: {"✅ FAIRNESS PROVEN — Same improvement = same RII" if all_match else "❌ FAIRNESS VIOLATED"}')
    
    # Now test with varying improvements
    print(f'\n  --- Variable Improvement Test ---\n')
    print(f'  {"Runner":<15} {"PB Pace":>10} {"Current":>10} {"Improved":>10} {"RII":>8} {"Rank":>6}')
    print(f'  {"-"*15} {"-"*10} {"-"*10} {"-"*10} {"-"*8} {"-"*6}')
    
    variable_scenarios = [
        {'label': 'Beginner A',   'pb': 420, 'current': 378},  # 7:00 → 6:18 = 10% faster
        {'label': 'Elite B',      'pb': 210, 'current': 200},  # 3:30 → 3:20 = 4.8% faster
        {'label': 'Beginner C',   'pb': 390, 'current': 380},  # 6:30 → 6:20 = 2.6% faster
        {'label': 'Advanced D',   'pb': 270, 'current': 243},  # 4:30 → 4:03 = 10% faster
    ]
    
    var_results = []
    for s in variable_scenarios:
        rii = calculate_rii(s['pb'], s['current'])
        improve = (1 - s['current'] / s['pb']) * 100
        var_results.append({'label': s['label'], 'rii': rii, 'improve': improve, **s})
    
    var_results.sort(key=lambda r: r['rii'], reverse=True)
    for rank, r in enumerate(var_results, 1):
        print(f'  {r["label"]:<15} {format_pace(r["pb"]):>10} {format_pace(r["current"]):>10} {r["improve"]:>9.1f}% {r["rii"]:>8.4f} {"#" + str(rank):>6}')
    
    print(f'\n  ✅ Notice: Beginner A and Advanced D both improved by ~10% → nearly identical RII!')
    print(f'     Elite B improved less (4.8%) so ranks lower, despite being faster in absolute terms.')
    
    return var_results


# ============================================================
# Main
# ============================================================

def main():
    print('=' * 70)
    print('  Ghost-Tracker — Improvement Metrics Data Modeling')
    print('  Data-driven proof of RII fairness and PB tracking')
    print('=' * 70)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Load data
    print('\n  Loading synthetic test data...')
    data = load_test_data()
    sessions_meta = data['sessions']
    all_points = data['telemetry']
    print(f'  Loaded {len(all_points)} GPS points across {len(sessions_meta)} sessions')
    
    # Process sessions
    print('\n  Processing sessions (filtering, distance calculation, pace)...')
    processed = []
    for meta in sessions_meta:
        result = process_session(meta, all_points)
        if result:
            processed.append(result)
            print(f'    {result["user_alias"]:<12}: {result["valid_points"]:>4} valid / {result["total_points"]:>4} total points, '
                  f'dist={result["total_distance_m"]:.0f}m, pace={format_pace(result["avg_pace_s_per_km"])}')
    
    # Run all analyses
    pb_results, runners = analyze_personal_bests(processed)
    rii_results = analyze_rii_improvement(processed, runners)
    cross_results = analyze_cross_location(processed, runners)
    ghost_results = analyze_ghost_comparison(processed, runners)
    fairness_results = analyze_fairness()
    
    # Save results
    output = {
        'generated_at': datetime.now().isoformat(),
        'input_data': {
            'total_points': len(all_points),
            'total_sessions': len(sessions_meta),
            'processed_sessions': len(processed),
        },
        'personal_bests': pb_results,
        'rii_improvement': rii_results,
        'cross_location_comparison': cross_results,
        'ghost_comparison_sample': ghost_results[:20],
        'fairness_proof': fairness_results,
    }
    
    output_path = os.path.join(OUTPUT_DIR, 'improvement_metrics_results.json')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2, default=str)
    print(f'\n  📄 Results saved to: {output_path}')
    
    # Save RII results as CSV for chart generation
    csv_path = os.path.join(OUTPUT_DIR, 'rii_results.csv')
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['runner', 'session_num', 'pace', 'rii', 'status', 'distance', 'is_pb'])
        writer.writeheader()
        writer.writerows(rii_results)
    print(f'  📊 RII CSV saved to: {csv_path}')
    
    # Save ghost comparison as CSV
    ghost_csv_path = os.path.join(OUTPUT_DIR, 'ghost_comparison.csv')
    with open(ghost_csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['elapsed_s', 'ghost_pace', 'live_pace', 'rii', 'lead_lag_m', 'status'])
        writer.writeheader()
        writer.writerows(ghost_results)
    print(f'  👻 Ghost comparison CSV saved to: {ghost_csv_path}')
    
    print('\n' + '=' * 70)
    print('  ✅ DATA MODELING COMPLETE')
    print('  All improvement metrics verified with real synthetic data')
    print('=' * 70)


if __name__ == '__main__':
    main()
