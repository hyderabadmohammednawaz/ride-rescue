import { Booking } from '../models/Booking.js';
import { User } from '../models/User.js';
import { distanceKm, etaMinutes, moveToward } from '../utils/geo.js';
import { emitToBooking, emitToUser } from '../realtime/hub.js';

const TICK_MS = 3000;
// The mechanic closes this fraction of the remaining gap each tick, with a
// minimum step so the last few hundred metres do not crawl. At 3 s ticks a
// 3 km trip finishes in roughly 90 seconds - a demo-friendly compression of a
// real ride, not an attempt to simulate traffic.
const STEP_FRACTION = 0.15;
const MIN_STEP_KM = 0.08;

/**
 * Advances the position of any mechanic who is en route to a job, so live
 * tracking on the map animates during a demo without a phone streaming real GPS.
 * A real device sending `location:update` over the socket simply overrides this.
 */
export function startSimulator() {
  console.log('[sim] mechanic movement simulator running (set SIMULATE=false to disable)');

  setInterval(async () => {
    try {
      const enRoute = await Booking.find({ status: 'accepted', mechanic: { $ne: null } }).limit(20);
      if (enRoute.length === 0) return;

      for (const booking of enRoute) {
        const target = booking.pickupLocation.coordinates;
        const current = booking.mechanicLocation?.coordinates;
        if (!current) continue;

        const remaining = distanceKm(current, target);

        // Close enough - park the mechanic at the customer and stop moving them.
        if (remaining < 0.05) {
          booking.etaMinutes = 0;
          booking.distanceKm = 0;
          await booking.save();
          emitToBooking(booking._id, 'booking:location', {
            bookingId: booking._id,
            coordinates: target,
            distanceKm: 0,
            etaMinutes: 0,
            arrived: true,
          });
          continue;
        }

        const stepKm = Math.min(remaining, Math.max(remaining * STEP_FRACTION, MIN_STEP_KM));
        const next = moveToward(current, target, stepKm / remaining);
        const km = distanceKm(next, target);

        booking.mechanicLocation = { type: 'Point', coordinates: next, updatedAt: new Date() };
        booking.distanceKm = Number(km.toFixed(2));
        booking.etaMinutes = etaMinutes(km);
        await booking.save();

        await User.findByIdAndUpdate(booking.mechanic, {
          'location.coordinates': next,
          'location.updatedAt': new Date(),
        });

        const payload = {
          bookingId: booking._id,
          coordinates: next,
          distanceKm: booking.distanceKm,
          etaMinutes: booking.etaMinutes,
        };
        emitToBooking(booking._id, 'booking:location', payload);
        emitToUser(booking.customer, 'booking:location', payload);
      }
    } catch (err) {
      console.error('[sim] tick failed:', err.message);
    }
  }, TICK_MS).unref();
}
