import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { sha256 } from '../utils/tokens.js';

export const MAX_WRONG_TRIES = 5;

/**
 * FR-28: 4-digit delivery code. Derived from a server secret + shipment + version, so the
 * customer's app can always show it, while the database only keeps a hash for verification.
 */
export function deliveryOtp(shipmentId, version) {
  const mac = createHmac('sha256', env.OTP_SECRET).update(`${shipmentId}:${version}`).digest();
  return String(mac.readUInt32BE(0) % 10000).padStart(4, '0');
}

export const hashOtp = (shipmentId, otp) => sha256(`${shipmentId}:${otp}`);

/** Issues a fresh OTP on the shipment (call before saving). Returns the plain code. */
export function issueOtp(shipment) {
  shipment.otpVersion = (shipment.otpVersion ?? 0) + 1;
  shipment.otpWrongTries = 0;
  const otp = deliveryOtp(shipment._id.toString(), shipment.otpVersion);
  shipment.deliveryOtpHash = hashOtp(shipment._id.toString(), otp);
  return otp;
}

export function otpMatches(shipment, otp) {
  if (!shipment.deliveryOtpHash || !/^\d{4}$/.test(otp ?? '')) return false;
  const a = Buffer.from(hashOtp(shipment._id.toString(), otp), 'hex');
  const b = Buffer.from(shipment.deliveryOtpHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The current code, for the shipment's owner only. */
export const currentOtp = (shipment) => (shipment.otpVersion ? deliveryOtp(shipment._id.toString(), shipment.otpVersion) : null);
