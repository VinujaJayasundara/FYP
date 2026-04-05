# 👻 Ghost-Tracker

### A Privacy-Preserving P2P Edge-Consensus Framework for Fair Fitness Competition

> **Final Year Project (FYP)** — Ghost-Tracker is a decentralized fitness platform that lets runners compete fairly across different locations, skill levels, and routes. Instead of ranking by absolute speed, Ghost-Tracker uses the **Relative Improvement Index (RII)** — a mathematically provable fairness metric where you race against your own "Ghost" (past Personal Best).

---

## Table of Contents

- [Problem Statement](#-problem-statement)
- [Solution: The RII Framework](#-solution-the-rii-framework)
- [Repository Structure](#-repository-structure)
- [Core Engine (GhostTracker)](#-core-engine-ghosttracker)
- [Mobile Application (GhostTrackerApp)](#-mobile-application-ghosttrackerapp)
- [Data Analysis Scripts](#-data-analysis-scripts)
- [Interactive Demo](#-interactive-demo)
- [Getting Started](#-getting-started)
- [Test Suite](#-test-suite)
- [Technical Architecture](#-technical-architecture)
- [Roadmap](#-roadmap)

---

## 🎯 Problem Statement

Existing fitness platforms (Strava, Nike Run Club, etc.) suffer from three core limitations:

| Problem | Description |
|---------|-------------|
| **Privacy** | All data uploaded to centralized servers — users don't own their data |
| **Connectivity** | Requires internet to sync and compete — fails in offline environments |
| **Fairness** | Leaderboards reward absolute speed — a 4:00/km elite always beats a 7:00/km beginner regardless of effort |

Ghost-Tracker addresses all three through a **Privacy-Preserving Edge-Consensus** design.

---

## ⚖️ Solution: The RII Framework

### The Relative Improvement Index (RII)

The RII is the central fairness metric. It normalizes competition so that **same effort = same score**, regardless of ability level.

```
RII = PB_pace / Current_pace
```

- **RII > 1.0** → You are FASTER than your Ghost (outperforming your PB)
- **RII = 1.0** → You are MATCHING your Ghost
- **RII < 1.0** → You are BEHIND your Ghost

### RII Status Scale

| RII Score | Status | Indicator |
|-----------|--------|-----------|
| ≥ 1.10 | Crushing It! | 🔥 |
| 1.00 – 1.09 | On Pace | ✅ |
| 0.95 – 0.99 | Slightly Behind | 😤 |
| < 0.95 | Behind Ghost | 👻 |

### Mathematical Fairness Proof

The RII is mathematically fair — the same percentage improvement always produces the same RII regardless of ability:

| Level | PB Pace | Current Pace | Improvement | RII |
|-------|---------|-------------|-------------|-----|
| Beginner | 7:00/km | 6:39/km | 5% | **1.0526** |
| Intermediate | 5:30/km | 5:14/km | 5% | **1.0526** |
| Advanced | 4:30/km | 4:17/km | 5% | **1.0526** |
| Elite | 3:30/km | 3:20/km | 5% | **1.0526** |

> All runners who improve by 5% get an identical RII of **1.0526** — regardless of their absolute speed. This means a beginner who works hard to improve outranks an elite who coasts.

---

## 📁 Repository Structure

```
FYP/
├── GhostTracker/                  # Core Engine (React Native CLI)
│   ├── src/
│   │   ├── core/
│   │   │   ├── crdt/              # P2P Consensus Layer
│   │   │   │   ├── gCounter.ts        # G-Counter CRDT (Grow-Only Counter)
│   │   │   │   ├── mergeEngine.ts     # State merge orchestrator
│   │   │   │   └── stateVector.ts     # BLE payload serialization
│   │   │   ├── fairness/          # Fairness Engine
│   │   │   │   ├── riiEngine.ts       # RII calculation + cumulative RII
│   │   │   │   └── ghostComparator.ts # Real-time Ghost position matching
│   │   │   └── spatial/           # GPS Processing
│   │   │       ├── haversine.ts       # Great-circle distance (Haversine formula)
│   │   │       ├── gpsFilter.ts       # Noise rejection + anti-cheat
│   │   │       └── paceCalculator.ts  # Instant, rolling, and average pace
│   │   ├── data/
│   │   │   ├── models/            # TypeScript domain interfaces
│   │   │   │   └── index.ts           # TelemetryPoint, RunSession, GhostRecord, etc.
│   │   │   └── database/          # SQLite persistence layer
│   │   │       ├── schema.ts          # 6-table schema with indices
│   │   │       ├── dbManager.ts       # Connection management (WAL mode)
│   │   │       ├── sessionRepo.ts     # Run session CRUD
│   │   │       ├── ghostRepo.ts       # Ghost record management
│   │   │       ├── telemetryRepo.ts   # GPS point storage
│   │   │       └── leaderboardRepo.ts # Leaderboard queries
│   │   └── utils/
│   │       ├── constants.ts       # GPS, BLE, RII, and UI configuration
│   │       ├── logger.ts          # Structured logging
│   │       └── uuid.ts            # Offline-safe UUID generation
│   ├── __tests__/core/            # Jest test suite (6 test files)
│   ├── scripts/                   # Python data analysis pipeline
│   ├── demo/                      # Standalone HTML/CSS/JS proof-of-concept
│   └── android/                   # Android native build configuration
│
├── GhostTrackerApp/               # Expo Mobile Application
│   ├── App.tsx                    # Main app with 5-tab navigation
│   ├── src/
│   │   ├── core/algorithms.ts     # Lightweight algorithm copies for the app
│   │   ├── screens/
│   │   │   └── RunScreen.tsx      # Live GPS tracking + Ghost Race UI
│   │   ├── components/
│   │   │   ├── MapViewWeb.tsx     # Leaflet-based web map fallback
│   │   │   ├── RunMap.tsx         # Web map component
│   │   │   └── RunMap.native.tsx  # Native map component (react-native-maps)
│   │   └── data/
│   │       └── mockData.ts        # Synthetic data for 5 runners × 6 sessions
│   └── package.json
│
├── .gitignore
└── README.md                      # ← You are here
```

---

## ⚙️ Core Engine (GhostTracker)

The core engine is a pure TypeScript library with **zero UI dependencies**. It implements all the algorithms and data structures required for the Ghost-Tracker framework.

### 1. Spatial Module (`src/core/spatial/`)

#### Haversine Distance (`haversine.ts`)
- Calculates great-circle distance between GPS coordinates on Earth's surface
- Provides both kilometer and meter variants
- Includes `calculateTrackDistanceM()` for cumulative GPS track distance

#### GPS Filter (`gpsFilter.ts`)
- **Individual point validation:** coordinate bounds, velocity limits (< 25 km/h), accuracy thresholds (< 50m)
- **Pair-wise validation:** detects impossible teleportation between consecutive points
- **Batch filtering:** `filterTelemetry()` returns valid points + a rejection log with reasons
- Rejection reasons include: `NULL_COORDINATES`, `VELOCITY_EXCEEDED`, `LOW_ACCURACY`, `IMPLIED_SPEED_EXCEEDED`, `TIMESTAMP_NOT_MONOTONIC`

#### Pace Calculator (`paceCalculator.ts`)
- `calculateInstantPace()` — pace between two consecutive GPS points
- `calculateRollingPace()` — smoothed pace over a sliding window
- `calculateAvgPace()` — session-level average pace
- `paceToSpeed()` / `speedToPace()` — unit conversion utilities
- `formatPace()` — human-readable output (e.g., `5:30 /km`)

### 2. Fairness Module (`src/core/fairness/`)

#### RII Engine (`riiEngine.ts`)
- `calculateRII()` — single-value comparison (PB pace vs current pace)
- `calculateCumulativeRII()` — running average over arrays of sequential pace readings (requires minimum 5 data points)
- `getRIIStatus()` — maps score to human-readable label, emoji, and color
- `formatRII()` — display formatting

#### Ghost Comparator (`ghostComparator.ts`)
- `matchGhostPosition()` — binary search to find the Ghost's position at the current elapsed time
- `calculateLeadLagM()` — cumulative distance comparison (positive = ahead, negative = behind)
- `generatePaceData()` — assembles complete live comparison data for the UI every second

### 3. CRDT Module (`src/core/crdt/`)

The P2P consensus layer uses **Conflict-free Replicated Data Types** (CRDTs) — specifically the G-Counter — to enable leaderboard synchronization without a central server.

#### G-Counter (`gCounter.ts`)
A Grow-Only Counter implementing Strong Eventual Consistency:
- **State:** `{ replicaId → count }` map
- **Increment:** Only the local replica's counter is modified
- **Merge:** Element-wise `MAX` across all replica IDs
- **Query:** Sum all counters
- **Mathematical Guarantees:** Commutative, Associative, Idempotent
- **BLE Ready:** `serialize()` / `deserialize()` for Bluetooth payload exchange

#### Merge Engine (`mergeEngine.ts`)
- `mergeWithRemote()` — orchestrated merge of G-Counter states + leaderboard entries
- Leaderboard conflict resolution: highest RII wins; ties broken by most recent timestamp (LWW-Register per device+route pair)
- `verifyConvergence()` — test utility to verify two devices converged to identical state

#### State Vector (`stateVector.ts`)
- `encodeStateVector()` / `decodeStateVector()` — JSON serialization with BLE MTU validation (512 bytes)
- `createSyncPayload()` — assembles device ID, CRDT state, and leaderboard entries for transmission
- `isPayloadWithinBLELimit()` — pre-flight size check

### 4. Data Layer (`src/data/`)

#### Domain Models (`models/index.ts`)
8 TypeScript interfaces defining the complete domain:
- `TelemetryPoint` — A single 1Hz GPS reading
- `RunSession` — A complete running session
- `GhostRecord` — A PB data point for ghost comparison
- `LeaderboardEntry` — An RII-ranked competitive record
- `CRDTState` — G-Counter persistence
- `SyncPayload` — The JSON structure exchanged via BLE
- `PaceData` — Live comparison data for the UI
- `DeviceProfile` — Local device identity

#### SQLite Database (`database/`)
6-table schema optimized for offline-first operation:
- **WAL mode** for concurrent reads/writes
- **Performance indices** on session, timestamp, route, and leaderboard columns
- **Foreign key enforcement** for referential integrity
- Repository pattern: `sessionRepo`, `ghostRepo`, `telemetryRepo`, `leaderboardRepo`

### 5. Configuration (`src/utils/constants.ts`)
- GPS: `MAX_VELOCITY_KMH = 25`, `MAX_ACCURACY_M = 50`, `GPS_SAMPLE_RATE_HZ = 1`
- BLE: Custom service/characteristic UUIDs, `BLE_MAX_PAYLOAD_BYTES = 512`
- RII: `RII_MIN_POINTS = 5`, `RII_OUTPERFORMING = 1.0`
- UI: `TARGET_FPS = 60`, `FRAME_BUDGET_MS = 16.67`

---

## 📱 Mobile Application (GhostTrackerApp)

An [Expo](https://expo.dev/) React Native application with 5 interactive tabs:

### Tab 1: ▶️ Run (Live GPS Tracking)
- Real-time 1Hz GPS tracking with `expo-location` (BestForNavigation accuracy)
- Live route polyline drawing on a map (Leaflet on web, react-native-maps on native)
- Ghost runner marker showing the PB position at the same elapsed time
- Lead/lag distance indicator in real-time
- Live RII score vs Ghost
- Per-kilometer split times with haptic feedback
- GPS noise filtering (rejects readings > 25 km/h or > 50m accuracy)
- Teleportation rejection (> 50m jump in 1 second)

### Tab 2: 📊 Home (Dashboard)
- Welcome card with personal RII score
- Stat cards: Sessions, Improvement %, PB Pace, Total Distance
- Pace Improvement Trend chart (bar chart of session paces)
- "Problems We Solve" trilemma cards (Privacy, Connectivity, Fairness)

### Tab 3: 🏃 Sessions (History)
- Runner selector for switching between 5 runner profiles (Vinuja, Tharindu, Supun, Kasun, Malith)
- Runner stats: PB Pace, Improvement %, RII Score
- Session history with run number, pace, time, distance, and RII per session
- PB badges on personal best runs

### Tab 4: 👻 Ghost (Race Simulation)
- Ghost vs Live matchup visualization
- Overall RII score display with percentage improvement
- Second-by-second race table showing Ghost distance, Live distance, and lead/lag

### Tab 5: 🏆 Board (Leaderboard)
- Cross-location leaderboard ranked by **improvement percentage**, not absolute speed
- Runners from different locations (Bellanwila Park 2500m vs KDU Clubhouse 1800m)
- Demonstrates that route distance and location are irrelevant to ranking
- Key insight displayed: the fastest runner ranks LAST because they improved the least

---

## 📊 Data Analysis Scripts

Three Python scripts in `GhostTracker/scripts/` provide data-driven proof of the framework:

### `generate_test_data.py`
- Generates realistic synthetic GPS telemetry modeling Bellanwila Park, Sri Lanka
- 1Hz sampling with GPS noise (±3m), pace variation, and intentional GPS spikes
- Multiple runner profiles (Kamal, Nuwan, Dilshan, Tharindu, Supun) at varying ability levels
- Outputs CSV and JSON to `scripts/test_data/`

### `analyze_improvement.py`
Runs 5 analyses on the generated data:
1. **Personal Best Tracking** — identifies PB for each runner
2. **RII Improvement Tracking** — session-over-session RII trends
3. **Cross-Location Fair Comparison** — Bellanwila Park vs KDU Clubhouse ranking
4. **Ghost Comparison Simulation** — second-by-second live vs PB
5. **Fairness Proof** — mathematical verification that same % improvement = same RII

### `model_improvement.py`
- Models 6 sessions per runner with progressive improvement curves
- Cross-location leaderboard (5 runners across 2 locations)
- Ghost race simulation with lead/lag tracking
- Outputs JSON, CSV, and console reports to `scripts/analysis_output/`

---

## 🌐 Interactive Demo

A standalone browser demo (`GhostTracker/demo/`) demonstrates the core concepts without any build tooling:

- `index.html` — Single-page app with dashboard, sessions, ghost race, and leaderboard views
- `styles.css` — Dark theme styling
- `demo.js` — Pure JavaScript implementation of RII, pace, and ghost logic

Open `demo/index.html` directly in a browser — no server required.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 22.11.0
- **npm** (included with Node.js)
- **Android SDK** (for native Android builds — set `ANDROID_HOME` or create `android/local.properties`)
- **Expo Go** app (for mobile preview on physical device)

### Running the Mobile App (Web)

```bash
cd GhostTrackerApp
npm install
npx expo start --web
```

The app will be available at `http://localhost:8081`.

### Running the Mobile App (Android)

```bash
cd GhostTrackerApp
npm install
npx expo start --android
```

Scan the QR code with the Expo Go app on your phone.

### Running the Core Engine Tests

```bash
cd GhostTracker
npm install
npm test
```

### Running the Data Analysis

```bash
cd GhostTracker/scripts

# Generate synthetic GPS data
python generate_test_data.py

# Run improvement analysis pipeline
python analyze_improvement.py

# Run multi-session modeling
python model_improvement.py
```

Results are saved to `scripts/analysis_output/`.

---

## 🧪 Test Suite

The core engine has **6 test files** covering all critical algorithms:

| Test File | Module Under Test | What's Verified |
|-----------|------------------|-----------------|
| `riiEngine.test.ts` | RII Engine | Basic RII calculation, cumulative RII, edge cases (zero/negative pace, Infinity) |
| `haversine.test.ts` | Haversine | Known distance benchmarks (Colombo–Kandy, equator, poles, same-point) |
| `gpsFilter.test.ts` | GPS Filter | Coordinate validation, velocity limits, accuracy rejection, pair-wise teleportation detection |
| `paceCalculator.test.ts` | Pace Calculator | Instant pace, rolling pace, average pace, pace↔speed conversion, formatting |
| `gCounter.test.ts` | G-Counter CRDT | Increment, merge (commutativity, associativity, idempotency), multi-replica convergence |
| `crdtMerge.test.ts` | Merge Engine | Full merge pipeline, leaderboard conflict resolution, convergence verification |

Run with: `cd GhostTracker && npm test`

---

## 🏗️ Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│                  MOBILE APP (Expo)                    │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ │
│  │ Run Tab  │ │ Dashboard│ │ Sessions  │ │ Ghost  │ │
│  │ (GPS Map)│ │ (Stats)  │ │ (History) │ │ (Race) │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └───┬────┘ │
│       │             │             │            │      │
│       └─────────────┴─────────────┴────────────┘      │
│                         │                             │
├─────────────────────────┼─────────────────────────────┤
│                  CORE ENGINE                          │
│  ┌──────────────────────┼──────────────────────────┐  │
│  │            ┌─────────┴─────────┐                │  │
│  │   ┌────────┤  Fairness Engine  ├────────┐       │  │
│  │   │        │  RII + Ghost Race │        │       │  │
│  │   │        └───────────────────┘        │       │  │
│  │   │                                     │       │  │
│  │ ┌─┴──────────┐              ┌───────────┴──┐   │  │
│  │ │  Spatial    │              │  CRDT / P2P  │   │  │
│  │ │  Haversine  │              │  G-Counter   │   │  │
│  │ │  GPS Filter │              │  Merge Engine│   │  │
│  │ │  Pace Calc  │              │  State Vector│   │  │
│  │ └──────┬──────┘              └──────┬───────┘   │  │
│  │        │                            │           │  │
│  │  ┌─────┴────────────────────────────┴──────┐    │  │
│  │  │         SQLite Database (WAL Mode)      │    │  │
│  │  │  Sessions | Telemetry | Ghost | Board   │    │  │
│  │  └────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────┘  │
│                         │                             │
│                    ┌────┴────┐                        │
│                    │  BLE    │  (Future: Bluetooth P2P)│
│                    │  Sync   │                        │
│                    └─────────┘                        │
└──────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Offline-first SQLite** | No internet dependency; data sovereignty stays with the user |
| **G-Counter CRDT** | Guarantees convergence without a central coordinator (COM + ASSOC + IDEMP) |
| **Haversine (2D)** | Sufficient accuracy for fitness tracking; avoids altitude sensor unreliability |
| **1Hz GPS sampling** | Balances battery life with tracking granularity |
| **RII over ELO/Glicko** | Simple, transparent, verifiable — users can check their own score |
| **BLE for P2P sync** | Works without internet; direct device-to-device at running events |

---

## 🗺️ Roadmap

### Completed ✅
- [x] RII Algorithm — core formula + cumulative variant + fairness proof
- [x] GPS Processing — Haversine, noise filtering, pace calculation
- [x] G-Counter CRDT — grow-only counter with merge + serialization
- [x] CRDT Merge Engine — full merge pipeline with leaderboard conflict resolution
- [x] Data Models — 8 domain interfaces covering the full entity graph
- [x] SQLite Schema — 6 tables with indices and WAL mode
- [x] Test Suite — 6 test files covering all core algorithms
- [x] Synthetic Data Generator — realistic GPS telemetry with noise + spikes
- [x] Data Analysis Pipeline — 5 analyses proving RII fairness
- [x] Live GPS Tracking — real-time 1Hz tracking with map visualization
- [x] Ghost Race UI — live runner vs ghost position comparison
- [x] 5-Tab Mobile App — Run, Dashboard, Sessions, Ghost, Leaderboard
- [x] Web-Compatible Maps — Leaflet fallback for web platform
- [x] Cross-Platform Demo — standalone HTML demo requiring no build tools

### In Progress 🔨
- [ ] BLE (Bluetooth Low Energy) P2P synchronization between devices
- [ ] Social consensus verification for leaderboard entries

### Future 🔮
- [ ] Grade Adjusted Pace (GAP) for elevation-aware RII
- [ ] Multi-route PB management
- [ ] Run history persistence with SQLite on device
- [ ] Export to GPX/TCX formats

---

## 👥 Authors

**Vinuja Jayasundara** — University Final Year Project

---

## 📚 References

- Shapiro et al., *"Conflict-free Replicated Data Types"* (2011) — G-Counter foundation
- Haversine Formula — [Wikipedia](https://en.wikipedia.org/wiki/Haversine_formula)
- Expo Location — [expo-location docs](https://docs.expo.dev/versions/latest/sdk/location/)
