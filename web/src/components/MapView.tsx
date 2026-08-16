'use client';

import dynamic from 'next/dynamic';

/**
 * Leaflet touches `window` at import time, so the map can only be loaded in the
 * browser. Every page imports the map through this wrapper.
 */
const MapView = dynamic(() => import('./LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      Loading map…
    </div>
  ),
});

export default MapView;
export type { MapMarker } from './LiveMap';
