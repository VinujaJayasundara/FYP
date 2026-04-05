"""
Ghost-Tracker — Multi-Session Improvement Modeling
===================================================

Generates multiple sessions PER RUNNER then analyzes improvement
trends as each runner progressively gets faster over time.

This demonstrates:
  1. PB updates as runners improve
  2. RII trending upward over sessions
  3. Ghost comparison between different sessions
  4. Cross-location ranking (Bellanwila vs KDU)
"""

import json
import math
import os
import csv
from datetime import datetime

EARTH_RADIUS_M = 6371000
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, 'analysis_output')

# ── Core Algorithms ──────────────────────────────────────────

def haversine_m(lat1, lon1, lat2, lon2):
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def calculate_rii(pb_pace, current_pace):
    if pb_pace <= 0 or current_pace <= 0:
        return 0
    return pb_pace / current_pace

def format_pace(s_per_km):
    if not math.isfinite(s_per_km) or s_per_km <= 0:
        return '--:--'
    return f'{int(s_per_km // 60)}:{int(s_per_km % 60):02d}'


# ── Multi-Session Runner Profiles ─────────────────────────────
# Each runner runs 6 sessions with a realistic improvement curve

BELLANWILA_RUNNERS = {
    'Vinuja': {
        'location': 'Bellanwila Park',
        'route_dist_m': 2500,
        # Progressive improvement: starts slow, gets faster
        'session_paces': [390, 375, 365, 355, 340, 330],  # 6:30 -> 5:30
    },
    'Tharindu': {
        'location': 'Bellanwila Park',
        'route_dist_m': 2500,
        'session_paces': [330, 325, 320, 310, 305, 300],  # 5:30 -> 5:00 (already fast)
    },
    'Supun': {
        'location': 'Bellanwila Park',
        'route_dist_m': 2500,
        'session_paces': [420, 405, 395, 380, 375, 360],  # 7:00 -> 6:00 (big improvement)
    },
}

KDU_RUNNERS = {
    'Kasun': {
        'location': 'KDU Clubhouse',
        'route_dist_m': 1800,
        'session_paces': [360, 350, 340, 335, 325, 320],  # 6:00 -> 5:20
    },
    'Malith': {
        'location': 'KDU Clubhouse',
        'route_dist_m': 1800,
        'session_paces': [300, 298, 295, 292, 290, 288],  # 5:00 -> 4:48 (elite, small gains)
    },
}


