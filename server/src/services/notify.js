import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { sendEmail, statusEmail } from './email.js';
import { currentOtp } from './otp.js';
import { notifyStatusInApp } from './notifications.js';

/** Fire-and-forget: in-app notifications (FR-37) + customer email for key status changes (FR-17/38). Never throws. */
export function notifyStatusChange(shipment, status, note, opts = {}) {
  notifyStatusInApp(shipment, status, note, opts).catch((err) => logger.error('Status notification failed:', err.message));
  (async () => {
    const user = await User.findById(shipment.customerId);
    if (!user) return;
    const trackUrl = `${env.CLIENT_URL.split(',')[0]}/track/${shipment.trackingId}`;
    const otp = status === 'OUT_FOR_DELIVERY' ? currentOtp(shipment) : undefined;
    const mail = statusEmail(user.name, shipment, status, { otp, trackUrl, note });
    if (mail) await sendEmail({ to: user.email, ...mail });
  })().catch((err) => logger.error('Status email failed:', err.message));
}
