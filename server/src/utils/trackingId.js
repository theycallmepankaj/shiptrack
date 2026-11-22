import { randomInt } from 'node:crypto';

// No 0/O/1/I/L so IDs are easy to read out over the phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** FR-13: e.g. SHP-7X4K2P */
export function generateTrackingId() {
  let id = '';
  for (let i = 0; i < 6; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return `SHP-${id}`;
}

export const TRACKING_ID_RE = /^SHP-[A-Z0-9]{6}$/;
