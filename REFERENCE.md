# Technical reference

Everything the project is built from, and everything it exposes. This is the
appendix you quote from in a report — [NOTES.md](NOTES.md) explains the ideas,
[VIVA.md](VIVA.md) prepares you to defend them, and this lists the facts.

Counts as of this writing: **13 API route groups**, **76 endpoints**, **30 web
pages**, **16 mobile screens**, **12 database collections**, **10 socket events**.

---

## 1. The three applications

| | Backend | Web app | Mobile app |
|---|---|---|---|
| **Language** | JavaScript (ES modules) | TypeScript | TypeScript |
| **Runtime / framework** | Node.js + Express 4 | Next.js 15 (App Router) | React Native 0.76 + Expo 52 |
| **UI library** | — | React 19 | React 18.3 |
| **Hosted on** | Render (free tier) | GitHub Pages (static export) | Installed APK |
| **Used by** | everything | all four roles | customer + mechanic |

The backend is the only component that talks to the database. Both frontends
reach it over HTTPS and a WebSocket.

---

## 2. Libraries, and what each is for

### Backend

| Package | Version | Why it is here |
|---|---|---|
| `express` | ^4.19.2 | HTTP server and routing |
| `mongoose` | ^8.9.0 | Models and queries for MongoDB |
| `socket.io` | ^4.8.1 | Live tracking, chat, notifications |
| `jsonwebtoken` | ^9.0.2 | Issues and verifies login tokens |
| `bcryptjs` | ^2.4.3 | One-way password hashing, 10 salt rounds |
| `firebase-admin` | ^14.2.0 | Verifies the signature on phone-OTP tokens |
| `razorpay` | ^2.9.8 | Creates payment orders |
| `cors` | ^2.8.5 | Restricts which websites may call the API |
| `dotenv` | ^16.4.5 | Reads configuration from `.env` |
| `mongodb-memory-server` | ^10.1.2 | Runs a local MongoDB so the project works with nothing installed |

### Web

| Package | Version | Why it is here |
|---|---|---|
| `next` | ^15.1.6 | Framework, routing, static export |
| `react` / `react-dom` | ^19.0.0 | UI |
| `socket.io-client` | ^4.8.1 | The live connection |
| `firebase` | ^12.17.1 | Phone-OTP sign-in in the browser |
| `leaflet` + `react-leaflet` | ^1.9.4 / ^5.0.0 | Map fallback when no Google Maps key is set |
| `qrcode` | ^1.5.4 | Draws the invoice verification QR code |
| `tailwindcss` | ^3.4.17 | Styling |

Google Maps is loaded from Google's CDN at runtime rather than installed as a
package, which is why it does not appear here.

### Mobile

| Package | Version | Why it is here |
|---|---|---|
| `expo` | ~52.0.46 | Build tooling and native modules |
| `react-native` | 0.76.9 | The app itself |
| `expo-router` | ~4.0.21 | File-based navigation, including the mechanic's tab bar |
| `expo-location` | ~18.0.10 | GPS |
| `react-native-webview` | 13.12.5 | Hosts both the map and the Razorpay checkout |
| `@react-native-firebase/app` + `/auth` | ^26.2.0 | Phone-OTP sign-in |
| `@react-native-async-storage/async-storage` | 2.1.2 | Stores the login token and cart |
| `socket.io-client` | ^4.8.1 | The live connection |
| `react-native-safe-area-context` | 4.12.0 | Keeps content clear of notches |
| `react-native-screens` | ~4.4.0 | Native screen transitions |
| `expo-build-properties` | ~0.13.3 | Android build settings |

---

## 3. External services

| Service | Used for | Cost |
|---|---|---|
| **MongoDB Atlas** | The production database (AWS Mumbai) | Free tier |
| **Render** | Hosts the backend as a long-running process | Free tier |
| **GitHub Pages** | Hosts the web app as static files | Free |
| **Firebase Authentication** | Sends and verifies the SMS OTP | Blaze plan, pay per SMS |
| **Razorpay** | Payments | Test mode, free |
| **Google Maps JavaScript API** | Maps on both clients | Free tier, billing account required |
| **OpenStreetMap** | Map fallback when no Maps key is present | Free |

> **Why Render and not Vercel for the backend?** Vercel is serverless, and a
> serverless function cannot hold a WebSocket open. Live tracking and chat would
> not work. The frontend has no such constraint, which is why it *can* be static.

---

## 4. The API — all 76 endpoints

Every path below is prefixed with `/api`. Unless noted, a request needs a valid
JWT in an `Authorization: Bearer …` header.

