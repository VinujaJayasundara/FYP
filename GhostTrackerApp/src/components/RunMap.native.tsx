/**
 * NativeMap.tsx — Used on iOS/Android only.
 * Wraps react-native-maps MapView for the Run screen.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';

interface Coordinate {
  latitude: number;
  longitude: number;
}

// ── Dark map style ────────────────────────────────────────

export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0a0e1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0e1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1f35' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2a3050' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a3050' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1729' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1f15' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// ── Marker Styles ─────────────────────────────────────────

const markerStyles = StyleSheet.create({
  startMarker: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  startMarkerText: { fontSize: 18 },
  finishMarker: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  finishMarkerText: { fontSize: 18 },
  ghostMarker: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,20,50,0.8)', borderRadius: 16,
    borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.6)',
  },
  ghostMarkerText: { fontSize: 18 },
  runnerMarker: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  runnerMarkerPulse: {
    position: 'absolute', width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.3)',
  },
  runnerMarkerDot: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#fff',
  },
});

// ── Idle Map ──────────────────────────────────────────────

export function IdleMap({
  region,
}: {
  region: Region;
}) {
  return (
    <MapView
      style={StyleSheet.absoluteFillObject}
      initialRegion={region}
      mapType="standard"
      showsUserLocation={true}
      showsMyLocationButton={false}
      showsCompass={false}
      customMapStyle={darkMapStyle}
    />
  );
}

// ── Running Map ───────────────────────────────────────────

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
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      initialRegion={initialRegion}
      mapType="standard"
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      customMapStyle={darkMapStyle}
      onPanDrag={onPanDrag}
    >
      {routeCoords.length >= 2 && (
        <Polyline
          coordinates={routeCoords}
          strokeColor="#22c55e"
          strokeWidth={4}
        />
      )}

      {routeCoords.length > 0 && (
        <Marker coordinate={routeCoords[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={markerStyles.startMarker}>
            <Text style={markerStyles.startMarkerText}>🏁</Text>
          </View>
        </Marker>
      )}

      {ghostPosition && routeCoords.length >= 2 && (
        <Marker coordinate={ghostPosition} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={markerStyles.ghostMarker}>
            <Text style={markerStyles.ghostMarkerText}>👻</Text>
          </View>
        </Marker>
      )}

      {currentPosition && (
        <Marker
          coordinate={{ latitude: currentPosition.latitude, longitude: currentPosition.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={markerStyles.runnerMarker}>
            <View style={markerStyles.runnerMarkerPulse} />
            <View style={markerStyles.runnerMarkerDot} />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

// ── Finished Map ──────────────────────────────────────────

export function FinishedMap({
  mapRef,
  initialRegion,
  routeCoords,
}: {
  mapRef: React.RefObject<any>;
  initialRegion: Region;
  routeCoords: Coordinate[];
}) {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      initialRegion={initialRegion}
      mapType="standard"
      showsUserLocation={false}
      customMapStyle={darkMapStyle}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      <Polyline coordinates={routeCoords} strokeColor="#22c55e" strokeWidth={4} />
      <Marker coordinate={routeCoords[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
        <View style={markerStyles.startMarker}>
          <Text style={markerStyles.startMarkerText}>🏁</Text>
        </View>
      </Marker>
      <Marker coordinate={routeCoords[routeCoords.length - 1]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
        <View style={markerStyles.finishMarker}>
          <Text style={markerStyles.finishMarkerText}>🏆</Text>
        </View>
      </Marker>
    </MapView>
  );
}

// ── Camera helper ─────────────────────────────────────────

export function animateMapToRegion(mapRef: React.RefObject<any>, region: Region, duration: number = 500) {
  mapRef.current?.animateToRegion(region, duration);
}

export function fitMapToCoordinates(mapRef: React.RefObject<any>, coords: Coordinate[]) {
  setTimeout(() => {
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, 500);
}
