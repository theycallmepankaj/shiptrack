import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transporter;
function getTransporter() {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Sends an email; without SMTP configured it logs the message instead (handy in development). */
export async function sendEmail({ to, subject, html, text, attachments }) {
  const t = getTransporter();
  if (!t) {
    if (env.NODE_ENV !== 'test') logger.info(`[email:dev] to=${to} subject="${subject}"${attachments?.length ? ` attachments=${attachments.map((a) => a.filename).join(',')}` : ''}\n${text ?? html}`);
    return { delivered: false };
  }
  await t.sendMail({ from: env.MAIL_FROM, to, subject, html, text, attachments });
  return { delivered: true };
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function passwordResetEmail(rawName, link) {
  const name = escapeHtml(rawName);
  return {
    subject: 'Reset your ShipTrack password',
    text: `Hi ${name},\n\nReset your password using this link (valid for 30 minutes):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#0B1220">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p>Hi ${name}, click the button below to choose a new password. The link is valid for 30 minutes.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#FF6B2C;color:#0B1220;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p>
      <p style="color:#64748B;font-size:13px">If you didn't request this, you can ignore this email.</p></div>`,
  };
}

export function bookingConfirmationEmail(rawName, shipment, trackUrl) {
  const name = escapeHtml(rawName);
  const eta = shipment.estimatedDeliveryAt
    ? new Date(shipment.estimatedDeliveryAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
    : '—';
  const from = escapeHtml(shipment.pickup.city || shipment.pickup.address);
  const to = escapeHtml(shipment.drop.city || shipment.drop.address);
  return {
    subject: `Booking confirmed — ${shipment.trackingId}`,
    text: `Hi ${rawName},\n\nPayment received — your shipment is booked. Your invoice is attached.\nTracking ID: ${shipment.trackingId}\nFrom ${shipment.pickup.city} to ${shipment.drop.city}\nTotal: ₹${shipment.price.total}\nEstimated delivery: ${eta}\n\nTrack it live: ${trackUrl}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0B1220">
      <h2 style="margin:0 0 8px">Your shipment is booked</h2>
      <p>Hi ${name}, we’ve received your payment — thanks for shipping with ShipTrack. Your invoice is attached.</p>
      <div style="border:1px solid #E5E7EB;border-radius:14px;padding:16px;margin:20px 0">
        <p style="margin:0;color:#64748B;font-size:13px">Tracking ID</p>
        <p style="margin:4px 0 12px;font:700 22px 'JetBrains Mono',monospace">${shipment.trackingId}</p>
        <p style="margin:0">${from} → ${to}</p>
        <p style="margin:4px 0 0;color:#64748B">Total ₹${shipment.price.total} · Estimated delivery ${eta}</p>
      </div>
      <p><a href="${trackUrl}" style="background:#FF6B2C;color:#0B1220;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Track your parcel</a></p></div>`,
  };
}

const STATUS_COPY = {
  PICKED_UP: { subject: 'Your parcel has been picked up', line: 'Your parcel is with our driver and on its way.' },
  OUT_FOR_DELIVERY: { subject: 'Out for delivery today', line: 'Your parcel is out for delivery. Share this code with the driver at handover:' },
  DELIVERED: { subject: 'Delivered', line: 'Your parcel has been delivered. Thanks for shipping with ShipTrack!' },
  FAILED_ATTEMPT: { subject: 'Delivery attempt unsuccessful', line: 'We couldn’t deliver your parcel this time. We’ll try again or contact you.' },
};

/** FR-17/38: emails for key status changes. Returns null for statuses that don't email. */
export function statusEmail(rawName, shipment, status, { otp, trackUrl, note } = {}) {
  const copy = STATUS_COPY[status];
  if (!copy) return null;
  const name = escapeHtml(rawName);
  return {
    subject: `${copy.subject} — ${shipment.trackingId}`,
    text: `Hi ${rawName},\n\n${copy.line}${otp ? ` ${otp}` : ''}${note ? `\nNote: ${note}` : ''}\n\nTrack: ${trackUrl}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0B1220">
      <h2 style="margin:0 0 8px">${escapeHtml(copy.subject)}</h2>
      <p>Hi ${name}, ${escapeHtml(copy.line)}</p>
      ${otp ? `<p style="font:700 34px 'JetBrains Mono',monospace;letter-spacing:12px;margin:16px 0">${otp}</p>` : ''}
      ${note ? `<p style="color:#64748B">Note: ${escapeHtml(note)}</p>` : ''}
      <p style="color:#64748B;font-size:13px">Tracking ID ${shipment.trackingId}</p>
      <p><a href="${trackUrl}" style="background:#FF6B2C;color:#0B1220;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Track your parcel</a></p></div>`,
  };
}
