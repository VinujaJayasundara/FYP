/**
 * UserBadge — Top-left user avatar + name (Touchable)
 * =====================================================
 * Displays the user's initials in a circle avatar and their name.
 * Tapping it navigates to the profile screen.
 * Reads from ProfileContext so it stays in sync with profile edits.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useProfile } from '../context/ProfileContext';

// ── Design Tokens ─────────────────────────────────────────
const C = {
  accent: '#00FF87',
  accentDim: '#00FF8718',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
};

/**
 * Extract initials from a name (first letter of first two words).
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

interface UserBadgeProps {
  /** Called when the user taps the badge — navigates to Profile */
  onPress?: () => void;
}

export default function UserBadge({ onPress }: UserBadgeProps) {
  const { profile } = useProfile();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Avatar ring with initials */}
      <View style={styles.avatarRing}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
        </View>
      </View>
      {/* Name + subtitle */}
      <View style={styles.textContainer}>
        <Text style={styles.name} numberOfLines={1}>
          {profile.name}
        </Text>
        <Text style={styles.subtitle}>View Profile</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
  },
  avatarRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.accent,
    letterSpacing: 0.5,
  },
  textContainer: {
    justifyContent: 'center',
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textPrimary,
    maxWidth: 90,
    lineHeight: 16,
  },
  subtitle: {
    fontSize: 9,
    fontWeight: '500',
    color: C.textSecondary,
    letterSpacing: 0.3,
    lineHeight: 12,
  },
});
