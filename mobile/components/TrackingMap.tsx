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
 * The map, inside a WebView.
 *
 * Google Maps is used when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is set, and Leaflet
 * with OpenStreetMap otherwise, so a build without a key still shows a map.
 * Either way the library and tiles arrive over the network — a WebView cannot
 * render a map offline.
 *
 * The key is public by design: it ships inside the APK and is identified by the
 * app's package name and signing certificate rather than kept secret. Restrict
 * it in Google Cloud Console, or anyone can spend the quota.
 */
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

function buildGoogleHtml(pins: MapPin[], drawRoute: boolean) {
  const payload = JSON.stringify({ pins, drawRoute });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>html,body,#map{height:100%;margin:0;padding:0;background:#f8fafc;}</style>
</head>
<body>
  <div id="map"></div>
  <script>
    var data = ${payload};
    var glyphs = { customer: '\u{1F4CD}', mechanic: '\u{1F3CD}' };
    var map, markers = {}, routeLine = null;

    function render(state) {
      if (!map) return;
      var bounds = new google.maps.LatLngBounds();
      var seen = {};

      state.pins.forEach(function (p) {
        var pos = { lat: p.lat, lng: p.lng };
        bounds.extend(pos); seen[p.id] = true;
        if (markers[p.id]) {
          markers[p.id].setPosition(pos);
        } else {
          markers[p.id] = new google.maps.Marker({
            position: pos, map: map, title: p.label,
            label: { text: glyphs[p.kind] || '', fontSize: '15px' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE, scale: 16,
              fillColor: p.kind === 'customer' ? '#dc2626' : '#2563eb',
              fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2
            }
          });
        }
      });

      Object.keys(markers).forEach(function (id) {
        if (!seen[id]) { markers[id].setMap(null); delete markers[id]; }
      });

      if (routeLine) { routeLine.setMap(null); routeLine = null; }
      if (state.drawRoute && state.pins.length >= 2) {
        routeLine = new google.maps.Polyline({
          path: state.pins.map(function (p) { return { lat: p.lat, lng: p.lng }; }),
          map: map, strokeColor: '#2563eb', strokeOpacity: 0.85, strokeWeight: 4
        });
      }

      if (state.pins.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(15); }
      else if (state.pins.length > 1) { map.fitBounds(bounds, 45); }
    }

    function initMap() {
      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 17.385, lng: 78.4867 }, zoom: 13,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
      });
      render(data);
    }
    window.initMap = initMap;

    function handleMessage(event) {
      try { render(JSON.parse(event.data)); } catch (e) {}
    }
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
  </script>
  <script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
    GOOGLE_KEY
  )}&callback=initMap"></script>
</body>
</html>`;
}

function buildOsmHtml(pins: MapPin[], drawRoute: boolean) {
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
  const html = useMemo(
    () => (GOOGLE_KEY ? buildGoogleHtml(pins, drawRoute) : buildOsmHtml(pins, drawRoute)),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

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
