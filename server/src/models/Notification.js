import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = ['status', 'assignment', 'payment', 'support', 'system'];

/** FR-37/39: in-app notifications, pushed live and stored with read/unread state. */
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 500 },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', default: null },
    link: { type: String, default: null }, // client route to open
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86_400 }); // keep 90 days

export const Notification = mongoose.model('Notification', notificationSchema);
