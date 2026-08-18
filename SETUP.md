# Setting up RideRescue on another machine

Everything needed to go from a bare laptop to a running project.

> **The one thing that catches everyone:** `git clone` gives you the code but **not** the secrets.
> Five files on the old machine are deliberately gitignored and must be copied across by hand. They
> are listed in [Step 2](#step-2--copy-the-five-files-git-will-not-bring). Skip that step and the
> backend refuses to start, the phone app cannot sign anyone in, and the web app calls `localhost`.

---

## What you need installed

| Tool | Version | Needed for | Notes |
|---|---|---|---|
| **Node.js** | 18.18 or newer | everything | Developed on 24.11.1. `node -v` to check. |
| **Git** | any | cloning | |
| **JDK 17** | exactly 17 | building the Android APK **only** | See the warning below. |
| **Android SDK** | platform-tools + API 34 | building/installing the APK **only** | Comes with Android Studio. |

You only need the bottom two rows if you intend to rebuild the phone app. The backend and the web
app need nothing beyond Node.

> **JDK 17 is not negotiable for the APK.** React Native 0.76 uses Android Gradle Plugin 8.6, which
> *rejects* both the JDK 11 that ships inside Android Studio and newer JDKs such as 21 or 25. On the
> old machine it lives at `C:\Users\Nawaz\.jdks\temurin-17.0.20`, installed from the **portable ZIP** —
> the winget MSI needs elevation and fails with exit 1602 without it.

---

## Step 1 — Clone the repository

The repo is **private**, so you must be signed in as `hyderabadmohammednawaz`:

```bash
git clone https://github.com/hyderabadmohammednawaz/ride-rescue.git
```

If it prompts endlessly, sign in once with the GitHub CLI (`gh auth login`) or use a personal access
token as the password.

Then set your commit identity. Use the GitHub noreply form — a commit authored as something GitHub
cannot match to a user (`nawaz@local`, for instance) is **rejected by Vercel's Hobby plan** and the
deploy silently never happens:

```bash
git config user.name "hyderabadmohammednawaz"
git config user.email "255927115+hyderabadmohammednawaz@users.noreply.github.com"
```

---

## Step 2 — Copy the five files git will not bring

Copy these from the old machine to the same paths on the new one. They are gitignored on purpose:
three are secrets, and one is tied to a specific Firebase project.

| File | What it is | If it is missing |
|---|---|---|
| `backend/.env` | DB URI, JWT secret, Razorpay keys | Backend runs on embedded Mongo with a dev JWT secret; payments fall back to mock |
| `web/.env.local` | `NEXT_PUBLIC_API_URL` | Web app calls `http://localhost:5000` |
| `mobile/.env` | `EXPO_PUBLIC_API_URL` | Phone app cannot reach the API |
| `mobile/google-services.json` | Firebase **client** config | Phone app crashes on launch or cannot send OTPs |
| `mobile/riderescue-94e68-firebase-adminsdk.json` | Firebase **service-account key** — a real secret | Only needed if you point the backend at it locally; production reads it from Render |

**Do not** copy `backend/data/` (the embedded MongoDB files) or any `node_modules/`. Both are
regenerated locally, and `backend/data/` is tied to the machine that created it.

Each `.env` has a committed `.env.example` next to it listing every key with comments, so you can
also rebuild them by hand rather than copying.

### Regenerating them instead of copying

- **`google-services.json`** — Firebase Console → project `riderescue-94e68` → Project settings →
  Your apps → Android app `in.riderescue.app` → *Download google-services.json*.
- **Service-account key** — Firebase Console → Project settings → **Service accounts** →
  *Generate new private key*. Treat the download like a password.
- **`.env` files** — copy the matching `.env.example` and fill in the values.

---

## Step 3 — Backend

```bash
cd backend
npm install
npm run seed     # only against the local embedded database — see the warning
npm start
```

Runs on <http://localhost:5000>. Check <http://localhost:5000/api/health>.

With no `MONGODB_URI` set, the backend starts its **own MongoDB** (`mongodb-memory-server`) writing to
`backend/data/mongo` — nothing to install.

> ### Never run `npm run seed` against MongoDB Atlas
>
> The seed script calls `deleteMany({})` on **every collection, including users**. Pointed at
> production it would erase the real phone-verified accounts and their bookings. It is safe only
> against the local embedded database. There is no undo.

**Two operational quirks worth knowing:**

- The embedded MongoDB is a **separate OS process** (`mongod-x64-win32-*.exe`). It only exits cleanly
  on SIGTERM — force-killing Node orphans it and locks the data directory, and the next start fails
  with `DBPathInUse`. If that happens, kill the stray `mongod` process and retry.
- **Only one process may own `backend/data/mongo` at a time.** Stop the server before seeding.

---

## Step 4 — Web app

```bash
cd web
npm install
npm run dev
```

Runs on <http://localhost:3000>.

`web/.env.local` decides which API it talks to. Point it at `http://localhost:5000` for fully local
work, or at `https://riderescue-api.onrender.com` to run the UI locally against live data.

---

## Step 5 — Mobile app (only if you need the APK)

```bash
cd mobile
npm install
```

Then from the repo root, using the wrapper that sets `JAVA_HOME` and `ANDROID_HOME` for you:

```bash
E:\claude\rr.bat prebuild
E:\claude\rr.bat apk
E:\claude\rr.bat install
```

Copy `rr.bat` across too and edit the two paths inside it to match the new machine.

**Three traps, all previously hit:**

1. **`expo prebuild --clean` rewrites `gradle-wrapper.properties`.** Gradle's wrapper has a 10-second
   download timeout that fails on a slow connection, so the file was pointed at a pre-downloaded
   `file:///` copy of gradle-8.10.2-all.zip. **Re-apply that local path after every prebuild**, or the
   build tries to download Gradle again and times out.
2. **Never leave a shell's working directory inside `mobile/android`.** Windows locks the folder and
   `prebuild --clean` fails with `EBUSY`.
3. **The API URL is baked in at build time** from `mobile/.env`. Changing it needs a rebuild, not just
   a restart.

Release APKs are signed with Expo's **debug keystore**, so `adb install -r` works without any signing
setup.

---

## Step 6 — Check it actually works

From `backend/`, against a running server:

```bash
npm test
```

That is a **59-check end-to-end regression** covering auth, role-based access control, the booking
lifecycle, all four AI features, the store, and both dashboards. All 59 should pass.

To run it against production instead:

```bash
API_BASE=https://riderescue-api.onrender.com npm test
```

---

## The live deployment

Nothing needs redeploying after moving machines — it all runs from GitHub.

| Piece | Where | URL |
|---|---|---|
| Web app | Vercel, root directory `web` | <https://ride-rescue-57l9.vercel.app> |
| API | Render free tier | <https://riderescue-api.onrender.com> |
| Database | MongoDB Atlas, AWS Mumbai | cluster `Cluster0` |
| Auth / OTP | Firebase project `riderescue-94e68` | |
| Payments | Razorpay **test mode** | |

Pushing to `main` auto-deploys both Vercel and Render.

> **Render's free tier sleeps after 15 minutes idle**, and the next request takes about **50 seconds**
> to wake it. Open the health URL a minute before demoing, or it will look broken while an examiner
> watches.

Production secrets live in the Render dashboard, not in the repo. Note that the service is
**Blueprint managed**: a variable added only in the dashboard and *not* declared in `render.yaml`
will appear in the UI but never reach the running process.

---

## If something is wrong

| Symptom | Cause |
|---|---|
| `EADDRINUSE: port 5000` | An older backend is still running. Kill it. |
| `DBPathInUse` | Orphaned `mongod` process. Kill it and restart. |
| Web app calls `localhost` in production | `NEXT_PUBLIC_API_URL` missing, or saved as **Sensitive** on Vercel — sensitive values are withheld from the client bundle, and `NEXT_PUBLIC_*` must be inlined into it. |
| Phone OTP fails with `invalid-app-credential` | The site's domain is not in Firebase → Authentication → Settings → Authorized domains. |
| Payments settle as `mock` when keys are set | The keys are not declared in `render.yaml`. See the Blueprint note above. |
| `0 mechanics near you` | Correct behaviour if you are more than ~20 km from the seeded data. Re-seed with `SEED_LAT` / `SEED_LNG`. |
