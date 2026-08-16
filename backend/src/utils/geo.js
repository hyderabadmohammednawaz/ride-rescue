const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two [lng, lat] pairs. */
export function distanceKm([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Road distance is longer than the straight line, and city traffic is slow.
 * 1.35x detour factor and 22 km/h average speed match Indian city two-wheeler
 * conditions closely enough for a believable ETA.
 */
export function etaMinutes(km) {
  const roadKm = km * 1.35;
  return Math.max(3, Math.round((roadKm / 22) * 60));
}

/** Nudges a point by a fraction of the way toward a target - used to animate demo mechanics. */
export function moveToward(from, to, fraction) {
  return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
}
