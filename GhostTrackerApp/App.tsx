import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import { formatPace, formatTime, calculateRII, getRIIStatus } from './src/core/algorithms';
import {
  RUNNER_PROFILES,
  getLeaderboard,
  generateGhostRace,
  FAIRNESS_PROOF,
  RunnerProfile,
} from './src/data/mockData';
import RunScreen from './src/screens/RunScreen';

// ── Tab Navigation ────────────────────────────────────────

type TabKey = 'run' | 'dashboard' | 'sessions' | 'ghost' | 'leaderboard';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'run', label: 'Run', icon: '▶️' },
  { key: 'dashboard', label: 'Home', icon: '📊' },
  { key: 'sessions', label: 'Sessions', icon: '🏃' },
  { key: 'ghost', label: 'Ghost', icon: '👻' },
  { key: 'leaderboard', label: 'Board', icon: '🏆' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('run');
  const [selectedRunner, setSelectedRunner] = useState(0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0e1a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>👻</Text>
        <View>
          <Text style={styles.headerTitle}>Ghost-Tracker</Text>
          <Text style={styles.headerSub}>P2P Edge-Consensus Framework</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusText}>Live</Text>
        </View>
      </View>

      {/* Content */}
      {activeTab === 'run' ? (
        <View style={styles.content}>
          <RunScreen />
        </View>
      ) : (
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

      {/* Bottom Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabIcon, activeTab === tab.key && tab.key === 'run' && { fontSize: 22 }]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════

function DashboardTab() {
  const vinuja = RUNNER_PROFILES[0];
  const latestSession = vinuja.sessions[vinuja.sessions.length - 1];
  const firstSession = vinuja.sessions[0];
  const rii = calculateRII(firstSession.paceSPerKm, latestSession.paceSPerKm);
  const status = getRIIStatus(rii);

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.welcomeText}>Welcome, Vinuja 👋</Text>
        <Text style={styles.welcomeSub}>Your improvement journey at a glance</Text>
      </View>

      <View style={[styles.card, styles.riiCard]}>
        <Text style={styles.riiLabel}>Your RII Score</Text>
        <Text style={[styles.riiScore, { color: status.color }]}>{rii.toFixed(2)}</Text>
        <Text style={styles.riiEmoji}>{status.emoji} {status.label}</Text>
        <Text style={styles.riiDesc}>
          {formatPace(firstSession.paceSPerKm)} → {formatPace(latestSession.paceSPerKm)} /km
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Sessions" value="6" color="#3b82f6" />
        <StatCard label="Improved" value={`${vinuja.totalImprovement.toFixed(0)}%`} color="#22c55e" />
        <StatCard label="PB Pace" value={formatPace(vinuja.currentPBPace)} color="#a855f7" />
        <StatCard label="Distance" value="15km" color="#f59e0b" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📈 Pace Improvement Trend</Text>
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
                      backgroundColor: s.isPB ? '#22c55e' : '#3b82f6',
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎯 Problems We Solve</Text>
        {[
          { icon: '🔒', title: 'Privacy', desc: 'All data stays on YOUR device', color: '#22c55e' },
          { icon: '📡', title: 'Connectivity', desc: '100% offline via BLE P2P', color: '#3b82f6' },
          { icon: '⚖️', title: 'Fairness', desc: 'RII normalizes by personal baseline', color: '#a855f7' },
        ].map((item, i) => (
          <View key={i} style={[styles.trilemmaItem, { borderLeftColor: item.color }]}>
            <Text style={styles.trilemmaIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.trilemmaTitle}>{item.title}</Text>
              <Text style={styles.trilemmaDesc}>{item.desc}</Text>
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
        <Text style={styles.cardTitle}>🏃 {runner.name}</Text>
        <Text style={styles.cardSub}>{runner.location} · {runner.routeDistM}m route</Text>
        <View style={styles.runnerStats}>
          <View style={styles.runnerStatItem}>
            <Text style={styles.runnerStatValue}>{formatPace(runner.currentPBPace)}</Text>
            <Text style={styles.runnerStatLabel}>PB Pace</Text>
          </View>
          <View style={styles.runnerStatItem}>
            <Text style={[styles.runnerStatValue, { color: '#22c55e' }]}>
              +{runner.totalImprovement.toFixed(1)}%
            </Text>
            <Text style={styles.runnerStatLabel}>Improved</Text>
          </View>
          <View style={styles.runnerStatItem}>
            <Text style={[styles.runnerStatValue, { color: '#06b6d4' }]}>
              {runner.latestRII.toFixed(2)}
            </Text>
            <Text style={styles.runnerStatLabel}>RII</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Session History</Text>
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
              {s.isPB && <Text style={styles.pbBadge}>★ PB</Text>}
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
        <Text style={styles.cardTitle}>👻 Ghost Race Simulation</Text>
        <Text style={styles.cardSub}>Vinuja: Session 6 (latest) vs Ghost (Session 1)</Text>
        <View style={styles.ghostMatchup}>
          <View style={[styles.ghostRunner, { borderColor: '#ef4444' }]}>
            <Text style={styles.ghostLabel}>👻 Ghost</Text>
            <Text style={styles.ghostPace}>{formatPace(ghostPace)} /km</Text>
            <Text style={styles.ghostDetail}>Session 1 (PB)</Text>
          </View>
          <Text style={styles.vsText}>VS</Text>
          <View style={[styles.ghostRunner, { borderColor: '#22c55e' }]}>
            <Text style={styles.ghostLabel}>🏃 Live</Text>
            <Text style={styles.ghostPace}>{formatPace(livePace)} /km</Text>
            <Text style={styles.ghostDetail}>Session 6 (latest)</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { borderColor: '#22c55e', borderWidth: 1 }]}>
        <Text style={{ textAlign: 'center', fontSize: 36 }}>🔥</Text>
        <Text style={[styles.riiScore, { color: '#22c55e', textAlign: 'center' }]}>
          RII: {finalRII.toFixed(3)}
        </Text>
        <Text style={[styles.riiDesc, { textAlign: 'center' }]}>
          {((finalRII - 1) * 100).toFixed(1)}% faster than Ghost!
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>⏱️ Second-by-Second Race</Text>
        <View style={styles.raceHeader}>
          <Text style={styles.raceHeaderCell}>Time</Text>
          <Text style={styles.raceHeaderCell}>Ghost</Text>
          <Text style={styles.raceHeaderCell}>Live</Text>
          <Text style={styles.raceHeaderCell}>Lead</Text>
        </View>
        {ghostRace.map((p, i) => (
          <View key={i} style={[styles.raceRow, i % 2 === 0 && styles.raceRowAlt]}>
            <Text style={styles.raceCell}>
              {Math.floor(p.elapsedS / 60)}:{(p.elapsedS % 60).toString().padStart(2, '0')}
            </Text>
            <Text style={styles.raceCell}>{p.ghostDistM}m</Text>
            <Text style={styles.raceCell}>{p.liveDistM}m</Text>
            <Text style={[styles.raceCell, { color: p.leadLagM >= 0 ? '#22c55e' : '#ef4444' }]}>
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
  const leaderboard = getLeaderboard();
  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏆 Cross-Location Leaderboard</Text>
        <Text style={styles.cardSub}>Bellanwila Park vs KDU Clubhouse</Text>
        <Text style={styles.cardSub}>Ranked by IMPROVEMENT, not absolute speed</Text>
      </View>
      {leaderboard.map((r, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        const medal = i < 3 ? medals[i] : `#${i + 1}`;
        return (
          <View key={i} style={[styles.leaderRow, i === 0 && styles.leaderRowFirst]}>
            <Text style={styles.leaderRank}>{medal}</Text>
            <View style={styles.leaderInfo}>
              <Text style={styles.leaderName}>{r.name}</Text>
              <Text style={styles.leaderLocation}>{r.location} · {r.routeDistM}m</Text>
              <Text style={styles.leaderPace}>
                {formatPace(r.sessions[0].paceSPerKm)} → {formatPace(r.currentPBPace)} /km
              </Text>
            </View>
            <View style={styles.leaderRight}>
              <Text style={[styles.leaderImprove, { color: '#22c55e' }]}>
                +{r.totalImprovement.toFixed(1)}%
              </Text>
              <Text style={styles.leaderRII}>RII: {r.latestRII.toFixed(2)}</Text>
            </View>
          </View>
        );
      })}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={[styles.cardSub, { color: '#22c55e', fontWeight: '600' }]}>
          💡 Malith (4:48/km) is the FASTEST runner but ranks LAST because he improved the least.
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0e1a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 36, paddingBottom: 12, paddingHorizontal: 20,
    backgroundColor: '#111827', borderBottomWidth: 1, borderBottomColor: '#2a3050', gap: 12,
  },
  headerIcon: { fontSize: 32 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#22c55e' },
  headerSub: { fontSize: 11, color: '#64748b' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto',
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#22c55e20',
    borderRadius: 20, borderWidth: 1, borderColor: '#22c55e60',
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#22c55e' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  card: { backgroundColor: '#1a1f35', borderRadius: 16, padding: 20, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#94a3b8' },
  welcomeText: { fontSize: 22, fontWeight: '700', color: '#f1f5f9' },
  welcomeSub: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  riiCard: { alignItems: 'center', borderWidth: 1, borderColor: '#2a3050' },
  riiLabel: { fontSize: 13, color: '#94a3b8', marginBottom: 4 },
  riiScore: { fontSize: 48, fontWeight: '800', fontFamily: 'monospace' },
  riiEmoji: { fontSize: 16, fontWeight: '600', marginTop: 4, color: '#f1f5f9' },
  riiDesc: { fontSize: 13, color: '#94a3b8', marginTop: 8 },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#1a1f35', borderRadius: 12, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', fontFamily: 'monospace' },
  statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  trendChart: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    height: 160, marginTop: 12, paddingTop: 8,
  },
  trendBarWrapper: { alignItems: 'center', flex: 1 },
  trendBar: { width: 28, borderRadius: 6, minHeight: 20 },
  trendLabel: { fontSize: 10, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' },
  trendDate: { fontSize: 9, color: '#64748b', marginTop: 2 },
  trilemmaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderLeftWidth: 3, paddingLeft: 12, marginTop: 8,
  },
  trilemmaIcon: { fontSize: 24 },
  trilemmaTitle: { fontSize: 15, fontWeight: '700', color: '#f1f5f9' },
  trilemmaDesc: { fontSize: 12, color: '#94a3b8' },
  runnerSelector: { marginBottom: 12 },
  runnerChip: {
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1a1f35',
    borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#2a3050',
  },
  runnerChipActive: { backgroundColor: '#3b82f630', borderColor: '#3b82f6' },
  runnerChipText: { color: '#94a3b8', fontWeight: '500', fontSize: 14 },
  runnerChipTextActive: { color: '#3b82f6' },
  runnerStats: { flexDirection: 'row', marginTop: 16, gap: 8 },
  runnerStatItem: {
    flex: 1, alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, padding: 12,
  },
  runnerStatValue: { fontSize: 18, fontWeight: '800', color: '#f1f5f9', fontFamily: 'monospace' },
  runnerStatLabel: { fontSize: 11, color: '#64748b', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#f1f5f9', marginVertical: 12, marginLeft: 4 },
  sessionCard: {
    backgroundColor: '#1a1f35', borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#2a3050',
  },
  sessionCardPB: { borderLeftColor: '#22c55e' },
  sessionLeft: { width: 60 },
  sessionNum: { fontSize: 13, fontWeight: '700', color: '#f1f5f9' },
  sessionDate: { fontSize: 11, color: '#64748b' },
  sessionCenter: { flex: 1, paddingHorizontal: 8 },
  sessionPace: { fontSize: 16, fontWeight: '700', color: '#f1f5f9', fontFamily: 'monospace' },
  sessionTime: { fontSize: 11, color: '#94a3b8' },
  sessionRight: { alignItems: 'flex-end' },
  sessionRII: { fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
  pbBadge: {
    fontSize: 10, color: '#22c55e', fontWeight: '700', backgroundColor: '#22c55e20',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2,
  },
  improveBadge: { fontSize: 10, color: '#3b82f6', fontWeight: '600', marginTop: 2 },
  ghostMatchup: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
  ghostRunner: {
    flex: 1, backgroundColor: '#111827', borderRadius: 12, padding: 16,
    alignItems: 'center', borderWidth: 1,
  },
  ghostLabel: { fontSize: 14, fontWeight: '700', color: '#f1f5f9' },
  ghostPace: { fontSize: 20, fontWeight: '800', color: '#f1f5f9', marginTop: 4, fontFamily: 'monospace' },
  ghostDetail: { fontSize: 11, color: '#64748b', marginTop: 2 },
  vsText: { fontSize: 16, fontWeight: '800', color: '#64748b' },
  raceHeader: {
    flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a3050',
  },
  raceHeaderCell: {
    flex: 1, fontSize: 11, fontWeight: '600', color: '#64748b',
    textAlign: 'center', textTransform: 'uppercase',
  },
  raceRow: { flexDirection: 'row', paddingVertical: 8 },
  raceRowAlt: { backgroundColor: '#111827' },
  raceCell: { flex: 1, fontSize: 13, color: '#f1f5f9', textAlign: 'center', fontFamily: 'monospace' },
  leaderRow: {
    backgroundColor: '#1a1f35', borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', marginBottom: 8, gap: 12,
  },
  leaderRowFirst: { borderWidth: 1, borderColor: '#f59e0b40' },
  leaderRank: { fontSize: 24, width: 36, textAlign: 'center' },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: 16, fontWeight: '700', color: '#f1f5f9' },
  leaderLocation: { fontSize: 11, color: '#64748b' },
  leaderPace: { fontSize: 12, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' },
  leaderRight: { alignItems: 'flex-end' },
  leaderImprove: { fontSize: 18, fontWeight: '800', fontFamily: 'monospace' },
  leaderRII: { fontSize: 11, color: '#06b6d4', fontFamily: 'monospace', marginTop: 2 },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#111827', borderTopWidth: 1,
    borderTopColor: '#2a3050', paddingBottom: Platform.OS === 'ios' ? 28 : 12, paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabActive: {},
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 10, color: '#64748b', marginTop: 2 },
  tabLabelActive: { color: '#3b82f6', fontWeight: '600' },
});
