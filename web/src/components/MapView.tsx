'use client';

import dynamic from 'next/dynamic';

/**
 * Chooses the map renderer, once, at module load.
 *
 * Google Maps is used when a key is configured. Without one the app falls back
 * to Leaflet and OpenStreetMap, so a clone with no key still shows a map rather
 * than an empty panel — the same opt-in shape the payment gateway uses.
 *
 * Both renderers touch `window` at import time, so either way the component is
 * loaded dynamically with SSR disabled.
 */
const useGoogle = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

const Placeholder = () => (
  <div className="flex h-[380px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
    Loading map…
  </div>
);

const MapView = useGoogle
  ? dynamic(() => import('./GoogleMap'), { ssr: false, loading: Placeholder })
  : dynamic(() => import('./LiveMap'), { ssr: false, loading: Placeholder });

export default MapView;
export type { MapMarker } from './LiveMap';