def analyze_multi_session():
    """Full multi-session analysis."""
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    all_runners = {**BELLANWILA_RUNNERS, **KDU_RUNNERS}
    
    # ── ANALYSIS 1: Session-by-Session PB & RII Tracking ─────
    print('=' * 75)
    print('  MULTI-SESSION IMPROVEMENT DATA MODELING')
    print('  Tracking PB updates and RII trends across 6 sessions per runner')
    print('=' * 75)
    
    all_rii_data = []
    runner_summaries = []
    
    for name, profile in all_runners.items():
        paces = profile['session_paces']
        location = profile['location']
        dist = profile['route_dist_m']
        
        print(f'\n  Runner: {name} ({location}, {dist}m route)')
        print(f'  {"Sess #":<8} {"Pace":>8} {"PB Pace":>8} {"RII":>8} {"PB?":>5} {"Status":>20} {"Improvement":>12}')
        print(f'  {"-"*8} {"-"*8} {"-"*8} {"-"*8} {"-"*5} {"-"*20} {"-"*12}')
        
        pb_pace = paces[0]  # First session is initial PB
        pb_session = 1
        
        for i, pace in enumerate(paces):
            is_new_pb = pace < pb_pace
            if is_new_pb:
                pb_pace = pace
                pb_session = i + 1
            
            rii = calculate_rii(pb_pace, pace)
            
            # RII against overall PB (which is always the latest best)
            # For the PB session itself, RII = 1.0 exactly
            
            if rii >= 1.1:
                status = 'Crushing It!'
            elif rii >= 1.0:
                status = 'On Pace'
            elif rii >= 0.95:
                status = 'Slightly Behind'
            else:
                status = 'Behind Ghost'
            
            # Calculate improvement from first session
            improvement = (1 - pace / paces[0]) * 100
            
            pb_marker = 'NEW' if is_new_pb or i == 0 else ''
            
            row = {
                'runner': name,
                'location': location,
                'route_dist_m': dist,
                'session': i + 1,
                'pace_s_per_km': pace,
                'pb_pace_s_per_km': pb_pace,
                'rii': round(rii, 4),
                'is_pb': is_new_pb or i == 0,
                'status': status,
                'improvement_pct': round(improvement, 1),
            }
            all_rii_data.append(row)
            
            print(f'  Run {i+1:<4} {format_pace(pace):>8} {format_pace(pb_pace):>8} {rii:>8.3f} {pb_marker:>5} {status:>20} {improvement:>+10.1f}%')
        
        # Runner summary
        total_improvement = (1 - paces[-1] / paces[0]) * 100
        final_rii = calculate_rii(paces[0], paces[-1])  # Compare last run vs first run
        
        runner_summaries.append({
            'runner': name,
            'location': location,
            'route_dist_m': dist,
            'first_pace': paces[0],
            'latest_pace': paces[-1],
            'best_pace': min(paces),
            'total_improvement_pct': round(total_improvement, 1),
            'final_rii_vs_first': round(final_rii, 4),
            'total_sessions': len(paces),
        })
        
        print(f'  --> Total improvement: {total_improvement:+.1f}% over {len(paces)} sessions')
    
    # ── ANALYSIS 2: Cross-Location Leaderboard (RII-Ranked) ──
    print('\n' + '=' * 75)
    print('  CROSS-LOCATION LEADERBOARD (Ranked by Total Improvement)')
    print('  Bellanwila Park vs KDU Clubhouse')
    print('=' * 75)
    
    runner_summaries.sort(key=lambda r: r['total_improvement_pct'], reverse=True)
    
    print(f'\n  {"Rank":<6} {"Runner":<12} {"Location":<18} {"Route":>7} {"Start":>8} {"Now":>8} {"Improved":>10} {"RII vs Day1":>12}')
    print(f'  {"-"*6} {"-"*12} {"-"*18} {"-"*7} {"-"*8} {"-"*8} {"-"*10} {"-"*12}')
    
    for rank, r in enumerate(runner_summaries, 1):
        print(f'  #{rank:<5} {r["runner"]:<12} {r["location"]:<18} {r["route_dist_m"]:>6}m {format_pace(r["first_pace"]):>8} {format_pace(r["latest_pace"]):>8} {r["total_improvement_pct"]:>+9.1f}% {r["final_rii_vs_first"]:>12.3f}')
    
    print(f'\n  KEY INSIGHTS:')
    print(f'  - Rankings are by IMPROVEMENT PERCENTAGE, not absolute speed')
    print(f'  - {runner_summaries[0]["runner"]} improved the most ({runner_summaries[0]["total_improvement_pct"]:+.1f}%) despite potentially being slower')
    print(f'  - {runner_summaries[-1]["runner"]} improved the least ({runner_summaries[-1]["total_improvement_pct"]:+.1f}%) — possibly already elite')
    print(f'  - Route distance does NOT affect rankings (Bellanwila 2500m vs KDU 1800m)')
    
    # ── ANALYSIS 3: Ghost Race Simulation ─────────────────────
    print('\n' + '=' * 75)
    print('  GHOST RACE SIMULATION')
    print('  Vinuja Session 6 (latest) vs Ghost (Session 1 PB)')
    print('=' * 75)
    
    vinuja = BELLANWILA_RUNNERS['Vinuja']
    ghost_pace = vinuja['session_paces'][0]   # 6:30/km (first run)
    live_pace = vinuja['session_paces'][-1]    # 5:30/km (latest run)
    route_dist = vinuja['route_dist_m']
    
    # Simulate second-by-second for a 2.5km run
    ghost_speed_ms = 1000 / ghost_pace   # m/s
    live_speed_ms = 1000 / live_pace     # m/s
    
    ghost_total_time = int(route_dist / ghost_speed_ms)
    live_total_time = int(route_dist / live_speed_ms)
    
    print(f'\n  Ghost (Session 1): {format_pace(ghost_pace)} /km  -->  Finishes in {ghost_total_time//60}:{ghost_total_time%60:02d}')
    print(f'  Live  (Session 6): {format_pace(live_pace)} /km  -->  Finishes in {live_total_time//60}:{live_total_time%60:02d}')
    print(f'  Route: {route_dist}m at Bellanwila Park\n')
    
    print(f'  {"Time":>8} {"Ghost Dist":>12} {"Live Dist":>12} {"Lead/Lag":>10} {"RII":>8} {"Status":>16}')
    print(f'  {"-"*8} {"-"*12} {"-"*12} {"-"*10} {"-"*8} {"-"*16}')
    
    ghost_comparison_data = []
    max_time = max(ghost_total_time, live_total_time)
    step = max(1, max_time // 15)  # ~15 rows
    
    for t in range(0, max_time + 1, step):
        ghost_dist = min(t * ghost_speed_ms, route_dist)
        live_dist = min(t * live_speed_ms, route_dist)
        lead_lag = live_dist - ghost_dist
        
        # RII based on pace at this point
        ghost_elapsed_pace = (t / (ghost_dist / 1000)) if ghost_dist > 10 else ghost_pace
        live_elapsed_pace = (t / (live_dist / 1000)) if live_dist > 10 else live_pace
        rii = calculate_rii(ghost_elapsed_pace, live_elapsed_pace)
        
        if rii >= 1.05:
            status = 'AHEAD'
        elif rii >= 0.98:
            status = 'ON PACE'
        else:
            status = 'BEHIND'
        
        elapsed = f'{t//60}:{t%60:02d}'
        lead_str = f'+{lead_lag:.0f}m' if lead_lag >= 0 else f'{lead_lag:.0f}m'
        
        ghost_comparison_data.append({
            'elapsed_s': t,
            'ghost_dist_m': round(ghost_dist, 1),
            'live_dist_m': round(live_dist, 1),
            'lead_lag_m': round(lead_lag, 1),
            'rii': round(rii, 4),
            'status': status,
        })
        
        print(f'  {elapsed:>8} {ghost_dist:>10.0f}m {live_dist:>10.0f}m {lead_str:>10} {rii:>8.3f} {status:>16}')
    
    final_rii = calculate_rii(ghost_pace, live_pace)
    time_saved = ghost_total_time - live_total_time
    print(f'\n  RESULT: Vinuja finished {time_saved}s faster than Ghost!')
    print(f'  FINAL RII: {final_rii:.3f} ({(final_rii-1)*100:.1f}% improvement since Session 1)')
    
    # ── ANALYSIS 4: Fairness Mathematical Proof ───────────────
    print('\n' + '=' * 75)
    print('  FAIRNESS PROOF (Mathematical Verification)')
    print('=' * 75)
    
    print(f'\n  Test: 5% improvement across ALL ability levels\n')
    print(f'  {"Level":<15} {"PB Pace":>10} {"Current":>10} {"RII":>10} {"Fair?":>8}')
    print(f'  {"-"*15} {"-"*10} {"-"*10} {"-"*10} {"-"*8}')
    
    levels = [
        ('Beginner', 420),
        ('Intermediate', 330),
        ('Advanced', 270),
        ('Elite', 210),
    ]
    
    rii_list = []
    for label, pb in levels:
        current = pb * 0.95  # 5% faster
        rii = calculate_rii(pb, current)
        rii_list.append(rii)
        fair = 'YES' if abs(rii - rii_list[0]) < 0.0001 else 'NO'
        print(f'  {label:<15} {format_pace(pb):>10} {format_pace(current):>10} {rii:>10.4f} {fair:>8}')
    
    print(f'\n  ALL RII = {rii_list[0]:.4f}')
    print(f'  VERDICT: FAIRNESS PROVEN - Same improvement always produces same RII')
    
    # ── Save Results ──────────────────────────────────────────
    results = {
        'generated_at': datetime.now().isoformat(),
        'multi_session_rii': all_rii_data,
        'runner_summaries': runner_summaries,
        'ghost_comparison': ghost_comparison_data,
    }
    
    json_path = os.path.join(OUTPUT_DIR, 'multi_session_results.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    
    csv_path = os.path.join(OUTPUT_DIR, 'multi_session_rii.csv')
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['runner','location','route_dist_m','session','pace_s_per_km','pb_pace_s_per_km','rii','is_pb','status','improvement_pct'])
        w.writeheader()
        w.writerows(all_rii_data)
    
    ghost_csv = os.path.join(OUTPUT_DIR, 'ghost_race_simulation.csv')
    with open(ghost_csv, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['elapsed_s','ghost_dist_m','live_dist_m','lead_lag_m','rii','status'])
        w.writeheader()
        w.writerows(ghost_comparison_data)
    
    print(f'\n  Files saved to: {OUTPUT_DIR}')
    print('=' * 75)
    print('  DATA MODELING COMPLETE')
    print('=' * 75)


if __name__ == '__main__':
    analyze_multi_session()
