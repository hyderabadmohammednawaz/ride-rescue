import express from 'express';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';
import { env } from '../config/env.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { numericCode, referralCode } from '../utils/ids.js';
import { normalisePhone, phoneAuthConfigured, verifyPhoneToken } from '../services/firebaseAdmin.js';

const router = express.Router();

const OTP_TTL_MINUTES = 10;

/**
 * Builds an unsaved User from a registration payload. Shared by the email-OTP
 * and the Firebase phone-auth signup paths so the two cannot drift apart.
 */
function buildUser({ name, email, phone, role, extra }) {
  const user = new User({
    name,
    email: email.toLowerCase(),
    phone,
    role,
    referralCode: referralCode(name),
    referredBy: extra.referredBy,
  });

  if (extra.location?.coordinates) {
    user.location = {
      type: 'Point',
      coordinates: extra.location.coordinates,
      address: extra.location.address,
      updatedAt: new Date(),
    };
  }

  if (role === 'mechanic') {
    user.mechanicProfile = {
      experienceYears: Number(extra.experienceYears) || 0,
      specialisations: extra.specialisations || [],
      idProofNumber: extra.idProofNumber,
      drivingLicenceNumber: extra.drivingLicenceNumber,
      documentsVerified: false,
      isAvailable: true,
    };
  }
  if (role === 'vendor') {
    user.vendorProfile = {
      shopName: extra.shopName || `${name} Spares`,
      gstNumber: extra.gstNumber,
      address: extra.address,
    };
  }

  return user;
}

/** Both sides of a referral get wallet credit. */
async function applyReferral(user, code) {
  if (!code) return;
  const referrer = await User.findOne({ referralCode: code.toUpperCase() });
  if (!referrer) return;
  referrer.walletBalance += 100;
  user.walletBalance += 100;
  await Promise.all([referrer.save(), user.save()]);
}

/**
 * Creates an OTP for an identifier. In dev mode the code is returned in the
 * response and logged, standing in for an SMS gateway. Swapping in Twilio or
 * MSG91 means changing only this function.
 */
async function issueOtp(identifier, purpose) {
  await Otp.deleteMany({ identifier, purpose, consumed: false });
  const code = env.devMode ? '123456' : numericCode(6);
  await Otp.create({
    identifier,
    code,
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
  });
  console.log(`[otp] ${purpose} code for ${identifier}: ${code}`);
  return env.devMode ? code : null;
}

async function consumeOtp(identifier, purpose, code) {
  const record = await Otp.findOne({ identifier, purpose, consumed: false }).sort({ createdAt: -1 });
  if (!record) throw badRequest('No OTP was requested, or it has expired');
  if (record.expiresAt < new Date()) throw badRequest('That OTP has expired, please request a new one');
  if (record.code !== String(code)) throw badRequest('Incorrect OTP');
  record.consumed = true;
  await record.save();
}

// POST /api/auth/register
router.post(
  '/register',
  asyncRoute(async (req, res) => {
    const { name, email, phone, password, role = 'customer', ...extra } = req.body;
    if (!name || !email || !phone || !password) throw badRequest('Name, email, phone and password are required');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters');
    if (!['customer', 'mechanic', 'vendor'].includes(role)) throw badRequest('Invalid role');

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw badRequest('That email is already registered');

    const user = buildUser({ name, email, phone, role, extra });
    await user.setPassword(password);
    await user.save();
    await applyReferral(user, extra.referredBy);

    const devOtp = await issueOtp(user.email, 'register');
    res.status(201).json({
      message: 'Account created. Verify the OTP sent to you to activate it.',
      userId: user._id,
      email: user.email,
      devOtp, // null unless DEV_MODE=true
    });
  })
);

// POST /api/auth/verify-otp
router.post(
  '/verify-otp',
  asyncRoute(async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) throw badRequest('Email and OTP code are required');

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw notFound('No account with that email');

    await consumeOtp(user.email, 'register', code);
    user.isVerified = true;
    await user.save();

    res.json({ message: 'Account verified', token: signToken(user), user: user.toSafeJSON() });
  })
);

