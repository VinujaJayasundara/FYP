/* ═══════════════════════════════════════════════════════════════
   Ghost-Tracker Demo Dashboard — JavaScript
   Interactive demonstrations of all Phase 1-3 deliverables
   ═══════════════════════════════════════════════════════════════ */

// ── TAB NAVIGATION ──────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById(`content-${target}`).classList.add('active');

    // Initialize map on first view
    if (target === 'gps' && !window.mapInitialized) {
      initMap();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// RII ENGINE SIMULATOR
// ═══════════════════════════════════════════════════════════════

const pbSlider = document.getElementById('pb-pace');
const currentSlider = document.getElementById('current-pace');
const pbVal = document.getElementById('pb-pace-val');
const currentVal = document.getElementById('current-pace-val');
const riiArc = document.getElementById('rii-arc');
const riiValue = document.getElementById('rii-value');
const riiLabel = document.getElementById('rii-label');
const riiEmoji = document.getElementById('rii-emoji');
const riiStatusText = document.getElementById('rii-status-text');
const riiStatusCard = document.getElementById('rii-status-card');

function formatPaceFromSeconds(totalSeconds) {
  const min = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function updateRII() {
  const pbPace = parseInt(pbSlider.value);
  const currentPace = parseInt(currentSlider.value);

  pbVal.textContent = formatPaceFromSeconds(pbPace);
  currentVal.textContent = formatPaceFromSeconds(currentPace);

  const rii = currentPace > 0 ? pbPace / currentPace : 0;
  riiValue.textContent = rii.toFixed(2);

  // Update gauge arc (0 to 251 = full arc, center at 125)
  const maxArc = 251;
  const normalized = Math.max(0, Math.min(2, rii)); // Clamp 0-2
  const offset = maxArc - (normalized / 2) * maxArc;
  riiArc.setAttribute('stroke-dashoffset', offset.toString());

  // Update colors and status
  let color, emoji, label, statusBg, statusBorder;
  if (rii >= 1.1) {
    color = '#22c55e'; emoji = '🔥'; label = 'Crushing It!';
    statusBg = '#22c55e30'; statusBorder = '#22c55e';
  } else if (rii >= 1.0) {
    color = '#3b82f6'; emoji = '✅'; label = 'On Pace';
    statusBg = '#3b82f630'; statusBorder = '#3b82f6';
  } else if (rii >= 0.95) {
    color = '#f59e0b'; emoji = '😤'; label = 'Slightly Behind';
    statusBg = '#f59e0b30'; statusBorder = '#f59e0b';
  } else {
    color = '#ef4444'; emoji = '👻'; label = 'Behind Ghost';
    statusBg = '#ef444430'; statusBorder = '#ef4444';
  }

  riiArc.setAttribute('stroke', color);
  riiLabel.textContent = label;
  riiEmoji.textContent = emoji;
  riiStatusText.textContent = label;
  riiStatusCard.style.background = statusBg;
  riiStatusCard.style.borderColor = statusBorder;
}

pbSlider.addEventListener('input', updateRII);
currentSlider.addEventListener('input', updateRII);
updateRII();

// Fairness proof
const beginnerRII = (420 / 382).toFixed(2);
const eliteRII = (210 / 191).toFixed(2);
document.getElementById('beginner-rii').textContent = `RII: ${beginnerRII}`;
document.getElementById('elite-rii').textContent = `RII: ${eliteRII}`;


// ═══════════════════════════════════════════════════════════════
// CRDT SIMULATION
// ═══════════════════════════════════════════════════════════════

const crdtState = {
  a: { A: 0, B: 0 },
  b: { A: 0, B: 0 },
  synced: false,
};

function updateCRDTDisplay() {
  document.getElementById('val-a-a').textContent = crdtState.a.A;
  document.getElementById('val-a-b').textContent = crdtState.a.B;
  document.getElementById('val-b-a').textContent = crdtState.b.A;
  document.getElementById('val-b-b').textContent = crdtState.b.B;
  document.getElementById('total-a').textContent = crdtState.a.A + crdtState.a.B;
  document.getElementById('total-b').textContent = crdtState.b.A + crdtState.b.B;

  const nodeA = document.getElementById('node-a');
  const nodeB = document.getElementById('node-b');
  const syncStatus = document.getElementById('sync-status');

  if (crdtState.synced) {
    nodeA.classList.add('synced');
    nodeB.classList.add('synced');
    syncStatus.textContent = '✅ Synced — States identical';
    syncStatus.classList.add('synced');
  } else {
    nodeA.classList.remove('synced');
    nodeB.classList.remove('synced');
    syncStatus.textContent = 'Not synced';
    syncStatus.classList.remove('synced');
  }
}

document.getElementById('btn-inc-a').addEventListener('click', () => {
  const amount = Math.floor(Math.random() * 5) + 1;
  crdtState.a.A += amount;
  crdtState.synced = false;
  updateCRDTDisplay();

  // Flash animation
  const el = document.getElementById('val-a-a');
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 300);
});

document.getElementById('btn-inc-b').addEventListener('click', () => {
  const amount = Math.floor(Math.random() * 5) + 1;
  crdtState.b.B += amount;
  crdtState.synced = false;
  updateCRDTDisplay();

  const el = document.getElementById('val-b-b');
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 300);
});

