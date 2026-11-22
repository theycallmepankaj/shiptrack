import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  { _id: false },
);

const driverSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehicle: {
      type: { type: String, enum: ['bike', 'scooter', 'van', 'truck'], default: 'bike' },
      number: { type: String, trim: true },
      capacityKg: { type: Number, default: 20 },
    },
    isOnDuty: { type: Boolean, default: false },
    currentLocation: { type: pointSchema, default: () => ({}) },
    lastLocationAt: Date,
    heading: Number, // degrees clockwise from north
    speedKmh: Number,
    rating: { type: Number, default: 5, min: 0, max: 5 },
    totalDeliveries: { type: Number, default: 0 },
  },
  { timestamps: true },
);

driverSchema.index({ currentLocation: '2dsphere' });

export const Driver = mongoose.model('Driver', driverSchema);