### Auth — `/auth`

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/auth/register` | Create an account by email | public |
| POST | `/auth/verify-otp` | Confirm an email OTP | public |
| POST | `/auth/resend-otp` | Send the email OTP again | public |
| POST | `/auth/login` | Sign in with email and password | public |
| POST | `/auth/forgot-password` | Begin a password reset | public |
| POST | `/auth/reset-password` | Finish a password reset | public |
| POST | `/auth/email-available` | Check an email before spending an SMS | public |
| POST | `/auth/phone/register` | Create an account from a verified phone token | public |
| POST | `/auth/phone/login` | Sign in with a verified phone token | public |
| GET | `/auth/config` | Which features the server has configured | public |
| GET | `/auth/me` | The signed-in user | any |

### Profile — `/profile`

| Method | Path | Purpose | Access |
|---|---|---|---|
| PATCH | `/profile` | Update name, phone, mechanic settings | any |
| PUT | `/profile/location` | Report current position | any |
| POST | `/profile/vehicles` | Add a bike | customer |
| PATCH | `/profile/vehicles/:id` | Edit a bike | customer |
| DELETE | `/profile/vehicles/:id` | Remove a bike | customer |
| GET | `/profile/vehicles/:id/maintenance` | **AI** — maintenance forecast | customer |
| POST | `/profile/favourites/:mechanicId` | Favourite / unfavourite a mechanic | customer |

### Services — `/services`

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/services` | The service catalogue | public |
| GET | `/services/mechanics/nearby` | **AI** — ranked mechanics near a point | customer |
| GET | `/services/mechanics/:id` | A mechanic's public profile and reviews | any |

### Bookings — `/bookings`

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/bookings` | Your bookings; the list differs by role | any |
| GET | `/bookings/available` | Open jobs nearby | mechanic |
| GET | `/bookings/:id` | One booking | owner |
| POST | `/bookings` | Create an SOS, instant or scheduled booking | customer |
| GET | `/bookings/:id/suggested-parts` | **AI** — parts likely needed | mechanic |
| POST | `/bookings/:id/accept` | Take an open job | mechanic |
| POST | `/bookings/:id/reject` | Decline; returns to the pool | mechanic |
| PATCH | `/bookings/:id/status` | arrived → in_progress → completed | mechanic |
| POST | `/bookings/:id/cancel` | Cancel | owner |
| POST | `/bookings/:id/verify-qr` | Verify the service record by QR | any |
| GET | `/bookings/:id/messages` | Chat history | owner |
| POST | `/bookings/:id/review` | Leave a star rating | customer |

### Parts — `/parts`

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/parts` | Browse, search and filter | any |
| GET | `/parts/recommended` | **AI** — parts for your bike | customer |
| GET | `/parts/models` | Bike models the catalogue covers | any |
| GET | `/parts/:id` | One part | any |

### Orders — `/orders`

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/orders/quote` | Price a cart, including any coupon | customer |
| POST | `/orders` | Place an order | customer |
| GET | `/orders` | Your orders; differs by role | any |
| GET | `/orders/:id` | One order | owner |
| PATCH | `/orders/:id/status` | accept → dispatch → deliver | vendor |

### Payments — `/payments`

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/payments/create` | Create a payment and a Razorpay order | customer |
| POST | `/payments/:id/confirm` | Verify the signature and settle | customer |
| GET | `/payments` | Payment history | any |
| GET | `/payments/invoice/:bookingId` | Invoice data | owner |

### Mechanic — `/mechanic`

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/mechanic/dashboard` | Today's jobs and figures | mechanic |
| PATCH | `/mechanic/availability` | Go online or offline | mechanic |
| GET | `/mechanic/earnings` | Daily, weekly and monthly totals | mechanic |
| GET | `/mechanic/history` | Past jobs with their ratings | mechanic |

### Vendor — `/vendor`

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/vendor/products` | Your listings | vendor |
| POST | `/vendor/products` | Add a part | vendor |
| PATCH | `/vendor/products/:id` | Edit a part | vendor |
| DELETE | `/vendor/products/:id` | Soft delete, so past orders stay readable | vendor |
| GET | `/vendor/inventory` | Stock levels and low-stock alerts | vendor |
| GET | `/vendor/sales` | Revenue and best sellers | vendor |

### Admin — `/admin`

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/admin/dashboard` | Platform-wide totals | admin |
| GET | `/admin/users` | Every user | admin |
| PATCH | `/admin/users/:id` | Block, unblock, verify documents | admin |
| DELETE | `/admin/users/:id` | Delete a user and their records | admin |
| GET | `/admin/bookings` | Every booking | admin |
| POST | `/admin/bookings/:id/assign` | Assign a mechanic by hand | admin |
| GET | `/admin/bookings/:id/candidates` | **AI** — the ranking, for manual assignment | admin |
| GET | `/admin/reports` | Revenue by service and by mechanic | admin |
| GET | `/admin/complaints` | Every complaint | admin |
| PATCH | `/admin/complaints/:id` | Resolve a complaint | admin |
| GET | `/admin/coupons` | Every discount code | admin |
| POST | `/admin/coupons` | Create a discount code | admin |
| PATCH | `/admin/coupons/:id` | Edit or deactivate a code | admin |

### Notifications — `/notifications`

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/notifications` | Your alerts, newest first | any |
| POST | `/notifications/read` | Mark one, or all, as read | any |

