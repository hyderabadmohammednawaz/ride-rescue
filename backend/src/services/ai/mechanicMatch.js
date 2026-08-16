import { User } from '../../models/User.js';
import { Booking } from '../../models/Booking.js';
import { distanceKm, etaMinutes } from '../../utils/geo.js';

// Weights sum to 1. Distance dominates for emergencies because a nearby
// average mechanic beats a distant excellent one when the bike is stranded.
const WEIGHTS = {
  sos: { distance: 0.5, rating: 0.2, availability: 0.12, experience: 0.1, workload: 0.08 },
  normal: { distance: 0.32, rating: 0.3, availability: 0.1, experience: 0.18, workload: 0.1 },
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * Scores nearby mechanics on distance, rating, availability, experience and
 * current workload, and returns them best-first with a human-readable
 * explanation of why each one ranked where it did.
 *
 * @param {[number, number]} coordinates customer position as [lng, lat]
 * @param {object} options
 * @returns {Promise<{ranked: Array, consideredCount: number}>}
 */
export async function rankMechanics(coordinates, options = {}) {
  const { radiusKm = 20, limit = 5, isEmergency = false, favouriteIds = [], vehicleMake } = options;

  const candidates = await User.find({
    role: 'mechanic',
    isBlocked: false,
    'mechanicProfile.isAvailable': true,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates },
        $maxDistance: radiusKm * 1000,
      },
    },
  }).limit(30);

  if (candidates.length === 0) return { ranked: [], consideredCount: 0 };

  // One aggregate instead of a query per mechanic.
  const activeCounts = await Booking.aggregate([
    {
      $match: {
        mechanic: { $in: candidates.map((c) => c._id) },
        status: { $in: ['accepted', 'arrived', 'in_progress'] },
      },
    },
    { $group: { _id: '$mechanic', count: { $sum: 1 } } },
  ]);
  const workloadByMechanic = new Map(activeCounts.map((r) => [String(r._id), r.count]));

  const weights = isEmergency ? WEIGHTS.sos : WEIGHTS.normal;
  const favourites = new Set(favouriteIds.map(String));

  const ranked = candidates
    .map((mechanic) => {
      const profile = mechanic.mechanicProfile || {};
      const km = distanceKm(coordinates, mechanic.location.coordinates);
      const activeJobs = workloadByMechanic.get(String(mechanic._id)) || 0;

      // Each factor is normalised to 0..1 where 1 is best.
      const distanceScore = clamp01(1 - km / radiusKm);
      // An unrated new mechanic is treated as 3.5/5 rather than 0 so they can still get work.
      const rating = profile.ratingCount > 0 ? profile.ratingAverage : 3.5;
      const ratingScore = clamp01((rating - 1) / 4);
      const availabilityScore = profile.isAvailable ? 1 : 0;
      const experienceScore = clamp01((profile.experienceYears || 0) / 15);
      const workloadScore = clamp01(1 - activeJobs / 3);

      let score =
        distanceScore * weights.distance +
        ratingScore * weights.rating +
        availabilityScore * weights.availability +
        experienceScore * weights.experience +
        workloadScore * weights.workload;

      const reasons = [];
      if (km <= 3) reasons.push(`Only ${km.toFixed(1)} km away`);
      else reasons.push(`${km.toFixed(1)} km away`);
      if (profile.ratingCount > 0 && profile.ratingAverage >= 4.5) {
        reasons.push(`Rated ${profile.ratingAverage.toFixed(1)}★ by ${profile.ratingCount} customers`);
      }
      if ((profile.experienceYears || 0) >= 5) {
        reasons.push(`${profile.experienceYears} years experience`);
      }
      if (activeJobs === 0) reasons.push('Free right now');
      else reasons.push(`${activeJobs} job(s) in hand`);

      // Small nudges on top of the weighted score.
      if (favourites.has(String(mechanic._id))) {
        score += 0.05;
        reasons.push('One of your favourite mechanics');
      }
      if (vehicleMake && (profile.specialisations || []).some((s) => s.toLowerCase().includes(vehicleMake.toLowerCase()))) {
        score += 0.04;
        reasons.push(`Specialises in ${vehicleMake}`);
      }

      return {
        mechanic,
        score: Number(Math.min(1, score).toFixed(4)),
        distanceKm: Number(km.toFixed(2)),
        etaMinutes: etaMinutes(km),
        activeJobs,
        reasons,
        breakdown: {
          distance: Number(distanceScore.toFixed(3)),
          rating: Number(ratingScore.toFixed(3)),
          availability: availabilityScore,
          experience: Number(experienceScore.toFixed(3)),
          workload: Number(workloadScore.toFixed(3)),
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { ranked, consideredCount: candidates.length };
}
