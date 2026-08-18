# RideRescue — viva preparation

Everything an examiner is likely to probe, with answers grounded in what the code actually does.

---

## 1. The thirty-second answer

> RideRescue connects a stranded two-wheeler rider with the nearest available mechanic in seconds,
> tracks that mechanic live on a map, and runs a spare-parts marketplace alongside it. Four roles —
> customer, mechanic, vendor, admin. Node and Express with Socket.IO for real time, MongoDB for
> geospatial search, Next.js for the web app, React Native for the phone. Four explainable AI
> features. It is deployed and running on real accounts with real SMS verification and a real payment
> gateway in test mode.

Have the live URLs open before you start: <https://ride-rescue-57l9.vercel.app> and
<https://riderescue-api.onrender.com/api/health>. **Wake the API a minute early** — the free tier
sleeps and takes ~50 seconds to respond cold.

---

## 2. Architecture, and why each choice

```
Customer / Mechanic phone  ──┐
   (React Native, Expo)      │
                             ├──►  Express API  ──►  MongoDB Atlas
Web app (Next.js 15)  ───────┘     + Socket.IO       (2dsphere geo index)
   4 role dashboards               (one process)
                                        │
                                        ├──► Firebase Admin  (verifies phone OTP tokens)
                                        └──► Razorpay        (creates orders, signs payments)
```

**Why MongoDB and not MySQL.** The central query is *"available mechanics within N km, nearest
first"*. MongoDB answers that natively with a `2dsphere` index and `$near`. MySQL would need spatial
extensions or bounding-box arithmetic in application code. Bookings also carry naturally nested,
variable-shape data — `statusHistory[]`, `partsUsed[]` — which suits documents better than join
tables.

**Why Socket.IO and not polling.** Live tracking and chat need push. Polling every 3 seconds across
many customers wastes requests and still feels laggy; a socket delivers the moment the mechanic's
phone reports a new position.

**Why one process serves both REST and sockets.** They share the JWT verification and the same
Mongoose models. Splitting them would mean duplicating auth and adding a message bus for no benefit
at this scale.

**Why Next.js for web and Expo for mobile** rather than one codebase. The web app is four
information-dense dashboards where SSR and routing matter; the phone app is two focused flows that
need GPS, background location and push. Sharing UI code would compromise both.

---

## 3. The four AI features — expect the most probing here

The honest framing, and say it before you are asked:

> These are **explainable multi-criteria decision models, not neural networks**, and that is
> deliberate. Every output can be justified in a sentence, they work from day one with no training
> data, and they run inside a single request. A learned model is the next iteration, once there are
> enough completed bookings to train on.

That answer is stronger than pretending, because the follow-up question is always *"where is your
training data?"*

### 3.1 Mechanic matching — `services/ai/mechanicMatch.js`

Weighted scoring across five signals, re-weighted for emergencies:

| Signal | Emergency | Normal |
|---|---|---|
| Distance | **0.50** | 0.32 |
| Rating | 0.20 | **0.30** |
| Availability | 0.12 | 0.10 |
| Experience | 0.10 | 0.18 |
| Workload | 0.08 | 0.10 |

**Why the weights shift:** in a breakdown, *who arrives soonest* dominates — a superb mechanic
40 minutes away is the wrong answer. For a planned service, quality matters more than speed.

Unrated mechanics are scored **3.5/5** rather than 0, so a new joiner is not permanently buried by a
cold-start penalty. Every result carries human-readable `reasons[]` such as *"Only 0.4 km away · 5
years experience · Free right now"*.

**Live evidence:** booking `RR-GXARBY` recorded `"Auto-assigned by AI match (score 0.7674)"` and
assigned in **under one second**.

### 3.2 Parts recommendation — `services/ai/partsRecommender.js`

Content-based filtering: matches parts to the customer's specific bike make and model, weighted by
what past bookings for similar vehicles consumed. Not collaborative filtering — that needs a user
base you do not have yet.

### 3.3 Predictive maintenance — `services/ai/predictiveMaintenance.js`

Dual-axis prediction over eight components: whichever of **kilometres ridden** or **months elapsed**
comes first triggers the due date, mirroring how manufacturers actually specify service intervals.
Outputs a health score and a per-component urgency list.

### 3.4 Chatbot — `services/ai/chatbot.js`

Keyword-overlap intent classification across nine intents, each with a handler that queries **live
data** — so "where is my mechanic" returns the real current ETA, not a canned string.

---

## 4. Geospatial — likely follow-up

- Coordinates are stored **GeoJSON `[longitude, latitude]`** — that order, which is the usual
  stumbling block since everyone says "lat, long" aloud.
- A **`2dsphere` index** on `User.location` makes `$near` an index scan rather than a collection
  scan, and it treats the Earth as a sphere rather than a flat plane.
- The dispatch query filters `role: mechanic`, `isBlocked: false`,
  `mechanicProfile.isAvailable: true`, and `$maxDistance: 20 km`.
