"""
Ghost-Tracker Synthetic GPS Data Generator
==========================================

Generates realistic GPS telemetry data modeling a running track
at Bellanwila Park, Sri Lanka (6.8413°N, 79.8815°E).

Outputs:
  - CSV file: scripts/test_data/bellanwila_telemetry.csv
  - JSON file: scripts/test_data/bellanwila_telemetry.json
  - Summary stats printed to console

Features:
  - Realistic loop route (~2.5km perimeter)
  - 1Hz sampling (1 point per second)
  - Random GPS noise (±3m accuracy variation)
  - Pace variation (4:30 - 6:00 min/km)
  - Multiple sessions with different runners
  - Occasional GPS spikes (for filter testing)
"""

import json
import csv
import math
import random
import os
import uuid
from datetime import datetime, timedelta

# ============================================================
# Constants
# ============================================================
EARTH_RADIUS_M = 6371000
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'test_data')

# Bellanwila Park approximate corners (loop route)
# These form a realistic ~2.5km rectangular-ish loop
ROUTE_WAYPOINTS = [
    (6.84080, 79.88080),  # SW corner - Start/Finish
    (6.84080, 79.88280),  # SE corner
    (6.84280, 79.88280),  # NE corner
    (6.84280, 79.88080),  # NW corner
]

# ============================================================
# Utility Functions
# ============================================================

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two GPS coordinates in meters."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def interpolate_coords(lat1, lon1, lat2, lon2, fraction):
    """Linearly interpolate between two coordinates."""
    return (
        lat1 + (lat2 - lat1) * fraction,
        lon1 + (lon2 - lon1) * fraction,
    )


def add_gps_noise(lat, lon, noise_m=3.0):
    """Add realistic GPS noise to coordinates."""
    # Convert meters of noise to approximate degree offset
    noise_lat = random.gauss(0, noise_m / 111320)  # ~111.32km per degree latitude
    noise_lon = random.gauss(0, noise_m / (111320 * math.cos(math.radians(lat))))
    return lat + noise_lat, lon + noise_lon


def calculate_route_segments():
    """
    Calculate route segments with distances.
    Returns list of (start, end, distance_m) tuples.
    """
    segments = []
    waypoints = ROUTE_WAYPOINTS + [ROUTE_WAYPOINTS[0]]  # Close the loop
    
    for i in range(len(waypoints) - 1):
        start = waypoints[i]
        end = waypoints[i + 1]
        dist = haversine_distance(start[0], start[1], end[0], end[1])
        segments.append((start, end, dist))
    
    return segments


# ============================================================
# Data Generation
# ============================================================

def generate_session(
    session_id,
    route_id,
    base_pace_s_per_km=330,  # 5:30 min/km default
    pace_variation=30,        # ±30 s/km variation
    start_time=None,
    inject_spikes=True,
    spike_probability=0.02,   # 2% chance of GPS spike per point
):
    """
    Generate a complete running session with realistic GPS telemetry.
    
    Args:
        session_id: UUID for this session
        route_id: Route identifier
        base_pace_s_per_km: Average pace in seconds per km
        pace_variation: Random pace fluctuation range
        start_time: Session start timestamp (datetime)
        inject_spikes: Whether to inject GPS spikes for filter testing
        spike_probability: Probability of a GPS spike per point
    
    Returns:
        List of telemetry point dicts
    """
    if start_time is None:
        start_time = datetime(2026, 3, 15, 6, 30, 0)  # Morning run
    
    segments = calculate_route_segments()
    total_route_distance = sum(seg[2] for seg in segments)
    
    points = []
    current_time = start_time
    seq_index = 0
    cumulative_distance = 0
    
    for seg_start, seg_end, seg_distance in segments:
        # Calculate how many seconds this segment takes
        segment_pace = base_pace_s_per_km + random.uniform(-pace_variation, pace_variation)
        segment_time_s = (seg_distance / 1000) * segment_pace
        num_points = int(segment_time_s)  # 1Hz sampling
        
        for i in range(num_points):
            fraction = i / max(num_points - 1, 1)
            lat, lon = interpolate_coords(
                seg_start[0], seg_start[1],
                seg_end[0], seg_end[1],
                fraction,
            )
            
            # Add GPS noise
            noisy_lat, noisy_lon = add_gps_noise(lat, lon, noise_m=random.uniform(1.0, 5.0))
            
            # Calculate velocity (m/s)
            if len(points) > 0:
                prev = points[-1]
                dist = haversine_distance(prev['latitude'], prev['longitude'], noisy_lat, noisy_lon)
                velocity = dist / 1.0  # 1 second interval
                cumulative_distance += dist
            else:
                velocity = 0
            
            # GPS accuracy (realistic range: 3-15m, occasionally worse)
            accuracy = random.uniform(3, 15)
            
            # Inject GPS spike for testing filters
            if inject_spikes and random.random() < spike_probability:
                # Teleport spike: jump 500m-2km in random direction
                spike_lat = noisy_lat + random.uniform(-0.015, 0.015)
                spike_lon = noisy_lon + random.uniform(-0.015, 0.015)
                noisy_lat, noisy_lon = spike_lat, spike_lon
                accuracy = random.uniform(50, 200)  # Spike = low accuracy
                velocity = random.uniform(15, 50)    # Impossibly fast
            
            point = {
                'id': str(uuid.uuid4()),
                'session_id': session_id,
                'latitude': round(noisy_lat, 7),
                'longitude': round(noisy_lon, 7),
                'timestamp': int(current_time.timestamp() * 1000),  # Unix ms
                'velocity': round(velocity, 3),
                'accuracy': round(accuracy, 2),
                'seq_index': seq_index,
            }
            
            points.append(point)
            current_time += timedelta(seconds=1)
            seq_index += 1
    
    return points


