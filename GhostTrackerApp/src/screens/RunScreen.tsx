import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import {
  haversineDistanceM,
  calculatePace,
  formatPace,
  formatTime,
  calculateRII,
  getRIIStatus,
  isValidGPS,
} from '../core/algorithms';

// Conditional imports: react-native-maps is native-only
let MapView: any = View;
let Marker: any = View;
let Polyline: any = View;
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
let WebMap: any = () => null;

if (Platform.OS !== 'web') {
  // Native: use react-native-maps
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
} else {
  // Web: use Leaflet-based fallback
  WebMap = require('../components/MapViewWeb').default;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.45;

// ── Types ─────────────────────────────────────────────────

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number | null;
  accuracy: number | null;
  seqIndex: number;
  filtered: boolean;
}

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

// ── Ghost position helper ─────────────────────────────────

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

// ── Component ─────────────────────────────────────────────

export default function RunScreen() {
  const [run, setRun] = useState<RunState>({
    status: 'idle',
    startTime: null,
    elapsedS: 0,
    distanceM: 0,
    currentPaceSPerKm: 0,
    avgPaceSPerKm: 0,
    points: [],
    validPoints: [],
    filteredCount: 0,
    splitPaces: [],
  });

  const [initialLocation, setInitialLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<any>(null);
  const seqIndexRef = useRef(0);
  const lastKmDistRef = useRef(0);
  const lastKmTimeRef = useRef(0);

  // ── Get initial location on mount ─────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setInitialLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    })();
  }, []);

  // ── Timer ─────────────────────────────────────────────

  useEffect(() => {
    if (run.status === 'running' && run.startTime) {
      timerRef.current = setInterval(() => {
        setRun((prev) => ({
          ...prev,
          elapsedS: Math.floor(
            (Date.now() - (prev.startTime || Date.now())) / 1000,
          ),
        }));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [run.status, run.startTime]);

  // ── Start Run ─────────────────────────────────────────

  const startRun = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'GPS permission is required to track your run.',
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    seqIndexRef.current = 0;
    lastKmDistRef.current = 0;
    lastKmTimeRef.current = Date.now();

    setRun({
      status: 'running',
      startTime: Date.now(),
      elapsedS: 0,
      distanceM: 0,
      currentPaceSPerKm: 0,
      avgPaceSPerKm: 0,
      points: [],
      validPoints: [],
      filteredCount: 0,
      splitPaces: [],
    });

    // Start GPS tracking at 1Hz (high accuracy)
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (location) => {
        const point: GPSPoint = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: location.timestamp,
          speed: location.coords.speed,
          accuracy: location.coords.accuracy,
          seqIndex: seqIndexRef.current++,
          filtered: false,
        };

        // GPS Filter
        const isValid = isValidGPS(point.speed, point.accuracy);
        point.filtered = !isValid;

        setRun((prev) => {
          if (prev.status !== 'running') return prev;

          const newPoints = [...prev.points, point];

          if (!isValid) {
            return {
              ...prev,
              points: newPoints,
              filteredCount: prev.filteredCount + 1,
            };
          }

          const newValidPoints = [...prev.validPoints, point];
          let newDistance = prev.distanceM;
          let currentPace = prev.currentPaceSPerKm;
          let splitPaces = [...prev.splitPaces];

          // Calculate distance from last valid point
          if (newValidPoints.length >= 2) {
            const prevPoint = newValidPoints[newValidPoints.length - 2];
            const dist = haversineDistanceM(
              prevPoint.latitude,
              prevPoint.longitude,
              point.latitude,
              point.longitude,
            );

            // Reject teleportation (>50m in 1 second)
            if (dist < 50) {
              newDistance += dist;
              const timeDelta =
                (point.timestamp - prevPoint.timestamp) / 1000;
              if (dist > 0.5 && timeDelta > 0) {
                currentPace = calculatePace(dist, timeDelta);
              }
            }
          }

          // Check for km split
          const kmCovered = Math.floor(newDistance / 1000);
          if (kmCovered > splitPaces.length) {
            const splitDist = newDistance - lastKmDistRef.current;
            const splitTime = (Date.now() - lastKmTimeRef.current) / 1000;
            const splitPace = calculatePace(splitDist, splitTime);
            splitPaces.push(splitPace);
            lastKmDistRef.current = newDistance;
            lastKmTimeRef.current = Date.now();
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          }

          const elapsed =
            (Date.now() - (prev.startTime || Date.now())) / 1000;
          const avgPace = calculatePace(newDistance, elapsed);

          return {
            ...prev,
            points: newPoints,
            validPoints: newValidPoints,
            distanceM: newDistance,
            currentPaceSPerKm: currentPace,
            avgPaceSPerKm: avgPace,
            splitPaces,
          };
        });
      },
    );
  }, []);

  // ── Stop Run ──────────────────────────────────────────

  const stopRun = useCallback(() => {
    Alert.alert('Finish Run?', 'Are you sure you want to stop?', [
      { text: 'Keep Running', style: 'cancel' },
      {
        text: 'Finish',
        style: 'destructive',
        onPress: () => {
          locationSub.current?.remove();
          locationSub.current = null;
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          setRun((prev) => ({ ...prev, status: 'finished' }));
        },
      },
    ]);
  }, []);

  // ── Reset ─────────────────────────────────────────────

  const resetRun = useCallback(() => {
    locationSub.current?.remove();
    locationSub.current = null;
    setRun({
      status: 'idle',
      startTime: null,
      elapsedS: 0,
      distanceM: 0,
      currentPaceSPerKm: 0,
      avgPaceSPerKm: 0,
      points: [],
      validPoints: [],
      filteredCount: 0,
      splitPaces: [],
    });
  }, []);

  // ── Cleanup ───────────────────────────────────────────

  useEffect(() => {
    return () => {
      locationSub.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Render ────────────────────────────────────────────

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
  const region: Region = initialLocation
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
        {Platform.OS === 'web' ? (
          <>
            <WebMap
              center={initialLocation || { latitude: 6.8448, longitude: 79.8999 }}
              height={Dimensions.get('window').height}
              interactive={false}
              showRoute={false}
            />
            <View style={styles.idleMapOverlay} />
          </>
        ) : (
          <>
            <MapView
              style={StyleSheet.absoluteFillObject}
              initialRegion={region}
              mapType="standard"
              showsUserLocation={true}
              showsMyLocationButton={false}
              showsCompass={false}
              customMapStyle={darkMapStyle}
            />
            <View style={styles.idleMapOverlay} />
          </>
        )}
      </View>

      {/* Content overlay */}
      <View style={styles.idleContent}>
        <Text style={styles.ghostEmoji}>👻</Text>
        <Text style={styles.idleTitle}>Ready to Run?</Text>
        <Text style={styles.idleSub}>
          GPS will track your route in real-time.{'\n'}
          See your path on the live map.
        </Text>

        <TouchableOpacity style={styles.startButton} onPress={onStart}>
          <Text style={styles.startButtonText}>START RUN</Text>
        </TouchableOpacity>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🗺️</Text>
            <Text style={styles.infoLabel}>Live Map</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>📡</Text>
            <Text style={styles.infoLabel}>1Hz GPS</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>👻</Text>
            <Text style={styles.infoLabel}>Ghost Race</Text>
          </View>
        </View>

        {initialLocation && (
          <Text style={styles.locationReady}>
            📍 GPS locked · {initialLocation.latitude.toFixed(4)},{' '}
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
  const ghostLeadColor = ghostLead >= 0 ? '#22c55e' : '#ef4444';

  // Live RII
  const liveRII =
    run.avgPaceSPerKm > 0 && isFinite(run.avgPaceSPerKm)
      ? calculateRII(GHOST_PB_PACE, run.avgPaceSPerKm)
      : 0;
  const riiStatus = getRIIStatus(liveRII);

  // Auto-follow camera
  useEffect(() => {
    if (followCamera && currentPosition && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        },
        500,
      );
    }
  }, [currentPosition?.latitude, currentPosition?.longitude, followCamera]);

  // Map region for first load
  const initialRegion: Region = currentPosition
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
        {Platform.OS === 'web' ? (
          <WebMap
            coordinates={routeCoords}
            currentPosition={currentPosition ? { latitude: currentPosition.latitude, longitude: currentPosition.longitude } : null}
            ghostPosition={ghostPosition}
            startPosition={routeCoords.length > 0 ? routeCoords[0] : null}
            center={currentPosition ? { latitude: currentPosition.latitude, longitude: currentPosition.longitude } : undefined}
            height={MAP_HEIGHT}
            interactive={true}
            showRoute={true}
          />
        ) : (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={initialRegion}
            mapType="standard"
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            customMapStyle={darkMapStyle}
            onPanDrag={() => setFollowCamera(false)}
          >
            {/* Route polyline */}
            {routeCoords.length >= 2 && (
              <Polyline
                coordinates={routeCoords}
                strokeColor="#22c55e"
                strokeWidth={4}
                lineDashPattern={undefined}
              />
            )}

            {/* Start marker */}
            {routeCoords.length > 0 && (
              <Marker
                coordinate={routeCoords[0]}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.startMarker}>
                  <Text style={styles.startMarkerText}>🏁</Text>
                </View>
              </Marker>
            )}

            {/* Ghost runner marker */}
            {ghostPosition && routeCoords.length >= 2 && (
              <Marker
                coordinate={ghostPosition}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.ghostMarker}>
                  <Text style={styles.ghostMarkerText}>👻</Text>
                </View>
              </Marker>
            )}

            {/* Runner marker (current position) */}
            {currentPosition && (
              <Marker
                coordinate={{
                  latitude: currentPosition.latitude,
                  longitude: currentPosition.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.runnerMarker}>
                  <View style={styles.runnerMarkerPulse} />
                  <View style={styles.runnerMarkerDot} />
                </View>
              </Marker>
            )}
          </MapView>
        )}

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
            <Text style={styles.recenterText}>📍</Text>
          </TouchableOpacity>
        )}

        {/* Ghost status overlay on map */}
        {ghostPosition && run.distanceM > 5 && (
          <View style={styles.ghostOverlay}>
            <Text style={styles.ghostOverlayIcon}>👻</Text>
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
              <Text style={styles.liveRIILabel}>👻 vs Ghost</Text>
              <Text style={[styles.liveRIIValue, { color: riiStatus.color }]}>
                {riiStatus.emoji} RII {liveRII.toFixed(3)}
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
            <Text style={styles.splitsTitle}>Splits</Text>
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
              ? `📍 ${currentPosition.latitude.toFixed(5)}, ${currentPosition.longitude.toFixed(5)}`
              : '📡 Acquiring GPS...'}
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

  const initialRegion: Region = routeCoords.length > 0
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
          {Platform.OS === 'web' ? (
            <WebMap
              coordinates={routeCoords}
              startPosition={routeCoords[0]}
              finishPosition={routeCoords[routeCoords.length - 1]}
              height={220}
              interactive={false}
              showRoute={true}
            />
          ) : (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              initialRegion={initialRegion}
              mapType="standard"
              showsUserLocation={false}
              customMapStyle={darkMapStyle}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Polyline
                coordinates={routeCoords}
                strokeColor="#22c55e"
                strokeWidth={4}
              />
              <Marker
                coordinate={routeCoords[0]}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.startMarker}>
                  <Text style={styles.startMarkerText}>🏁</Text>
                </View>
              </Marker>
              <Marker
                coordinate={routeCoords[routeCoords.length - 1]}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.finishMarker}>
                  <Text style={styles.finishMarkerText}>🏆</Text>
                </View>
              </Marker>
            </MapView>
          )}
          <View style={styles.finishedMapBadge}>
            <Text style={styles.finishedMapBadgeText}>🏁 Run Complete</Text>
          </View>
        </View>
      )}

      {/* Summary Header */}
      <View style={styles.finishHeader}>
        <Text style={styles.finishTitle}>Great Run! 🔥</Text>
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
            {riiStatus.emoji} {riiStatus.label}
          </Text>
          <Text style={styles.riiResultDesc}>
            vs PB of {formatPace(pbPace)} /km
          </Text>
        </View>
      )}

      {/* GPS Stats */}
      <View style={styles.gpsStatsCard}>
        <Text style={styles.gpsStatsTitle}>📡 GPS Quality</Text>
        <View style={styles.gpsStatsRow}>
          <View style={styles.gpsStatItem}>
            <Text style={styles.gpsStatValue}>{run.points.length}</Text>
            <Text style={styles.gpsStatLabel}>Total</Text>
          </View>
          <View style={styles.gpsStatItem}>
            <Text style={[styles.gpsStatValue, { color: '#22c55e' }]}>
              {run.validPoints.length}
            </Text>
            <Text style={styles.gpsStatLabel}>Valid</Text>
          </View>
          <View style={styles.gpsStatItem}>
            <Text style={[styles.gpsStatValue, { color: '#ef4444' }]}>
              {run.filteredCount}
            </Text>
            <Text style={styles.gpsStatLabel}>Filtered</Text>
          </View>
        </View>
      </View>

      {/* Splits */}
      {run.splitPaces.length > 0 && (
        <View style={styles.gpsStatsCard}>
          <Text style={styles.gpsStatsTitle}>⏱️ Km Splits</Text>
          {run.splitPaces.map((p, i) => (
            <View key={i} style={styles.splitRow}>
              <Text style={styles.splitKm}>km {i + 1}</Text>
              <Text style={styles.splitPace}>{formatPace(p)} /km</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.resetButton} onPress={onReset}>
        <Text style={styles.resetButtonText}>🏃 New Run</Text>
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
    backgroundColor: 'rgba(10, 14, 26, 0.75)',
  },
  idleContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ghostEmoji: { fontSize: 64, marginBottom: 16 },
  idleTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  idleSub: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
  },
  startButton: {
    marginTop: 32,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  startButtonText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 40,
  },
  infoItem: { alignItems: 'center' },
  infoIcon: { fontSize: 24 },
  infoLabel: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  locationReady: {
    marginTop: 24,
    fontSize: 12,
    color: '#22c55e',
    fontFamily: 'monospace',
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
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 2,
  },
  gpsCount: { fontSize: 10, color: '#94a3b8', marginLeft: 4 },

  recenterBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(26, 31, 53, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a3050',
  },
  recenterText: { fontSize: 20 },

  ghostOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(26, 31, 53, 0.9)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a3050',
  },
  ghostOverlayIcon: { fontSize: 16 },
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
    backgroundColor: 'rgba(34, 197, 94, 0.3)',
  },
  runnerMarkerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 3,
    borderColor: '#fff',
  },
  ghostMarker: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 20, 50, 0.8)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(168, 85, 247, 0.6)',
  },
  ghostMarkerText: { fontSize: 18 },
  startMarker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startMarkerText: { fontSize: 18 },
  finishMarker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishMarkerText: { fontSize: 18 },

  // Stats panel
  statsPanel: {
    flex: 1,
    backgroundColor: '#0a0e1a',
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
    color: '#f1f5f9',
    fontFamily:
      Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-thin',
  },
  mainStatUnit: {
    fontSize: 22,
    fontWeight: '400',
    color: '#64748b',
    marginLeft: 4,
  },

  // Live stats row
  liveStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#1a1f35',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '100%',
  },
  liveStatItem: { flex: 1, alignItems: 'center' },
  liveStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
    fontFamily: 'monospace',
  },
  liveStatLabel: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  divider: { width: 1, height: 36, backgroundColor: '#2a3050' },

  // Live RII
  liveRIIBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
    backgroundColor: '#1a1f35',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2a3050',
  },
  liveRIILeft: {},
  liveRIILabel: { fontSize: 11, color: '#94a3b8' },
  liveRIIValue: { fontSize: 16, fontWeight: '800', fontFamily: 'monospace', marginTop: 2 },
  ghostLeadBadge: { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },

  // Splits
  splitsContainer: {
    width: '100%',
    backgroundColor: '#1a1f35',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  splitsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  splitKm: { fontSize: 13, color: '#94a3b8' },
  splitPace: {
    fontSize: 13,
    color: '#22c55e',
    fontFamily: 'monospace',
    fontWeight: '600',
  },

  // GPS indicator
  gpsIndicator: {
    marginTop: 10,
    alignItems: 'center',
  },
  gpsLabel: { fontSize: 11, color: '#64748b', fontFamily: 'monospace' },
  gpsAccuracy: { fontSize: 10, color: '#3b82f6', marginTop: 2 },

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
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopInner: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  stopLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ef4444',
    marginTop: 6,
    letterSpacing: 2,
  },

  // ── FINISHED ──────────────────────────────────────────
  finishedScroll: {
    flex: 1,
    backgroundColor: '#0a0e1a',
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
    borderWidth: 1,
    borderColor: '#2a3050',
  },
  finishedMapBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(26, 31, 53, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e40',
  },
  finishedMapBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22c55e',
  },
  finishHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  finishTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f1f5f9',
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#1a1f35',
    borderRadius: 16,
    padding: 24,
    marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f1f5f9',
    fontFamily: 'monospace',
  },
  summaryLabel: { fontSize: 12, color: '#64748b', marginTop: 4 },

  // RII Result
  riiResultCard: {
    width: '100%',
    backgroundColor: '#1a1f35',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a3050',
  },
  riiResultLabel: { fontSize: 13, color: '#94a3b8' },
  riiResultValue: {
    fontSize: 44,
    fontWeight: '800',
    fontFamily: 'monospace',
    marginVertical: 4,
  },
  riiResultDesc: { fontSize: 12, color: '#64748b', marginTop: 4 },

  // GPS Stats
  gpsStatsCard: {
    width: '100%',
    backgroundColor: '#1a1f35',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  gpsStatsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 10,
  },
  gpsStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gpsStatItem: { alignItems: 'center' },
  gpsStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f1f5f9',
    fontFamily: 'monospace',
  },
  gpsStatLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },

  // Reset
  resetButton: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    alignSelf: 'center',
  },
  resetButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
