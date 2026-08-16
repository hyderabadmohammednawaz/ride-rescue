'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

export interface MapMarker {
  id: string;
  position: [number, number]; // [lat, lng] - Leaflet order
  kind: 'customer' | 'mechanic' | 'highlight';
  label: string;
  sublabel?: string;
  color?: string;
}

const EMOJI: Record<MapMarker['kind'], string> = {
  customer: '📍',
  mechanic: '🏍️',
  highlight: '🔧',
};

/** Builds a DivIcon so no external marker images are fetched. */
function pinIcon(marker: MapMarker) {
  const color = marker.color || (marker.kind === 'customer' ? '#dc2626' : '#2563eb');
  return L.divIcon({
    className: 'riderescue-pin',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center">
        <div style="background:${color};width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
                    display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35);
                    border:2px solid white">
          <span style="transform:rotate(45deg);font-size:16px;line-height:1">${EMOJI[marker.kind]}</span>
        </div>
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
}

/** Keeps every marker in view as positions change. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const previous = useRef('');

  useEffect(() => {
    if (points.length === 0) return;
    const key = JSON.stringify(points);
    if (key === previous.current) return;
    previous.current = key;

    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15, animate: true });
    }
  }, [points, map]);

  return null;
}

export default function LiveMap({
  markers,
  route,
  radiusKm,
  radiusCenter,
  height = 380,
  className = '',
}: {
  markers: MapMarker[];
  route?: [number, number][];
  radiusKm?: number;
  radiusCenter?: [number, number];
  height?: number;
  className?: string;
}) {
  const points = useMemo(() => markers.map((m) => m.position), [markers]);
  const centre = points[0] || ([17.385, 78.4867] as [number, number]);

  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`} style={{ height }}>
      {/* Wheel zoom stays off so scrolling the page over a map does not zoom it;
          the +/- controls and pinch gestures still work. */}
      <MapContainer center={centre} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        {/* OpenStreetMap tiles - no API key or billing account needed. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {radiusCenter && radiusKm && (
          <Circle center={radiusCenter} radius={radiusKm * 1000} pathOptions={{ color: '#2563eb', fillOpacity: 0.05, weight: 1 }} />
        )}

        {route && route.length >= 2 && (
          <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.75, dashArray: '8 10' }} />
        )}

        {markers.map((m) => (
          <Marker key={m.id} position={m.position} icon={pinIcon(m)}>
            <Popup>
              <strong>{m.label}</strong>
              {m.sublabel && <div style={{ marginTop: 2 }}>{m.sublabel}</div>}
            </Popup>
          </Marker>
        ))}

        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
