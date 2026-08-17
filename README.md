# RideRescue

**Real-Time Location-Based Two-Wheeler Service and Spare Parts Dispatch System**

> **Live web app:** https://ride-rescue-57l9.vercel.app
> **Live API:** https://riderescue-api.onrender.com — [health check](https://riderescue-api.onrender.com/api/health)
>
> The web app is on Vercel; the API is on Render's free tier with MongoDB Atlas. The API sleeps after
> 15 minutes of inactivity, so the first request after a quiet spell takes ~50 seconds to wake.
> **Open the health check a minute before demoing** — otherwise the first login looks broken.

A full-stack platform that connects stranded riders with nearby verified mechanics in seconds, tracks
those mechanics live on a map, and runs an online spare-parts marketplace on top.

Built as a final-year project. Four user roles, real-time communication, geospatial search,
JWT authentication with role-based access control, and four AI features that use live data rather
than canned responses.

---

## Table of contents

- [What is in the box](#what-is-in-the-box)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [The 6-minute demo script](#the-6-minute-demo-script)
- [Architecture](#architecture)
- [Feature list by role](#feature-list-by-role)
- [The AI features, explained](#the-ai-features-explained)
- [Database schema](#database-schema)
- [API reference](#api-reference)
- [Security](#security)
- [Running the mobile app](#running-the-mobile-app)
- [Going to production](#going-to-production)
- [Troubleshooting](#troubleshooting)
- [Viva questions you should be ready for](#viva-questions-you-should-be-ready-for)

---

## What is in the box

```
ride_rescue/
├── backend/     Node.js + Express + Socket.IO + MongoDB (Mongoose)
├── web/         Next.js 15 (App Router) + TypeScript + Tailwind CSS  — all 4 roles
└── mobile/      React Native (Expo Router) + TypeScript              — customer & mechanic
```

| Layer | Technology |
|---|---|
| Web frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| Mobile app | React Native 0.76 via Expo 52, Expo Router, TypeScript |
| Backend | Node.js, Express 4, ES modules |
| Database | MongoDB with Mongoose (2dsphere geospatial indexes) |
| Real-time | Socket.IO (live tracking, chat, notifications) |
| Maps | Leaflet + OpenStreetMap — **no API key, no billing account** |
| Auth | JWT (jsonwebtoken) + bcrypt password hashing + OTP verification |
| Payments | Razorpay-ready, with a mock gateway so it runs offline |

---

## Quick start

**Requirements:** Node.js 18 or newer. That is all — no MongoDB installation needed.

```bash
cd ride_rescue/backend && npm install && cp .env.example .env && npm run seed
```

> **First run downloads ~600 MB.** With `MONGODB_URI` left empty the backend starts an *embedded*
> MongoDB and downloads the MongoDB 7 binary once, caching it in `backend/node_modules/.cache/`.
> Every later start is instant. If you already have MongoDB installed, set
> `MONGODB_URI=mongodb://127.0.0.1:27017/ride_rescue` in `.env` and this step is skipped entirely.

Then, in **two separate terminals**:

```bash
cd ride_rescue/backend && npm start
```

```bash
cd ride_rescue/web && npm install && npm run dev
```

Open **http://localhost:3000** and use the one-click demo login buttons.

### Verifying it works

With the backend running, a 59-check regression suite exercises the whole API — auth, role-based
access control, all four AI features, the full booking lifecycle including OTP gating, payments,
invoicing, QR verification, the store, and every dashboard:

```bash
cd ride_rescue/backend && npm test
```

Run it against a freshly seeded database (`npm run seed`) for a clean pass.

> ⚠️ **Only one process may use the embedded database at a time.** Stop the backend before running
> `npm run seed` again, or you will get a `DBPathInUse` error. The error message tells you this too.

---

## Demo accounts

Seeded by `npm run seed`. **Password for every account: `password123`**

| Role | Email | What to look at |
|---|---|---|
| Customer | `customer@riderescue.in` | SOS, live tracking, store, predictive maintenance, chatbot |
| Customer | `priya@riderescue.in` | A second customer with different history |
| Mechanic | `mechanic@riderescue.in` | Ravi Kumar — 4.8★, 8 yrs, the usual best match |
| Mechanic | `imran@riderescue.in` | A second mechanic for reassignment demos |
| Vendor | `vendor@riderescue.in` | Sai Auto Spares — products, inventory, sales |
| Vendor | `bikeworld@riderescue.in` | Bike World Parts |
| Admin | `admin@riderescue.in` | Platform dashboard, users, manual assignment, reports |

The seed also creates 8 mechanics spread across real Hyderabad localities, 20 spare parts across
2 vendors, 6 completed bookings with ratings, 3 spare-parts orders, 3 coupons and 1 open complaint —
so every dashboard has real numbers in it from the first second.

### Seeding around your own location

Nearest-mechanic search only looks within ~20 km. Demo the app from anywhere other than Hyderabad —
especially from a **phone**, which reports its real GPS — and you will correctly see *"0 mechanics near
you"*, because the seeded mechanics really are hundreds of kilometres away.

Rebuild the dataset around wherever you are:

```bash
SEED_LAT=14.4014 SEED_LNG=77.7117 npm run seed
```

On Windows PowerShell:

```bash
$env:SEED_LAT="14.4014"; $env:SEED_LNG="77.7117"; npm run seed
```

Every locality keeps its relative offset, so the spread still looks like a real city — just centred on
you. Leave the variables unset for the original Hyderabad data. To find your coordinates, log in on
the phone once and read them back with:

```bash
node -e "fetch('http://localhost:5000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'customer@riderescue.in',password:'password123'})}).then(r=>r.json()).then(d=>console.log(d.user.location.coordinates))"
```

---

## The 6-minute demo script

This is the order that shows the most in the least time.

**1. Customer raises an SOS (90s)**
Log in as the customer. Press and hold the red **SOS** button for 2 seconds. It captures GPS, scores
every available mechanic, assigns the best one, and lands you on the tracking screen. Point out the
**"Why we picked them"** panel — that is the AI recommendation explaining itself.

**2. Live tracking (60s)**
Watch the ETA and distance count down on their own. No refresh — the numbers arrive over Socket.IO.
The mechanic's pin visibly moves along the dashed route line toward you.

**3. Mechanic side (90s)**
In a **different browser** (or an incognito window — see the note below), log in as the mechanic.
The job is already on their dashboard. Press **I have arrived**, then enter the 4-digit **start OTP**
shown on the customer's screen. This is the anti-fraud step: work cannot start without the customer
physically present to read out the code.

**4. Complete and pay (60s)**
The mechanic adds parts from the AI-suggested list, sets the labour charge, and marks the job
complete. The customer's screen updates instantly with the itemised total. Pay by UPI, then rate the
mechanic 5 stars.

**5. The invoice (30s)**
Open the invoice. It is a proper tax invoice with a **QR code** that encodes the verification token —
scanning it hits `POST /api/bookings/:id/verify-qr` and proves the service record is genuine.
"Download PDF" prints it through a print stylesheet.

**6. AI chatbot + admin (60s)**
Open the 🤖 button and ask *"what maintenance is due?"* — it answers from that customer's actual
odometer reading and service history. Then log in as admin to show the platform dashboard, revenue
split, and manual mechanic assignment with the AI candidate ranking.

> **Two roles at once:** the JWT lives in `localStorage`, which is shared by all tabs of one browser
> profile. To show customer and mechanic side by side, use two *different* browsers, or one normal
> window and one incognito window. Two tabs of the same browser will log each other out.

---

## Architecture

```
   ┌──────────────────┐            ┌──────────────────┐
   │  Next.js web app │            │  Expo mobile app │
   │  (all 4 roles)   │            │ (customer +      │
   │                  │            │  mechanic)       │
   └────────┬─────────┘            └─────────┬────────┘
            │  REST (JWT)  +  Socket.IO      │
            └───────────────┬────────────────┘
                            ▼
            ┌───────────────────────────────┐
            │  Express API  +  Socket.IO    │
            │                               │
            │  routes/     auth, bookings,  │
            │              parts, orders,   │
            │              payments, admin  │
            │  services/ai mechanicMatch    │
            │              partsRecommender │
            │              predictive       │
            │              chatbot          │
            │  realtime/   hub.js           │
            └───────────────┬───────────────┘
                            ▼
            ┌───────────────────────────────┐
            │  MongoDB (Mongoose)           │
            │  2dsphere indexes on          │
            │  users.location &             │
            │  bookings.pickupLocation      │
            └───────────────────────────────┘
```

### How real-time tracking actually works

1. Every socket connection is authenticated with the same JWT as the REST API (`realtime/hub.js`).
2. Both parties to a booking join a private room, `booking:<id>`. Membership is verified against the
   database — you cannot join a room for someone else's booking.
3. The mechanic's device emits `location:update` with `[lng, lat]`.
4. The server recomputes distance and ETA, persists them, and broadcasts `booking:location` to the room.
5. The customer's map moves. No polling anywhere.

**The demo simulator.** `services/simulator.js` moves any accepted-but-not-arrived mechanic toward the
customer every 3 seconds, so live tracking animates during a demo without a second phone streaming
real GPS. A real device emitting `location:update` overrides it immediately. Disable it with
`SIMULATE=false`.

### Distance and ETA

`utils/geo.js` uses the haversine formula for great-circle distance, then applies a **1.35× road
detour factor** and an **average speed of 22 km/h** — realistic for a two-wheeler in Indian city
traffic. MongoDB's `$near` on a 2dsphere index does the actual "find mechanics within N km" query,
so filtering happens in the database, not in JavaScript.

---

## Feature list by role

### Customer
Registration with OTP · login/logout · forgot password · edit profile · **multiple vehicles** ·
**one-tap SOS with live location** · automatic nearest-mechanic dispatch · **live tracking with ETA** ·
instant / scheduled / home service booking · **spare parts store** (search, filter by bike model,
categories, wishlist, cart) · coupons · UPI / card / wallet / cash payments · booking history ·
**invoice with QR verification** · rate & review mechanics · **live chat with the mechanic** ·
real-time notifications · **AI chatbot** · **predictive maintenance** · favourite mechanics ·
referral rewards · emergency-contact alert · dark mode · multi-language (English / हिन्दी / తెలుగు)

### Mechanic
Registration with ID proof, driving licence and experience · dashboard with today's jobs, earnings and
pending requests · accept / reject jobs · **live location sharing** · navigate via Google Maps ·
job status updates gated by a **customer OTP** · AI-suggested parts per job · daily / weekly / monthly
earnings with charts · service history with customer ratings · online/offline availability toggle

### Spare Parts Vendor
Add / edit / soft-delete products · stock management with inline restock · **low-stock alerts** ·
accept, dispatch and track orders · revenue reports · best-selling products · multi-vendor orders
(each vendor sees only their own lines)

### Admin
Dashboard: total users, active mechanics, vendors, revenue, payment-method split, 30-day revenue
trend · manage all users · verify mechanic documents · block/unblock fake accounts ·
**manual mechanic assignment with AI candidate ranking** · revenue / service / user reports ·
CSV export · complaint management · coupon management

---

## The AI features, explained

All four are deterministic, explainable algorithms — not a black box. That matters in a viva: you can
show the exact formula and defend every number on screen.

### 1. Mechanic recommendation — `services/ai/mechanicMatch.js`

Scores every available mechanic within radius on five normalised factors:

| Factor | Weight (emergency) | Weight (normal) | Why |
|---|---|---|---|
| Distance | 0.50 | 0.32 | A nearby average mechanic beats a distant excellent one when you are stranded |
| Rating | 0.20 | 0.30 | Quality matters more when there is time to choose |
| Availability | 0.12 | 0.10 | |
| Experience | 0.10 | 0.18 | |
| Current workload | 0.08 | 0.10 | Spreads jobs instead of overloading the top-rated mechanic |

Plus small bonuses: +0.05 for a favourite mechanic, +0.04 for specialising in that bike's make.
An unrated new mechanic is scored as 3.5/5 rather than 0, so newcomers can still get work.
Every score comes with a human-readable reason list, which is what the UI displays.

### 2. Spare parts recommendation — `services/ai/partsRecommender.js`

Blends three signals: **fitment** (0.45 for an exact model match, 0.20 for the same make), **history**
(0.20 if the part was used in a past service), and **demand** (up to 0.20 from normalised sales volume,
+0.10 for a high rating). Parts the customer already bought are penalised −0.25 so the list stays
useful. This is content-based filtering with a collaborative-filtering popularity term.

### 3. Predictive maintenance — `services/ai/predictiveMaintenance.js`

Eight components, each with a service interval in **both** kilometres and months — whichever limit is
reached first drives the prediction, which is how real service schedules work. The rider's actual
daily running is derived from odometer movement since their last service, so someone doing 60 km/day
is warned much earlier than someone doing 5 km/day. Outputs a wear percentage, urgency band, days
remaining, estimated cost and a bike health score out of 100.

### 4. Chatbot — `services/ai/chatbot.js`

Keyword-overlap intent classification across nine intents, each with a handler that queries live data.
Ask "what is my booking status?" and it reads that customer's actual active booking, mechanic name,
ETA and start OTP. It is a real assistant over the database, not a scripted FAQ.

---

## Database schema

13 collections, matching the module list in the project brief.

| Collection | Purpose | Notable fields |
|---|---|---|
| `users` | All four roles in one collection, discriminated by `role` | `location` (GeoJSON Point, **2dsphere**), embedded `vehicles[]`, `mechanicProfile`, `vendorProfile` |
| `servicetypes` | Service catalogue | `slug`, `basePrice`, `isEmergency` |
| `bookings` | The core entity | `pickupLocation` (**2dsphere**), `mechanicLocation`, `statusHistory[]`, `recommendation`, `otpCode`, `qrToken` |
| `spareparts` | Product catalogue | `compatibleModels[]` (indexed), `stock`, `lowStockThreshold` |
| `orders` | Spare-parts orders | `items[]` with per-line `vendor`, `vendors[]` for multi-vendor orders |
| `payments` | All money movement | `method`, `purpose`, `gateway`, `gatewayPaymentId` |
| `reviews` | Mechanic ratings | Unique per booking |
| `messages` | Customer↔mechanic chat | Indexed by booking |
| `notifications` | In-app notifications | Indexed by user |
| `complaints` | Dispute management | |
| `coupons` | Discount codes | `usedCount` vs `usageLimit` |
| `otps` | OTP verification | **TTL index** — MongoDB deletes expired codes automatically |

Why users are one collection: a single `$near` query can filter by role, availability *and* distance
in one database round-trip. Splitting mechanics into their own collection would need a join for every
nearest-mechanic search.

---

## API reference

All routes are prefixed `/api`. Authenticated routes need `Authorization: Bearer <jwt>`.

<details>
<summary><b>Authentication</b></summary>

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create a customer, mechanic or vendor account |
| POST | `/auth/verify-otp` | Verify the account and receive a JWT |
| POST | `/auth/resend-otp` | Re-issue an OTP |
| POST | `/auth/login` | Email + password → JWT |
| POST | `/auth/forgot-password` | Issue a reset OTP |
| POST | `/auth/reset-password` | Reset with OTP → JWT |
| GET | `/auth/me` | Current user |
</details>

<details>
<summary><b>Profile & vehicles</b></summary>

| Method | Path | Description |
|---|---|---|
| PATCH | `/profile` | Update profile / emergency contact / mechanic settings |
| PUT | `/profile/location` | Push current GPS position |
| POST | `/profile/vehicles` | Add a vehicle |
| PATCH | `/profile/vehicles/:id` | Edit a vehicle |
| DELETE | `/profile/vehicles/:id` | Remove a vehicle |
| GET | `/profile/vehicles/:id/maintenance` | **AI predictive maintenance report** |
| POST | `/profile/favourites/:mechanicId` | Toggle favourite mechanic |
</details>

<details>
<summary><b>Services & bookings</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/services` | Service catalogue |
| GET | `/services/mechanics/nearby` | **AI-ranked nearby mechanics** |
| GET | `/services/mechanics/:id` | Mechanic profile + reviews |
| GET | `/bookings` | Role-aware booking list |
| GET | `/bookings/available` | Open jobs near a mechanic |
| POST | `/bookings` | Create an SOS / instant / scheduled booking |
| GET | `/bookings/:id` | Booking detail |
| POST | `/bookings/:id/accept` | Mechanic accepts |
| POST | `/bookings/:id/reject` | Decline and auto-reassign |
| PATCH | `/bookings/:id/status` | arrived → in_progress (OTP-gated) → completed |
| POST | `/bookings/:id/cancel` | Cancel |
| POST | `/bookings/:id/verify-qr` | **QR service verification** |
| GET | `/bookings/:id/messages` | Chat history |
| POST | `/bookings/:id/review` | Rate the mechanic |
| GET | `/bookings/:id/suggested-parts` | **AI parts suggestion for the job** |
</details>

<details>
<summary><b>Store, orders, payments</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/parts` | Browse / search / filter |
| GET | `/parts/recommended` | **AI parts recommendations** |
| GET | `/parts/models` | Bike models in the catalogue |
| GET | `/parts/:id` | Product detail + related |
| POST | `/orders/quote` | Price a cart (coupon preview) |
| POST | `/orders` | Place an order |
| GET | `/orders` | Role-aware order list |
| PATCH | `/orders/:id/status` | Vendor: accept → dispatch → deliver |
| POST | `/payments/create` | Create a payment (Razorpay or mock) |
| POST | `/payments/:id/confirm` | Confirm (HMAC-verified when live) |
| GET | `/payments/invoice/:bookingId` | Invoice data |
</details>

<details>
<summary><b>Mechanic, vendor, admin, assistant</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/mechanic/dashboard` | Today's jobs, earnings, rating |
| PATCH | `/mechanic/availability` | Go online / offline |
| GET | `/mechanic/earnings` | Daily / weekly / monthly |
| GET | `/mechanic/history` | Completed jobs + ratings |
| GET/POST/PATCH/DELETE | `/vendor/products` | Product management |
| GET | `/vendor/inventory` | Stock + low-stock alerts |
| GET | `/vendor/sales` | Revenue + best sellers |
| GET | `/admin/dashboard` | Platform statistics |
| GET/PATCH | `/admin/users` | Manage, verify, block |
| GET | `/admin/bookings` | All bookings |
| GET | `/admin/bookings/:id/candidates` | **AI ranking for manual assignment** |
| POST | `/admin/bookings/:id/assign` | Assign manually |
| GET | `/admin/reports` | Revenue / service / user reports |
| GET/PATCH | `/admin/complaints` | Complaint management |
| POST | `/assistant/ask` | **AI chatbot** |
</details>

### Socket.IO events

| Direction | Event | Payload |
|---|---|---|
| → server | `booking:join` / `booking:leave` | `bookingId` |
| → server | `location:update` | `{ bookingId, coordinates }` |
| → server | `chat:send` | `{ bookingId, text }` |
| ← client | `booking:location` | `{ coordinates, distanceKm, etaMinutes }` |
| ← client | `booking:updated` / `booking:assigned` / `booking:new` | booking object |
| ← client | `chat:message` | message object |
| ← client | `notification` | notification object |

---

## Security

- **Password hashing** — bcrypt with 10 salt rounds. Plaintext passwords are never stored, and
  `toSafeJSON()` strips the hash from every API response.
- **JWT authentication** — signed tokens, 7-day expiry, verified on every REST request *and* on the
  Socket.IO handshake.
- **Role-based access control** — `requireRole('customer')`, `requireRole('vendor', 'admin')` etc.
  guard every route. Ownership is checked separately: you cannot read, pay for or chat about a
  booking that is not yours, even with a valid token for the right role.
- **Phone verification via Firebase** — signup on both web and mobile proves ownership of the number
  before an account exists. The client never tells us "I am 98765…": Firebase sends the SMS, checks
  the code, and returns a signed ID token, and `verifyPhoneToken()` validates that signature with the
  service-account key before the user row is written. A forged token fails the signature check.
- **OTP verification (legacy email path)** — accounts created by the older email signup must verify
  before login; OTP records carry a TTL index so expired codes are deleted by MongoDB itself.
- **Service-start OTP** — a 4-digit code the customer reads out, required before a mechanic can move a
  job to `in_progress`. Prevents billing for work that never happened.
- **Payment signature verification** — with live keys, Razorpay's HMAC-SHA256 signature is verified
  server-side before a payment is marked successful. A failed signature marks the payment failed.
- **Server-authoritative pricing** — the cart total is always recomputed on the server from the
  database. A tampered client price is ignored.
- **Blocked accounts** — rejected at both the REST middleware and the socket handshake.

**Known limitations** (be honest about these in a viva): the JWT is stored in `localStorage`, which is
readable by JavaScript — an httpOnly cookie is stricter but complicates mobile. There is no rate
limiting on login; `express-rate-limit` would be the first thing to add. HTTPS is a deployment
concern, not an application one — the app is transport-agnostic and should sit behind TLS.

---

## Running the mobile app

```bash
cd ride_rescue/mobile
npm install
cp .env.example .env
npx expo start
```

Scan the QR code with **Expo Go** on your phone, or press `a` for an Android emulator.

**The one thing you must get right:** the phone cannot reach `localhost` — that address means the
phone itself. Set `EXPO_PUBLIC_API_URL` in `mobile/.env`:

| Running on | Value |
|---|---|
| Android emulator | `http://10.0.2.2:5000` |
| iOS simulator | `http://localhost:5000` |
| **Real phone on the same Wi-Fi** | `http://<your-PC-LAN-IP>:5000` e.g. `http://192.168.1.7:5000` |

Find your LAN IP with `ipconfig` (the IPv4 Address of your Wi-Fi adapter). The login screen displays
the URL it is using, so you can see at a glance whether it is set correctly.

You can also run the mobile app in a browser with `npx expo start --web` — handy for demoing without a
phone, though the map (a WebView) renders best on a real device.

The mobile app covers the customer and mechanic roles; vendors and admins use the web dashboard.

### Building a standalone APK

For a real installed app with its own home-screen icon (rather than running inside Expo Go):

```bash
E:\claude\rr.bat prebuild    # generate the native android/ project
E:\claude\rr.bat install     # build a release APK and adb install it
```

`rr.bat` sets the toolchain, because nothing is on this machine's system PATH.

**JDK 17 is mandatory.** React Native 0.76 uses Android Gradle Plugin 8.6, which rejects both the
JDK 11 bundled with Android Studio and JDK 25. Temurin 17 is installed at
`C:\Users\Nawaz\.jdks\temurin-17.0.20` and `rr.bat` points `JAVA_HOME` at it.

Two things that bite on this setup:

- **Gradle's wrapper has a 10-second download timeout** and fails on a slow link. The distribution is
  pre-downloaded to `E:\claude\gradle-dists\gradle-8.10.2-all.zip` and
  `android/gradle/wrapper/gradle-wrapper.properties` points at that local file. Note that
  `expo prebuild --clean` regenerates that file and resets the URL — re-apply the local path if a
  build suddenly starts trying to download Gradle again.
- **Never leave a shell sitting inside `mobile/android`.** Windows locks the directory and
  `expo prebuild --clean` fails with `EBUSY`.

- **Android blocks cleartext HTTP.** Apps targeting API 28+ refuse plain `http://` connections, so the
  app could not reach the backend even though `adb shell curl` to the same URL worked fine — the shell
  is not subject to the app's network security policy. `app.json` enables it via
  `expo-build-properties`:

  ```json
  ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
  ```

  This is a **development concession**. In production the backend sits behind HTTPS and this flag
  should be removed.

The release build is signed with the **debug keystore** (Expo's default), so it installs over previous
dev builds without a signature clash. Generate a real keystore before publishing anywhere.

The API URL is baked in at build time from `mobile/.env`. If your PC's LAN IP changes, update
`EXPO_PUBLIC_API_URL` and rebuild — the app will not pick it up otherwise.

---

## Deploying the backend

The app runs entirely on your laptop, but the phone then only works on your Wi-Fi. Deploying the
backend gives it a public HTTPS URL that works on mobile data, from a projector, or from an examiner's
machine.

**Total cost: nothing.** Both services below have a free tier that does not expire.

### Why these choices

- **Render** runs a real long-lived Node process, so Socket.IO's WebSocket connections stay open.
  **Vercel and Netlify will not work** for this backend — they are serverless, and serverless
  functions cannot hold a persistent socket. Live tracking and chat, the two headline features, would
  silently break.
- **MongoDB Atlas** is required, not optional. The embedded MongoDB writes to local disk, and Render
  wipes that disk on every restart and redeploy, so every booking and account would vanish. The code
  already handles this: set `MONGODB_URI` and the embedded server is skipped automatically.

### Step 1 — Push to GitHub

The repository is already initialised and committed, with `.env` files excluded. Create an empty
repository on GitHub (no README, no .gitignore — you already have both), then:

```bash
git remote add origin https://github.com/<your-username>/ride-rescue.git
git push -u origin main
```

### Step 2 — Create the database

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a **free M0 cluster**.
2. Under **Database Access**, add a user with a password. Avoid `@ : / ?` in the password — they have
   to be percent-encoded inside a connection string and are a common source of confusing failures.
3. Under **Network Access**, add `0.0.0.0/0`. Render's outbound IP is not fixed on the free plan, so
   restricting by IP does not work there.
4. Copy the connection string. It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/ride_rescue?retryWrites=true&w=majority`
   Add `/ride_rescue` before the `?` so the data lands in a named database.

### Step 3 — Seed the cloud database

Run this **from your laptop**, pointing at Atlas — it fills the cloud database with the demo accounts,
mechanics and catalogue:

```bash
cd backend
$env:MONGODB_URI="mongodb+srv://...your string..."; npm run seed
```

Add `SEED_LAT` / `SEED_LNG` here too if you want the mechanics near you rather than in Hyderabad.

### Step 4 — Deploy on Render

1. Sign up at [render.com](https://render.com) and connect your GitHub account.
2. **New → Blueprint**, pick the repository. Render reads [`render.yaml`](render.yaml) and configures
   the service itself.
3. It will ask for the two values marked `sync: false`:
   - `MONGODB_URI` — your Atlas string from step 2
   - `CORS_ORIGIN` — leave blank for now; set it once the web app is deployed
4. Deploy. First build takes 2–4 minutes. Your API lands at
   `https://riderescue-api.onrender.com`.

Check it:

```bash
curl https://riderescue-api.onrender.com/api/health
```

`JWT_SECRET` is generated by Render automatically — you never see or set it. The server **refuses to
start** in production if it is missing, if it is still the development default, or if `MONGODB_URI` is
unset, rather than booting an insecure public API.

### Step 5 — Point the apps at it

**Mobile** — edit `mobile/.env`, then rebuild:

```
EXPO_PUBLIC_API_URL=https://riderescue-api.onrender.com
```

```bash
E:\claude\rr.bat prebuild
E:\claude\rr.bat install
```

Since the URL is now HTTPS, you can also delete the `usesCleartextTraffic` block from `app.json` —
it only existed to allow plain HTTP to your laptop.

### Step 6 — Deploy the web app on Vercel

The web app deploys fine on Vercel — it is the *backend* that cannot be serverless.

1. Import the same GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `web`. The repo is a monorepo, and without this Vercel builds the
   repository root and finds no Next.js app.
3. Add environment variable `NEXT_PUBLIC_API_URL` = `https://riderescue-api.onrender.com`, and leave
   **Sensitive** switched off (see below).
4. Deploy, then set `CORS_ORIGIN` on Render to the resulting URL so only your own frontend can call
   the API.

### Step 7 — Phone sign-in on the web

Web and mobile share one authentication path. Both use Firebase Phone Auth, both send the resulting
ID token to `POST /auth/phone/register` (or `/auth/phone/login`), and the backend verifies the
token's signature before writing anything — so a signup made on the phone can log in on the web, and
vice versa.

Setting it up for a new deployment takes two console steps:

1. **Firebase → Project settings → Your apps → Add app → Web.** Copy the config into
   `web/src/lib/firebase.ts` (or set the `NEXT_PUBLIC_FIREBASE_*` env vars, which take precedence).
2. **Firebase → Authentication → Settings → Authorized domains → Add domain.** Add the Vercel URL.
   `localhost` is authorised by default, so this only bites after deploying.

Two things differ from the mobile flow and are worth understanding:

- **The browser needs a reCAPTCHA verifier**; native does not. A web page has no app-signature
  equivalent to prove it is not a bot, so Firebase refuses to send a browser-initiated SMS without
  one. It is invisible unless Google thinks the visitor looks automated. The verifier is **single-use** —
  reusing one is the usual cause of a resend failing with `captcha-check-failed`, so `sendOtp()`
  builds a fresh verifier each time and disposes of the previous one.
- **The OTP step is on the same page as the form**, not a route of its own. Firebase's confirmation
  handle is a live object that cannot be serialised into a URL or storage, and handing it across a
  navigation is exactly what broke resend in the mobile app.

The web config values (`apiKey`, `appId`, …) are committed deliberately. They are not secrets — every
Firebase web app ships them in its JavaScript bundle by design. What protects the project is the
authorised-domain list, the SMS region policy, and server-side token verification. The
**service-account key is the real secret** and lives only in Render's `FIREBASE_SERVICE_ACCOUNT`.

Signup also asks the backend `POST /auth/email-available` before sending anything, so a duplicate
email is caught without spending an SMS on a registration that would be rejected anyway.

### Deployment gotchas actually hit during this deploy

- **The deployed site kept calling `http://localhost:5000`.** `NEXT_PUBLIC_*` values are *inlined into
  the client bundle at build time*, and the variable had been saved as **Sensitive** — a flag that
  tells Vercel to withhold the value from anything the browser can read, which is precisely what
  inlining is. The build read the fallback instead and shipped a site that 503s on login. Sensitive is
  correct for a database URL and wrong for anything named `NEXT_PUBLIC_`. The tell is that
  **Copy to Clipboard** is greyed out on the variable: write-only in the dashboard means write-only in
  the bundle too. Fix by deleting and re-adding it with Sensitive off — the flag cannot be edited.
- **"GitHub could not associate the committer with a GitHub user."** Commits were authored as
  `nawaz@local`, which matches no GitHub account, and Vercel's Hobby plan only builds commits from
  recognised team members. The fix is to commit under an address GitHub knows — the
  `ID+username@users.noreply.github.com` form always works and does not publish a real address:
  ```bash
  git config user.email "255927115+hyderabadmohammednawaz@users.noreply.github.com"
  ```
  A missing environment variable and an unrecognised committer produce the same symptom (a deployment
  that does not update), so check the build log's commit author before blaming config.

- **`bad auth : authentication failed`** — the connection string's password was wrong. Worth knowing
  what this error *rules out*: the build compiled, the container started, and it reached Atlas over
  the network, so `render.yaml` and the `0.0.0.0/0` rule were already working. Only the credential
  was wrong. Fix with Atlas → Database Access → Edit → **Autogenerate Secure Password**, which
  produces an alphanumeric password and sidesteps percent-encoding entirely.
- **Seeding into the wrong database.** Omit `/ride_rescue` from the connection string and MongoDB
  writes to a database called `test`. The seed reports success while the deployed API — correctly
  pointed at `/ride_rescue` — keeps returning empty lists.
- **cmd.exe vs PowerShell.** The seed command uses PowerShell syntax (`$env:VAR=`). In cmd you need
  `cd /d` to change drive, `set` instead of `$env:`, and **quotes around `set "VAR=value"`** — the
  connection string contains `&w=majority`, and an unquoted `&` in cmd means "run the next command",
  silently truncating the URI.

### The one thing that will bite you in a viva

**Render's free tier sleeps after 15 minutes of inactivity.** The next request wakes it, taking around
**50 seconds** — long enough to look broken while an examiner watches. Open the health URL a minute
before you present and it will be warm. If you want to remove the risk entirely, Fly.io's free
allowance does not force a sleep.

Also note the free tier gives 512 MB RAM and a shared CPU. That is ample for a demo and not intended
for real traffic.

---

## Going to production

Everything below is wired up and needs only credentials.

| Feature | What to do |
|---|---|
| **Real SMS OTP** | **Already live** on web and mobile via Firebase Phone Auth — see below. The legacy email-OTP path (`issueOtp()` in `routes/auth.js`) is the one place a Twilio/MSG91 integration would go if you ever wanted email or a second channel. |
| **Razorpay payments** | **Fully implemented** — set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` and real checkout takes over. See "Payments" below. Live keys need only the same two variables; no code differs between test and live. |
| **Push notifications** | `services/notifications.js` persists and emits every notification. Add an FCM `send()` call in `notify()` and every existing notification becomes a push. |
| **Google Maps** | Swap the Leaflet `TileLayer` URL for the Google tile source, or replace `LiveMap.tsx` with `@react-google-maps/api`. All coordinates are already GeoJSON `[lng, lat]`. |
| **Real MongoDB** | Set `MONGODB_URI` to your Atlas connection string. The embedded server is skipped automatically. |
| **HTTPS** | Deploy behind nginx or a platform that terminates TLS. |

### Payments — Razorpay test mode

Test mode is free, unlimited, and needs **no KYC**; only going live requires business
verification. Nothing about the code changes between the two — only the keys.

1. Sign up at [dashboard.razorpay.com](https://dashboard.razorpay.com), stay in **Test Mode**.
2. **Settings → API Keys → Generate Test Key.** You get `rzp_test_…` and a secret.
3. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the server and restart.

`GET /api/auth/config` then reports `paymentGateway: "razorpay"` instead of `"mock"`, and the
checkout dialog switches from settling instantly to opening the real Razorpay sheet.

**Test credentials:** card `4111 1111 1111 1111`, any future expiry, any CVV — or UPI id
`success@razorpay`. Use `failure@razorpay` to exercise the declined path.

**How the flow works, and why:**

- `POST /payments/create` creates a Razorpay **order** server-side and stores its id on the
  Payment. Checkout cannot open without one, and it is what ties the payment to an amount *we*
  chose rather than one the browser claimed.
- The browser opens Razorpay's sheet. Card details are entered in **their** iframe and never touch
  our page or our server — which is why `checkout.js` is loaded from their CDN rather than bundled,
  and is the only third-party script the app loads.
- `POST /payments/:id/confirm` recomputes the HMAC-SHA256 of `order_id|payment_id` with the secret
  and compares it, in constant time, against the signature checkout returned. **The order id comes
  from our stored record, never from the request body** — a signature only proves that *some* order
  was paid, so trusting a client-supplied order id would let another order's signature be replayed
  against this payment. A mismatch marks the payment failed.
- Wallet and cash never reach the gateway: the wallet is our own ledger and cash settles in person.

Without keys the same sequence runs against a mock gateway that settles instantly, so the demo
works offline and the 59-check regression needs no network.

**Clients opt in.** A payment only goes to Razorpay if the caller sent `supportsCheckout: true`.
The mobile app — and any web build predating checkout — calls create and then confirms with an empty
body; routed to the gateway it would create a real order, return no signature, and have the payment
marked failed. Opting in means **adding keys can never break a client that has not shipped yet**, so
the rollout does not depend on deploy order. The mobile app therefore stays on the mock gateway until
it gains a real checkout, which on React Native needs Razorpay's native SDK and a rebuild.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `DBPathInUse` when seeding | The backend is still running. Stop it first — only one process can own the embedded database. |
| `EADDRINUSE: port 5000` | An older backend is still alive. Kill it, or change `PORT` in `backend/.env`. |
| First `npm start` hangs for minutes | It is downloading MongoDB (~600 MB), once. Watch the progress in the console. |
| Backend killed but port stays busy | The embedded `mongod` is a *separate* process (`mongod-x64-win32-*.exe`). Stop it in Task Manager. Ctrl+C shuts it down cleanly; force-killing does not. |
| Mechanic's marker never moves | The simulator only moves `accepted` jobs. Once the mechanic marks *arrived*, movement stops by design. |
| Two browser tabs log each other out | Expected — the JWT is per browser profile. Use two different browsers or an incognito window. |
| Map tiles are blank | OpenStreetMap tiles need an internet connection. |
| Mobile app cannot reach the server | `EXPO_PUBLIC_API_URL` is wrong. See [Running the mobile app](#running-the-mobile-app). |

---

## Viva questions you should be ready for

**"Why MongoDB and not MySQL?"** The core query is *"find available mechanics within N km, sorted by
distance"*. MongoDB does that natively with a 2dsphere index and `$near`. In MySQL you would need
spatial extensions or bounding-box maths in application code. Bookings also have naturally nested,
variable-shape data — `statusHistory[]`, `partsUsed[]` — that fits documents better than join tables.

**"Is your AI really AI?"** It is a weighted multi-criteria scoring model, not a neural network — and
that is deliberate. Every recommendation is explainable ("3.2 km away, rated 4.8★, free right now"),
it works from the first day with no training data, and it is fast enough to run inside a request.
A learned model would be the next iteration, once there are enough completed bookings to train on.

**"How does live tracking work without polling?"** WebSockets via Socket.IO. The mechanic's device
emits its position, the server recomputes distance and ETA and broadcasts to the booking's private
room. Both parties join that room only after the server verifies they belong to the booking.

**"How do you stop a mechanic billing for work they never did?"** Two gates: the customer's 4-digit
start OTP is required to move a job to `in_progress`, and the completed job carries a QR token that
verifies the service record independently.

**"What happens if no mechanic accepts?"** SOS and instant bookings are auto-assigned to the highest
scoring mechanic. If one declines, the job is automatically reassigned to the next best. If nobody is
within range, the booking stays `pending`, appears in the admin's unassigned filter, and an admin can
assign someone manually using the same AI ranking.

**"What would you improve with more time?"** Rate limiting on auth endpoints, httpOnly refresh
tokens, real road routing (OSRM) instead of straight-line ETA, a learned ranking model trained on
completed-booking outcomes, and automated tests.