- **Distance and ETA are straight-line**, computed with the haversine formula. Say this before being
  caught by it: real road routing would need OSRM or a routing API. It is honest and it is the right
  next step.

**"Why 20 km?"** Beyond that a two-wheeler mechanic is not a practical rescue. It is a constant, not a
hard-coded magic number scattered around the code.

---

## 5. Real-time — how tracking actually works

1. The mechanic's phone emits `location:update` over the socket every 4 seconds **or every 20 metres**
   of movement, whichever comes first.
2. The server recomputes distance and ETA from those coordinates to the pickup point, saves them to
   the booking, and broadcasts `booking:location` to that booking's **private room**.
3. Both parties join that room **only after the server verifies they belong to the booking** — the
   room name alone is not authorisation.

**JWT is verified on the socket handshake too**, not just on REST calls. Blocked accounts are
rejected at both entry points.

**A demo simulator** moves *seeded* mechanics so tracking animates without a second phone. It
deliberately **skips accounts with a Firebase uid** — real users. Both would otherwise write every few
seconds and fight each other, and the simulator would corrupt the real mechanic's stored location.

---

## 6. Security — know all of these

| Control | Implementation |
|---|---|
| Password storage | bcrypt, 10 salt rounds; `toSafeJSON()` strips the hash from every response |
| Sessions | JWT, 7-day expiry, verified on every REST request **and** the socket handshake |
| Authorisation | Role guards **plus** ownership checks — a valid customer token cannot read another customer's booking |
| Phone ownership | Firebase ID token signature verified server-side before an account is created |
| Payment integrity | HMAC-SHA256 signature verified against **our stored order id** |
| Billing fraud | 4-digit service-start OTP the customer reads aloud, required to move a job to `in_progress` |
| Invoice integrity | QR token that verifies the service record independently |
| Price tampering | Cart totals **always recomputed server-side**; a client-sent price is ignored |
| CORS | Pinned to the deployed frontend — verified that another origin is blocked |
| Production safety | `assertProductionConfig()` refuses to boot with a default or short JWT secret, or no `MONGODB_URI` |

**The best security answer you can give**, because it shows you understand *why* and not just *what*:

> The Razorpay signature is verified against the order id **stored on our own payment record**, never
> the one the browser sends back. A signature only proves that *some* order was paid. If we trusted a
> client-supplied order id, a valid signature from a different, cheaper order could be replayed
> against an expensive one.

**Known limitations — say them yourself before you are told.** The JWT is in `localStorage`, which
JavaScript can read; an httpOnly cookie is stricter but complicates the mobile client. There is no
rate limiting on login — `express-rate-limit` is the first thing to add. HTTPS is handled by the
platform, not the app.

---

## 7. Authentication — the DLT story

**Question:** *"How do you send OTPs? Isn't SMS in India regulated?"*

> Yes — commercial SMS to Indian numbers requires **TRAI DLT registration**: entity, header and
> template approval, which needs a registered business. A student project cannot get that. We use
> **Firebase Phone Authentication**, where **Google is the DLT-registered sender**, so the requirement
> does not fall on us.

**How the trust works, and this is the part that matters:** the phone talks to Firebase directly.
Firebase sends the SMS and checks the code, then returns a **signed ID token**. Our backend verifies
that token's signature with the service-account key. That signature is what proves the caller controls
the number — otherwise a client could simply POST any phone number it liked.

Both web and mobile use the same path, posting to `/auth/phone/register` and `/auth/phone/login`, so
one identity works on both. **Web additionally needs a reCAPTCHA verifier** — a browser has no
app-signature equivalent to prove it is not a bot — and that verifier is **single-use**, which is why
each send builds a fresh one.

An older email-OTP path still exists, but on a deployed server `DEV_MODE` is off, so no code could
ever reach a real user. That is exactly why phone auth replaced it.

---

## 8. Payments — Razorpay in test mode

**The flow, in the order it happens:**

1. `POST /payments/create` creates a Razorpay **order server-side** and stores its id on our Payment.
   Checkout cannot open without one, and it binds the payment to an amount **we** chose.
2. The browser opens Razorpay's own sheet. **Card details are entered in their iframe and never touch
   our page or our server** — which is why `checkout.js` loads from Razorpay's CDN rather than being
   bundled, and is the only third-party script in the app.
3. `POST /payments/:id/confirm` recomputes `HMAC-SHA256(order_id | payment_id)` with the secret and
   compares it **in constant time** against the returned signature. Mismatch marks the payment failed.

**Wallet and cash never reach the gateway** — the wallet is our own ledger, cash settles in person.

**Proven live:** payment `PAY-A9Y3KQT7` reached `success` with real ids `order_TR6BDZCENcEF4K` and
`pay_TR6BNfBuLT5dwk`. A forged signature was rejected with HTTP 400.

