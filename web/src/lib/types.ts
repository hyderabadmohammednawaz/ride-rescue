export type Role = 'customer' | 'mechanic' | 'vendor' | 'admin';

export interface Vehicle {
  _id: string;
  make: string;
  model: string;
  year?: number;
  registrationNumber: string;
  fuelType?: string;
  odometerKm?: number;
  lastServiceDate?: string;
  lastServiceOdometerKm?: number;
  isPrimary?: boolean;
}

export interface GeoPoint {
  type?: 'Point';
  coordinates: [number, number];
  address?: string;
  updatedAt?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  avatarColor?: string;
  isVerified: boolean;
  isBlocked: boolean;
  preferredLanguage?: string;
  emergencyContact?: { name?: string; phone?: string };
  location: GeoPoint;
  vehicles: Vehicle[];
  walletBalance: number;
  referralCode?: string;
  favouriteMechanics?: string[];
  mechanicProfile?: {
    experienceYears: number;
    specialisations: string[];
    documentsVerified: boolean;
    isAvailable: boolean;
    ratingAverage: number;
    ratingCount: number;
    completedJobs: number;
    serviceRadiusKm: number;
    hourlyRate: number;
  };
  vendorProfile?: { shopName?: string; gstNumber?: string; address?: string };
  createdAt?: string;
}

export type BookingStatus = 'pending' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export interface ServiceType {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  basePrice: number;
  estimatedMinutes: number;
  icon: string;
  isEmergency?: boolean;
}

export interface Booking {
  _id: string;
  reference: string;
  customer: User;
  mechanic?: User | null;
  serviceType?: ServiceType;
  vehicle: { make: string; model: string; registrationNumber: string };
  kind: 'sos' | 'instant' | 'scheduled';
  status: BookingStatus;
  statusHistory: { status: BookingStatus; at: string; note?: string }[];
  description?: string;
  scheduledFor?: string;
  pickupLocation: GeoPoint;
  mechanicLocation?: GeoPoint;
  etaMinutes?: number;
  distanceKm?: number;
  distanceFromMeKm?: number;
  etaFromMeMinutes?: number;
  recommendation?: { score: number; reasons: string[]; consideredCount: number };
  charges: { labour: number; parts: number; visitFee: number; discount: number; total: number };
  partsUsed: { part?: string; name: string; quantity: number; price: number }[];
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  otpCode?: string;
  qrToken?: string;
  rated?: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface SparePart {
  _id: string;
  name: string;
  brand?: string;
  sku: string;
  category: string;
  description?: string;
  price: number;
  mrp?: number;
  stock: number;
  lowStockThreshold: number;
  compatibleModels: string[];
  vendor: any;
  warrantyMonths: number;
  image?: string;
  ratingAverage: number;
  ratingCount: number;
  unitsSold: number;
  active: boolean;
  matchScore?: number;
  reasons?: string[];
}

export interface Order {
  _id: string;
  reference: string;
  customer: any;
  items: { part: any; vendor: string; name: string; sku: string; price: number; quantity: number; warrantyMonths: number }[];
  status: 'placed' | 'accepted' | 'dispatched' | 'delivered' | 'cancelled';
  statusHistory: { status: string; at: string; note?: string }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode?: string;
  total: number;
  vendorSubtotal?: number;
  deliveryAddress: string;
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  trackingNote?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface NotificationItem {
  _id: string;
  title: string;
  body?: string;
  type: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface NearbyMechanic {
  _id: string;
  name: string;
  phone: string;
  avatarColor?: string;
  coordinates: [number, number];
  experienceYears: number;
  specialisations: string[];
  rating: number;
  ratingCount: number;
  hourlyRate: number;
  distanceKm: number;
  etaMinutes: number;
  activeJobs: number;
  matchScore: number;
  reasons: string[];
  breakdown: Record<string, number>;
  isFavourite: boolean;
}

export interface MaintenancePrediction {
  key: string;
  label: string;
  icon: string;
  estimatedCost: number;
  wearPercent: number;
  urgency: 'ok' | 'due_soon' | 'due_now' | 'overdue';
  daysRemaining: number;
  dueDate: string;
  kmRemaining: number;
  reason: string;
}

export interface ChatMessage {
  _id: string;
  booking: string;
  sender: any;
  senderName?: string;
  senderRole: 'customer' | 'mechanic';
  text: string;
  createdAt: string;
}
