import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const vehicleSchema = new mongoose.Schema(
  {
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: Number,
    registrationNumber: { type: String, required: true },
    fuelType: { type: String, enum: ['Petrol', 'Electric'], default: 'Petrol' },
    odometerKm: { type: Number, default: 0 },
    lastServiceDate: Date,
    lastServiceOdometerKm: { type: Number, default: 0 },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Mechanic-only profile data. Kept on the user document so a single
// geo query can filter by role, availability and distance in one hop.
const mechanicProfileSchema = new mongoose.Schema(
  {
    experienceYears: { type: Number, default: 0 },
    specialisations: [String],
    idProofNumber: String,
    drivingLicenceNumber: String,
    documentsVerified: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    serviceRadiusKm: { type: Number, default: 15 },
    hourlyRate: { type: Number, default: 250 },
  },
  { _id: false }
);

const vendorProfileSchema = new mongoose.Schema(
  {
    shopName: String,
    gstNumber: String,
    address: String,
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['customer', 'mechanic', 'vendor', 'admin'],
      required: true,
      index: true,
    },
    avatarColor: { type: String, default: '#2563eb' },
    isVerified: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    preferredLanguage: { type: String, default: 'en' },
    emergencyContact: {
      name: String,
      phone: String,
    },
    // GeoJSON point: [longitude, latitude]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [78.4867, 17.385] }, // Hyderabad
      updatedAt: Date,
      address: String,
    },
    vehicles: [vehicleSchema],
    mechanicProfile: mechanicProfileSchema,
    vendorProfile: vendorProfileSchema,
    walletBalance: { type: Number, default: 0 },
    referralCode: { type: String, index: true },
    referredBy: String,
    favouriteMechanics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

userSchema.index({ location: '2dsphere' });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ versionKey: false });
  delete obj.passwordHash;
  return obj;
};

export const User = mongoose.model('User', userSchema);