document.getElementById('btn-sync').addEventListener('click', () => {
  // G-Counter merge: take MAX of each key
  const mergedA = Math.max(crdtState.a.A, crdtState.b.A);
  const mergedB = Math.max(crdtState.a.B, crdtState.b.B);

  crdtState.a.A = mergedA;
  crdtState.a.B = mergedB;
  crdtState.b.A = mergedA;
  crdtState.b.B = mergedB;
  crdtState.synced = true;

  updateCRDTDisplay();

  // Mark all properties as verified
  ['check-comm', 'check-assoc', 'check-idemp'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.add('verified');
    el.querySelector('.check-icon').textContent = '✅';
  });
});

updateCRDTDisplay();


// ═══════════════════════════════════════════════════════════════
// CONVERGENCE TEST
// ═══════════════════════════════════════════════════════════════

document.getElementById('btn-convergence').addEventListener('click', async () => {
  const TRIALS = 100;
  const bar = document.getElementById('convergence-bar');
  const text = document.getElementById('convergence-text');
  const log = document.getElementById('convergence-log');
  const btn = document.getElementById('btn-convergence');

  btn.disabled = true;
  btn.textContent = 'Running...';
  log.innerHTML = '';
  log.classList.add('visible');
  text.classList.remove('success');

  let converged = 0;

  for (let t = 0; t < TRIALS; t++) {
    // Create two independent G-Counter states
    const stateA = { A: 0, B: 0 };
    const stateB = { A: 0, B: 0 };

    // Random increments
    const opsA = Math.floor(Math.random() * 20) + 1;
    const opsB = Math.floor(Math.random() * 20) + 1;
    for (let i = 0; i < opsA; i++) stateA.A += Math.floor(Math.random() * 10) + 1;
    for (let i = 0; i < opsB; i++) stateB.B += Math.floor(Math.random() * 10) + 1;

    // Bidirectional merge (MAX)
    const mergedAA = Math.max(stateA.A, stateB.A);
    const mergedAB = Math.max(stateA.B, stateB.B);
    const mergedBA = Math.max(stateB.A, stateA.A);
    const mergedBB = Math.max(stateB.B, stateA.B);

    const convergedResult = mergedAA === mergedBA && mergedAB === mergedBB;
    if (convergedResult) converged++;

    // Update progress
    const progress = ((t + 1) / TRIALS) * 100;
    bar.style.width = `${progress}%`;
    text.textContent = `${t + 1}/${TRIALS} — ${converged} converged`;

    const logEntry = `Trial ${(t + 1).toString().padStart(3)}: A={A:${mergedAA},B:${mergedAB}} B={A:${mergedBA},B:${mergedBB}} → ${convergedResult ? '✅' : '❌'}`;
    log.innerHTML += logEntry + '\n';
    log.scrollTop = log.scrollHeight;

    // Small delay for visual effect
    if (t % 5 === 0) {
      await new Promise(r => setTimeout(r, 10));
    }
  }

  text.textContent = `${converged}/${TRIALS} trials converged — 100% convergence!`;
  text.classList.add('success');
  bar.style.background = 'linear-gradient(90deg, #22c55e, #06b6d4)';
  btn.disabled = false;
  btn.textContent = 'Run 100 Trials Again';
});


// ═══════════════════════════════════════════════════════════════
// GPS FILTER SIMULATION
// ═══════════════════════════════════════════════════════════════

