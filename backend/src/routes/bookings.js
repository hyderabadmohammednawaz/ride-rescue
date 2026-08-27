import express from 'express';
import { Booking } from '../models/Booking.js';
import { ServiceType } from '../models/ServiceType.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { Review } from '../models/Review.js';
import { asyncRoute, badRequest, forbidden, notFound } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { bookingReference, numericCode, qrToken } from '../utils/ids.js';
import { distanceKm, etaMinutes } from '../utils/geo.js';
import { rankMechanics } from '../services/ai/mechanicMatch.js';
import { partsForService } from '../services/ai/partsRecommender.js';
import { notify } from '../services/notifications.js';
import { emitToBooking, emitToMechanics, emitToUser } from '../realtime/hub.js';

const router = express.Router();
router.use(requireAuth);

const populateBooking = (query) =>
  query
    .populate('customer', 'name phone avatarColor location emergencyContact')
    .populate('mechanic', 'name phone avatarColor location mechanicProfile')
    .populate('serviceType', 'name slug icon basePrice estimatedMinutes');

function assertParticipant(booking, user) {
  const isCustomer = String(booking.customer?._id || booking.customer) === String(user._id);
  const isMechanic = String(booking.mechanic?._id || booking.mechanic || '') === String(user._id);
  if (!isCustomer && !isMechanic && user.role !== 'admin') throw forbidden('This is not your booking');
  return { isCustomer, isMechanic };
}

function pushStatus(booking, status, note) {
  booking.status = status;
  booking.statusHistory.push({ status, at: new Date(), note });
}

// GET /api/bookings - role-aware list
router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { status, limit = 50 } = req.query;
    const filter = {};
    if (req.user.role === 'customer') filter.customer = req.user._id;
    else if (req.user.role === 'mechanic') filter.mechanic = req.user._id;
    else if (req.user.role !== 'admin') throw forbidden('Not available for this role');

    if (status) filter.status = { $in: String(status).split(',') };

    const bookings = await populateBooking(Booking.find(filter).sort({ createdAt: -1 }).limit(Number(limit)));
    res.json({ bookings });
  })
);

// GET /api/bookings/available - open jobs a mechanic can accept
router.get(
  '/available',
  requireRole('mechanic'),
  asyncRoute(async (req, res) => {
    const radiusKm = req.user.mechanicProfile?.serviceRadiusKm || 15;
    const bookings = await populateBooking(
      Booking.find({
        status: 'pending',
        mechanic: null,
        pickupLocation: {
          $near: {
            $geometry: { type: 'Point', coordinates: req.user.location.coordinates },
            $maxDistance: radiusKm * 1000,
          },
        },
      }).limit(25)
    );

    const withDistance = bookings.map((b) => {
      const km = distanceKm(req.user.location.coordinates, b.pickupLocation.coordinates);
      return { ...b.toObject(), distanceFromMeKm: Number(km.toFixed(2)), etaFromMeMinutes: etaMinutes(km) };
    });
    res.json({ bookings: withDistance });
  })
);

// GET /api/bookings/:id
router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const booking = await populateBooking(Booking.findById(req.params.id));
    if (!booking) throw notFound('Booking not found');
    assertParticipant(booking, req.user);
    res.json({ booking });
  })
);

