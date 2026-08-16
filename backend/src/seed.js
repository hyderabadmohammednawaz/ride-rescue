/**
 * Seeds a complete demo dataset: admin, customers, mechanics spread around
 * Hyderabad, two vendors with a spare-parts catalogue, past bookings with
 * ratings, orders and coupons. Safe to re-run - it wipes the collections first.
 *
 *   npm run seed
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { User } from './models/User.js';
import { ServiceType } from './models/ServiceType.js';
import { SparePart } from './models/SparePart.js';
import { Booking } from './models/Booking.js';
import { Order } from './models/Order.js';
import { Payment } from './models/Payment.js';
import { Review } from './models/Review.js';
import { Coupon } from './models/Coupon.js';
import { Notification } from './models/Notification.js';
import { Message } from './models/Message.js';
import { Complaint } from './models/Complaint.js';
import { Otp } from './models/Otp.js';
import { bookingReference, orderReference, paymentReference, referralCode, numericCode, qrToken } from './utils/ids.js';

const PASSWORD = 'password123';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

// Real Hyderabad localities so the map looks believable in a demo.
const HYDERABAD_AREAS = {
  hitecCity: { coords: [78.3808, 17.4483], name: 'HITEC City, Madhapur' },
  gachibowli: { coords: [78.3489, 17.4401], name: 'Gachibowli' },
  kukatpally: { coords: [78.4089, 17.4948], name: 'Kukatpally' },
  ameerpet: { coords: [78.4483, 17.4374], name: 'Ameerpet' },
  secunderabad: { coords: [78.5012, 17.4399], name: 'Secunderabad' },
  charminar: { coords: [78.4747, 17.3616], name: 'Charminar, Old City' },
  banjaraHills: { coords: [78.4482, 17.4126], name: 'Banjara Hills' },
  lbNagar: { coords: [78.5522, 17.3457], name: 'LB Nagar' },
  kondapur: { coords: [78.3639, 17.4615], name: 'Kondapur' },
  begumpet: { coords: [78.4636, 17.4437], name: 'Begumpet' },
};

/**
 * Nearest-mechanic search only looks within ~20 km, so a demo run from anywhere
 * other than Hyderabad finds nobody. Set SEED_LAT and SEED_LNG to your own
 * position and the whole dataset is rebuilt around you, keeping the same
 * relative geometry:
 *
 *   SEED_LAT=14.4014 SEED_LNG=77.7117 npm run seed
 *
 * Leave them unset for the original Hyderabad localities.
 */
