/**
 * ProfileContext — User Profile State
 * =====================================
 * Stores the current user's name and physical profile data.
 * Used by UserBadge (display) and ProfileSetupScreen (edit).
 * Defaults to "Vinuja" to match existing mock data.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { calculateBMI } from '../core/npiEngine';

// ── Types ─────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  age: number;
  weightKg: number;
  heightCm: number;
  gender: 'M' | 'F';
  bmi: number;
}

interface ProfileContextValue {
  profile: UserProfile;
  setProfile: (updates: Partial<UserProfile>) => void;
  updateFromSetup: (age: number, weightKg: number, heightCm: number, gender: 'M' | 'F') => void;
}

// ── Default profile ───────────────────────────────────────

const DEFAULT_PROFILE: UserProfile = {
  name: 'Vinuja',
  age: 22,
  weightKg: 68,
  heightCm: 175,
  gender: 'M',
  bmi: calculateBMI(68, 175),
};

// ── Context ───────────────────────────────────────────────

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Hook to consume profile state from any component.
 */
export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within <ProfileProvider>');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, _setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  // Merge partial updates into the existing profile
  const setProfile = useCallback((updates: Partial<UserProfile>) => {
    _setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  // Convenience method called from ProfileSetupScreen
  const updateFromSetup = useCallback(
    (age: number, weightKg: number, heightCm: number, gender: 'M' | 'F') => {
      _setProfile((prev) => ({
        ...prev,
        age,
        weightKg,
        heightCm,
        gender,
        bmi: calculateBMI(weightKg, heightCm),
      }));
    },
    [],
  );

  return (
    <ProfileContext.Provider value={{ profile, setProfile, updateFromSetup }}>
      {children}
    </ProfileContext.Provider>
  );
}
