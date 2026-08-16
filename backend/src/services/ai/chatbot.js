import { Booking } from '../../models/Booking.js';
import { Order } from '../../models/Order.js';
import { ServiceType } from '../../models/ServiceType.js';
import { SparePart } from '../../models/SparePart.js';
import { rankMechanics } from './mechanicMatch.js';
import { predictMaintenance } from './predictiveMaintenance.js';

/**
 * Intent-matching assistant. Each intent has trigger keywords; the intent with
 * the highest keyword overlap wins, and its handler answers using live data
 * from the database rather than canned text.
 */
const INTENTS = [
  { name: 'booking_status', keywords: ['status', 'booking', 'where', 'mechanic', 'coming', 'track', 'eta', 'arrive'] },
  { name: 'service_cost', keywords: ['cost', 'price', 'charge', 'rate', 'fee', 'much', 'expensive', 'service'] },
  { name: 'nearby_mechanic', keywords: ['nearby', 'near', 'nearest', 'close', 'around', 'mechanic', 'available'] },
  { name: 'part_availability', keywords: ['part', 'spare', 'stock', 'available', 'buy', 'brake', 'tyre', 'battery', 'oil', 'filter'] },
  { name: 'order_status', keywords: ['order', 'delivery', 'dispatch', 'parcel', 'shipped', 'deliver'] },
  { name: 'maintenance', keywords: ['maintenance', 'servicing', 'due', 'next', 'when', 'change', 'predict', 'reminder'] },
  { name: 'sos_help', keywords: ['sos', 'emergency', 'breakdown', 'stuck', 'stranded', 'help', 'urgent', 'accident'] },
  { name: 'payment', keywords: ['payment', 'pay', 'upi', 'card', 'wallet', 'refund', 'invoice', 'bill'] },
  { name: 'greeting', keywords: ['hi', 'hello', 'hey', 'namaste', 'good', 'morning', 'evening'] },
];

