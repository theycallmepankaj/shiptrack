// Client-side mirror of the server's Zod rules, for instant feedback. The server stays authoritative.
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function passwordIssues(pw) {
  const issues = [];
  if (pw.length < 8) issues.push('At least 8 characters');
  if (!/[A-Za-z]/.test(pw)) issues.push('Include a letter');
  if (!/[0-9]/.test(pw)) issues.push('Include a number');
  return issues;
}

/** 0–4 strength score for the meter. */
export function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
