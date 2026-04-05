/**
 * RunContext — Global Run State Management
 * ==========================================
 * Owns the GPS subscription and timer at the provider level so that
 * run tracking survives tab navigation.  Every screen can read the
 * live run state via `useRun()` and trigger start / stop / reset.
 */

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import {
  haversineDistanceM,
  calculatePace,
  isValidGPS,
} from '../core/algorithms';

// ── Types ─────────────────────────────────────────────────

export interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number | null;
  accuracy: number | null;
  seqIndex: number;
  filtered: boolean;
}

export interface RunState {
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

interface RunContextValue {
  run: RunState;
  initialLocation: { latitude: number; longitude: number } | null;
  startRun: () => Promise<void>;
  stopRun: () => void;
  resetRun: () => void;
}

// ── Initial state ─────────────────────────────────────────

const INITIAL_RUN: RunState = {
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
};

// ── Context ───────────────────────────────────────────────

const RunContext = createContext<RunContextValue | null>(null);

/**
 * Hook to consume run state from any component.
 */
export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error('useRun must be used within <RunProvider>');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────

export function RunProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<RunState>(INITIAL_RUN);
  const [initialLocation, setInitialLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Refs survive re-renders and are not tied to any particular screen
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seqIndexRef = useRef(0);
  const lastKmDistRef = useRef(0);
  const lastKmTimeRef = useRef(0);

  // ── Acquire initial location on mount ───────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setInitialLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        } catch {
          // GPS may be unavailable on web — fail silently
        }
      }
    })();
  }, []);

  // ── Timer — ticks every second while running ────────────

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
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [run.status, run.startTime]);

  // ── Start Run ───────────────────────────────────────────

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

    // Reset sequence counters
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

    // Start GPS tracking at 1 Hz (high accuracy)
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

        // GPS quality filter
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

            // Reject teleportation (>50 m in ~1 second)
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

  // ── Stop Run ────────────────────────────────────────────

  const stopRun = useCallback(() => {
    const doStop = () => {
      // Clean up GPS subscription
      locationSub.current?.remove();
      locationSub.current = null;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setRun((prev) => ({ ...prev, status: 'finished' }));
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Finish Run?\nAre you sure you want to stop?')) {
        doStop();
      }
    } else {
      Alert.alert('Finish Run?', 'Are you sure you want to stop?', [
        { text: 'Keep Running', style: 'cancel' },
        { text: 'Finish', style: 'destructive', onPress: doStop },
      ]);
    }
  }, []);

  // ── Reset Run ───────────────────────────────────────────

  const resetRun = useCallback(() => {
    locationSub.current?.remove();
    locationSub.current = null;
    setRun(INITIAL_RUN);
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────

  useEffect(() => {
    return () => {
      locationSub.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Provide ─────────────────────────────────────────────

  return (
    <RunContext.Provider
      value={{ run, initialLocation, startRun, stopRun, resetRun }}
    >
      {children}
    </RunContext.Provider>
  );
}
