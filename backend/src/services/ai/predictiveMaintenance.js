/**
 * Rule-based predictive maintenance.
 *
 * Each component has a service interval in kilometres and in months. Whichever
 * limit is reached first drives the prediction, which is how two-wheeler service
 * schedules actually work. Usage is projected forward from the customer's own
 * average daily running, so a rider doing 60 km/day is warned much earlier than
 * one doing 5 km/day.
 */

const COMPONENTS = [
  { key: 'engine_oil', label: 'Engine oil change', km: 3000, months: 6, cost: 550, icon: '🛢️' },
  { key: 'oil_filter', label: 'Oil filter replacement', km: 6000, months: 12, cost: 250, icon: '🧽' },
  { key: 'air_filter', label: 'Air filter cleaning/replacement', km: 5000, months: 9, cost: 320, icon: '💨' },
  { key: 'brake_pads', label: 'Brake pad replacement', km: 8000, months: 18, cost: 700, icon: '🛑' },
  { key: 'chain_sprocket', label: 'Chain & sprocket service', km: 5000, months: 12, cost: 900, icon: '⛓️' },
  { key: 'battery', label: 'Battery check/replacement', km: 20000, months: 30, cost: 1800, icon: '🔋' },
  { key: 'tyres', label: 'Tyre replacement', km: 18000, months: 36, cost: 2600, icon: '🛞' },
  { key: 'spark_plug', label: 'Spark plug replacement', km: 10000, months: 18, cost: 220, icon: '⚡' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function monthsBetween(from, to) {
  return (to - from) / (30.44 * DAY_MS);
}

/**
 * @param {object} vehicle a vehicle subdocument from User.vehicles
 * @param {object} options
 * @param {number} options.assumedDailyKm fallback when there is no odometer history
 * @returns {{dailyKm:number, predictions:Array}}
 */
export function predictMaintenance(vehicle, { assumedDailyKm = 25 } = {}) {
  const now = new Date();
  const odometer = vehicle.odometerKm || 0;
  const lastServiceKm = vehicle.lastServiceOdometerKm || 0;
  const lastServiceDate = vehicle.lastServiceDate ? new Date(vehicle.lastServiceDate) : null;

  // Derive the rider's actual daily running from odometer movement since the
  // last service; fall back to the assumed average for a brand-new profile.
  let dailyKm = assumedDailyKm;
  if (lastServiceDate && odometer > lastServiceKm) {
    const days = Math.max(1, (now - lastServiceDate) / DAY_MS);
    const observed = (odometer - lastServiceKm) / days;
    if (observed > 0.5 && observed < 300) dailyKm = observed;
  }

  const kmSinceService = Math.max(0, odometer - lastServiceKm);
  const monthsSinceService = lastServiceDate ? monthsBetween(lastServiceDate, now) : 12;

  const predictions = COMPONENTS.map((c) => {
    const kmUsedRatio = kmSinceService / c.km;
    const timeUsedRatio = monthsSinceService / c.months;
    const wear = Math.max(kmUsedRatio, timeUsedRatio);

    const kmRemaining = Math.max(0, c.km - kmSinceService);
    const daysByKm = kmRemaining / Math.max(1, dailyKm);
    const daysByTime = Math.max(0, (c.months - monthsSinceService) * 30.44);
    const daysRemaining = Math.round(Math.min(daysByKm, daysByTime));

    let urgency = 'ok';
    if (wear >= 1) urgency = 'overdue';
    else if (wear >= 0.85) urgency = 'due_now';
    else if (wear >= 0.65) urgency = 'due_soon';

    const driver = daysByKm <= daysByTime ? 'distance' : 'time';

    return {
      key: c.key,
      label: c.label,
      icon: c.icon,
      estimatedCost: c.cost,
      wearPercent: Math.min(150, Math.round(wear * 100)),
      urgency,
      daysRemaining,
      dueDate: new Date(now.getTime() + daysRemaining * DAY_MS),
      kmRemaining: Math.round(kmRemaining),
      reason:
        urgency === 'overdue'
          ? `Overdue — ${driver === 'distance' ? `${Math.round(kmSinceService)} km` : `${Math.round(monthsSinceService)} months`} since last service (limit ${driver === 'distance' ? `${c.km} km` : `${c.months} months`})`
          : `About ${daysRemaining} day(s) left based on ${driver === 'distance' ? `${dailyKm.toFixed(0)} km/day riding` : 'age since last service'}`,
    };
  }).sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    dailyKm: Number(dailyKm.toFixed(1)),
    kmSinceService: Math.round(kmSinceService),
    monthsSinceService: Number(monthsSinceService.toFixed(1)),
    predictions,
    healthScore: Math.max(
      0,
      Math.round(100 - (predictions.reduce((sum, p) => sum + Math.min(120, p.wearPercent), 0) / predictions.length))
    ),
  };
}

export const MAINTENANCE_COMPONENTS = COMPONENTS;
