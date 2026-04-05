/**
 * FloatingRunIndicator — Active Run Status Pill
 * ================================================
 * Shows a compact floating bar when a run is in progress and the user
 * is viewing a different tab.  Tapping the bar navigates back to the Run tab.
 *
 * Reads live run state from RunContext.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useRun } from '../context/RunContext';
import { formatTime } from '../core/algorithms';

// ── Design Tokens ─────────────────────────────────────────
const C = {
  accent: '#00FF87',
  accentDim: '#00FF8718',
  surface: '#1C1C1E',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  red: '#FF3B30',
};

interface FloatingRunIndicatorProps {
  /** Whether the Run tab is currently visible */
  isRunTabActive: boolean;
  /** Callback to switch to the Run tab */
  onPress: () => void;
}

export default function FloatingRunIndicator({
  isRunTabActive,
  onPress,
}: FloatingRunIndicatorProps) {
  const { run } = useRun();

  // Animated slide-in value
  const slideAnim = useRef(new Animated.Value(-80)).current;
  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const shouldShow = run.status === 'running' && !isRunTabActive;

  // Slide in / out
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : -80,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [shouldShow]);

  // Pulse the recording dot
  useEffect(() => {
    if (!shouldShow) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [shouldShow]);

  // Don't render at all when idle/finished to avoid touch-blocking
  if (run.status !== 'running') return null;

  const distKm = (run.distanceM / 1000).toFixed(2);
  const elapsed = formatTime(run.elapsedS);

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY: slideAnim }] }]}
    >
      <TouchableOpacity
        style={styles.pill}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {/* Pulsing recording dot */}
        <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />

        {/* Status text */}
        <Text style={styles.statusText}>Running</Text>

        {/* Separator */}
        <View style={styles.sep} />

        {/* Time */}
        <Text style={styles.stat}>{elapsed}</Text>

        {/* Separator */}
        <View style={styles.sep} />

        {/* Distance */}
        <Text style={styles.stat}>{distKm} km</Text>

        {/* Arrow indicator */}
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 100,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: C.accent + '40',
    // Shadow
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 0.5,
  },
  sep: {
    width: 1,
    height: 14,
    backgroundColor: '#38383A',
  },
  stat: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textPrimary,
    fontFamily: 'monospace',
  },
  arrow: {
    fontSize: 18,
    fontWeight: '700',
    color: C.accent,
    marginLeft: 2,
  },
});
