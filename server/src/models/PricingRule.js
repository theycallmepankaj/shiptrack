import mongoose from 'mongoose';

const pricingRuleSchema = new mongoose.Schema(
  {
    baseFare: { type: Number, required: true, min: 0 },
    perKm: { type: Number, required: true, min: 0 },
    perKg: { type: Number, required: true, min: 0 },
    expressMultiplier: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const PricingRule = mongoose.model('PricingRule', pricingRuleSchema);