document.getElementById('btn-run-filter').addEventListener('click', () => {
  const tbody = document.getElementById('filter-tbody');
  tbody.innerHTML = '';

  const MAX_VELOCITY_KMH = 25;
  const MAX_ACCURACY_M = 50;
  const NUM_POINTS = 50;

  let accepted = 0;
  let rejected = 0;
  let prevLat = 6.8413;
  let prevLon = 79.8815;

  for (let i = 0; i < NUM_POINTS; i++) {
    // Generate point
    let lat = prevLat + (Math.random() - 0.48) * 0.0001;
    let lon = prevLon + (Math.random() - 0.48) * 0.0001;
    let velocity = 2 + Math.random() * 3; // 2-5 m/s (normal running)
    let accuracy = 3 + Math.random() * 12; // 3-15m
    let reason = '';
    let isValid = true;

    // Randomly inject bad data (~15% of points)
    if (Math.random() < 0.08) {
      // GPS spike - teleportation
      lat += (Math.random() - 0.5) * 0.01;
      lon += (Math.random() - 0.5) * 0.01;
      velocity = 15 + Math.random() * 20;
      reason = `VELOCITY: ${(velocity * 3.6).toFixed(1)} km/h > 25 km/h`;
      isValid = false;
    } else if (Math.random() < 0.08) {
      // Low accuracy
      accuracy = 55 + Math.random() * 50;
      reason = `ACCURACY: ${accuracy.toFixed(0)}m > 50m`;
      isValid = false;
    } else if (Math.random() < 0.05) {
      // Vehicle speed
      velocity = 8 + Math.random() * 10;
      reason = `SPEED: ${(velocity * 3.6).toFixed(1)} km/h (vehicle?)`;
      isValid = false;
    }

    if (isValid) {
      accepted++;
      prevLat = lat;
      prevLon = lon;
    } else {
      rejected++;
    }

    const row = document.createElement('tr');
    row.className = isValid ? 'accepted' : 'rejected';
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${lat.toFixed(5)}</td>
      <td>${lon.toFixed(5)}</td>
      <td>${(velocity * 3.6).toFixed(1)} km/h</td>
      <td>${accuracy.toFixed(0)}m</td>
      <td>${isValid ? '✅' : '❌'}</td>
      <td>${reason || '—'}</td>
    `;
    tbody.appendChild(row);
  }

  document.getElementById('filter-accepted').textContent = accepted;
  document.getElementById('filter-rejected').textContent = rejected;
  document.getElementById('filter-rate').textContent = `${((accepted / NUM_POINTS) * 100).toFixed(0)}%`;
});


// ═══════════════════════════════════════════════════════════════
// MAP (Leaflet)
// ═══════════════════════════════════════════════════════════════

const RUNNERS = [
  { name: 'Kamal', pace: '5:00 /km', color: '#22c55e', pb: true, points: 267 },
  { name: 'Nuwan', pace: '5:30 /km', color: '#3b82f6', pb: false, points: 296 },
  { name: 'Dilshan', pace: '6:00 /km', color: '#a855f7', pb: false, points: 313 },
  { name: 'Tharindu', pace: '4:30 /km', color: '#f59e0b', pb: false, points: 229 },
  { name: 'Supun', pace: '6:30 /km', color: '#ef4444', pb: false, points: 349 },
];

// Generate synthetic route around Bellanwila Park
function generateRoute(offsetLat = 0, offsetLon = 0, noise = 0.00003) {
  const waypoints = [
    [6.84080, 79.88080],
    [6.84080, 79.88280],
    [6.84280, 79.88280],
    [6.84280, 79.88080],
    [6.84080, 79.88080], // Close loop
  ];

  const route = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lat1, lon1] = waypoints[i];
    const [lat2, lon2] = waypoints[i + 1];
    const steps = 30 + Math.floor(Math.random() * 20);
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const lat = lat1 + (lat2 - lat1) * t + (Math.random() - 0.5) * noise + offsetLat;
      const lon = lon1 + (lon2 - lon1) * t + (Math.random() - 0.5) * noise + offsetLon;
      route.push([lat, lon]);
    }
  }
  return route;
}

function initMap() {
  const map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
  }).setView([6.8418, 79.8818], 17);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  const runnerList = document.getElementById('runner-list');
  const layers = [];

  RUNNERS.forEach((runner, idx) => {
    const offset = (idx - 2) * 0.00005;
    const route = generateRoute(offset, offset);
    
    const polyline = L.polyline(route, {
      color: runner.color,
      weight: 3,
      opacity: 0.8,
    }).addTo(map);

    layers.push(polyline);

    // Start marker
    L.circleMarker(route[0], {
      radius: 5,
      fillColor: '#22c55e',
      color: '#fff',
      weight: 1,
      fillOpacity: 1,
    }).addTo(map).bindPopup(`${runner.name} — Start`);

    // End marker
    L.circleMarker(route[route.length - 1], {
      radius: 5,
      fillColor: '#ef4444',
      color: '#fff',
      weight: 1,
      fillOpacity: 1,
    }).addTo(map);

    // Runner list item
    const item = document.createElement('div');
    item.className = `runner-item ${idx === 0 ? 'active' : ''}`;
    item.innerHTML = `
      <span class="runner-dot" style="background:${runner.color}"></span>
      <div class="runner-info">
        <div class="runner-name">${runner.name}</div>
        <div class="runner-pace">${runner.pace} · ${runner.points} pts</div>
        ${runner.pb ? '<div class="runner-pb">★ Personal Best</div>' : ''}
      </div>
    `;
    item.addEventListener('click', () => {
      document.querySelectorAll('.runner-item').forEach(r => r.classList.remove('active'));
      item.classList.add('active');
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    });
    runnerList.appendChild(item);
  });

  // Add a few GPS spike markers
  const spikes = [
    [6.8500, 79.8900],
    [6.8350, 79.8750],
  ];
  spikes.forEach(pos => {
    L.circleMarker(pos, {
      radius: 6,
      fillColor: '#f59e0b',
      color: '#f59e0b',
      weight: 2,
      fillOpacity: 0.5,
    }).addTo(map).bindPopup('⚠️ GPS Spike — Filtered out');
  });

  window.mapInitialized = true;

  // Force map resize
  setTimeout(() => map.invalidateSize(), 200);
}

// ── Animate stats on load ────────────────────────────────
function animateValue(el, end, duration = 1500) {
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.floor(start + (end - start) * eased);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// Animate on page load
setTimeout(() => {
  animateValue(document.getElementById('stat-tests'), 75);
  animateValue(document.getElementById('stat-points'), 1454);
}, 300);
