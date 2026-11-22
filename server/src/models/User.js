import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

export const ROLES = ['customer', 'driver', 'admin'];
const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    isActive: { type: Boolean, default: true },
    // One entry per signed-in device/browser (FR-3/4). Refresh tokens are stored hashed and rotated;
    // the previous hash is accepted briefly so parallel tabs refreshing together don't trip reuse detection.
    sessions: {
      type: [
        new mongoose.Schema(
          {
            sid: { type: String, required: true },
            tokenHash: { type: String, required: true },
            prevTokenHash: String,
            rotatedAt: Date,
            createdAt: { type: Date, default: Date.now },
            lastUsedAt: { type: Date, default: Date.now },
            userAgent: String,
          },
          { _id: false },
        ),
      ],
      default: [],
      select: false,
    },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
  },
  { timestamps: true },
);

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
