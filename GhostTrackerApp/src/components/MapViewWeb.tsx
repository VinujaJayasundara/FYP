/**
 * Web-compatible map fallback using Leaflet via WebView-like iframe approach.
 * On web, react-native-maps doesn't work, so we render an embedded map.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface WebMapProps {
  coordinates?: Coordinate[];
  currentPosition?: Coordinate | null;
  ghostPosition?: Coordinate | null;
  startPosition?: Coordinate | null;
  finishPosition?: Coordinate | null;
  center?: Coordinate;
  zoom?: number;
  height?: number;
  interactive?: boolean;
  showRoute?: boolean;
}

export default function WebMap({
  coordinates = [],
  currentPosition,
  ghostPosition,
  startPosition,
  finishPosition,
  center,
  zoom = 16,
  height = 300,
  interactive = true,
  showRoute = true,
}: WebMapProps) {
  if (Platform.OS !== 'web') return null;

  const mapCenter = center || currentPosition || (coordinates.length > 0 ? coordinates[0] : { latitude: 6.8448, longitude: 79.8999 });

  const routeJSON = JSON.stringify(coordinates.map(c => [c.latitude, c.longitude]));
  const currentJSON = currentPosition ? JSON.stringify([currentPosition.latitude, currentPosition.longitude]) : 'null';
  const ghostJSON = ghostPosition ? JSON.stringify([ghostPosition.latitude, ghostPosition.longitude]) : 'null';
  const startJSON = startPosition ? JSON.stringify([startPosition.latitude, startPosition.longitude]) : 'null';
  const finishJSON = finishPosition ? JSON.stringify([finishPosition.latitude, finishPosition.longitude]) : 'null';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; background: #0a0e1a; }
    .runner-marker {
      width: 16px; height: 16px; background: #22c55e;
      border: 3px solid #fff; border-radius: 50%;
      box-shadow: 0 0 12px rgba(34,197,94,0.6);
    }
    .runner-pulse {
      position: absolute; top: -6px; left: -6px;
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(34,197,94,0.3);
      animation: pulse 1.5s ease-out infinite;
    }
    .ghost-marker {
      width: 28px; height: 28px; background: rgba(30,20,50,0.85);
      border: 2px solid rgba(168,85,247,0.6); border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; line-height: 28px; text-align: center;
    }
    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', {
      zoomControl: ${interactive},
      dragging: ${interactive},
      scrollWheelZoom: ${interactive},
      attributionControl: false,
    }).setView([${mapCenter.latitude}, ${mapCenter.longitude}], ${zoom});

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    const route = ${routeJSON};
    const current = ${currentJSON};
    const ghost = ${ghostJSON};
    const start = ${startJSON};
    const finish = ${finishJSON};

    // Route polyline
    if (route.length >= 2 && ${showRoute}) {
      L.polyline(route, { color: '#22c55e', weight: 4, opacity: 0.9 }).addTo(map);
      map.fitBounds(L.polyline(route).getBounds(), { padding: [30, 30] });
    }

    // Start marker
    if (start) {
      L.marker(start, {
        icon: L.divIcon({ className: '', html: '<div style="font-size:20px">🏁</div>', iconSize: [24,24], iconAnchor: [12,12] })
      }).addTo(map);
    }

    // Finish marker
    if (finish) {
      L.marker(finish, {
        icon: L.divIcon({ className: '', html: '<div style="font-size:20px">🏆</div>', iconSize: [24,24], iconAnchor: [12,12] })
      }).addTo(map);
    }

    // Ghost marker
    if (ghost) {
      L.marker(ghost, {
        icon: L.divIcon({ className: '', html: '<div class="ghost-marker">👻</div>', iconSize: [28,28], iconAnchor: [14,14] })
      }).addTo(map);
    }

    // Runner marker (current position)
    if (current) {
      L.marker(current, {
        icon: L.divIcon({
          className: '',
          html: '<div style="position:relative"><div class="runner-pulse"></div><div class="runner-marker"></div></div>',
          iconSize: [16,16], iconAnchor: [8,8]
        })
      }).addTo(map);
    }
  </script>
</body>
</html>`;

  return (
    <View style={[styles.container, { height }]}>
      <iframe
        srcDoc={html}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        } as any}
        title="Ghost Tracker Map"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0a0e1a',
  },
});
