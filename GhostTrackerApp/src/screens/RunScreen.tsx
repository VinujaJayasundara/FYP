/**
 * RunScreen — Run Tracking UI (Presentation Only)
 * ==================================================
 * All run state, GPS subscription, and timer management have been moved
 * to RunContext.  This screen is now a pure presentation layer that reads
 * from the context via useRun() and renders one of three views:
 *   - IdleView        — map preview + "Start" button
 *   - RunningView     — live map, stats, stop button
 *   - FinishedView    — run summary, route map, reset button
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import {
  haversineDistanceM,
  formatPace,
  formatTime,
  calculateRII,
  getRIIStatus,
} from '../core/algorithms';
import { useRun, type GPSPoint } from '../context/RunContext';

import {
  IdleMap,
  RunningMap,
  FinishedMap,
  animateMapToRegion,
  fitMapToCoordinates,
} from '../components/RunMap';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.45;

// ── Ghost position helper (interpolate along route) ───────

function getPositionAlongRoute(
  points: { latitude: number; longitude: number }[],
  targetDistM: number,
): { latitude: number; longitude: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1 || targetDistM <= 0) return points[0];

  let accumulated = 0;
  for (let i = 1; i < points.length; i++) {
    const segDist = haversineDistanceM(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    );
    if (accumulated + segDist >= targetDistM) {
      const fraction = segDist > 0 ? (targetDistM - accumulated) / segDist : 0;
      return {
        latitude:
          points[i - 1].latitude +
          fraction * (points[i].latitude - points[i - 1].latitude),
        longitude:
          points[i - 1].longitude +
          fraction * (points[i].longitude - points[i - 1].longitude),
      };
    }
    accumulated += segDist;
  }
  return points[points.length - 1];
}

// ── Main Component ────────────────────────────────────────

export default function RunScreen() {
  // All state comes from context — no local run state
  const { run, initialLocation, startRun, stopRun, resetRun } = useRun();
  const mapRef = useRef<any>(null);

  if (run.status === 'idle') {
    return <IdleView onStart={startRun} initialLocation={initialLocation} />;
  }

  if (run.status === 'finished') {
    return <FinishedView run={run} onReset={resetRun} />;
  }

  return <RunningView run={run} onStop={stopRun} mapRef={mapRef} />;
}

// ═══════════════════════════════════════════════════════════
// IDLE VIEW — Map preview + "Press to Start"
// ═══════════════════════════════════════════════════════════

function IdleView({
  onStart,
  initialLocation,
}: {
  onStart: () => void;
  initialLocation: { latitude: number; longitude: number } | null;
}) {
  const region = initialLocation
    ? {
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : {
        // Default to Bellanwila Park area
        latitude: 6.8448,
        longitude: 79.8999,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };

  return (
    <View style={styles.idleContainer}>
      {/* Background Map */}
      <View style={styles.idleMapContainer}>
        <IdleMap region={region} />
        <View style={styles.idleMapOverlay} />
      </View>

      {/* Content overlay */}
      <View style={styles.idleContent}>
        <Text style={styles.idleTitle}>START YOUR RUN</Text>
        <Text style={styles.idleSub}>
          GPS tracking is ready.{'\n'}
          Your route will appear on the live map.
        </Text>

        <TouchableOpacity style={styles.startButton} onPress={onStart}>
          <Text style={styles.startButtonText}>START</Text>
        </TouchableOpacity>

        <View style={styles.infoRow}>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>GPS</Text>
          </View>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>1 Hz</Text>
          </View>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>LIVE MAP</Text>
          </View>
        </View>

        {initialLocation && (
          <Text style={styles.locationReady}>
            GPS LOCKED · {initialLocation.latitude.toFixed(4)},{' '}
            {initialLocation.longitude.toFixed(4)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// RUNNING VIEW — Live Map + Stats
// ═══════════════════════════════════════════════════════════

interface RunState {
  status: 'idle' | 'running' | 'paused' | 'finished';
  startTime: number | null;
  elapsedS: number;
  distanceM: number;
  currentPaceSPerKm: number;
  avgPaceSPerKm: number;
  points: GPSPoint[];
  validPoints: GPSPoint[];
  filteredCount: number;
  splitPaces: number[];
}

function RunningView({
  run,
  onStop,
  mapRef,
}: {
  run: RunState;
  onStop: () => void;
  mapRef: React.MutableRefObject<any>;
}) {
  const [followCamera, setFollowCamera] = useState(true);

  const distKm = (run.distanceM / 1000).toFixed(2);
  const elapsed = formatTime(run.elapsedS);
  const pace =
    run.avgPaceSPerKm > 0 && isFinite(run.avgPaceSPerKm)
      ? formatPace(run.avgPaceSPerKm)
      : '--:--';
  const currentPace =
    run.currentPaceSPerKm > 0 && isFinite(run.currentPaceSPerKm)
      ? formatPace(run.currentPaceSPerKm)
      : '--:--';

  // Route coordinates for polyline
  const routeCoords = useMemo(
    () =>
      run.validPoints.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    [run.validPoints],
  );

  // Current runner position
  const currentPosition =
    run.validPoints.length > 0
      ? run.validPoints[run.validPoints.length - 1]
      : null;

  // Ghost position — ghost runs at PB pace (6:00/km = 360 s/km)
  const GHOST_PB_PACE = 360;
  const ghostDistM = run.elapsedS * (1000 / GHOST_PB_PACE);
  const ghostPosition = useMemo(
    () => getPositionAlongRoute(routeCoords, ghostDistM),
    [routeCoords, ghostDistM],
  );

  // Ghost lead/lag
  const ghostLead = run.distanceM - ghostDistM;
  const ghostLeadText =
    ghostLead >= 0
      ? `+${Math.round(ghostLead)}m ahead`
      : `${Math.round(Math.abs(ghostLead))}m behind`;
  const ghostLeadColor = ghostLead >= 0 ? '#00FF87' : '#FF3B30';

  // Live RII
  const liveRII =
    run.avgPaceSPerKm > 0 && isFinite(run.avgPaceSPerKm)
      ? calculateRII(GHOST_PB_PACE, run.avgPaceSPerKm)
      : 0;
  const riiStatus = getRIIStatus(liveRII);

  // Auto-follow camera
  useEffect(() => {
    if (followCamera && currentPosition && mapRef.current) {
      animateMapToRegion(mapRef, {
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }, 500);
    }
  }, [currentPosition?.latitude, currentPosition?.longitude, followCamera]);

  // Map region for first load
  const initialRegion = currentPosition
    ? {
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }
    : {
        latitude: 6.8448,
        longitude: 79.8999,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };

  return (
    <View style={styles.runContainer}>
      {/* ── Live Map ────────────────────────────────────── */}
      <View style={styles.mapWrapper}>
        <RunningMap
          mapRef={mapRef}
          initialRegion={initialRegion}
          routeCoords={routeCoords}
          currentPosition={currentPosition}
          ghostPosition={ghostPosition}
          onPanDrag={() => setFollowCamera(false)}
        />

        {/* Map overlays */}
        <View style={styles.mapTopOverlay}>
          <View style={styles.liveBar}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>RECORDING</Text>
            <Text style={styles.gpsCount}>
              {run.validPoints.length} pts · {run.filteredCount} filtered
            </Text>
          </View>
        </View>

        {/* Re-center button */}
        {!followCamera && Platform.OS !== 'web' && (
          <TouchableOpacity
            style={styles.recenterBtn}
            onPress={() => setFollowCamera(true)}
          >
            <View style={styles.recenterIcon} />
          </TouchableOpacity>
        )}

        {/* Ghost status overlay on map */}
        {ghostPosition && run.distanceM > 5 && (
          <View style={styles.ghostOverlay}>
            <Text style={styles.ghostOverlayLabel}>GHOST</Text>
            <Text style={[styles.ghostOverlayText, { color: ghostLeadColor }]}>
              {ghostLeadText}
            </Text>
          </View>
        )}
      </View>

      {/* ── Stats Panel ─────────────────────────────────── */}
      <ScrollView
        style={styles.statsPanel}
        contentContainerStyle={styles.statsPanelContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main distance */}
        <View style={styles.mainStat}>
          <Text style={styles.mainStatValue}>{distKm}</Text>
          <Text style={styles.mainStatUnit}>km</Text>
        </View>

        {/* Stats grid */}
        <View style={styles.liveStats}>
          <View style={styles.liveStatItem}>
            <Text style={styles.liveStatValue}>{elapsed}</Text>
            <Text style={styles.liveStatLabel}>Duration</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.liveStatItem}>
            <Text style={styles.liveStatValue}>{pace}</Text>
            <Text style={styles.liveStatLabel}>Avg Pace</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.liveStatItem}>
            <Text style={styles.liveStatValue}>{currentPace}</Text>
            <Text style={styles.liveStatLabel}>Current</Text>
          </View>
        </View>

        {/* Live RII vs Ghost */}
        {liveRII > 0 && (
          <View style={styles.liveRIIBar}>
            <View style={styles.liveRIILeft}>
              <Text style={styles.liveRIILabel}>VS GHOST</Text>
              <Text style={[styles.liveRIIValue, { color: riiStatus.color }]}>
                RII {liveRII.toFixed(3)}
              </Text>
            </View>
            <Text style={[styles.ghostLeadBadge, { color: ghostLeadColor }]}>
              {ghostLeadText}
            </Text>
          </View>
        )}

        {/* Split times */}
        {run.splitPaces.length > 0 && (
          <View style={styles.splitsContainer}>
            <Text style={styles.splitsTitle}>SPLITS</Text>
            {run.splitPaces.map((p, i) => (
              <View key={i} style={styles.splitRow}>
                <Text style={styles.splitKm}>km {i + 1}</Text>
                <Text style={styles.splitPace}>{formatPace(p)} /km</Text>
              </View>
            ))}
          </View>
        )}

        {/* GPS accuracy */}
        <View style={styles.gpsIndicator}>
          <Text style={styles.gpsLabel}>
            {currentPosition
              ? `${currentPosition.latitude.toFixed(5)}, ${currentPosition.longitude.toFixed(5)}`
              : 'ACQUIRING GPS...'}
          </Text>
          {currentPosition?.accuracy && (
            <Text style={styles.gpsAccuracy}>
              ±{currentPosition.accuracy.toFixed(0)}m accuracy
            </Text>
          )}
        </View>

        {/* Stop Button */}
        <View style={styles.stopArea}>
          <TouchableOpacity style={styles.stopButton} onPress={onStop}>
            <View style={styles.stopInner} />
          </TouchableOpacity>
          <Text style={styles.stopLabel}>STOP</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// FINISHED VIEW — Summary + Route Map
// ═══════════════════════════════════════════════════════════

function FinishedView({
  run,
  onReset,
}: {
  run: RunState;
  onReset: () => void;
}) {
  const mapRef = useRef<any>(null);
  const distKm = (run.distanceM / 1000).toFixed(2);
  const elapsed = formatTime(run.elapsedS);
  const pace = formatPace(run.avgPaceSPerKm);

  const routeCoords = useMemo(
    () =>
      run.validPoints.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    [run.validPoints],
  );

  // Fit map to route
  useEffect(() => {
    if (mapRef.current && routeCoords.length >= 2) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(routeCoords, {
          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
          animated: true,
        });
      }, 500);
    }
  }, [routeCoords]);

  // RII comparison
  const pbPace = 360;
  const rii =
    run.avgPaceSPerKm > 0 && isFinite(run.avgPaceSPerKm)
      ? calculateRII(pbPace, run.avgPaceSPerKm)
      : 0;
  const riiStatus = getRIIStatus(rii);

  const initialRegion = routeCoords.length > 0
    ? {
        latitude: routeCoords[0].latitude,
        longitude: routeCoords[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : {
        latitude: 6.8448,
        longitude: 79.8999,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

  return (
    <ScrollView
      style={styles.finishedScroll}
      contentContainerStyle={styles.finishedContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Route Map */}
      {routeCoords.length >= 2 && (
        <View style={styles.finishedMapContainer}>
          <FinishedMap
            mapRef={mapRef}
            initialRegion={initialRegion}
            routeCoords={routeCoords}
          />
          <View style={styles.finishedMapBadge}>
            <Text style={styles.finishedMapBadgeText}>RUN COMPLETE</Text>
          </View>
        </View>
      )}

      {/* Summary Header */}
      <View style={styles.finishHeader}>
        <Text style={styles.finishTitle}>Great Run</Text>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{distKm}</Text>
            <Text style={styles.summaryLabel}>km</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{elapsed}</Text>
            <Text style={styles.summaryLabel}>time</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{pace}</Text>
            <Text style={styles.summaryLabel}>/km</Text>
          </View>
        </View>
      </View>

      {/* RII Score */}
      {rii > 0 && (
        <View style={styles.riiResultCard}>
          <Text style={styles.riiResultLabel}>RII Score</Text>
          <Text style={[styles.riiResultValue, { color: riiStatus.color }]}>
            {rii.toFixed(3)}
          </Text>
          <Text
            style={{ color: riiStatus.color, fontWeight: '600', fontSize: 14 }}
          >
            {riiStatus.label}
          </Text>
          <Text style={styles.riiResultDesc}>
            vs PB of {formatPace(pbPace)} /km
          </Text>
        </View>
      )}

      {/* GPS Stats */}
      <View style={styles.gpsStatsCard}>
        <Text style={styles.gpsStatsTitle}>GPS QUALITY</Text>
        <View style={styles.gpsStatsRow}>
          <View style={styles.gpsStatItem}>
            <Text style={styles.gpsStatValue}>{run.points.length}</Text>
            <Text style={styles.gpsStatLabel}>Total</Text>
          </View>
          <View style={styles.gpsStatItem}>
            <Text style={[styles.gpsStatValue, { color: '#00FF87' }]}>
              {run.validPoints.length}
            </Text>
            <Text style={styles.gpsStatLabel}>Valid</Text>
          </View>
          <View style={styles.gpsStatItem}>
            <Text style={[styles.gpsStatValue, { color: '#FF3B30' }]}>
              {run.filteredCount}
            </Text>
            <Text style={styles.gpsStatLabel}>Filtered</Text>
          </View>
        </View>
      </View>

      {/* Splits */}
      {run.splitPaces.length > 0 && (
        <View style={styles.gpsStatsCard}>
          <Text style={styles.gpsStatsTitle}>KM SPLITS</Text>
          {run.splitPaces.map((p, i) => (
            <View key={i} style={styles.splitRow}>
              <Text style={styles.splitKm}>km {i + 1}</Text>
              <Text style={styles.splitPace}>{formatPace(p)} /km</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.resetButton} onPress={onReset}>
        <Text style={styles.resetButtonText}>NEW RUN</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════
// DARK MAP STYLE
// ═══════════════════════════════════════════════════════════

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0a0e1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0e1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1a1f35' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2a3050' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2a3050' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0f1729' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#111827' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0f1f15' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#111827' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
];

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // ── IDLE ──────────────────────────────────────────────
  idleContainer: {
    flex: 1,
  },
  idleMapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  idleMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  idleContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  idleTitle: {
    fontSize: 32,
    fontWeight: '200',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 3,
  },
  idleSub: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  startButton: {
    marginTop: 40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#00FF87',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 10,
  },
  startButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 3,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 40,
  },
  infoPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#38383A',
  },
  infoPillText: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '600',
    letterSpacing: 1,
  },
  locationReady: {
    marginTop: 24,
    fontSize: 11,
    color: '#00FF87',
    letterSpacing: 1,
    fontWeight: '500',
  },

  // ── RUNNING ───────────────────────────────────────────
  runContainer: {
    flex: 1,
  },

  // Map
  mapWrapper: {
    height: MAP_HEIGHT,
    position: 'relative',
  },
  mapTopOverlay: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    alignItems: 'flex-start',
  },
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF3B30',
    letterSpacing: 2,
  },
  gpsCount: { fontSize: 10, color: '#8E8E93', marginLeft: 4 },

  recenterBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  ghostOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    borderRadius: 16,
  },
  ghostOverlayLabel: {
    fontSize: 10, fontWeight: '700', color: '#8E8E93', letterSpacing: 1,
  },
  ghostOverlayText: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  // Markers
  runnerMarker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runnerMarkerPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 255, 135, 0.3)',
  },
  runnerMarkerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00FF87',
    borderWidth: 3,
    borderColor: '#fff',
  },
  ghostMarker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 59, 48, 0.5)',
  },
  ghostMarkerInner: {
    flexDirection: 'row',
    gap: 4,
  },
  ghostEye: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF3B30',
  },
  startMarker: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00FF87',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  finishMarker: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishMarkerDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFD60A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishMarkerDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#000000',
  },

  // Stats panel
  statsPanel: {
    flex: 1,
    backgroundColor: '#000000',
  },
  statsPanelContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },

  // Main distance
  mainStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  mainStatValue: {
    fontSize: 64,
    fontWeight: '200',
    color: '#FFFFFF',
    fontFamily:
      Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-thin',
  },
  mainStatUnit: {
    fontSize: 22,
    fontWeight: '400',
    color: '#636366',
    marginLeft: 4,
  },

  // Live stats row
  liveStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '100%',
  },
  liveStatItem: { flex: 1, alignItems: 'center' },
  liveStatValue: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  liveStatLabel: {
    fontSize: 9,
    color: '#636366',
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 1,
  },
  divider: { width: 1, height: 36, backgroundColor: '#38383A' },

  // Live RII
  liveRIIBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  liveRIILeft: {},
  liveRIILabel: {
    fontSize: 10, color: '#8E8E93', fontWeight: '600', letterSpacing: 1,
  },
  liveRIIValue: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace', marginTop: 2 },
  ghostLeadBadge: { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },

  // Splits
  splitsContainer: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  splitsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    letterSpacing: 1.5,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  splitKm: { fontSize: 13, color: '#8E8E93' },
  splitPace: {
    fontSize: 13,
    color: '#00FF87',
    fontFamily: 'monospace',
    fontWeight: '600',
  },

  // GPS indicator
  gpsIndicator: {
    marginTop: 10,
    alignItems: 'center',
  },
  gpsLabel: { fontSize: 10, color: '#636366', fontFamily: 'monospace' },
  gpsAccuracy: { fontSize: 10, color: '#0A84FF', marginTop: 2 },

  // Stop area
  stopArea: {
    alignItems: 'center',
    marginTop: 16,
  },
  stopButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopInner: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },
  stopLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF3B30',
    marginTop: 6,
    letterSpacing: 2,
  },

  // ── FINISHED ──────────────────────────────────────────
  finishedScroll: {
    flex: 1,
    backgroundColor: '#000000',
  },
  finishedContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 40,
  },
  finishedMapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  finishedMapBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  finishedMapBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00FF87',
    letterSpacing: 1,
  },
  finishHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  finishTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  summaryLabel: {
    fontSize: 10, color: '#636366', marginTop: 4,
    fontWeight: '600', letterSpacing: 1,
  },

  // RII Result
  riiResultCard: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#00FF8730',
  },
  riiResultLabel: {
    fontSize: 10, color: '#8E8E93', fontWeight: '600', letterSpacing: 2,
  },
  riiResultValue: {
    fontSize: 48,
    fontWeight: '200',
    fontFamily: 'monospace',
    marginVertical: 4,
  },
  riiResultDesc: { fontSize: 12, color: '#636366', marginTop: 4 },

  // GPS Stats
  gpsStatsCard: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  gpsStatsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 10,
    letterSpacing: 1.5,
  },
  gpsStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gpsStatItem: { alignItems: 'center' },
  gpsStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  gpsStatLabel: {
    fontSize: 10,
    color: '#636366',
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Reset
  resetButton: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#00FF87',
    borderRadius: 12,
    alignSelf: 'center',
  },
  resetButtonText: {
    fontSize: 14, fontWeight: '700', color: '#000000', letterSpacing: 1,
  },
});
