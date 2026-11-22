import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const STATUSES = [
  'BOOKED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY',
  'DELIVERED', 'FAILED_ATTEMPT', 'RETURNED', 'CANCELLED',
];
export const PACKAGE_TYPES = ['document', 'parcel', 'fragile'];
export const SPEEDS = ['standard', 'express'];

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false },
);

const stopSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    location: { type: pointSchema, required: true },
    contactName: { type: String, required: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    at: { type: Date, default: Date.now },
    location: pointSchema,
    by: { type: ObjectId, ref: 'User' },
    byRole: { type: String, enum: ['customer', 'driver', 'admin', 'system'] },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const shipmentSchema = new mongoose.Schema(
  {
    trackingId: { type: String, required: true, unique: true },
    customerId: { type: ObjectId, ref: 'User', required: true },
    driverId: { type: ObjectId, ref: 'User', index: true }, // the driver's User id
    pickup: { type: stopSchema, required: true },
    drop: { type: stopSchema, required: true },
    package: {
      weightKg: { type: Number, required: true, min: 0.1 },
      dimensions: { l: Number, w: Number, h: Number }, // cm
      type: { type: String, enum: PACKAGE_TYPES, required: true },
      description: { type: String, trim: true, maxlength: 200 },
    },
    speed: { type: String, enum: SPEEDS, required: true },
    price: {
      base: Number,
      distanceCharge: Number,
      weightCharge: Number,
      speedCharge: Number,
      chargeableWeightKg: Number,
      total: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
    },
    distanceKm: { type: Number, required: true },
    estimatedDeliveryAt: Date,
    promisedDeliveryAt: Date, // the estimate at booking — never changes; used for on-time % (FR-33)
    etaSource: { type: String, enum: ['model', 'formula', 'fallback'] },
    status: { type: String, enum: STATUSES, default: 'BOOKED', index: true },
    statusHistory: [historySchema],
    deliveryOtpHash: { type: String, select: false },
    otpVersion: { type: Number, default: 0 }, // bumped each time a new OTP is issued (retry after a failed attempt)
    otpWrongTries: { type: Number, default: 0 },
    deliveryAttempts: { type: Number, default: 0 },
    driverEarning: Number,
    proofOfDelivery: { photoUrl: String, signatureUrl: String, deliveredAt: Date },
    // FR-13/14: Razorpay (test mode) or the development mock. Only paid shipments can be assigned.
    payment: {
      provider: { type: String, default: 'none' },
      orderId: { type: String, index: true, sparse: true },
      paymentId: String,
      status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'], default: 'pending' },
      amount: Number, // rupees charged
      method: String, // card / upi / netbanking… as reported by the provider
      paidAt: Date,
      failureReason: String,
      refundId: String,
      refundedAt: Date,
    },
    cancelledAt: Date,
  },
  { timestamps: true },
);

shipmentSchema.index({ customerId: 1, createdAt: -1 });
shipmentSchema.index({ 'pickup.location': '2dsphere' });
shipmentSchema.index({ 'pickup.city': 1, status: 1 });
shipmentSchema.index({ createdAt: -1 });
shipmentSchema.index({ status: 1, promisedDeliveryAt: 1 });
shipmentSchema.index({ status: 1, 'payment.status': 1, createdAt: 1 }); // unpaid-booking sweep

export const Shipment = mongoose.model('Shipment', shipmentSchema);