def generate_dataset(
    num_sessions=5,
    route_id='bellanwila-loop-01',
    min_points_target=1000,
):
    """
    Generate a complete test dataset with multiple sessions.
    
    Ensures at least min_points_target total points are generated.
    """
    all_points = []
    sessions = []
    
    # Define different runner profiles for variety
    profiles = [
        {'alias': 'Kamal',  'pace': 300, 'variation': 20},   # 5:00 min/km (fast)
        {'alias': 'Nuwan',  'pace': 330, 'variation': 25},   # 5:30 min/km
        {'alias': 'Dilshan','pace': 360, 'variation': 30},   # 6:00 min/km
        {'alias': 'Tharindu','pace': 270, 'variation': 15},  # 4:30 min/km (very fast)
        {'alias': 'Supun',  'pace': 390, 'variation': 35},   # 6:30 min/km (beginner)
    ]
    
    for i in range(num_sessions):
        profile = profiles[i % len(profiles)]
        session_id = str(uuid.uuid4())
        device_id = f'device-{profile["alias"].lower()}'
        
        start_time = datetime(2026, 3, 15 + i, 6, 30, 0)
        
        points = generate_session(
            session_id=session_id,
            route_id=route_id,
            base_pace_s_per_km=profile['pace'],
            pace_variation=profile['variation'],
            start_time=start_time,
            inject_spikes=(i == 0),  # Only inject spikes in first session
        )
        
        # Calculate session stats
        total_distance = 0
        for j in range(1, len(points)):
            total_distance += haversine_distance(
                points[j-1]['latitude'], points[j-1]['longitude'],
                points[j]['latitude'], points[j]['longitude'],
            )
        
        total_time_s = (points[-1]['timestamp'] - points[0]['timestamp']) / 1000
        avg_pace = total_time_s / (total_distance / 1000) if total_distance > 0 else 0
        
        session = {
            'id': session_id,
            'device_id': device_id,
            'user_alias': profile['alias'],
            'route_id': route_id,
            'started_at': points[0]['timestamp'],
            'ended_at': points[-1]['timestamp'],
            'total_distance_m': round(total_distance, 2),
            'avg_pace_s_per_km': round(avg_pace, 2),
            'total_time_s': round(total_time_s, 2),
            'point_count': len(points),
            'is_pb': False,
        }
        
        sessions.append(session)
        all_points.extend(points)
    
    # Mark the fastest session as PB
    if sessions:
        fastest = min(sessions, key=lambda s: s['avg_pace_s_per_km'])
        fastest['is_pb'] = True
    
    # Generate more sessions if we haven't hit the minimum target
    extra_session_idx = num_sessions
    while len(all_points) < min_points_target:
        profile = profiles[extra_session_idx % len(profiles)]
        session_id = str(uuid.uuid4())
        start_time = datetime(2026, 3, 15 + extra_session_idx, 6, 30, 0)
        
        points = generate_session(
            session_id=session_id,
            route_id=route_id,
            base_pace_s_per_km=profile['pace'],
            pace_variation=profile['variation'],
            start_time=start_time,
            inject_spikes=False,
        )
        
        total_distance = sum(
            haversine_distance(
                points[j-1]['latitude'], points[j-1]['longitude'],
                points[j]['latitude'], points[j]['longitude'],
            )
            for j in range(1, len(points))
        )
        total_time_s = (points[-1]['timestamp'] - points[0]['timestamp']) / 1000
        
        sessions.append({
            'id': session_id,
            'device_id': f'device-{profile["alias"].lower()}',
            'user_alias': profile['alias'],
            'route_id': route_id,
            'started_at': points[0]['timestamp'],
            'ended_at': points[-1]['timestamp'],
            'total_distance_m': round(total_distance, 2),
            'avg_pace_s_per_km': round(total_time_s / (total_distance / 1000) if total_distance > 0 else 0, 2),
            'total_time_s': round(total_time_s, 2),
            'point_count': len(points),
            'is_pb': False,
        })
        all_points.extend(points)
        extra_session_idx += 1
    
    return all_points, sessions