// POST /api/bookings - instant, scheduled or SOS
router.post(
  '/',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const {
      serviceTypeId,
      kind = 'instant',
      description,
      scheduledFor,
      coordinates,
      address,
      vehicleId,
      autoAssign = true,
      mechanicId,
    } = req.body;

    const point = coordinates || req.user.location?.coordinates;
    if (!Array.isArray(point) || point.length !== 2) throw badRequest('Your location is required to book');

    const service = serviceTypeId
      ? await ServiceType.findById(serviceTypeId)
      : await ServiceType.findOne({ slug: kind === 'sos' ? 'emergency-breakdown' : 'general-service' });
    if (!service) throw badRequest('Unknown service type');

    if (kind === 'scheduled' && !scheduledFor) throw badRequest('A scheduled booking needs a date and time');

    const vehicle =
      (vehicleId && req.user.vehicles.id(vehicleId)) ||
      req.user.vehicles.find((v) => v.isPrimary) ||
      req.user.vehicles[0];
    if (!vehicle) throw badRequest('Add a vehicle to your profile before booking');

    const booking = new Booking({
      reference: bookingReference(),
      customer: req.user._id,
      serviceType: service._id,
      kind,
      description,
      scheduledFor: kind === 'scheduled' ? new Date(scheduledFor) : undefined,
      vehicle: { make: vehicle.make, model: vehicle.model, registrationNumber: vehicle.registrationNumber },
      pickupLocation: { type: 'Point', coordinates: point, address: address || req.user.location?.address },
      charges: { visitFee: kind === 'sos' ? 100 : 0, labour: service.basePrice, total: service.basePrice + (kind === 'sos' ? 100 : 0) },
      otpCode: numericCode(4),
      qrToken: qrToken(),
      statusHistory: [{ status: 'pending', at: new Date(), note: 'Booking created' }],
    });

    // AI mechanic recommendation. A scheduled job stays in the pool for
    // mechanics to pick up; instant and SOS jobs get the best match assigned.
    const { ranked, consideredCount } = await rankMechanics(point, {
      isEmergency: kind === 'sos',
      radiusKm: kind === 'sos' ? 25 : 20,
      favouriteIds: req.user.favouriteMechanics,
      vehicleMake: vehicle.make,
      // Only the top match matters when assigning automatically, but a chosen
      // mechanic can sit anywhere in the ranking — a highly rated one further
      // away scores below a closer average one. Widen the list so the customer's
      // pick is actually found rather than reported unavailable.
      limit: mechanicId && kind !== 'sos' ? 30 : 5,
    });

    /**
     * A customer may name the mechanic they want — someone they have used before,
     * or the best rated in the list — but only for planned work. An SOS ignores
     * the choice entirely: when you are stranded the nearest mechanic is the
     * right answer, and letting someone pick a five-star mechanic forty minutes
     * away would make the emergency feature worse while looking like a feature.
     */
    const chosen =
      mechanicId && kind !== 'sos' ? ranked.find((r) => String(r.mechanic._id) === String(mechanicId)) : null;

    if (mechanicId && kind !== 'sos' && !chosen) {
      // Not in range, offline or blocked — say so rather than silently
      // assigning someone else, which is the sort of substitution a customer
      // would only discover when a stranger turned up.
      throw badRequest('That mechanic is no longer available. Pick another from the list.');
    }

    const picked = chosen || ranked[0];

    if (picked) {
      booking.recommendation = { score: picked.score, reasons: picked.reasons, consideredCount };
      booking.distanceKm = picked.distanceKm;
      booking.etaMinutes = picked.etaMinutes;

      if ((autoAssign || chosen) && kind !== 'scheduled') {
        booking.mechanic = picked.mechanic._id;
        pushStatus(
          booking,
          'accepted',
          chosen
            ? `Chosen by the customer (rated ${(picked.mechanic.mechanicProfile?.ratingAverage || 0).toFixed(1)}★)`
            : `Auto-assigned by AI match (score ${picked.score})`
        );
        booking.mechanicLocation = {
          type: 'Point',
          coordinates: picked.mechanic.location.coordinates,
          updatedAt: new Date(),
        };
      }
    }

    await booking.save();
    const saved = await populateBooking(Booking.findById(booking._id));

    if (booking.mechanic) {
      await notify(booking.mechanic, {
        title: kind === 'sos' ? '🚨 Emergency job assigned' : 'New job assigned',
        body: `${req.user.name} — ${service.name} · ${booking.distanceKm} km away`,
        type: kind === 'sos' ? 'sos' : 'booking',
        link: `/mechanic/jobs/${booking._id}`,
        meta: { bookingId: booking._id },
      });
      emitToUser(booking.mechanic, 'booking:assigned', saved);
      await notify(req.user._id, {
        title: 'Mechanic assigned',
        body: `${saved.mechanic.name} is on the way — ETA ${booking.etaMinutes} min`,
        type: 'booking',
        link: `/customer/bookings/${booking._id}`,
      });
    } else {
      emitToMechanics('booking:new', saved);
      await notify(req.user._id, {
        title: 'Booking created',
        body: `We are finding a mechanic for ${booking.reference}`,
        type: 'booking',
        link: `/customer/bookings/${booking._id}`,
      });
    }

    // Emergency contact alert for SOS.
    if (kind === 'sos' && req.user.emergencyContact?.phone) {
      console.log(
        `[sos] alerting emergency contact ${req.user.emergencyContact.name} (${req.user.emergencyContact.phone}) — ${req.user.name} raised SOS at ${point.join(', ')}`
      );
    }

    res.status(201).json({
      booking: saved,
      alternatives: ranked.slice(1).map((r) => ({
        mechanicId: r.mechanic._id,
        name: r.mechanic.name,
        distanceKm: r.distanceKm,
        etaMinutes: r.etaMinutes,
        rating: r.mechanic.mechanicProfile?.ratingAverage || 0,
        score: r.score,
        reasons: r.reasons,
      })),
    });
  })
);