function buildAreas() {
  const lat = Number(process.env.SEED_LAT);
  const lng = Number(process.env.SEED_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return HYDERABAD_AREAS;

  // Recentre every locality on the requested point, preserving each one's
  // offset from the Hyderabad centre so the spread still looks like a city.
  const centre = HYDERABAD_AREAS.hitecCity.coords;
  const shifted = {};
  for (const [key, area] of Object.entries(HYDERABAD_AREAS)) {
    shifted[key] = {
      coords: [
        Number((lng + (area.coords[0] - centre[0])).toFixed(6)),
        Number((lat + (area.coords[1] - centre[1])).toFixed(6)),
      ],
      name: area.name,
    };
  }
  console.log(`[seed] recentred all locations on ${lat}, ${lng} (SEED_LAT/SEED_LNG)`);
  return shifted;
}

const AREAS = buildAreas();

const SERVICES = [
  { name: 'Emergency Breakdown', slug: 'emergency-breakdown', category: 'breakdown', basePrice: 400, estimatedMinutes: 40, icon: '🚨', isEmergency: true, description: 'On-the-spot rescue for a bike that will not start or has broken down mid-ride.' },
  { name: 'Puncture Repair', slug: 'puncture-repair', category: 'breakdown', basePrice: 150, estimatedMinutes: 25, icon: '🛞', isEmergency: true, description: 'Tube patch or tubeless plug at your location.' },
  { name: 'Battery Jumpstart', slug: 'battery-jumpstart', category: 'breakdown', basePrice: 250, estimatedMinutes: 20, icon: '🔋', isEmergency: true, description: 'Jumpstart, battery test and replacement if needed.' },
  { name: 'General Service', slug: 'general-service', category: 'periodic', basePrice: 799, estimatedMinutes: 90, icon: '🔧', description: 'Full periodic service: oil, filters, brakes, chain, tuning and wash.' },
  { name: 'Engine Oil Change', slug: 'engine-oil-change', category: 'periodic', basePrice: 450, estimatedMinutes: 30, icon: '🛢️', description: 'Drain and refill with manufacturer-grade oil, plus filter check.' },
  { name: 'Brake Service', slug: 'brake-service', category: 'repair', basePrice: 550, estimatedMinutes: 45, icon: '🛑', description: 'Brake pad/shoe inspection, replacement and cable adjustment.' },
  { name: 'Chain & Sprocket Service', slug: 'chain-sprocket', category: 'repair', basePrice: 600, estimatedMinutes: 50, icon: '⛓️', description: 'Clean, lubricate, adjust tension or replace the chain set.' },
  { name: 'Bike Wash & Polish', slug: 'bike-wash', category: 'cleaning', basePrice: 299, estimatedMinutes: 40, icon: '🧼', description: 'Foam wash, chain degrease and polish at your doorstep.' },
];

const BIKE_MODELS = [
  'Honda Activa 6G', 'Honda Shine', 'Hero Splendor Plus', 'Hero HF Deluxe',
  'Bajaj Pulsar 150', 'Bajaj Pulsar NS200', 'TVS Jupiter', 'TVS Apache RTR 160',
  'Royal Enfield Classic 350', 'Yamaha FZ-S', 'Suzuki Access 125', 'Ola S1 Pro',
];

const PARTS = [
  { name: 'Engine Oil 10W-30 (1L)', brand: 'Motul', category: 'Lubricants', price: 480, mrp: 560, stock: 45, warrantyMonths: 0, image: '🛢️', models: ['Honda Activa 6G', 'Honda Shine', 'Hero Splendor Plus', 'TVS Jupiter'], rating: 4.6, sold: 132 },
  { name: 'Fully Synthetic Engine Oil 10W-40', brand: 'Castrol', category: 'Lubricants', price: 690, mrp: 799, stock: 30, warrantyMonths: 0, image: '🛢️', models: ['Bajaj Pulsar NS200', 'Yamaha FZ-S', 'Royal Enfield Classic 350', 'TVS Apache RTR 160'], rating: 4.7, sold: 98 },
  { name: 'Oil Filter', brand: 'Bosch', category: 'Filters', price: 210, mrp: 260, stock: 60, warrantyMonths: 3, image: '🧽', models: ['Bajaj Pulsar 150', 'Bajaj Pulsar NS200', 'Yamaha FZ-S'], rating: 4.3, sold: 76 },
  { name: 'Air Filter Element', brand: 'K&N', category: 'Filters', price: 340, mrp: 420, stock: 8, warrantyMonths: 6, image: '💨', models: ['Honda Activa 6G', 'Honda Shine', 'Suzuki Access 125'], rating: 4.4, sold: 54 },
  { name: 'Front Brake Pad Set', brand: 'Brembo', category: 'Brakes', price: 780, mrp: 950, stock: 22, warrantyMonths: 12, image: '🛑', models: ['Bajaj Pulsar NS200', 'TVS Apache RTR 160', 'Yamaha FZ-S'], rating: 4.8, sold: 61 },
  { name: 'Rear Brake Shoe', brand: 'TVS Genuine', category: 'Brakes', price: 420, mrp: 490, stock: 4, warrantyMonths: 6, image: '🛑', models: ['TVS Jupiter', 'TVS Apache RTR 160', 'Hero Splendor Plus'], rating: 4.2, sold: 44 },
  { name: 'Brake Fluid DOT 4 (250ml)', brand: 'Shell', category: 'Brakes', price: 260, mrp: 310, stock: 35, warrantyMonths: 0, image: '🧴', models: ['Royal Enfield Classic 350', 'Bajaj Pulsar NS200'], rating: 4.1, sold: 27 },
  { name: 'Maintenance-Free Battery 12V 5Ah', brand: 'Exide', category: 'Electrical', price: 1850, mrp: 2200, stock: 15, warrantyMonths: 24, image: '🔋', models: ['Honda Activa 6G', 'Hero Splendor Plus', 'TVS Jupiter', 'Suzuki Access 125'], rating: 4.5, sold: 89 },
  { name: 'LED Headlight Bulb H4', brand: 'Philips', category: 'Electrical', price: 640, mrp: 799, stock: 28, warrantyMonths: 12, image: '💡', models: ['Bajaj Pulsar 150', 'Royal Enfield Classic 350', 'Yamaha FZ-S'], rating: 4.6, sold: 71 },
  { name: 'Spark Plug (Iridium)', brand: 'NGK', category: 'Electrical', price: 290, mrp: 350, stock: 55, warrantyMonths: 6, image: '⚡', models: ['Honda Shine', 'Hero HF Deluxe', 'Bajaj Pulsar 150', 'TVS Jupiter'], rating: 4.5, sold: 118 },
  { name: 'Tubeless Tyre 90/90-12', brand: 'MRF', category: 'Tyres', price: 1650, mrp: 1950, stock: 18, warrantyMonths: 24, image: '🛞', models: ['Honda Activa 6G', 'TVS Jupiter', 'Suzuki Access 125'], rating: 4.4, sold: 52 },
  { name: 'Tubeless Tyre 110/70-17', brand: 'CEAT', category: 'Tyres', price: 2400, mrp: 2800, stock: 12, warrantyMonths: 24, image: '🛞', models: ['Bajaj Pulsar NS200', 'TVS Apache RTR 160', 'Yamaha FZ-S'], rating: 4.3, sold: 33 },
  { name: 'Tyre Puncture Repair Kit', brand: 'Michelin', category: 'Accessories', price: 550, mrp: 650, stock: 40, warrantyMonths: 0, image: '🧰', models: BIKE_MODELS, rating: 4.2, sold: 64 },
  { name: 'Chain & Sprocket Kit', brand: 'Rolon', category: 'Engine', price: 2100, mrp: 2500, stock: 10, warrantyMonths: 12, image: '⛓️', models: ['Bajaj Pulsar 150', 'Hero Splendor Plus', 'Honda Shine'], rating: 4.5, sold: 38 },
  { name: 'Chain Lubricant Spray', brand: 'WD-40', category: 'Lubricants', price: 380, mrp: 450, stock: 50, warrantyMonths: 0, image: '🧴', models: BIKE_MODELS, rating: 4.7, sold: 145 },
  { name: 'Clutch Cable', brand: 'Endurance', category: 'Engine', price: 240, mrp: 290, stock: 3, warrantyMonths: 6, image: '🔗', models: ['Bajaj Pulsar 150', 'Yamaha FZ-S', 'Honda Shine'], rating: 4.0, sold: 29 },
  { name: 'Side Mirror Pair', brand: 'Vega', category: 'Body', price: 520, mrp: 640, stock: 26, warrantyMonths: 3, image: '🪞', models: BIKE_MODELS, rating: 4.1, sold: 47 },
  { name: 'Mobile Holder with USB Charger', brand: 'Amkette', category: 'Accessories', price: 890, mrp: 1099, stock: 32, warrantyMonths: 6, image: '📱', models: BIKE_MODELS, rating: 4.4, sold: 83 },
  { name: 'Bike Body Cover (Waterproof)', brand: 'Autofy', category: 'Accessories', price: 640, mrp: 799, stock: 24, warrantyMonths: 3, image: '🧥', models: BIKE_MODELS, rating: 4.2, sold: 57 },
  { name: 'Horn Set (Windtone)', brand: 'Roots', category: 'Electrical', price: 780, mrp: 950, stock: 19, warrantyMonths: 12, image: '📢', models: ['Royal Enfield Classic 350', 'Bajaj Pulsar NS200'], rating: 4.6, sold: 41 },
];

/**
 * Shifts a point by `km` along `bearingDeg`. Seeded users are spread out around
 * their locality instead of sharing one coordinate, so distances, ETAs and the
 * live-tracking animation all have something real to show.
 */
function offset([lng, lat], km, bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (km * Math.cos(rad)) / 111.32;
  const dLng = (km * Math.sin(rad)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))];
}