// POST /api/auth/resend-otp
router.post(
  '/resend-otp',
  asyncRoute(async (req, res) => {
    const { email, purpose = 'register' } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user) throw notFound('No account with that email');
    const devOtp = await issueOtp(user.email, purpose);
    res.json({ message: 'OTP sent', devOtp });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw badRequest('Email and password are required');

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.checkPassword(password))) throw badRequest('Incorrect email or password');
    if (user.isBlocked) throw badRequest('This account has been blocked. Contact support.');

    if (!user.isVerified) {
      const devOtp = await issueOtp(user.email, 'register');
      return res.status(403).json({ message: 'Please verify your account first', needsVerification: true, email: user.email, devOtp });
    }

    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  asyncRoute(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    // Do not reveal whether the account exists.
    if (!user) return res.json({ message: 'If that account exists, an OTP has been sent' });
    const devOtp = await issueOtp(user.email, 'reset');
    return res.json({ message: 'If that account exists, an OTP has been sent', devOtp });
  })
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  asyncRoute(async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) throw badRequest('Email, OTP and new password are required');
    if (newPassword.length < 6) throw badRequest('Password must be at least 6 characters');

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw notFound('No account with that email');

    await consumeOtp(user.email, 'reset', code);
    await user.setPassword(newPassword);
    user.isVerified = true;
    await user.save();

    res.json({ message: 'Password updated', token: signToken(user), user: user.toSafeJSON() });
  })
);

// GET /api/auth/config — lets the apps show or hide the phone sign-in option
router.get('/config', (req, res) => {
  res.json({ phoneAuth: phoneAuthConfigured(), devMode: env.devMode });
});

/**
 * POST /api/auth/email-available
 *
 * Lets the signup form catch a duplicate email before an SMS is spent on a
 * registration that would be rejected anyway. Returns only a boolean, so it
 * cannot be used to read anything about an existing account.
 */
router.post(
  '/email-available',
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) throw badRequest('Email is required');
    const taken = await User.exists({ email });
    res.json({ available: !taken });
  })
);

/**
 * POST /api/auth/phone/register
 *
 * Firebase already sent the SMS and checked the code; the app sends us the
 * resulting ID token. Verifying its signature is what proves the caller owns
 * the number, so the account is created already verified — no second OTP.
 */
router.post(
  '/phone/register',
  asyncRoute(async (req, res) => {
    const { idToken, name, email, password, role = 'customer', ...extra } = req.body;
    if (!name || !email || !password) throw badRequest('Name, email and password are required');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters');
    if (!['customer', 'mechanic', 'vendor'].includes(role)) throw badRequest('Invalid role');

    const { phone, uid } = await verifyPhoneToken(idToken).catch((err) => {
      throw badRequest(err.message);
    });
    const phoneKey = normalisePhone(phone);

    // Check both identities before writing, so a clash gives a clear message
    // rather than a duplicate-key error from Mongo.
    const [emailTaken, phoneTaken] = await Promise.all([
      User.findOne({ email: email.toLowerCase() }),
      User.findOne({ phoneKey }),
    ]);
    if (emailTaken) throw badRequest('That email is already registered');
    if (phoneTaken) throw badRequest('That mobile number is already registered. Try signing in instead.');

    const user = buildUser({ name, email, phone, role, extra });
    await user.setPassword(password);
    user.phoneKey = phoneKey;
    user.phoneVerified = true;
    user.firebaseUid = uid;
    // The number is proven, so there is nothing left to verify.
    user.isVerified = true;
    await user.save();
    await applyReferral(user, extra.referredBy);

    res.status(201).json({
      message: 'Account created',
      token: signToken(user),
      user: user.toSafeJSON(),
    });
  })
);

/**
 * POST /api/auth/phone/login — sign in with a verified number, no password.
 */
router.post(
  '/phone/login',
  asyncRoute(async (req, res) => {
    const { phone, uid } = await verifyPhoneToken(req.body.idToken).catch((err) => {
      throw badRequest(err.message);
    });
    const phoneKey = normalisePhone(phone);

    const user = await User.findOne({ $or: [{ firebaseUid: uid }, { phoneKey }] });
    if (!user) {
      return res.status(404).json({
        message: 'No account uses that mobile number yet.',
        needsRegistration: true,
        phone,
      });
    }
    if (user.isBlocked) throw badRequest('This account has been blocked. Contact support.');

    // Backfill for accounts that registered by email before phone sign-in existed.
    let changed = false;
    if (!user.firebaseUid) {
      user.firebaseUid = uid;
      changed = true;
    }
    if (!user.phoneKey) {
      user.phoneKey = phoneKey;
      changed = true;
    }
    if (!user.phoneVerified || !user.isVerified) {
      user.phoneVerified = true;
      user.isVerified = true;
      changed = true;
    }
    if (changed) await user.save();

    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json({ user: req.user.toSafeJSON() });
  })
);

export default router;
