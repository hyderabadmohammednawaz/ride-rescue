/**
 * In-app routes for notifications, in one place.
 *
 * These used to be written inline at eleven call sites as `/customer/bookings/<id>`.
 * When the web app moved to a static export those routes became
 * `/customer/bookings/detail?id=<id>`, every stored link broke, and tapping a
 * notification produced a 404 — a class of bug that no typecheck or lint can
 * catch, because a wrong string is still a valid string.
 *
 * Building them here means a future route change is one edit rather than a
 * search-and-hope. Each notification also carries the raw id in `meta`, so a
 * client with different routes — the phone app uses `/customer/booking/<id>`,
 * singular and path-based — can construct its own destination instead of
 * following a path built for the browser.
 */

export const bookingLink = (id) => `/customer/bookings/detail?id=${id}`;
export const jobLink = (id) => `/mechanic/jobs/detail?id=${id}`;

/**
 * There is no per-order page on the web, so an order notification opens the
 * list. Pointing at a detail route that does not exist is how the previous
 * `/customer/orders/<id>` links 404'd.
 */
export const orderLink = () => '/customer/orders';

/**
 * Rewrites links stored before the routes changed.
 *
 * Notifications already in the database keep whatever path was current when
 * they were created, and there are months of them. Normalising on read costs
 * nothing and repairs the history, which a migration would have to be written
 * and run to achieve.
 */
export function normaliseLink(link) {
  if (!link || typeof link !== 'string') return link;

  let m = link.match(/^\/customer\/bookings\/([a-f0-9]{24})$/i);
  if (m) return bookingLink(m[1]);

  m = link.match(/^\/mechanic\/jobs\/([a-f0-9]{24})$/i);
  if (m) return jobLink(m[1]);

  m = link.match(/^\/customer\/orders\/[a-f0-9]{24}$/i);
  if (m) return orderLink();

  return link;
}
