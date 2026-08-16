import express from 'express';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';
import { env } from '../config/env.js';
import { asyncRoute, badRequest, notFound } from '../middleware/errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { numericCode, referralCode } from '../utils/ids.js';

const router = express.Router();

const OTP_TTL_MINUTES = 10;

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

    const user = new User({
      name,
      email: email.toLowerCase(),
      phone,
      role,
      referralCode: referralCode(name),
      referredBy: extra.referredBy,
    });
    await user.setPassword(password);

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

    await user.save();

    // Referral reward: both sides get wallet credit.
    if (extra.referredBy) {
      const referrer = await User.findOne({ referralCode: extra.referredBy.toUpperCase() });
      if (referrer) {
        referrer.walletBalance += 100;
        user.walletBalance += 100;
        await Promise.all([referrer.save(), user.save()]);
      }
    }

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

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json({ user: req.user.toSafeJSON() });
  })
);

export default router;