function detectIntent(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let best = { name: 'fallback', hits: 0 };
  for (const intent of INTENTS) {
    const hits = intent.keywords.filter((k) => words.includes(k)).length;
    if (hits > best.hits) best = { name: intent.name, hits };
  }
  return best;
}

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export async function askAssistant(user, rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return { intent: 'fallback', reply: 'Ask me about your booking, service prices, spare parts or maintenance.', suggestions: defaultSuggestions() };
  }

  const { name: intent } = detectIntent(text);

  switch (intent) {
    case 'greeting':
      return {
        intent,
        reply: `Hello ${user.name.split(' ')[0]}! I can check your booking status, quote service prices, find a mechanic near you, or tell you what your bike needs next.`,
        suggestions: defaultSuggestions(),
      };

    case 'booking_status': {
      const booking = await Booking.findOne({
        customer: user._id,
        status: { $in: ['pending', 'accepted', 'arrived', 'in_progress'] },
      })
        .sort({ createdAt: -1 })
        .populate('mechanic', 'name phone mechanicProfile')
        .populate('serviceType', 'name');

      if (!booking) {
        const last = await Booking.findOne({ customer: user._id }).sort({ createdAt: -1 }).populate('serviceType', 'name');
        return {
          intent,
          reply: last
            ? `You have no active booking. Your last one (${last.reference} — ${last.serviceType?.name || 'service'}) was ${last.status}.`
            : 'You have no bookings yet. Tap SOS for an emergency or book a service from the home screen.',
          suggestions: ['How much is a general service?', 'Find a mechanic near me'],
        };
      }

      const parts = [`Booking ${booking.reference} is **${booking.status.replace('_', ' ')}**.`];
      if (booking.mechanic) parts.push(`${booking.mechanic.name} is assigned (${booking.mechanic.phone}).`);
      if (booking.etaMinutes && ['accepted'].includes(booking.status)) {
        parts.push(`ETA is about ${booking.etaMinutes} minutes, ${booking.distanceKm} km away.`);
      }
      if (booking.status === 'pending') parts.push('We are still waiting for a mechanic to accept.');
      if (booking.otpCode && ['accepted', 'arrived'].includes(booking.status)) {
        parts.push(`Share start OTP ${booking.otpCode} when work begins.`);
      }
      return { intent, reply: parts.join(' '), data: { bookingId: booking._id, reference: booking.reference }, suggestions: ['Track on map', 'Chat with mechanic'] };
    }

    case 'service_cost': {
      const services = await ServiceType.find({ active: true }).sort({ basePrice: 1 }).lean();
      const matched = services.filter((s) => text.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]));
      const list = (matched.length ? matched : services).slice(0, 6);
      return {
        intent,
        reply:
          `Here are our current prices:\n` +
          list.map((s) => `${s.icon} ${s.name} — ${rupees(s.basePrice)} (~${s.estimatedMinutes} min)`).join('\n') +
          `\nFinal cost includes any spare parts used.`,
        data: { services: list },
        suggestions: ['Book a general service', 'Find a mechanic near me'],
      };
    }

    case 'nearby_mechanic': {
      const coordinates = user.location?.coordinates;
      if (!coordinates) {
        return { intent, reply: 'I need your location first. Enable location access and ask me again.', suggestions: defaultSuggestions() };
      }
      const { ranked } = await rankMechanics(coordinates, { limit: 3, favouriteIds: user.favouriteMechanics });
      if (ranked.length === 0) {
        return { intent, reply: 'No mechanics are available within 20 km right now. Raise an SOS and our admin team will assign someone manually.', suggestions: ['Raise SOS'] };
      }
      return {
        intent,
        reply:
          `Closest available mechanics:\n` +
          ranked
            .map((r, i) => `${i + 1}. ${r.mechanic.name} — ${r.distanceKm} km, ETA ${r.etaMinutes} min, ${(r.mechanic.mechanicProfile?.ratingAverage || 0).toFixed(1)}★`)
            .join('\n'),
        data: { mechanics: ranked.map((r) => ({ id: r.mechanic._id, name: r.mechanic.name, distanceKm: r.distanceKm, etaMinutes: r.etaMinutes })) },
        suggestions: ['Book instant service', 'How much is a general service?'],
      };
    }

    case 'part_availability': {
      const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
      const regex = new RegExp(words.join('|') || 'oil', 'i');
      const parts = await SparePart.find({ active: true, $or: [{ name: regex }, { category: regex }, { brand: regex }] })
        .limit(5)
        .lean();
      if (parts.length === 0) {
        return { intent, reply: 'I could not find that part. Try searching the store by your bike model.', suggestions: ['Show parts for my bike'] };
      }
      return {
        intent,
        reply:
          parts
            .map((p) => `${p.image || '🔩'} ${p.name} — ${rupees(p.price)} · ${p.stock > 0 ? `${p.stock} in stock` : 'out of stock'}`)
            .join('\n'),
        data: { parts },
        suggestions: ['Show parts for my bike', 'What maintenance is due?'],
      };
    }

    case 'order_status': {
      const order = await Order.findOne({ customer: user._id }).sort({ createdAt: -1 }).lean();
      if (!order) return { intent, reply: 'You have not placed any spare parts orders yet.', suggestions: ['Show parts for my bike'] };
      return {
        intent,
        reply: `Order ${order.reference} (${order.items.length} item(s), ${rupees(order.total)}) is currently **${order.status}**.${order.trackingNote ? ` ${order.trackingNote}` : ''}`,
        data: { orderId: order._id },
        suggestions: ['Show parts for my bike'],
      };
    }

    case 'maintenance': {
      const vehicle = (user.vehicles || []).find((v) => v.isPrimary) || (user.vehicles || [])[0];
      if (!vehicle) return { intent, reply: 'Add your bike details in your profile and I can predict what service it needs.', suggestions: ['How much is a general service?'] };

      const { predictions, healthScore } = predictMaintenance(vehicle);
      const urgent = predictions.filter((p) => p.urgency !== 'ok').slice(0, 3);
      if (urgent.length === 0) {
        return { intent, reply: `Your ${vehicle.make} ${vehicle.model} is in good shape (health ${healthScore}/100). Next up: ${predictions[0].label} in about ${predictions[0].daysRemaining} days.`, suggestions: ['Book a general service'] };
      }
      return {
        intent,
        reply:
          `For your ${vehicle.make} ${vehicle.model} (health ${healthScore}/100):\n` +
          urgent.map((p) => `${p.icon} ${p.label} — ${p.urgency === 'overdue' ? 'overdue' : `due in ~${p.daysRemaining} days`} (${rupees(p.estimatedCost)})`).join('\n'),
        data: { predictions: urgent },
        suggestions: ['Book a general service', 'Show parts for my bike'],
      };
    }

    case 'sos_help':
      return {
        intent,
        reply: 'Tap the red SOS button on your home screen. It shares your live location, picks the nearest available mechanic automatically and shows their ETA. Your emergency contact is alerted too.',
        suggestions: ['Find a mechanic near me', 'What is my booking status?'],
      };

    case 'payment':
      return {
        intent,
        reply: 'You can pay by UPI, card, wallet or cash. Payment is taken after the mechanic marks the job complete, and the invoice PDF appears in your booking history straight away.',
        suggestions: ['What is my booking status?', 'How much is a general service?'],
      };

    default:
      return {
        intent: 'fallback',
        reply: "I did not quite catch that. I can help with booking status, service costs, nearby mechanics, spare parts and maintenance reminders.",
        suggestions: defaultSuggestions(),
      };
  }
}

function defaultSuggestions() {
  return [
    'What is my booking status?',
    'How much is a general service?',
    'Find a mechanic near me',
    'What maintenance is due?',
  ];
}
