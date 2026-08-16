/**
 * End-to-end regression over the whole API, run against a freshly seeded database.
 * Exits non-zero on the first failure so the result is unambiguous.
 */
const BASE = 'http://localhost:5000/api';
let pass = 0;
const failures = [];

const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const login = async (email) => {
  const { json } = await call('/auth/login', { method: 'POST', body: { email, password: 'password123' } });
  return json.token;
};

console.log('\n== auth ==');
const health = await call('/health');
check('health endpoint', health.json.status === 'ok');

const customer = await login('customer@riderescue.in');
const mechanic = await login('mechanic@riderescue.in');
const vendor = await login('vendor@riderescue.in');
const admin = await login('admin@riderescue.in');
check('customer login', !!customer);
check('mechanic login', !!mechanic);
check('vendor login', !!vendor);
check('admin login', !!admin);

const badPw = await call('/auth/login', { method: 'POST', body: { email: 'customer@riderescue.in', password: 'wrong' } });
check('wrong password rejected', badPw.status === 400);

console.log('\n== role-based access control ==');
const rbac1 = await call('/admin/dashboard', { token: customer });
check('customer blocked from admin dashboard', rbac1.status === 403, `got ${rbac1.status}`);
const rbac2 = await call('/vendor/sales', { token: customer });
check('customer blocked from vendor sales', rbac2.status === 403, `got ${rbac2.status}`);
const rbac3 = await call('/mechanic/dashboard', { token: vendor });
check('vendor blocked from mechanic dashboard', rbac3.status === 403, `got ${rbac3.status}`);
const noAuth = await call('/bookings');
check('unauthenticated request rejected', noAuth.status === 401);

console.log('\n== AI: mechanic ranking ==');
const nearby = await call('/services/mechanics/nearby?emergency=true&limit=5', { token: customer });
const ranked = nearby.json.mechanics || [];
check('nearby mechanics returned', ranked.length > 0, `got ${ranked.length}`);
check('ranked best-first', ranked.every((m, i) => i === 0 || ranked[i - 1].matchScore >= m.matchScore));
check('every match has reasons', ranked.every((m) => m.reasons?.length > 0));
check('distances are non-zero (seed spread)', ranked.every((m) => m.distanceKm > 0), JSON.stringify(ranked.map((m) => m.distanceKm)));

console.log('\n== AI: predictive maintenance ==');
const me = await call('/auth/me', { token: customer });
const vehicleId = me.json.user.vehicles[0]._id;
const maint = await call(`/profile/vehicles/${vehicleId}/maintenance`, { token: customer });
check('health score in range', maint.json.healthScore >= 0 && maint.json.healthScore <= 100, String(maint.json.healthScore));
check('8 components predicted', maint.json.predictions?.length === 8, String(maint.json.predictions?.length));
check('sorted by urgency', maint.json.predictions.every((p, i) => i === 0 || maint.json.predictions[i - 1].daysRemaining <= p.daysRemaining));

console.log('\n== AI: parts recommendation ==');
const rec = await call('/parts/recommended?limit=5', { token: customer });
check('recommendations returned', rec.json.recommendations?.length > 0);
check('each has an explanation', rec.json.recommendations.every((r) => r.reasons?.length > 0));

console.log('\n== AI: chatbot ==');
for (const [q, expected] of [
  ['what is my booking status', 'booking_status'],
  ['how much does a general service cost', 'service_cost'],
  ['find a mechanic near me', 'nearby_mechanic'],
  ['what maintenance is due', 'maintenance'],
  ['do you have brake pads in stock', 'part_availability'],
]) {
  const bot = await call('/assistant/ask', { method: 'POST', token: customer, body: { message: q } });
  check(`chatbot intent "${q}"`, bot.json.intent === expected, `got ${bot.json.intent}`);
}

console.log('\n== booking lifecycle ==');
const created = await call('/bookings', {
  method: 'POST',
  token: customer,
  body: { kind: 'sos', description: 'Regression test SOS' },
});
const booking = created.json.booking;
check('SOS booking created', created.status === 201);
check('auto-assigned a mechanic', !!booking?.mechanic, JSON.stringify(booking?.status));
check('recommendation explained', booking?.recommendation?.reasons?.length > 0);
check('ETA computed', booking?.etaMinutes > 0, String(booking?.etaMinutes));
check('start OTP issued', /^\d{4}$/.test(booking?.otpCode || ''));

const id = booking._id;

// A different customer must not be able to read this booking.
const priya = await login('priya@riderescue.in');
const stranger = await call(`/bookings/${id}`, { token: priya });
check('other customer cannot read booking', stranger.status === 403, `got ${stranger.status}`);

const early = await call(`/bookings/${id}/status`, { method: 'PATCH', token: mechanic, body: { status: 'completed' } });
check('cannot skip to completed', early.status === 400, `got ${early.status}`);

await call(`/bookings/${id}/status`, { method: 'PATCH', token: mechanic, body: { status: 'arrived' } });

const wrongOtp = await call(`/bookings/${id}/status`, { method: 'PATCH', token: mechanic, body: { status: 'in_progress', otpCode: '0000' } });
check('wrong start OTP rejected', wrongOtp.status === 400, `got ${wrongOtp.status}`);