### Support and assistant

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/assistant/ask` | **AI** — the chatbot | any |
| POST | `/support/complaints` | Raise a complaint | any |
| GET | `/support/complaints` | Your complaints | any |
| GET | `/support/coupons` | Coupons you can use now | customer |
| GET | `/health` | Is the server alive | public |

**"Owner" means the record must be yours.** Holding the right role is not
enough — one customer cannot read another customer's booking.

---

## 5. Socket events

Sent over a WebSocket that stays open, so the server can speak first. The JWT is
verified on the handshake, exactly as on a REST call.

### The client sends

| Event | Meaning |
|---|---|
| `booking:join` | Start listening to this booking (server checks it is yours) |
| `booking:leave` | Stop listening |
| `location:update` | Mechanic reporting a new position |
| `chat:send` | Send a chat message |
| `typing` | Show a typing indicator |

### The server sends

| Event | Meaning |
|---|---|
| `connected` | Handshake accepted |
| `booking:location` | New mechanic position, with distance and ETA |
| `booking:updated` | The booking changed status |
| `booking:paid` | Payment received |
| `chat:message` | A new chat message |
| `chat:unread` | Unread badge count |
| `typing` | The other person is typing |
| `notification` | A new alert for the bell icon |

---

## 6. Web pages — 30

| Area | Pages |
|---|---|
| **Public** | `/` · `/login` · `/register` · `/verify-otp` · `/forgot-password` |
| **Customer** | `/customer` · `/book` · `/bookings` · `/bookings/detail` · `/bookings/invoice` · `/store` · `/store/detail` · `/cart` · `/orders` · `/profile` |
| **Mechanic** | `/mechanic` · `/jobs` · `/jobs/detail` · `/earnings` · `/history` · `/profile` |
| **Vendor** | `/vendor` · `/products` · `/inventory` · `/orders` |
| **Admin** | `/admin` · `/users` · `/bookings` · `/reports` · `/complaints` |

Detail pages take their id from the query string (`?id=…`) rather than the path.
That is a consequence of static export for GitHub Pages: a static build must know
every page at build time, and booking ids are not known until someone books.

---

## 7. Mobile screens — 16

| Area | Screens |
|---|---|
| **Entry** | splash · `login` · `register` · `verify-phone` |
| **Customer** | home (SOS) · `bookings` · `booking/[id]` · `store` · `cart` · `orders` · `profile` |
| **Mechanic** | dashboard · `job/[id]` · `earnings` · `history` · `profile` |

The mechanic side uses a **bottom tab bar** (Jobs · Earnings · History · Profile).
The job detail screen is deliberately not a tab — it belongs to one job, so it is
pushed over the tabs and keeps a back button.

---

## 8. Database — 12 collections

| Collection | Holds | Notable |
|---|---|---|
| `User` | All four roles, their vehicles and location | `2dsphere` index on location |
| `Booking` | Every job and its status history | |
| `ServiceType` | The service catalogue | |
| `SparePart` | Shop inventory | belongs to a vendor |
| `Order` | Parts purchases | |
| `Payment` | Every attempt, successful or not | stores the Razorpay order id |
| `Review` | Star ratings | one per booking |
| `Message` | Chat | |
| `Notification` | Bell-icon alerts | |
| `Complaint` | Raised for the admin | |
| `Coupon` | Discount codes | |
| `Otp` | Email sign-up codes | TTL index deletes them automatically |

Two indexes are worth naming: the **`2dsphere`** index that makes "who is nearby"
fast, and the **TTL** index that makes expired OTPs delete themselves with no
cleanup code.

---

## 9. Configuration

### Backend — set on Render

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string. Empty locally, so an embedded MongoDB starts instead |
| `JWT_SECRET` | Signs login tokens. Generated by Render |
| `DEV_MODE` | `false` in production. When true, OTPs come back in responses and payments are mocked |
| `CORS_ORIGIN` | Which websites may call the API |
| `FIREBASE_SERVICE_ACCOUNT` | Verifies phone-OTP tokens |
| `RAZORPAY_KEY_ID` / `_SECRET` | Payments. Empty means the mock gateway |

> The service is **Blueprint managed** by `render.yaml`. A variable added only in
> the dashboard and not declared in that file appears in the UI but never reaches
> the process.

### Web

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Which backend to call |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps. Unset falls back to OpenStreetMap |

`NEXT_PUBLIC_*` values are inlined at **build** time, not read at runtime, so
changing one needs a rebuild.

### Mobile

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Which backend to call |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps |

Also baked in at build time — a change needs a new APK.

---

## 10. Build and test commands

```bash
# Backend
cd backend && npm install && npm run seed && npm start   # http://localhost:5000
npm test                                                 # 59-check regression

# Web
cd web && npm install && npm run dev                     # http://localhost:3000

# Mobile (needs JDK 17 and the Android SDK)
cd mobile && npm install
E:\claude\rr.bat apk        # build a release APK
E:\claude\rr.bat install    # build and install to a connected phone
```

> `npm run seed` calls `deleteMany({})` on **every** collection. It is only ever
> safe against the local embedded database — never against Atlas.

The 59 checks pass against a seeded local database. Against production, the checks
that sign in as the seeded customer and mechanic fail by design: those accounts
were deleted so that side of the app runs on real phone-verified signups.
