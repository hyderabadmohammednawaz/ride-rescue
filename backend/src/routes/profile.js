import express from 'express';
import { User } from '../models/User.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { predictMaintenance } from '../services/ai/predictiveMaintenance.js';

const router = express.Router();
router.use(requireAuth);

// PATCH /api/profile
router.patch(
  '/',
  asyncRoute(async (req, res) => {
    const allowed = ['name', 'phone', 'avatarColor', 'preferredLanguage', 'emergencyContact'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) req.user[key] = req.body[key];
    }
    if (req.user.role === 'mechanic' && req.body.mechanicProfile) {
      const editable = ['experienceYears', 'specialisations', 'isAvailable', 'serviceRadiusKm', 'hourlyRate'];
      for (const key of editable) {
        if (req.body.mechanicProfile[key] !== undefined) {
          req.user.mechanicProfile[key] = req.body.mechanicProfile[key];
        }
      }
    }
    if (req.user.role === 'vendor' && req.body.vendorProfile) {
      for (const key of ['shopName', 'gstNumber', 'address']) {
        if (req.body.vendorProfile[key] !== undefined) req.user.vendorProfile[key] = req.body.vendorProfile[key];
      }
    }
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  })
);

/**
 * PUT /api/profile/location — called by the browser and the app as the user moves.
 *
 * Not every fix is worth keeping. A laptop browser has no GPS, so it returns a
 * wifi or IP-derived position that can be a kilometre out, and the web app
 * reports one on every page load. Left unguarded that coarse fix overwrites the
 * precise GPS the phone just sent, and since a booking copies the customer's
 * stored location, the mechanic is then sent to the wrong place.
 *
 * So a fix is rejected when it is much vaguer than one we already hold and that
 * one is still fresh. Clients send `accuracy` in metres, straight from the
 * geolocation API; an update without it is treated as unknown quality and only
 * accepted when nothing better is on file.
 */
const STALE_AFTER_MS = 15 * 60 * 1000;
/** Anything vaguer than this is a network-derived guess rather than a GPS fix. */
const COARSE_METRES = 200;

router.put(
  '/location',
  asyncRoute(async (req, res) => {
    const { coordinates, address, accuracy } = req.body;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) throw badRequest('coordinates must be [longitude, latitude]');

    const incoming = Number.isFinite(accuracy) ? Number(accuracy) : null;
    const held = req.user.location;
    const heldAge = held?.updatedAt ? Date.now() - new Date(held.updatedAt).getTime() : Infinity;
    const heldIsFresh = heldAge < STALE_AFTER_MS;
    const heldAccuracy = Number.isFinite(held?.accuracy) ? held.accuracy : null;

    // Keep the better fix, but never let a stale one win indefinitely.
    const incomingIsCoarse = incoming === null || incoming > COARSE_METRES;
    const heldIsPrecise = heldAccuracy !== null && heldAccuracy <= COARSE_METRES;
    if (incomingIsCoarse && heldIsPrecise && heldIsFresh) {
      return res.json({ location: held, ignored: true, reason: 'a more precise recent fix is on file' });
    }

    req.user.location = {
      type: 'Point',
      coordinates,
      address: address ?? held?.address,
      accuracy: incoming,
      updatedAt: new Date(),
    };
    await req.user.save();
    res.json({ location: req.user.location });
  })
);

// POST /api/profile/vehicles
router.post(
  '/vehicles',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const { make, model, registrationNumber } = req.body;
    if (!make || !model || !registrationNumber) throw badRequest('Make, model and registration number are required');

    const isFirst = req.user.vehicles.length === 0;
    req.user.vehicles.push({ ...req.body, isPrimary: isFirst || !!req.body.isPrimary });
    if (req.body.isPrimary) {
      req.user.vehicles.forEach((v, i) => {
        v.isPrimary = i === req.user.vehicles.length - 1;
      });
    }
    await req.user.save();
    res.status(201).json({ vehicles: req.user.vehicles });
  })
);

// PATCH /api/profile/vehicles/:vehicleId
router.patch(
  '/vehicles/:vehicleId',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const vehicle = req.user.vehicles.id(req.params.vehicleId);
    if (!vehicle) throw notFound('Vehicle not found');

    for (const key of ['make', 'model', 'year', 'registrationNumber', 'fuelType', 'odometerKm', 'lastServiceDate', 'lastServiceOdometerKm']) {
      if (req.body[key] !== undefined) vehicle[key] = req.body[key];
    }
    if (req.body.isPrimary) {
      req.user.vehicles.forEach((v) => {
        v.isPrimary = String(v._id) === String(vehicle._id);
      });
    }
    await req.user.save();
    res.json({ vehicles: req.user.vehicles });
  })
);

// DELETE /api/profile/vehicles/:vehicleId
router.delete(
  '/vehicles/:vehicleId',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const vehicle = req.user.vehicles.id(req.params.vehicleId);
    if (!vehicle) throw notFound('Vehicle not found');
    vehicle.deleteOne();
    if (req.user.vehicles.length && !req.user.vehicles.some((v) => v.isPrimary)) {
      req.user.vehicles[0].isPrimary = true;
    }
    await req.user.save();
    res.json({ vehicles: req.user.vehicles });
  })
);

// GET /api/profile/vehicles/:vehicleId/maintenance - AI predictive maintenance
router.get(
  '/vehicles/:vehicleId/maintenance',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const vehicle = req.user.vehicles.id(req.params.vehicleId);
    if (!vehicle) throw notFound('Vehicle not found');
    res.json({
      vehicle: { make: vehicle.make, model: vehicle.model, registrationNumber: vehicle.registrationNumber, odometerKm: vehicle.odometerKm },
      ...predictMaintenance(vehicle),
    });
  })
);

// POST /api/profile/favourites/:mechanicId - toggle favourite mechanic
router.post(
  '/favourites/:mechanicId',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const id = req.params.mechanicId;
    const mechanic = await User.findOne({ _id: id, role: 'mechanic' });
    if (!mechanic) throw notFound('Mechanic not found');

    const index = req.user.favouriteMechanics.findIndex((m) => String(m) === id);
    if (index >= 0) req.user.favouriteMechanics.splice(index, 1);
    else req.user.favouriteMechanics.push(id);
    await req.user.save();

    res.json({ favouriteMechanics: req.user.favouriteMechanics, isFavourite: index < 0 });
  })
);

export default router;
