'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapMarker } from './LiveMap';

/**
 * Google Maps renderer, with the same props as the Leaflet one so call sites do
 * not care which is in use.
 *
 * The Maps JavaScript API key is public by design — it ships in the bundle and
 * is identified by HTTP referrer, not kept secret. Restrict it to your own
 * domains in Google Cloud Console, or anyone can spend your quota.
 */

const EMOJI: Record<MapMarker['kind'], string> = {
  customer: '📍',
  mechanic: '🏍️',
  highlight: '🔧',
};

const COLOR: Record<MapMarker['kind'], string> = {
  customer: '#dc2626',
  mechanic: '#2563eb',
  highlight: '#d97706',
};

let loader: Promise<void> | null = null;

const READY_CALLBACK = '__riderescueMapsReady';

/**
 * Loads the Maps script once per page.
 *
 * Resolving on the script's `onload` does not work: with `loading=async` the
 * script returns before the library is installed, so `google.maps.Map` is still
 * undefined and constructing one throws "maps.Map is not a constructor". Google
 * signals readiness through the `callback` parameter instead, and that is what
 * this waits on.
 *
 * The promise is cached because React mounts effects twice in development, and
 * every map on a page shares one script tag.
 */
function loadMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    (window as any)[READY_CALLBACK] = () => resolve();

    const el = document.createElement('script');
    el.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&loading=async&callback=${READY_CALLBACK}`;
    el.async = true;
    el.onerror = () => {
      loader = null; // allow a later retry rather than reusing a rejected promise
      reject(new Error('Could not load Google Maps'));
    };
    document.head.appendChild(el);
  });
  return loader;
}

export default function GoogleMapView({
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const drawn = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey) return;

    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !holder.current) return;
        const g = (window as any).google;

        if (!map.current) {
          map.current = new g.maps.Map(holder.current, {
            center: { lat: 17.385, lng: 78.4867 },
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            // Roads and labels matter here; points of interest are noise.
            styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
          });
        }

        // Everything drawn last time goes, then the current state is drawn. The
        // marker set changes shape between renders (a mechanic appears, a route
        // is added), so reconciling individually would cost more than it saves.
        drawn.current.forEach((o) => o.setMap(null));
        drawn.current = [];

        const bounds = new g.maps.LatLngBounds();

        markers.forEach((m) => {
          const position = { lat: m.position[0], lng: m.position[1] };
          bounds.extend(position);
          const marker = new g.maps.Marker({
            position,
            map: map.current,
            title: m.label,
            label: { text: EMOJI[m.kind], fontSize: '18px' },
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 17,
              fillColor: m.color || COLOR[m.kind],
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          });
          const info = new g.maps.InfoWindow({
            content: `<strong>${m.label}</strong>${m.sublabel ? `<br/>${m.sublabel}` : ''}`,
          });
          marker.addListener('click', () => info.open({ anchor: marker, map: map.current }));
          drawn.current.push(marker);
        });

        if (route && route.length >= 2) {
          const line = new g.maps.Polyline({
            path: route.map(([lat, lng]) => ({ lat, lng })),
            map: map.current,
            strokeColor: '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 4,
          });
          route.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
          drawn.current.push(line);
        }

        if (radiusKm && radiusCenter) {
          const circle = new g.maps.Circle({
            map: map.current,
            center: { lat: radiusCenter[0], lng: radiusCenter[1] },
            radius: radiusKm * 1000,
            fillColor: '#2563eb',
            fillOpacity: 0.06,
            strokeColor: '#2563eb',
            strokeOpacity: 0.35,
            strokeWeight: 1,
          });
          bounds.union(circle.getBounds());
          drawn.current.push(circle);
        }

        if (!bounds.isEmpty()) {
          if (markers.length === 1 && !radiusKm) {
            map.current.setCenter(bounds.getCenter());
            map.current.setZoom(15);
          } else {
            map.current.fitBounds(bounds, 48);
          }
        }
      })
      .catch((e) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [apiKey, markers, route, radiusKm, radiusCenter]);

  if (!apiKey) {
    return (
      <div
        style={{ height }}
        className={`flex items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-6 text-center text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 ${className}`}
      >
        Set <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to show the map.
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{ height }}
        className={`flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 text-center text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 ${className}`}
      >
        {error}. Check the key is valid and that this domain is allowed in its referrer restrictions.
      </div>
    );
  }

  return <div ref={holder} style={{ height }} className={`overflow-hidden rounded-2xl ${className}`} />;
}