async function makeUser({ name, email, phone, role, area, spread, extra = {} }) {
  const coords = spread ? offset(AREAS[area].coords, spread.km, spread.bearing) : AREAS[area].coords;
  const user = new User({
    name,
    email,
    phone,
    role,
    referralCode: referralCode(name),
    isVerified: true,
    location: { type: 'Point', coordinates: coords, address: AREAS[area].name, updatedAt: new Date() },
    ...extra,
  });
  await user.setPassword(PASSWORD);
  await user.save();
  return user;
}

async function seed() {
  await connectDatabase();
  console.log('[seed] clearing existing data...');
  await Promise.all(
    [User, ServiceType, SparePart, Booking, Order, Payment, Review, Coupon, Notification, Message, Complaint, Otp].map((M) =>
      M.deleteMany({})
    )
  );

  console.log('[seed] service catalogue...');
  const services = await ServiceType.insertMany(SERVICES);
  const serviceBySlug = Object.fromEntries(services.map((s) => [s.slug, s]));

  console.log('[seed] users...');
  const admin = await makeUser({ name: 'Admin', email: 'admin@riderescue.in', phone: '9000000001', role: 'admin', area: 'hitecCity' });

  const customers = await Promise.all([
    makeUser({
      name: 'Nawaz Shaik',
      email: 'customer@riderescue.in',
      phone: '9000000010',
      role: 'customer',
      area: 'kondapur',
      extra: {
        walletBalance: 500,
        emergencyContact: { name: 'Rehan Shaik', phone: '9000000099' },
        vehicles: [
          { make: 'Honda', model: 'Activa 6G', year: 2022, registrationNumber: 'TS09EA1234', odometerKm: 14200, lastServiceDate: daysAgo(210), lastServiceOdometerKm: 10400, isPrimary: true },
          { make: 'Bajaj', model: 'Pulsar NS200', year: 2023, registrationNumber: 'TS09FB5678', odometerKm: 8300, lastServiceDate: daysAgo(65), lastServiceOdometerKm: 6100 },
        ],
      },
    }),
    makeUser({
      name: 'Priya Reddy',
      email: 'priya@riderescue.in',
      phone: '9000000011',
      role: 'customer',
      area: 'gachibowli',
      extra: {
        vehicles: [{ make: 'TVS', model: 'Jupiter', year: 2021, registrationNumber: 'TS07GH9012', odometerKm: 22800, lastServiceDate: daysAgo(120), lastServiceOdometerKm: 19500, isPrimary: true }],
      },
    }),
    makeUser({
      name: 'Arjun Kumar',
      email: 'arjun@riderescue.in',
      phone: '9000000012',
      role: 'customer',
      area: 'ameerpet',
      extra: {
        vehicles: [{ make: 'Royal Enfield', model: 'Classic 350', year: 2020, registrationNumber: 'TS08JK3456', odometerKm: 31500, lastServiceDate: daysAgo(45), lastServiceOdometerKm: 29800, isPrimary: true }],
      },
    }),
  ]);

  // Each mechanic is placed a few km from their locality centre on a distinct
  // bearing, so the nearest one is a realistic ride away rather than on top of
  // the customer.
  const mechanicSpecs = [
    { name: 'Ravi Kumar', email: 'mechanic@riderescue.in', phone: '9000000020', area: 'kondapur', spread: { km: 3.2, bearing: 20 }, years: 8, rating: 4.8, count: 64, jobs: 210, spec: ['Honda', 'Hero', 'Engine repair'] },
    { name: 'Imran Ali', email: 'imran@riderescue.in', phone: '9000000021', area: 'hitecCity', spread: { km: 2.4, bearing: 140 }, years: 5, rating: 4.6, count: 41, jobs: 130, spec: ['Bajaj', 'Yamaha', 'Electrical'] },
    { name: 'Suresh Babu', email: 'suresh@riderescue.in', phone: '9000000022', area: 'ameerpet', spread: { km: 1.8, bearing: 250 }, years: 12, rating: 4.9, count: 96, jobs: 380, spec: ['Royal Enfield', 'Engine overhaul'] },
    { name: 'Venkat Rao', email: 'venkat@riderescue.in', phone: '9000000023', area: 'kukatpally', spread: { km: 2.6, bearing: 310 }, years: 3, rating: 4.2, count: 18, jobs: 55, spec: ['TVS', 'Suzuki', 'Puncture'] },
    { name: 'Mahesh Yadav', email: 'mahesh@riderescue.in', phone: '9000000024', area: 'secunderabad', spread: { km: 3.0, bearing: 75 }, years: 6, rating: 4.5, count: 33, jobs: 105, spec: ['Electric bikes', 'Ola', 'Battery'] },
    { name: 'Farhan Khan', email: 'farhan@riderescue.in', phone: '9000000025', area: 'banjaraHills', spread: { km: 2.1, bearing: 190 }, years: 4, rating: 4.4, count: 27, jobs: 88, spec: ['Honda', 'Brakes'] },
    { name: 'Kiran Reddy', email: 'kiran@riderescue.in', phone: '9000000026', area: 'gachibowli', spread: { km: 4.0, bearing: 45 }, years: 7, rating: 4.7, count: 52, jobs: 175, spec: ['Bajaj', 'Chain & sprocket'] },
    { name: 'Anil Sharma', email: 'anil@riderescue.in', phone: '9000000027', area: 'lbNagar', spread: { km: 2.9, bearing: 300 }, years: 10, rating: 4.3, count: 39, jobs: 145, spec: ['Hero', 'Tyres'] },
  ];

  const mechanics = await Promise.all(
    mechanicSpecs.map((m) =>
      makeUser({
        name: m.name,
        email: m.email,
        phone: m.phone,
        role: 'mechanic',
        area: m.area,
        spread: m.spread,
        extra: {
          mechanicProfile: {
            experienceYears: m.years,
            specialisations: m.spec,
            idProofNumber: `AADH${numericCode(8)}`,
            drivingLicenceNumber: `TS${numericCode(10)}`,
            documentsVerified: true,
            isAvailable: true,
            ratingAverage: m.rating,
            ratingCount: m.count,
            completedJobs: m.jobs,
            serviceRadiusKm: 15,
            hourlyRate: 200 + m.years * 20,
          },
        },
      })
    )
  );

  const vendors = await Promise.all([
    makeUser({
      name: 'Sai Auto Spares',
      email: 'vendor@riderescue.in',
      phone: '9000000030',
      role: 'vendor',
      area: 'ameerpet',
      extra: { vendorProfile: { shopName: 'Sai Auto Spares', gstNumber: '36ABCDE1234F1Z5', address: 'Shop 12, Ameerpet, Hyderabad', ratingAverage: 4.5, ratingCount: 88 } },
    }),
    makeUser({
      name: 'Bike World Parts',
      email: 'bikeworld@riderescue.in',
      phone: '9000000031',
      role: 'vendor',
      area: 'kukatpally',
      extra: { vendorProfile: { shopName: 'Bike World Parts', gstNumber: '36XYZAB5678K1Z2', address: 'KPHB Phase 3, Kukatpally, Hyderabad', ratingAverage: 4.2, ratingCount: 41 } },
    }),
  ]);

  console.log('[seed] spare parts catalogue...');
  const parts = await SparePart.insertMany(
    PARTS.map((p, i) => ({
      name: p.name,
      brand: p.brand,
      sku: `RR-${p.category.slice(0, 3).toUpperCase()}-${String(i + 101).padStart(4, '0')}`,
      category: p.category,
      description: `${p.brand} ${p.name} — genuine part with fitment support from RideRescue mechanics.`,
      price: p.price,
      mrp: p.mrp,
      stock: p.stock,
      lowStockThreshold: 5,
      compatibleModels: p.models,
      vendor: vendors[i % 2]._id,
      warrantyMonths: p.warrantyMonths,
      image: p.image,
      ratingAverage: p.rating,
      ratingCount: Math.round(p.sold * 0.3),
      unitsSold: p.sold,
    }))
  );

  console.log('[seed] coupons...');
  await Coupon.insertMany([
    { code: 'FIRST100', description: '₹100 off your first service', discountType: 'flat', value: 100, minOrderValue: 300, appliesTo: 'both', validTill: daysAgo(-90), usageLimit: 500 },
    { code: 'SAVE15', description: '15% off spare parts, up to ₹300', discountType: 'percent', value: 15, maxDiscount: 300, minOrderValue: 500, appliesTo: 'order', validTill: daysAgo(-60), usageLimit: 300 },
    { code: 'MONSOON20', description: '20% off brake and tyre services', discountType: 'percent', value: 20, maxDiscount: 400, minOrderValue: 400, appliesTo: 'booking', validTill: daysAgo(-30), usageLimit: 200 },
  ]);

  console.log('[seed] booking history...');
  const historySpecs = [
    { customer: 0, mechanic: 0, service: 'general-service', days: 25, rating: 5, comment: 'Very professional, came within 20 minutes and explained everything.', tags: ['On time', 'Fair price'] },
    { customer: 0, mechanic: 2, service: 'brake-service', days: 60, rating: 4, comment: 'Good work on the brakes, slight delay in arriving.', tags: ['Skilled'] },
    { customer: 1, mechanic: 1, service: 'puncture-repair', days: 12, rating: 5, comment: 'Saved me on the ORR at night. Excellent.', tags: ['Quick', 'Polite'] },
    { customer: 2, mechanic: 2, service: 'engine-oil-change', days: 40, rating: 5, comment: 'Genuine oil, showed me the sealed pack.', tags: ['Genuine parts'] },
    { customer: 1, mechanic: 6, service: 'chain-sprocket', days: 8, rating: 4, comment: 'Chain noise gone completely.', tags: ['Skilled'] },
    { customer: 0, mechanic: 0, service: 'bike-wash', days: 5, rating: 5, comment: 'Bike looks brand new.', tags: ['Polite'] },
  ];

  for (const h of historySpecs) {
    const customer = customers[h.customer];
    const mechanic = mechanics[h.mechanic];
    const service = serviceBySlug[h.service];
    const vehicle = customer.vehicles[0];
    const usedParts =
      h.service === 'engine-oil-change'
        ? [{ part: parts[0]._id, name: parts[0].name, quantity: 1, price: parts[0].price }]
        : h.service === 'brake-service'
          ? [{ part: parts[4]._id, name: parts[4].name, quantity: 1, price: parts[4].price }]
          : [];
    const partsTotal = usedParts.reduce((s, p) => s + p.price * p.quantity, 0);
    const total = service.basePrice + partsTotal;

    const booking = await Booking.create({
      reference: bookingReference(),
      customer: customer._id,
      mechanic: mechanic._id,
      serviceType: service._id,
      kind: service.isEmergency ? 'sos' : 'instant',
      status: 'completed',
      vehicle: { make: vehicle.make, model: vehicle.model, registrationNumber: vehicle.registrationNumber },
      pickupLocation: { type: 'Point', coordinates: customer.location.coordinates, address: customer.location.address },
      description: 'Seeded service record',
      charges: { labour: service.basePrice, parts: partsTotal, visitFee: 0, discount: 0, total },
      partsUsed: usedParts,
      paymentStatus: 'paid',
      otpCode: numericCode(4),
      qrToken: qrToken(),
      rated: true,
      completedAt: daysAgo(h.days),
      createdAt: daysAgo(h.days),
      statusHistory: [
        { status: 'pending', at: daysAgo(h.days) },
        { status: 'accepted', at: daysAgo(h.days) },
        { status: 'arrived', at: daysAgo(h.days) },
        { status: 'in_progress', at: daysAgo(h.days) },
        { status: 'completed', at: daysAgo(h.days) },
      ],
    });

    const payment = await Payment.create({
      reference: paymentReference(),
      customer: customer._id,
      amount: total,
      method: ['upi', 'card', 'cash'][h.days % 3],
      status: 'success',
      purpose: 'booking',
      booking: booking._id,
      gatewayPaymentId: `mock_seed_${booking.reference}`,
      paidAt: daysAgo(h.days),
      createdAt: daysAgo(h.days),
    });
    booking.payment = payment._id;
    await booking.save();

    await Review.create({
      booking: booking._id,
      customer: customer._id,
      mechanic: mechanic._id,
      rating: h.rating,
      comment: h.comment,
      tags: h.tags,
      createdAt: daysAgo(h.days),
    });
  }

  console.log('[seed] spare parts orders...');
  const orderSpecs = [
    { customer: 0, items: [[0, 2], [9, 1]], days: 18, status: 'delivered' },
    { customer: 1, items: [[7, 1]], days: 6, status: 'dispatched' },
    { customer: 2, items: [[4, 1], [14, 1]], days: 2, status: 'placed' },
  ];

  for (const spec of orderSpecs) {
    const customer = customers[spec.customer];
    const items = spec.items.map(([index, qty]) => {
      const part = parts[index];
      return { part: part._id, vendor: part.vendor, name: part.name, sku: part.sku, price: part.price, quantity: qty, warrantyMonths: part.warrantyMonths };
    });
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryFee = subtotal >= 999 ? 0 : 40;

    const order = await Order.create({
      reference: orderReference(),
      customer: customer._id,
      items,
      vendors: [...new Set(items.map((i) => String(i.vendor)))].map((id) => new mongoose.Types.ObjectId(id)),
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      deliveryAddress: `${customer.location.address}, Hyderabad, Telangana`,
      status: spec.status,
      paymentStatus: spec.status === 'placed' ? 'unpaid' : 'paid',
      deliveredAt: spec.status === 'delivered' ? daysAgo(spec.days - 2) : undefined,
      createdAt: daysAgo(spec.days),
      statusHistory: [{ status: 'placed', at: daysAgo(spec.days) }],
    });

    if (spec.status !== 'placed') {
      await Payment.create({
        reference: paymentReference(),
        customer: customer._id,
        amount: order.total,
        method: 'upi',
        status: 'success',
        purpose: 'order',
        order: order._id,
        gatewayPaymentId: `mock_seed_${order.reference}`,
        paidAt: daysAgo(spec.days),
        createdAt: daysAgo(spec.days),
      });
    }
  }

  console.log('[seed] an open complaint for the admin panel...');
  await Complaint.create({
    raisedBy: customers[1]._id,
    against: mechanics[3]._id,
    subject: 'Mechanic arrived much later than the ETA',
    details: 'The app showed 15 minutes but it took nearly an hour on 12 July.',
    status: 'open',
  });

  console.log('\n✅ Seed complete. Demo logins (password for all: password123)\n');
  console.table([
    { Role: 'Admin', Email: admin.email },
    { Role: 'Customer', Email: customers[0].email },
    { Role: 'Customer', Email: customers[1].email },
    { Role: 'Mechanic', Email: mechanics[0].email },
    { Role: 'Mechanic', Email: mechanics[1].email },
    { Role: 'Vendor', Email: vendors[0].email },
    { Role: 'Vendor', Email: vendors[1].email },
  ]);

  await disconnectDatabase();
}

seed().catch(async (err) => {
  console.error('[seed] failed:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
