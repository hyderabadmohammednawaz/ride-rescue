import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { verifyToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Booking } from '../models/Booking.js';
import { Message } from '../models/Message.js';
import { distanceKm, etaMinutes } from '../utils/geo.js';

let io = null;

/** Every user joins a private room so we can push to them by id. */
const userRoom = (userId) => `user:${userId}`;
/** Both parties of a booking join this room for chat and tracking. */
const bookingRoom = (bookingId) => `booking:${bookingId}`;
/** All available mechanics listen here for new SOS broadcasts. */
const MECHANIC_POOL = 'mechanics:pool';

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyToken(token);
      const user = await User.findById(payload.sub).select('name role isBlocked');
      if (!user || user.isBlocked) return next(new Error('Account unavailable'));
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      socket.data.name = user.name;
      return next();
    } catch {
      return next(new Error('Invalid session'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data;
    socket.join(userRoom(userId));
    if (role === 'mechanic') socket.join(MECHANIC_POOL);

    socket.emit('connected', { userId, role });

    // Join a booking's room after verifying the user is part of that booking.
    socket.on('booking:join', async (bookingId, ack) => {
      const booking = await Booking.findById(bookingId).select('customer mechanic');
      if (!booking) return ack?.({ ok: false, message: 'Booking not found' });
      const allowed =
        String(booking.customer) === userId ||
        String(booking.mechanic || '') === userId ||
        role === 'admin';
      if (!allowed) return ack?.({ ok: false, message: 'Not your booking' });
      socket.join(bookingRoom(bookingId));
      return ack?.({ ok: true });
    });

    socket.on('booking:leave', (bookingId) => socket.leave(bookingRoom(bookingId)));

    // Mechanic pushes GPS updates while heading to the customer.
    socket.on('location:update', async ({ bookingId, coordinates }, ack) => {
      if (role !== 'mechanic' || !Array.isArray(coordinates) || coordinates.length !== 2) {
        return ack?.({ ok: false });
      }
      await User.findByIdAndUpdate(userId, {
        'location.coordinates': coordinates,
        'location.updatedAt': new Date(),
      });

      if (!bookingId) return ack?.({ ok: true });

      const booking = await Booking.findById(bookingId);
      if (!booking || String(booking.mechanic || '') !== userId) return ack?.({ ok: false });

      const km = distanceKm(coordinates, booking.pickupLocation.coordinates);
      const eta = etaMinutes(km);
      booking.mechanicLocation = { type: 'Point', coordinates, updatedAt: new Date() };
      booking.distanceKm = Number(km.toFixed(2));
      booking.etaMinutes = eta;
      await booking.save();

      io.to(bookingRoom(bookingId)).emit('booking:location', {
        bookingId,
        coordinates,
        distanceKm: booking.distanceKm,
        etaMinutes: eta,
      });
      return ack?.({ ok: true, etaMinutes: eta });
    });

    // Live chat between customer and mechanic.
    socket.on('chat:send', async ({ bookingId, text }, ack) => {
      if (!text?.trim()) return ack?.({ ok: false, message: 'Message is empty' });
      const booking = await Booking.findById(bookingId).select('customer mechanic');
      if (!booking) return ack?.({ ok: false, message: 'Booking not found' });

      const isCustomer = String(booking.customer) === userId;
      const isMechanic = String(booking.mechanic || '') === userId;
      if (!isCustomer && !isMechanic) return ack?.({ ok: false, message: 'Not your booking' });

      const message = await Message.create({
        booking: bookingId,
        sender: userId,
        senderRole: isCustomer ? 'customer' : 'mechanic',
        text: text.trim().slice(0, 1000),
      });

      const payload = {
        _id: message._id,
        booking: bookingId,
        sender: userId,
        senderName: socket.data.name,
        senderRole: message.senderRole,
        text: message.text,
        createdAt: message.createdAt,
      };
      io.to(bookingRoom(bookingId)).emit('chat:message', payload);

      const otherParty = isCustomer ? booking.mechanic : booking.customer;
      if (otherParty) io.to(userRoom(String(otherParty))).emit('chat:unread', payload);
      return ack?.({ ok: true, message: payload });
    });

    socket.on('typing', ({ bookingId, isTyping }) => {
      socket.to(bookingRoom(bookingId)).emit('typing', { userId, isTyping });
    });
  });

  return io;
}

export function getIO() {
  return io;
}

/** Push an event to one user across all their devices. */
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(String(userId))).emit(event, payload);
}

/** Push to everyone watching a booking (customer, mechanic, admin). */
export function emitToBooking(bookingId, event, payload) {
  io?.to(bookingRoom(String(bookingId))).emit(event, payload);
}

/** Broadcast a new job to all connected mechanics. */
export function emitToMechanics(event, payload) {
  io?.to(MECHANIC_POOL).emit(event, payload);
}
