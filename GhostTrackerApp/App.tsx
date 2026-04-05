/**
 * Ghost Tracker App — Root Component
 * ====================================
 * Wraps the app in RunProvider + ProfileProvider so that run state
 * persists across tab navigation.  Includes:
 *   - UserBadge (top-left avatar + name)
 *   - FloatingRunIndicator (shows when run is active on other tabs)
 *   - Navigation confirmation dialog during active runs
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { formatPace, formatTime, calculateRII, getRIIStatus } from './src/core/algorithms';
import {
  RUNNER_PROFILES,
  getLeaderboard,
  getNPILeaderboard,
  generateGhostRace,
  FAIRNESS_PROOF,
  RunnerProfile,
} from './src/data/mockData';
import { formatNPI, getNPIStatus } from './src/core/npiEngine';

// Context providers
import { RunProvider, useRun } from './src/context/RunContext';
import { ProfileProvider, useProfile } from './src/context/ProfileContext';

// Screens
import RunScreen from './src/screens/RunScreen';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';

// Components
import UserBadge from './src/components/UserBadge';
import FloatingRunIndicator from './src/components/FloatingRunIndicator';

// ── Design Tokens ─────────────────────────────────────────
const C = {
  bg: '#000000',
  surface: '#1C1C1E',
  surfaceElevated: '#2C2C2E',
  separator: '#38383A',
  accent: '#00FF87',
  accentDim: '#00FF8730',
  teal: '#00D4AA',
  red: '#FF3B30',
  amber: '#FF9F0A',
  blue: '#0A84FF',
  gold: '#FFD60A',
  silver: '#8E8E93',
  bronze: '#AC8E68',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  textTertiary: '#636366',
};

// ── Tab Icon Components ───────────────────────────────────

function IconRun({ active }: { active: boolean }) {
  const color = active ? C.accent : C.textTertiary;
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 10, borderLeftColor: color,
        borderTopWidth: 7, borderTopColor: 'transparent',
        borderBottomWidth: 7, borderBottomColor: 'transparent',
        marginLeft: 3,
      }} />
    </View>
  );
}

function IconDashboard({ active }: { active: boolean }) {
  const color = active ? C.accent : C.textTertiary;
  return (
    <View style={{ width: 24, height: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

function IconSessions({ active }: { active: boolean }) {
  const color = active ? C.accent : C.textTertiary;
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: color }} />
      <View style={{ width: 2, height: 6, backgroundColor: color, marginTop: -2 }} />
    </View>
  );
}

function IconTrophy({ active }: { active: boolean }) {
  const color = active ? C.accent : C.textTertiary;
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 14, height: 10, borderWidth: 2, borderColor: color, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomWidth: 0 }} />
      <View style={{ width: 2, height: 4, backgroundColor: color }} />
      <View style={{ width: 10, height: 2, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

function IconProfile({ active }: { active: boolean }) {
  const color = active ? C.accent : C.textTertiary;
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color }} />
      <View style={{ width: 16, height: 6, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: color, marginTop: 1, opacity: active ? 1 : 0.7 }} />
    </View>
  );
}

// ── Tab Navigation ────────────────────────────────────────

type TabKey = 'run' | 'dashboard' | 'sessions' | 'ghost' | 'leaderboard' | 'profile';

const TABS: { key: TabKey; label: string; Icon: React.FC<{ active: boolean }> }[] = [
  { key: 'run', label: 'Run', Icon: IconRun },
  { key: 'dashboard', label: 'Home', Icon: IconDashboard },
  { key: 'sessions', label: 'History', Icon: IconSessions },
  { key: 'leaderboard', label: 'Board', Icon: IconTrophy },
];

// ── Root App (wraps everything in providers) ──────────────

export default function App() {
  return (
    <ProfileProvider>
      <RunProvider>
        <AppContent />
      </RunProvider>
    </ProfileProvider>
  );
}

// ── Inner App Content (can now use contexts) ──────────────

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('run');
  const [selectedRunner, setSelectedRunner] = useState(0);
  const { run } = useRun();
  const { profile, updateFromSetup } = useProfile();

  /**
   * Tab press handler with navigation confirmation during active runs.
   * If a run is in progress and the user taps a different tab, show a
   * confirmation dialog. The run will NOT be stopped — it continues
   * in the background (matching Strava / Nike Run Club behaviour).
   */
  const handleTabPress = useCallback((tabKey: TabKey) => {
    // No confirmation needed if switching to the same tab
    if (tabKey === activeTab) return;

    // No confirmation needed if no run is active
    if (run.status !== 'running') {
      setActiveTab(tabKey);
      return;
    }

    // Run is active — confirm navigation
    if (Platform.OS === 'web') {
      const proceed = window.confirm(
        'You have an active run.\nYour run will continue in the background. Switch tabs?',
      );
      if (proceed) setActiveTab(tabKey);
    } else {
      Alert.alert(
        'Active Run',
        'Your run will continue tracking in the background. Switch tabs?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Switch', onPress: () => setActiveTab(tabKey) },
        ],
      );
    }
  }, [activeTab, run.status]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Left — User profile badge (tapping navigates to Profile) */}
        <UserBadge onPress={() => handleTabPress('profile')} />

        {/* Center — App title */}
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>GHOST TRACKER</Text>
          <Text style={styles.headerSub}>RACE YOUR GHOST</Text>
        </View>

        {/* Right — Live indicator dot */}
        <View style={styles.liveDotContainer}>
          {run.status === 'running' ? (
            <View style={styles.liveDotActive} />
          ) : (
            <View style={styles.liveDot} />
          )}
        </View>
      </View>

      {/* ── Floating Run Indicator ─────────────────────── */}
      <View style={styles.contentArea}>
        <FloatingRunIndicator
          isRunTabActive={activeTab === 'run'}
          onPress={() => setActiveTab('run')}
        />

        {/* ── Content ──────────────────────────────────── */}
        {/* RunScreen stays mounted so run state persists across tab switches */}
        <View style={[styles.content, { display: activeTab === 'run' ? 'flex' : 'none' }]}>
          <RunScreen />
        </View>
        <View style={[styles.content, { display: activeTab === 'profile' ? 'flex' : 'none' }]}>
          <ProfileSetupScreen
            onSave={(age, weightKg, heightCm, gender) => {
              updateFromSetup(age, weightKg, heightCm, gender);
              console.log('[Profile] Saved:', { age, weightKg, heightCm, gender });
              setActiveTab('dashboard');
            }}
            onBack={() => setActiveTab('dashboard')}
            existingProfile={{
              name: profile.name,
              age: profile.age,
              weightKg: profile.weightKg,
              heightCm: profile.heightCm,
              gender: profile.gender,
              bmi: profile.bmi,
            }}
          />
        </View>
        {activeTab !== 'run' && activeTab !== 'profile' && (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'sessions' && (
              <SessionsTab
                runner={RUNNER_PROFILES[selectedRunner]}
                selectedRunner={selectedRunner}
                onSelectRunner={setSelectedRunner}
              />
            )}
            {activeTab === 'ghost' && <GhostTab />}
            {activeTab === 'leaderboard' && <LeaderboardTab />}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </View>

      {/* ── Bottom Tabs ────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => handleTabPress(tab.key)}
            >
              {isActive && <View style={styles.tabActiveDot} />}
              <tab.Icon active={isActive} />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════

function DashboardTab() {
  const { profile } = useProfile();
  const vinuja = RUNNER_PROFILES[0];
  const latestSession = vinuja.sessions[vinuja.sessions.length - 1];
  const firstSession = vinuja.sessions[0];
  const rii = calculateRII(firstSession.paceSPerKm, latestSession.paceSPerKm);
  const status = getRIIStatus(rii);
  const npiStatus = getNPIStatus(vinuja.npiScore);

  return (
    <View>
      <Text style={styles.greeting}>Good Morning, {profile.name}</Text>
      <Text style={styles.greetingSub}>Your improvement journey at a glance</Text>

      {/* Dual Score Hero */}
      <View style={styles.dualScoreHero}>
        {/* RII */}
        <View style={styles.dualScoreItem}>
          <View style={[styles.riiRing, { width: 110, height: 110, borderRadius: 55 }]}>
            <Text style={[styles.riiHeroScore, { color: status.color, fontSize: 36 }]}>{rii.toFixed(2)}</Text>
          </View>
          <Text style={styles.dualScoreLabel}>RII</Text>
          <Text style={[styles.dualScoreStatus, { color: status.color }]}>{status.label}</Text>
          <Text style={styles.dualScoreDesc}>vs your Ghost</Text>
        </View>
        {/* NPI */}
        <View style={styles.dualScoreItem}>
          <View style={[styles.riiRing, { width: 110, height: 110, borderRadius: 55, borderColor: '#BF5AF240' }]}>
            <Text style={[styles.riiHeroScore, { color: npiStatus.color, fontSize: 36 }]}>{formatNPI(vinuja.npiScore)}</Text>
          </View>
          <Text style={styles.dualScoreLabel}>NPI</Text>
          <Text style={[styles.dualScoreStatus, { color: npiStatus.color }]}>{npiStatus.label}</Text>
          <Text style={styles.dualScoreDesc}>vs your profile</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsGrid}>
        <StatCard label="SESSIONS" value="6" accent={C.blue} />
        <StatCard label="IMPROVED" value={`${vinuja.totalImprovement.toFixed(0)}%`} accent={C.accent} />
        <StatCard label="PB PACE" value={formatPace(vinuja.currentPBPace)} accent={C.teal} />
        <StatCard label="BMI" value={vinuja.bmi.toFixed(1)} accent={C.amber} />
      </View>

      {/* Pace Trend */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>PACE TREND</Text>
        <View style={styles.trendChart}>
          {vinuja.sessions.map((s, i) => {
            const maxPace = 400;
            const minPace = 320;
            const height = ((maxPace - s.paceSPerKm) / (maxPace - minPace)) * 120;
            return (
              <View key={i} style={styles.trendBarWrapper}>
                <View
                  style={[
                    styles.trendBar,
                    {
                      height: Math.max(20, height),
                      backgroundColor: s.isPB ? C.accent : C.blue,
                      opacity: s.isPB ? 1 : 0.6,
                    },
                  ]}
                />
                <Text style={styles.trendLabel}>{formatPace(s.paceSPerKm)}</Text>
                <Text style={styles.trendDate}>{s.date.split(' ')[1]}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* How It Works — NPI Model */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>DUAL METRIC SYSTEM</Text>
        {[
          { title: 'RII — Self Improvement', desc: 'PB_pace / Current_pace — are you beating your Ghost?', accent: C.accent },
          { title: 'NPI — Cross-Person Fair', desc: 'Z-score vs expected pace for your age, BMI, altitude', accent: '#BF5AF2' },
          { title: 'Privacy First', desc: 'All data stays on your device — zero cloud dependency', accent: C.blue },
        ].map((item, i) => (
          <View key={i} style={[styles.featureItem, { borderLeftColor: item.accent }]}>
            <View>
              <Text style={styles.featureTitle}>{item.title}</Text>
              <Text style={styles.featureDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// SESSIONS TAB
// ═══════════════════════════════════════════════════════════

function SessionsTab({
  runner,
  selectedRunner,
  onSelectRunner,
}: {
  runner: RunnerProfile;
  selectedRunner: number;
  onSelectRunner: (i: number) => void;
}) {
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.runnerSelector}>
        {RUNNER_PROFILES.map((r, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.runnerChip, selectedRunner === i && styles.runnerChipActive]}
            onPress={() => onSelectRunner(i)}
          >
            <Text style={[styles.runnerChipText, selectedRunner === i && styles.runnerChipTextActive]}>
              {r.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.card}>
        <Text style={styles.cardName}>{runner.name}</Text>
        <Text style={styles.cardLocation}>{runner.location} · {runner.routeDistM}m route</Text>
        <View style={styles.runnerStats}>
          <View style={styles.runnerStatItem}>
            <Text style={styles.runnerStatValue}>{formatPace(runner.currentPBPace)}</Text>
            <Text style={styles.runnerStatLabel}>PB PACE</Text>
          </View>
          <View style={styles.runnerStatItem}>
            <Text style={[styles.runnerStatValue, { color: C.accent }]}>
              +{runner.totalImprovement.toFixed(1)}%
            </Text>
            <Text style={styles.runnerStatLabel}>IMPROVED</Text>
          </View>
          <View style={styles.runnerStatItem}>
            <Text style={[styles.runnerStatValue, { color: C.teal }]}>
              {runner.latestRII.toFixed(2)}
            </Text>
            <Text style={styles.runnerStatLabel}>RII</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabelOutside}>SESSION HISTORY</Text>
      {runner.sessions.map((s, i) => {
        const rii = calculateRII(runner.sessions[0].paceSPerKm, s.paceSPerKm);
        const riiStatus = getRIIStatus(rii);
        const improvement = ((1 - s.paceSPerKm / runner.sessions[0].paceSPerKm) * 100);
        return (
          <View key={i} style={[styles.sessionCard, s.isPB && styles.sessionCardPB]}>
            <View style={styles.sessionLeft}>
              <Text style={styles.sessionNum}>Run {s.sessionNum}</Text>
              <Text style={styles.sessionDate}>{s.date}</Text>
            </View>
            <View style={styles.sessionCenter}>
              <Text style={styles.sessionPace}>{formatPace(s.paceSPerKm)} /km</Text>
              <Text style={styles.sessionTime}>
                {formatTime(s.totalTimeS)} · {s.distanceM}m
              </Text>
            </View>
            <View style={styles.sessionRight}>
              <Text style={[styles.sessionRII, { color: riiStatus.color }]}>
                {rii > 0 ? rii.toFixed(2) : '—'}
              </Text>
              {s.isPB && <Text style={styles.pbBadge}>PB</Text>}
              {improvement > 0 && <Text style={styles.improveBadge}>+{improvement.toFixed(0)}%</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// GHOST TAB
// ═══════════════════════════════════════════════════════════

function GhostTab() {
  const ghostRace = generateGhostRace();
  const vinuja = RUNNER_PROFILES[0];
  const ghostPace = vinuja.sessions[0].paceSPerKm;
  const livePace = vinuja.sessions[5].paceSPerKm;
  const finalRII = calculateRII(ghostPace, livePace);

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.ghostHeader}>VS YOUR GHOST</Text>
        <Text style={styles.cardLocation}>Vinuja: Session 6 vs Ghost (Session 1)</Text>
        <View style={styles.ghostMatchup}>
          <View style={[styles.ghostRunner, { borderColor: C.red + '60' }]}>
            <Text style={[styles.ghostLabel, { color: C.red }]}>GHOST</Text>
            <Text style={styles.ghostPace}>{formatPace(ghostPace)}</Text>
            <Text style={styles.ghostDetail}>Session 1</Text>
          </View>
          <Text style={styles.vsText}>VS</Text>
          <View style={[styles.ghostRunner, { borderColor: C.accent + '60' }]}>
            <Text style={[styles.ghostLabel, { color: C.accent }]}>YOU</Text>
            <Text style={styles.ghostPace}>{formatPace(livePace)}</Text>
            <Text style={styles.ghostDetail}>Session 6</Text>
          </View>
        </View>
      </View>

      {/* RII Result */}
      <View style={[styles.card, styles.riiResultCard]}>
        <Text style={styles.riiResultLabel}>RII SCORE</Text>
        <Text style={[styles.riiResultValue, { color: C.accent }]}>
          {finalRII.toFixed(3)}
        </Text>
        <Text style={[styles.riiResultPct, { color: C.accent }]}>
          +{((finalRII - 1) * 100).toFixed(1)}% faster than Ghost
        </Text>
      </View>

      {/* Race Table */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>SECOND-BY-SECOND</Text>
        <View style={styles.raceHeader}>
          <Text style={styles.raceHeaderCell}>TIME</Text>
          <Text style={styles.raceHeaderCell}>GHOST</Text>
          <Text style={styles.raceHeaderCell}>YOU</Text>
          <Text style={styles.raceHeaderCell}>LEAD</Text>
        </View>
        {ghostRace.map((p, i) => (
          <View key={i} style={[styles.raceRow, i % 2 === 0 && styles.raceRowAlt]}>
            <Text style={styles.raceCell}>
              {Math.floor(p.elapsedS / 60)}:{(p.elapsedS % 60).toString().padStart(2, '0')}
            </Text>
            <Text style={styles.raceCell}>{p.ghostDistM}m</Text>
            <Text style={styles.raceCell}>{p.liveDistM}m</Text>
            <Text style={[styles.raceCell, { color: p.leadLagM >= 0 ? C.accent : C.red }]}>
              {p.leadLagM >= 0 ? '+' : ''}{p.leadLagM}m
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// LEADERBOARD TAB
// ═══════════════════════════════════════════════════════════

function LeaderboardTab() {
  const [rankBy, setRankBy] = useState<'improvement' | 'npi'>('npi');
  const leaderboard = rankBy === 'npi' ? getNPILeaderboard() : getLeaderboard();
  const rankColors = [C.gold, C.silver, C.bronze];

  return (
    <View>
      {/* Toggle Buttons */}
      <View style={styles.rankToggle}>
        <TouchableOpacity
          style={[styles.rankToggleBtn, rankBy === 'npi' && styles.rankToggleBtnActive]}
          onPress={() => setRankBy('npi')}
        >
          <Text style={[styles.rankToggleText, rankBy === 'npi' && styles.rankToggleTextActive]}>
            NPI Ranked
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rankToggleBtn, rankBy === 'improvement' && styles.rankToggleBtnActive]}
          onPress={() => setRankBy('improvement')}
        >
          <Text style={[styles.rankToggleText, rankBy === 'improvement' && styles.rankToggleTextActive]}>
            RII Ranked
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>
          {rankBy === 'npi' ? 'NPI LEADERBOARD' : 'RII LEADERBOARD'}
        </Text>
        <Text style={styles.cardLocation}>Bellanwila Park vs KDU Clubhouse</Text>
        <Text style={[styles.cardLocation, { marginTop: 4 }]}>
          {rankBy === 'npi'
            ? 'Ranked by performance vs expected (age, BMI, altitude adjusted)'
            : 'Ranked by improvement vs personal best'}
        </Text>
      </View>

      {leaderboard.map((r, i) => {
        const npiSt = getNPIStatus(r.npiScore);
        return (
          <View key={i} style={[styles.leaderRow, i === 0 && styles.leaderRowFirst]}>
            <View style={styles.leaderRankContainer}>
              {i < 3 ? (
                <View style={[styles.rankDot, { backgroundColor: rankColors[i] }]}>
                  <Text style={styles.rankDotText}>{i + 1}</Text>
                </View>
              ) : (
                <Text style={styles.leaderRank}>#{i + 1}</Text>
              )}
            </View>
            <View style={styles.leaderInfo}>
              <Text style={styles.leaderName}>{r.name}</Text>
              <Text style={styles.leaderLocation}>
                {r.location} · {r.age}y · BMI {r.bmi.toFixed(1)} · {r.altitudeM}m alt
              </Text>
              <Text style={styles.leaderPace}>
                {formatPace(r.sessions[0].paceSPerKm)} → {formatPace(r.currentPBPace)} /km
              </Text>
            </View>
            <View style={styles.leaderRight}>
              {/* NPI Score */}
              <Text style={[styles.leaderNPI, { color: npiSt.color }]}>
                NPI {formatNPI(r.npiScore)}
              </Text>
              {/* RII Score */}
              <Text style={styles.leaderRII}>
                RII {r.latestRII.toFixed(2)}
              </Text>
              {/* NPI Label */}
              <Text style={[styles.leaderNPILabel, { color: npiSt.color }]}>
                {npiSt.emoji} {npiSt.label}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Fairness Explanation */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.sectionLabel}>WHY NPI IS FAIRER</Text>
        <Text style={[styles.cardLocation, { lineHeight: 20 }]}>
          {rankBy === 'npi'
            ? 'Supun (BMI 29.4, age 30) is the slowest runner at 6:00/km but ranks highest — his performance is most exceptional relative to what the model predicts for his profile.'
            : 'Traditional RII ranks by self-improvement. Switch to NPI to see fair cross-person ranking.'}
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STAT CARD COMPONENT
// ═══════════════════════════════════════════════════════════

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: accent }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header — updated for 3-column layout (badge | title | dot)
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 40, paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: C.bg, borderBottomWidth: 0.5, borderBottomColor: C.separator,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 16, fontWeight: '700', color: C.textPrimary, letterSpacing: 2,
  },
  headerSub: {
    fontSize: 10, color: C.textTertiary, letterSpacing: 1.5, marginTop: 2,
  },
  liveDotContainer: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent,
  },
  liveDotActive: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: C.red,
    shadowColor: C.red,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },

  // Content area wrapping both floating indicator and tab content
  contentArea: { flex: 1, position: 'relative' },

  // Content
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  // Tab Bar
  tabBar: {
    flexDirection: 'row', backgroundColor: C.bg, borderTopWidth: 0.5,
    borderTopColor: C.separator, paddingBottom: Platform.OS === 'ios' ? 28 : 12, paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabActiveDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent,
    position: 'absolute', top: -2,
  },
  tabLabel: {
    fontSize: 10, color: C.textTertiary, marginTop: 4, fontWeight: '500',
    letterSpacing: 0.5,
  },
  tabLabelActive: { color: C.accent },

  // Cards
  card: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20, marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary,
    letterSpacing: 1.5, marginBottom: 12,
  },
  sectionLabelOutside: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary,
    letterSpacing: 1.5, marginVertical: 12, marginLeft: 4,
  },
  cardName: { fontSize: 20, fontWeight: '700', color: C.textPrimary },
  cardLocation: { fontSize: 13, color: C.textSecondary, marginTop: 2 },

  // Dashboard
  greeting: { fontSize: 24, fontWeight: '400', color: C.textPrimary, marginBottom: 2 },
  greetingSub: { fontSize: 14, color: C.textSecondary, marginBottom: 16 },

  riiHero: {
    backgroundColor: C.surface, borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 12,
  },
  riiRing: {
    width: 140, height: 140, borderRadius: 70, borderWidth: 3,
    borderColor: C.accent + '40', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  riiHeroScore: { fontSize: 48, fontWeight: '200' },
  riiHeroLabel: {
    fontSize: 11, fontWeight: '600', color: C.textSecondary, letterSpacing: 2,
  },
  riiHeroStatus: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  riiHeroDesc: { fontSize: 13, color: C.textTertiary, marginTop: 8 },

  // Dual Score Hero (Dashboard)
  dualScoreHero: {
    backgroundColor: C.surface, borderRadius: 20, padding: 24,
    flexDirection: 'row', justifyContent: 'space-around',
    alignItems: 'center', marginBottom: 12,
  },
  dualScoreItem: { alignItems: 'center' },
  dualScoreLabel: {
    fontSize: 12, fontWeight: '700', color: C.textSecondary, letterSpacing: 2, marginTop: 4,
  },
  dualScoreStatus: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  dualScoreDesc: { fontSize: 11, color: C.textTertiary, marginTop: 2 },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14,
    alignItems: 'center', borderLeftWidth: 3,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: C.textPrimary },
  statLabel: {
    fontSize: 9, color: C.textSecondary, marginTop: 4,
    fontWeight: '600', letterSpacing: 1,
  },

  trendChart: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    height: 160, paddingTop: 8,
  },
  trendBarWrapper: { alignItems: 'center', flex: 1 },
  trendBar: { width: 24, borderRadius: 4, minHeight: 20 },
  trendLabel: {
    fontSize: 9, color: C.textSecondary, marginTop: 4, fontFamily: 'monospace',
  },
  trendDate: { fontSize: 8, color: C.textTertiary, marginTop: 2 },

  featureItem: {
    paddingVertical: 14, borderLeftWidth: 3, paddingLeft: 14, marginTop: 4,
  },
  featureTitle: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  featureDesc: { fontSize: 12, color: C.textSecondary, marginTop: 2 },

  // Sessions
  runnerSelector: { marginBottom: 12 },
  runnerChip: {
    paddingHorizontal: 18, paddingVertical: 8, backgroundColor: C.surface,
    borderRadius: 20, marginRight: 8,
  },
  runnerChipActive: { backgroundColor: C.surfaceElevated },
  runnerChipText: { color: C.textSecondary, fontWeight: '500', fontSize: 14 },
  runnerChipTextActive: { color: C.textPrimary, fontWeight: '600' },

  runnerStats: { flexDirection: 'row', marginTop: 16, gap: 8 },
  runnerStatItem: {
    flex: 1, alignItems: 'center', backgroundColor: C.bg, borderRadius: 10, padding: 12,
  },
  runnerStatValue: {
    fontSize: 18, fontWeight: '700', color: C.textPrimary, fontFamily: 'monospace',
  },
  runnerStatLabel: {
    fontSize: 9, color: C.textTertiary, marginTop: 4,
    fontWeight: '600', letterSpacing: 1,
  },

  sessionCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', marginBottom: 8,
  },
  sessionCardPB: { backgroundColor: C.accent + '08' },
  sessionLeft: { width: 60 },
  sessionNum: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
  sessionDate: { fontSize: 11, color: C.textTertiary },
  sessionCenter: { flex: 1, paddingHorizontal: 8 },
  sessionPace: { fontSize: 16, fontWeight: '700', color: C.textPrimary, fontFamily: 'monospace' },
  sessionTime: { fontSize: 11, color: C.textSecondary },
  sessionRight: { alignItems: 'flex-end' },
  sessionRII: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  pbBadge: {
    fontSize: 9, color: C.accent, fontWeight: '700', backgroundColor: C.accentDim,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2,
    letterSpacing: 1,
  },
  improveBadge: { fontSize: 10, color: C.blue, fontWeight: '600', marginTop: 2 },

  // Ghost Tab
  ghostHeader: {
    fontSize: 20, fontWeight: '800', color: C.textPrimary, letterSpacing: 1,
  },
  ghostMatchup: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
  ghostRunner: {
    flex: 1, backgroundColor: C.bg, borderRadius: 12, padding: 16,
    alignItems: 'center', borderWidth: 1,
  },
  ghostLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2,
  },
  ghostPace: {
    fontSize: 22, fontWeight: '700', color: C.textPrimary, marginTop: 4, fontFamily: 'monospace',
  },
  ghostDetail: { fontSize: 11, color: C.textTertiary, marginTop: 2 },
  vsText: { fontSize: 14, fontWeight: '800', color: C.textTertiary },

  riiResultCard: { alignItems: 'center', borderWidth: 1, borderColor: C.accent + '30' },
  riiResultLabel: {
    fontSize: 11, color: C.textSecondary, letterSpacing: 2, fontWeight: '600',
  },
  riiResultValue: {
    fontSize: 48, fontWeight: '200', fontFamily: 'monospace', marginVertical: 4,
  },
  riiResultPct: { fontSize: 14, fontWeight: '600' },

  raceHeader: {
    flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5,
    borderBottomColor: C.separator,
  },
  raceHeaderCell: {
    flex: 1, fontSize: 10, fontWeight: '600', color: C.textTertiary,
    textAlign: 'center', letterSpacing: 1,
  },
  raceRow: { flexDirection: 'row', paddingVertical: 10 },
  raceRowAlt: { backgroundColor: C.bg },
  raceCell: {
    flex: 1, fontSize: 13, color: C.textPrimary, textAlign: 'center', fontFamily: 'monospace',
  },

  // Leaderboard
  rankToggle: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  rankToggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C.surface, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  rankToggleBtnActive: {
    borderColor: C.accent, backgroundColor: C.accentDim,
  },
  rankToggleText: {
    fontSize: 13, fontWeight: '600', color: C.textSecondary,
  },
  rankToggleTextActive: {
    color: C.accent,
  },
  leaderRow: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', marginBottom: 8, gap: 12,
  },
  leaderRowFirst: { borderWidth: 1, borderColor: C.gold + '40' },
  leaderRankContainer: { width: 36, alignItems: 'center' },
  rankDot: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  rankDotText: { fontSize: 12, fontWeight: '800', color: C.bg },
  leaderRank: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  leaderLocation: { fontSize: 11, color: C.textTertiary },
  leaderPace: {
    fontSize: 12, color: C.textSecondary, marginTop: 2, fontFamily: 'monospace',
  },
  leaderRight: { alignItems: 'flex-end' },
  leaderNPI: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  leaderImprove: { fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  leaderRII: {
    fontSize: 11, color: C.teal, fontFamily: 'monospace', marginTop: 2,
  },
  leaderNPILabel: {
    fontSize: 10, fontWeight: '600', marginTop: 2,
  },
});
