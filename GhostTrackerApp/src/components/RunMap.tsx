/**
 * RunMap.tsx — Web fallback using Leaflet via inline iframe.
 * Metro resolves this on web, and RunMap.native.tsx on iOS/Android.
 */
import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

interface Coordinate {
  latitude: number;
  longitude: number;
}

type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

// ── Leaflet HTML builder ──────────────────────────────────

function buildLeafletHTML(opts: {
  center: Coordinate;
  zoom: number;
  route?: Coordinate[];
  current?: Coordinate | null;
  ghost?: Coordinate | null;
  start?: Coordinate | null;
  finish?: Coordinate | null;
  interactive: boolean;
  showRoute: boolean;
}): string {
  const routeJSON = JSON.stringify((opts.route || []).map(c => [c.latitude, c.longitude]));
  const currentJSON = opts.current ? JSON.stringify([opts.current.latitude, opts.current.longitude]) : 'null';
  const ghostJSON = opts.ghost ? JSON.stringify([opts.ghost.latitude, opts.ghost.longitude]) : 'null';
  const startJSON = opts.start ? JSON.stringify([opts.start.latitude, opts.start.longitude]) : 'null';
  const finishJSON = opts.finish ? JSON.stringify([opts.finish.latitude, opts.finish.longitude]) : 'null';

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0}
#map{width:100%;height:100vh;background:#0a0e1a}
.runner-marker{width:16px;height:16px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(34,197,94,0.6)}
.runner-pulse{position:absolute;top:-6px;left:-6px;width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,0.3);animation:pulse 1.5s ease-out infinite}
.ghost-marker{width:28px;height:28px;background:rgba(30,20,50,0.85);border:2px solid rgba(168,85,247,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:28px;text-align:center}
@keyframes pulse{0%{transform:scale(1);opacity:1}100%{transform:scale(2.5);opacity:0}}
</style></head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:${opts.interactive},dragging:${opts.interactive},scrollWheelZoom:${opts.interactive},attributionControl:false}).setView([${opts.center.latitude},${opts.center.longitude}],${opts.zoom});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
var route=${routeJSON},current=${currentJSON},ghost=${ghostJSON},start=${startJSON},finish=${finishJSON};
if(route.length>=2&&${opts.showRoute}){var pl=L.polyline(route,{color:'#22c55e',weight:4,opacity:0.9}).addTo(map);map.fitBounds(pl.getBounds(),{padding:[30,30]})}
if(start)L.marker(start,{icon:L.divIcon({className:'',html:'<div style="font-size:20px">🏁</div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);
if(finish)L.marker(finish,{icon:L.divIcon({className:'',html:'<div style="font-size:20px">🏆</div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);
if(ghost)L.marker(ghost,{icon:L.divIcon({className:'',html:'<div class="ghost-marker">👻</div>',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(map);
if(current)L.marker(current,{icon:L.divIcon({className:'',html:'<div style="position:relative"><div class="runner-pulse"></div><div class="runner-marker"></div></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);
</script></body></html>`;
}

// ── Exported Map Components ───────────────────────────────

export function IdleMap({ region }: { region: Region }) {
  const html = buildLeafletHTML({
    center: { latitude: region.latitude, longitude: region.longitude },
    zoom: 16,
    interactive: false,
    showRoute: false,
  });
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' } as any} title="Map" />
    </View>
  );
}

export function RunningMap({
  mapRef,
  initialRegion,
  routeCoords,
  currentPosition,
  ghostPosition,
  onPanDrag,
}: {
  mapRef: React.RefObject<any>;
  initialRegion: Region;
  routeCoords: Coordinate[];
  currentPosition: Coordinate | null;
  ghostPosition: Coordinate | null;
  onPanDrag: () => void;
}) {
  const center = currentPosition || { latitude: initialRegion.latitude, longitude: initialRegion.longitude };
  const html = buildLeafletHTML({
    center,
    zoom: 17,
    route: routeCoords,
    current: currentPosition,
    ghost: ghostPosition,
    start: routeCoords.length > 0 ? routeCoords[0] : null,
    interactive: true,
    showRoute: true,
  });
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' } as any} title="Live Map" />
    </View>
  );
}

export function FinishedMap({
  mapRef,
  initialRegion,
  routeCoords,
}: {
  mapRef: React.RefObject<any>;
  initialRegion: Region;
  routeCoords: Coordinate[];
}) {
  const html = buildLeafletHTML({
    center: { latitude: initialRegion.latitude, longitude: initialRegion.longitude },
    zoom: 15,
    route: routeCoords,
    start: routeCoords.length > 0 ? routeCoords[0] : null,
    finish: routeCoords.length > 0 ? routeCoords[routeCoords.length - 1] : null,
    interactive: false,
    showRoute: true,
  });
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' } as any} title="Route Map" />
    </View>
  );
}

// ── Camera helpers (no-ops on web) ────────────────────────

export function animateMapToRegion(_mapRef: React.RefObject<any>, _region: Region, _duration?: number) {
  // No-op on web — Leaflet iframe is rebuilt each render
}

export function fitMapToCoordinates(_mapRef: React.RefObject<any>, _coords: Coordinate[]) {
  // No-op on web — Leaflet auto-fits via fitBounds
}

export const darkMapStyle: any[] = [];