const rightOtp = await call(`/bookings/${id}/status`, { method: 'PATCH', token: mechanic, body: { status: 'in_progress', otpCode: booking.otpCode } });
check('correct start OTP accepted', rightOtp.status === 200);

const parts = await call('/parts?limit=1');
const part = parts.json.parts[0];
const done = await call(`/bookings/${id}/status`, {
  method: 'PATCH',
  token: mechanic,
  body: { status: 'completed', labourCharge: 400, partsUsed: [{ part: part._id, name: part.name, quantity: 2, price: part.price }] },
});
const expectedTotal = 400 + 100 + part.price * 2;
check('completed with correct total', done.json.booking?.charges?.total === expectedTotal, `${done.json.booking?.charges?.total} vs ${expectedTotal}`);

console.log('\n== payment ==');
const early2 = await call('/payments/create', { method: 'POST', token: priya, body: { purpose: 'booking', bookingId: id, method: 'upi' } });
check('other customer cannot pay for booking', early2.status === 403, `got ${early2.status}`);

const created2 = await call('/payments/create', { method: 'POST', token: customer, body: { purpose: 'booking', bookingId: id, method: 'upi' } });
check('payment created', created2.status === 201);
const confirmed = await call(`/payments/${created2.json.payment._id}/confirm`, { method: 'POST', token: customer, body: {} });
check('payment confirmed', confirmed.json.payment?.status === 'success');

const dbl = await call('/payments/create', { method: 'POST', token: customer, body: { purpose: 'booking', bookingId: id, method: 'upi' } });
check('double payment rejected', dbl.status === 400, `got ${dbl.status}`);

console.log('\n== rating & invoice ==');
const review = await call(`/bookings/${id}/review`, { method: 'POST', token: customer, body: { rating: 5, comment: 'Regression test' } });
check('review accepted', review.status === 201);
const dupe = await call(`/bookings/${id}/review`, { method: 'POST', token: customer, body: { rating: 4 } });
check('duplicate review rejected', dupe.status === 400, `got ${dupe.status}`);

const invoice = await call(`/payments/invoice/${id}`, { token: customer });
check('invoice generated', invoice.json.invoice?.total === expectedTotal);
check('invoice marked paid', invoice.json.invoice?.paymentStatus === 'paid');

const qrOk = await call(`/bookings/${id}/verify-qr`, { method: 'POST', token: customer, body: { token: invoice.json.invoice.qrToken } });
check('QR verification succeeds with real token', qrOk.json.valid === true);
const qrBad = await call(`/bookings/${id}/verify-qr`, { method: 'POST', token: customer, body: { token: 'forged' } });
check('QR verification fails with forged token', qrBad.json.valid === false);

console.log('\n== store, cart, orders ==');
const quote = await call('/orders/quote', {
  method: 'POST',
  token: customer,
  body: { items: [{ partId: part._id, quantity: 2 }], couponCode: 'SAVE15' },
});
check('coupon discount applied', quote.json.discount > 0, String(quote.json.discount));
check('quote total is consistent', quote.json.total === quote.json.subtotal - quote.json.discount + quote.json.deliveryFee);

const badCoupon = await call('/orders/quote', { method: 'POST', token: customer, body: { items: [{ partId: part._id, quantity: 1 }], couponCode: 'NOTREAL' } });
check('invalid coupon rejected', badCoupon.status === 400, `got ${badCoupon.status}`);

const stockBefore = (await call(`/parts/${part._id}`)).json.part.stock;
const order = await call('/orders', {
  method: 'POST',
  token: customer,
  body: { items: [{ partId: part._id, quantity: 2 }], deliveryAddress: 'Regression test address' },
});
check('order placed', order.status === 201);
const stockAfter = (await call(`/parts/${part._id}`)).json.part.stock;
check('stock decremented', stockAfter === stockBefore - 2, `${stockBefore} -> ${stockAfter}`);

const orderId = order.json.order._id;
const vendorAdvance = await call(`/orders/${orderId}/status`, { method: 'PATCH', token: vendor, body: { status: 'accepted' } });
check('vendor accepts order', vendorAdvance.status === 200, JSON.stringify(vendorAdvance.json.message));

console.log('\n== vendor & admin dashboards ==');
const sales = await call('/vendor/sales', { token: vendor });
check('vendor sales has revenue', sales.json.revenue > 0, String(sales.json.revenue));
check('vendor best sellers present', sales.json.bestSellers?.length > 0);

const inventory = await call('/vendor/inventory', { token: vendor });
check('inventory summary present', inventory.json.summary?.skuCount > 0);

const dash = await call('/admin/dashboard', { token: admin });
check('admin user counts', dash.json.users?.total > 0);
check('admin revenue total', dash.json.revenue?.total > 0);
check('admin sees active mechanics', dash.json.users?.activeMechanics > 0);

const reports = await call('/admin/reports', { token: admin });
check('reports by service', reports.json.byService?.length > 0);
check('reports by mechanic', reports.json.byMechanic?.length > 0);

const candidates = await call(`/admin/bookings/${id}/candidates`, { token: admin });
check('admin AI candidate ranking', candidates.json.candidates?.length > 0);

console.log('\n' + '='.repeat(60));
console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('All checks passed.');