// GET /api/bookings/:id/suggested-parts - AI parts suggestion for the mechanic
router.get(
  '/:id/suggested-parts',
  requireRole('mechanic', 'admin'),
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('serviceType', 'slug');
    if (!booking) throw notFound('Booking not found');
    const parts = await partsForService(booking.serviceType?.slug, booking.vehicle?.model);
    res.json({ parts });
  })
);

// POST /api/bookings/:id/accept - mechanic takes an open job
router.post(
  '/:id/accept',
  requireRole('mechanic'),
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    if (booking.mechanic) throw badRequest('This job has already been taken');
    if (booking.status !== 'pending') throw badRequest('This job is no longer open');

    const km = distanceKm(req.user.location.coordinates, booking.pickupLocation.coordinates);
    booking.mechanic = req.user._id;
    booking.distanceKm = Number(km.toFixed(2));
    booking.etaMinutes = etaMinutes(km);
    booking.mechanicLocation = { type: 'Point', coordinates: req.user.location.coordinates, updatedAt: new Date() };
    pushStatus(booking, 'accepted', `Accepted by ${req.user.name}`);
    await booking.save();

    const saved = await populateBooking(Booking.findById(booking._id));
    await notify(booking.customer, {
      title: 'Mechanic accepted your request',
      body: `${req.user.name} is on the way — ETA ${booking.etaMinutes} min`,
      type: 'booking',
      link: `/customer/bookings/${booking._id}`,
    });
    emitToUser(booking.customer, 'booking:updated', saved);
    emitToBooking(booking._id, 'booking:updated', saved);
    emitToMechanics('booking:taken', { bookingId: booking._id });

    res.json({ booking: saved });
  })
);

// POST /api/bookings/:id/reject - mechanic declines; job returns to the pool
router.post(
  '/:id/reject',
  requireRole('mechanic'),
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    if (String(booking.mechanic || '') !== String(req.user._id)) throw forbidden('This job is not assigned to you');
    if (!['pending', 'accepted'].includes(booking.status)) throw badRequest('Work has already started on this job');

    booking.mechanic = null;
    booking.mechanicLocation = undefined;
    pushStatus(booking, 'pending', `Declined by ${req.user.name}, reassigning`);

    // Try the next best mechanic straight away.
    const { ranked } = await rankMechanics(booking.pickupLocation.coordinates, {
      isEmergency: booking.kind === 'sos',
      limit: 3,
    });
    const next = ranked.find((r) => String(r.mechanic._id) !== String(req.user._id));
    if (next && booking.kind !== 'scheduled') {
      booking.mechanic = next.mechanic._id;
      booking.distanceKm = next.distanceKm;
      booking.etaMinutes = next.etaMinutes;
      booking.recommendation = { score: next.score, reasons: next.reasons, consideredCount: ranked.length };
      pushStatus(booking, 'accepted', `Reassigned to ${next.mechanic.name}`);
    }
    await booking.save();

    const saved = await populateBooking(Booking.findById(booking._id));
    if (booking.mechanic) {
      await notify(booking.mechanic, { title: 'New job assigned', body: `${saved.customer.name} — ${booking.distanceKm} km away`, type: 'booking', link: `/mechanic/jobs/${booking._id}` });
      emitToUser(booking.mechanic, 'booking:assigned', saved);
    } else {
      emitToMechanics('booking:new', saved);
    }
    emitToUser(booking.customer, 'booking:updated', saved);
    emitToBooking(booking._id, 'booking:updated', saved);

    res.json({ booking: saved });
  })
);