# ============================================================
# Output
# ============================================================

def save_csv(points, filepath):
    """Save telemetry points to CSV."""
    fieldnames = ['id', 'session_id', 'latitude', 'longitude', 'timestamp', 'velocity', 'accuracy', 'seq_index']
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(points)
    
    print(f"  CSV saved: {filepath} ({len(points)} rows)")


def save_json(data, filepath):
    """Save data to JSON."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    size_kb = os.path.getsize(filepath) / 1024
    print(f"  JSON saved: {filepath} ({size_kb:.1f} KB)")


def main():
    """Generate the complete synthetic test dataset."""
    print("=" * 60)
    print("Ghost-Tracker Synthetic GPS Data Generator")
    print(f"Location: Bellanwila Park, Sri Lanka")
    print(f"Route: ~2.5km rectangular loop")
    print("=" * 60)
    
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Generate dataset
    print("\nGenerating data...")
    points, sessions = generate_dataset(
        num_sessions=5,
        min_points_target=1000,
    )
    
    # Calculate route distance
    segments = calculate_route_segments()
    route_distance = sum(seg[2] for seg in segments)
    
    # Save outputs
    print("\nSaving files...")
    save_csv(points, os.path.join(OUTPUT_DIR, 'bellanwila_telemetry.csv'))
    save_json({
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'location': 'Bellanwila Park, Colombo, Sri Lanka',
            'route_center': {'latitude': 6.8413, 'longitude': 79.8815},
            'route_distance_m': round(route_distance, 2),
            'total_points': len(points),
            'total_sessions': len(sessions),
            'sampling_rate_hz': 1,
        },
        'sessions': sessions,
        'telemetry': points,
    }, os.path.join(OUTPUT_DIR, 'bellanwila_telemetry.json'))
    
    # Save sessions summary
    save_json(sessions, os.path.join(OUTPUT_DIR, 'sessions_summary.json'))
    
    # Print summary
    print("\n" + "=" * 60)
    print("DATASET SUMMARY")
    print("=" * 60)
    print(f"  Total points:    {len(points):,}")
    print(f"  Total sessions:  {len(sessions)}")
    print(f"  Route distance:  {route_distance:.0f}m ({route_distance/1000:.2f}km)")
    print()
    
    print("  SESSION DETAILS:")
    print(f"  {'Alias':<12} {'Points':>8} {'Distance':>10} {'Pace':>12} {'PB':>5}")
    print(f"  {'-'*12} {'-'*8} {'-'*10} {'-'*12} {'-'*5}")
    for s in sessions:
        pace_min = int(s['avg_pace_s_per_km'] // 60)
        pace_sec = int(s['avg_pace_s_per_km'] % 60)
        pb_marker = '★' if s['is_pb'] else ''
        print(f"  {s['user_alias']:<12} {s['point_count']:>8} {s['total_distance_m']:>9.0f}m {pace_min}:{pace_sec:02d} min/km  {pb_marker:>5}")
    
    # Count GPS spikes
    spike_count = sum(1 for p in points if p['accuracy'] > 50)
    print(f"\n  GPS spikes injected: {spike_count} (for filter testing)")
    
    print("\n✅ Data generation complete!")
    print(f"   Files saved to: {OUTPUT_DIR}")


if __name__ == '__main__':
    main()
