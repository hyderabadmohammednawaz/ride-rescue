import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../lib/theme';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  kind: 'customer' | 'mechanic';
  label: string;
}

/**
 * Leaflet + OpenStreetMap inside a WebView. This keeps the map free of any
 * Google Maps API key or billing account, and renders identically to the web
 * app. Leaflet itself is loaded from the CDN — the map needs a network
 * connection for tiles regardless.
 */
function buildHtml(pins: MapPin[], drawRoute: boolean) {
  const payload = JSON.stringify({ pins, drawRoute });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #f8fafc; }
    .pin { display:flex; align-items:center; justify-content:center; width:34px; height:34px;
           border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:2px solid #fff;
           box-shadow:0 3px 10px rgba(0,0,0,.35); }
    .pin span { transform:rotate(45deg); font-size:16px; line-height:1; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var data = ${payload};
    var map = L.map('map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var markers = {};
    var routeLine = null;

    function iconFor(kind) {
      var colour = kind === 'customer' ? '#dc2626' : '#2563eb';
      var emoji  = kind === 'customer' ? '📍' : '🏍️';
      return L.divIcon({
        className: '',
        html: '<div class="pin" style="background:' + colour + '"><span>' + emoji + '</span></div>',
        iconSize: [34, 34], iconAnchor: [17, 34]
      });
    }

    function render(state) {
      var bounds = [];
      state.pins.forEach(function (p) {
        var pos = [p.lat, p.lng];
        bounds.push(pos);
        if (markers[p.id]) {
          markers[p.id].setLatLng(pos);
        } else {
          markers[p.id] = L.marker(pos, { icon: iconFor(p.kind) }).addTo(map).bindPopup(p.label);
        }
      });

      // Drop markers that are no longer in the payload.
      Object.keys(markers).forEach(function (id) {
        if (!state.pins.some(function (p) { return p.id === id; })) {
          map.removeLayer(markers[id]); delete markers[id];
        }
      });

      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      if (state.drawRoute && state.pins.length >= 2) {
        routeLine = L.polyline(bounds, { color: '#2563eb', weight: 4, opacity: .75, dashArray: '8 10' }).addTo(map);
      }

      if (bounds.length === 1) map.setView(bounds[0], 14);
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
    }

    render(data);

    // React Native pushes position updates in through this channel rather than
    // reloading the whole WebView, so the marker glides instead of flickering.
    function handleMessage(event) {
      try { render(JSON.parse(event.data)); } catch (e) {}
    }
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
  </script>
</body>
</html>`;
}

export default function TrackingMap({
  pins,
  drawRoute = false,
  height = 260,
}: {
  pins: MapPin[];
  drawRoute?: boolean;
  height?: number;
}) {
  const webRef = useRef<WebView>(null);
  const loaded = useRef(false);

  // The HTML is built once; later pin changes are posted into the live page so
  // markers glide instead of the whole map reloading.
  const html = useMemo(() => buildHtml(pins, drawRoute), []); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = JSON.stringify({ pins, drawRoute });

  const push = () => {
    webRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(payload)}, '*'); true;`);
  };

  useEffect(() => {
    // Anything posted before the page finishes loading is dropped on the floor,
    // which used to leave stale markers on screen after the pin list changed.
    if (loaded.current) push();
  }, [payload]);

  return (
    <View style={[styles.wrapper, { height }]}>
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => {
          loaded.current = true;
          push();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  web: { flex: 1, backgroundColor: colors.background },
});