// PATCH /api/bookings/:id/status - arrived / in_progress / completed
router.patch(
  '/:id/status',
  requireRole('mechanic', 'admin'),
  asyncRoute(async (req, res) => {
    const { status, note, otpCode, partsUsed, labourCharge } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    if (req.user.role === 'mechanic' && String(booking.mechanic || '') !== String(req.user._id)) {
      throw forbidden('This job is not assigned to you');
    }

    const allowedNext = {
      accepted: ['arrived', 'cancelled'],
      arrived: ['in_progress', 'cancelled'],
      in_progress: ['completed'],
    };
    if (!allowedNext[booking.status]?.includes(status)) {
      throw badRequest(`Cannot move a ${booking.status} job to ${status}`);
    }

    // Starting work requires the customer's 4-digit OTP - proves the mechanic is really there.
    if (status === 'in_progress' && req.user.role === 'mechanic') {
      if (String(otpCode || '') !== booking.otpCode) throw badRequest('Incorrect start OTP from the customer');
    }

    if (status === 'completed') {
      if (Array.isArray(partsUsed)) {
        booking.partsUsed = partsUsed;
        booking.charges.parts = partsUsed.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
      }
      if (labourCharge !== undefined) booking.charges.labour = Number(labourCharge);
      booking.charges.total =
        booking.charges.labour + booking.charges.parts + booking.charges.visitFee - booking.charges.discount;
      booking.completedAt = new Date();

      await User.findByIdAndUpdate(booking.mechanic, { $inc: { 'mechanicProfile.completedJobs': 1 } });
    }

    pushStatus(booking, status, note);
    await booking.save();
    const saved = await populateBooking(Booking.findById(booking._id));

    const titles = {
      arrived: 'Your mechanic has arrived',
      in_progress: 'Work has started on your bike',
      completed: 'Service completed',
      cancelled: 'Booking cancelled',
    };
    await notify(booking.customer, {
      title: titles[status] || 'Booking updated',
      body: status === 'completed' ? `Total ₹${booking.charges.total}. Please complete payment.` : note || '',
      type: 'booking',
      link: `/customer/bookings/${booking._id}`,
    });
    emitToUser(booking.customer, 'booking:updated', saved);
    emitToBooking(booking._id, 'booking:updated', saved);

    res.json({ booking: saved });
  })
);

// POST /api/bookings/:id/cancel
router.post(
  '/:id/cancel',
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    const { isCustomer, isMechanic } = assertParticipant(booking, req.user);
    if (['completed', 'cancelled'].includes(booking.status)) throw badRequest('This booking is already closed');

    booking.cancelledBy = isCustomer ? 'customer' : isMechanic ? 'mechanic' : 'admin';
    booking.cancellationReason = req.body.reason;
    pushStatus(booking, 'cancelled', req.body.reason);
    await booking.save();

    const saved = await populateBooking(Booking.findById(booking._id));
    const other = isCustomer ? booking.mechanic : booking.customer;
    if (other) {
      await notify(other, { title: 'Booking cancelled', body: `${booking.reference} was cancelled${req.body.reason ? `: ${req.body.reason}` : ''}`, type: 'booking' });
      emitToUser(other, 'booking:updated', saved);
    }
    emitToBooking(booking._id, 'booking:updated', saved);
    res.json({ booking: saved });
  })
);

// POST /api/bookings/:id/verify-qr - QR code service verification
router.post(
  '/:id/verify-qr',
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('mechanic', 'name').populate('serviceType', 'name');
    if (!booking) throw notFound('Booking not found');
    const valid = booking.qrToken && booking.qrToken === req.body.token;
    res.json({
      valid,
      record: valid
        ? {
            reference: booking.reference,
            service: booking.serviceType?.name,
            mechanic: booking.mechanic?.name,
            vehicle: booking.vehicle,
            completedAt: booking.completedAt,
            total: booking.charges.total,
            partsUsed: booking.partsUsed,
          }
        : null,
    });
  })
);

// GET /api/bookings/:id/messages - chat history
router.get(
  '/:id/messages',
  asyncRoute(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    assertParticipant(booking, req.user);
    const messages = await Message.find({ booking: booking._id }).sort({ createdAt: 1 }).populate('sender', 'name');
    res.json({ messages });
  })
);

// POST /api/bookings/:id/review
router.post(
  '/:id/review',
  requireRole('customer'),
  asyncRoute(async (req, res) => {
    const { rating, comment, tags } = req.body;
    if (!rating || rating < 1 || rating > 5) throw badRequest('Rating must be between 1 and 5');

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw notFound('Booking not found');
    if (String(booking.customer) !== String(req.user._id)) throw forbidden('This is not your booking');
    if (booking.status !== 'completed') throw badRequest('You can rate a service once it is completed');
    if (booking.rated) throw badRequest('You have already rated this service');

    const review = await Review.create({
      booking: booking._id,
      customer: req.user._id,
      mechanic: booking.mechanic,
      rating,
      comment,
      tags,
    });

    // Recompute the mechanic's running average.
    const mechanic = await User.findById(booking.mechanic);
    const count = (mechanic.mechanicProfile.ratingCount || 0) + 1;
    const average = ((mechanic.mechanicProfile.ratingAverage || 0) * (count - 1) + rating) / count;
    mechanic.mechanicProfile.ratingCount = count;
    mechanic.mechanicProfile.ratingAverage = Number(average.toFixed(2));
    await mechanic.save();

    booking.rated = true;
    await booking.save();

    await notify(mechanic._id, { title: `You received ${rating}★`, body: comment || 'Thanks for the great work!', type: 'system' });
    res.status(201).json({ review });
  })
);

export default router;
