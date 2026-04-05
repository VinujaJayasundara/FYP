/**
 * Ghost-Tracker — Synthetic Data
 * Multi-session improvement data for 5 runners
 */

export interface RunnerSession {
  id: string;
  runner: string;
  location: string;
  routeDistM: number;
  sessionNum: number;
  paceSPerKm: number;
  totalTimeS: number;
  distanceM: number;
  date: string;
  isPB: boolean;
}

export interface RunnerProfile {
  name: string;
  location: string;
  routeDistM: number;
  sessions: RunnerSession[];
  currentPBPace: number;
  totalImprovement: number;
  latestRII: number;
}

export interface GhostPoint {
  elapsedS: number;
  ghostDistM: number;
  liveDistM: number;
  leadLagM: number;
  rii: number;
}

// ── Generate all runner data ──────────────────────────────

const RUNNERS_RAW = [
  {
    name: 'Vinuja',
    location: 'Bellanwila Park',
    routeDistM: 2500,
    paces: [390, 375, 365, 355, 340, 330], // 6:30 → 5:30
  },
  {
    name: 'Tharindu',
    location: 'Bellanwila Park',
    routeDistM: 2500,
    paces: [330, 325, 320, 310, 305, 300], // 5:30 → 5:00
  },
  {
    name: 'Supun',
    location: 'Bellanwila Park',
    routeDistM: 2500,
    paces: [420, 405, 395, 380, 375, 360], // 7:00 → 6:00
  },
  {
    name: 'Kasun',
    location: 'KDU Clubhouse',
    routeDistM: 1800,
    paces: [360, 350, 340, 335, 325, 320], // 6:00 → 5:20
  },
  {
    name: 'Malith',
    location: 'KDU Clubhouse',
    routeDistM: 1800,
    paces: [300, 298, 295, 292, 290, 288], // 5:00 → 4:48
  },
];

const SESSION_DATES = [
  'Mar 1', 'Mar 8', 'Mar 15', 'Mar 22', 'Mar 29', 'Apr 3',
];

function generateRunnerProfile(raw: typeof RUNNERS_RAW[0]): RunnerProfile {
  const sessions: RunnerSession[] = raw.paces.map((pace, i) => ({
    id: `${raw.name.toLowerCase()}-${i + 1}`,
    runner: raw.name,
    location: raw.location,
    routeDistM: raw.routeDistM,
    sessionNum: i + 1,
    paceSPerKm: pace,
    totalTimeS: (pace * raw.routeDistM) / 1000,
    distanceM: raw.routeDistM,
    date: SESSION_DATES[i],
    isPB: pace === Math.min(...raw.paces.slice(0, i + 1)),
  }));

  const firstPace = raw.paces[0];
  const lastPace = raw.paces[raw.paces.length - 1];
  const bestPace = Math.min(...raw.paces);

  return {
    name: raw.name,
    location: raw.location,
    routeDistM: raw.routeDistM,
    sessions,
    currentPBPace: bestPace,
    totalImprovement: ((1 - lastPace / firstPace) * 100),
    latestRII: firstPace / lastPace,
  };
}

export const RUNNER_PROFILES: RunnerProfile[] = RUNNERS_RAW.map(generateRunnerProfile);

// Get leaderboard sorted by improvement
export function getLeaderboard(): RunnerProfile[] {
  return [...RUNNER_PROFILES].sort((a, b) => b.totalImprovement - a.totalImprovement);
}

// Generate ghost race data (Vinuja Session 6 vs Ghost Session 1)
export function generateGhostRace(): GhostPoint[] {
  const vinuja = RUNNER_PROFILES[0]; // Vinuja
  const ghostPace = vinuja.sessions[0].paceSPerKm; // 390 s/km (6:30)
  const livePace = vinuja.sessions[5].paceSPerKm;   // 330 s/km (5:30)
  const routeDist = vinuja.routeDistM;

  const ghostSpeedMs = 1000 / ghostPace;
  const liveSpeedMs = 1000 / livePace;
  const maxTime = Math.max(
    Math.ceil(routeDist / ghostSpeedMs),
    Math.ceil(routeDist / liveSpeedMs),
  );

  const points: GhostPoint[] = [];
  const step = Math.max(1, Math.floor(maxTime / 20));

  for (let t = 0; t <= maxTime; t += step) {
    const ghostDist = Math.min(t * ghostSpeedMs, routeDist);
    const liveDist = Math.min(t * liveSpeedMs, routeDist);
    const leadLag = liveDist - ghostDist;
    const rii = ghostPace > 0 && livePace > 0 ? ghostPace / livePace : 1;

    points.push({
      elapsedS: t,
      ghostDistM: Math.round(ghostDist),
      liveDistM: Math.round(liveDist),
      leadLagM: Math.round(leadLag),
      rii: parseFloat(rii.toFixed(3)),
    });
  }

  return points;
}

// Fairness proof data
export const FAIRNESS_PROOF = [
  { level: 'Beginner', pb: 420, current: 399, improvement: 5, rii: 1.0526 },
  { level: 'Intermediate', pb: 330, current: 313.5, improvement: 5, rii: 1.0526 },
  { level: 'Advanced', pb: 270, current: 256.5, improvement: 5, rii: 1.0526 },
  { level: 'Elite', pb: 210, current: 199.5, improvement: 5, rii: 1.0526 },
];