**A subtle behaviour worth volunteering:** a *declined* payment stays **pending**, not failed. No
signature comes back, so nothing is confirmed and the customer can retry. Only a **tampered** signature
marks it failed. Those are genuinely different situations and the code distinguishes them.

**If asked why test mode:** live mode requires KYC and per-method bank onboarding — roughly ten
working days. Nothing in the code differs between test and live; only the API keys.

---

## 9. Deployment decisions

**"Why Render for the backend and not Vercel, when the web app is on Vercel?"** — a very likely question.

> Vercel and Netlify are **serverless**. A serverless function cannot hold a persistent WebSocket, so
> live tracking and chat — the two headline features — would not work. Render runs a real long-lived
> Node process. The Next.js frontend has no such constraint, so it sits on Vercel where it belongs.

**"Why Atlas and not the embedded database in production?"** Hosted platforms wipe local disk on every
restart and redeploy. Every booking and account would vanish. The embedded MongoDB exists so the
project runs on a laptop with nothing installed.

**Trade-off to acknowledge:** the free tier sleeps after 15 minutes and takes ~50 seconds to wake.
Fly.io's free allowance does not force a sleep.

---

## 10. War stories — real bugs, and what they teach

Examiners rate debugging insight highly. Each of these is true and diagnosable.

**Silent data loss on seeding.** The embedded MongoDB was killed before it checkpointed, so the last
writes vanished — the seed reported success while data was missing. Fixed with an `fsync` before
shutdown. *Lesson: "the process exited cleanly" is not the same as "the data is on disk".*

**A deployment that looked fine and was broken.** The live site called `localhost:5000`.
`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, and the variable had been
marked **Sensitive** — a flag that withholds it from anything the browser can read, which is exactly
what inlining is. *Lesson: a security flag applied to the wrong kind of value fails silently.*

**Accounts created but unusable.** Web signup created the account, then sent users to an OTP screen no
code could reach, because `DEV_MODE` is off in production. Login then returned 403 for unverified
accounts. *Lesson: the failure was at a seam between two components that were each individually
correct.*

**A config that produced a dead end.** Restricting Razorpay's sheet to UPI produced "No appropriate
payment method found" — UPI was disabled on the account, so the sheet resolved to nothing. *Lesson:
prefer degrading to a default over enforcing a preference that can be empty.*

**A race disguised as an override.** The simulator claimed a real device would "simply override" it.
Both wrote every few seconds — that is a race, not an override, and it corrupted the real mechanic's
stored position. *Lesson: comments describe intent; only the code describes behaviour.*

---

## 11. Rapid-fire answers

**"Is this really AI?"** → §3, opening paragraph. Explainable weighted scoring, no training data
needed, every output justified in words.

**"What if no mechanic accepts?"** → Auto-assigned to the highest scorer; a decline reassigns to the
next best; if nobody is in range the booking stays `pending`, surfaces in the admin's unassigned
filter, and an admin can assign manually using the same ranking.

**"How do you stop a mechanic billing for work never done?"** → Two gates: the customer's 4-digit
start OTP, and the QR token on the completed record.

**"How is a customer stopped from reading someone else's booking?"** → Role guard *and* ownership
check. The role alone is not enough — that distinction is the point.

**"What is your test coverage?"** → A 59-check end-to-end regression covering auth, RBAC, the booking
lifecycle, all four AI features, the store and both dashboards. Be honest about two things: these are
integration checks rather than unit tests, and **the full 59 pass against a seeded database**. Run
against production, the checks that sign in as the seeded customer and mechanic fail by design —
those accounts were deleted so that side of the app runs on real phone-verified signups. Knowing
*why* your own suite fails in one environment is a better answer than claiming it always passes.

**"How many users can it handle?"** → Free tier: 512 MB RAM, shared CPU — fine for a demo, not for
real traffic. The architecture scales by moving Socket.IO to a Redis adapter and running multiple
instances behind a load balancer; MongoDB Atlas scales separately.

**"What would you improve with more time?"** → Rate limiting on auth, httpOnly refresh tokens, real
road routing via OSRM instead of straight-line ETA, a learned ranking model trained on completed
bookings, and unit tests alongside the integration suite.

---

## 12. Before you walk in

- [ ] Open <https://riderescue-api.onrender.com/api/health> **a minute early** to wake the API
- [ ] Web app loaded and logged in on one screen
- [ ] Both phones charged, on the same network, location permission granted
- [ ] Know your two demo paths: **SOS → auto-assign → live track → OTP start → complete → pay**, and
      **store → cart → Razorpay checkout → invoice**
- [ ] For payment, use **Netbanking** in the Razorpay sheet — it serves a mock bank page with Success
      and Failure buttons, so there is nothing to type and nothing to be rejected
- [ ] Have `README.md` open at the architecture diagram
- [ ] Be ready to say what you would do differently — it is almost always asked, and having a real
      answer is worth more than a flawless demo
