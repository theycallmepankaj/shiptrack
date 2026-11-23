import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { passwordResetEmail, sendEmail } from '../services/email.js';
import {
  MAX_SESSIONS,
  REFRESH_COOKIE,
  randomToken,
  refreshCookieOptions,
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';

const RESET_TTL_MS = 30 * 60 * 1000;
const ROTATION_GRACE_MS = 30 * 1000;
const { maxAge: _ignored, ...clearCookieOptions } = refreshCookieOptions;

/** FR-3: a new signed-in session (one per device/browser), with its refresh token in an httpOnly cookie. */
async function startSession(req, res, user) {
  const sid = randomToken(12);
  const refreshToken = signRefreshToken(user, sid);
  const now = new Date();
  const session = { sid, tokenHash: sha256(refreshToken), createdAt: now, lastUsedAt: now, userAgent: req.get('user-agent')?.slice(0, 200) };
  // Atomic push, keeping only the newest MAX_SESSIONS sign-ins.
  await User.updateOne({ _id: user._id }, { $push: { sessions: { $each: [session], $slice: -MAX_SESSIONS } } });
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  return { accessToken: signAccessToken(user, sid), user: user.toPublic() };
}

const endSession = (userId, sid) => sid && User.updateOne({ _id: userId }, { $pull: { sessions: { sid } } });

// FR-1: public sign-up is customers only (FR-2: drivers/admins are created by an admin).
export async function register(req, res) {
  const { name, email, phone, password } = req.body;
  if (await User.exists({ email })) throw ApiError.badRequest('An account with this email already exists', { email: ['Email already registered'] });
  const user = new User({ name, email, phone, role: 'customer' });
  await user.setPassword(password);
  await user.save();
  res.status(201).json(await startSession(req, res, user));
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password, to avoid account enumeration.
  if (!user || !(await user.verifyPassword(password))) throw ApiError.unauthorized('Incorrect email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  res.json(await startSession(req, res, user));
}

export async function refresh(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No refresh token');
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions);
    throw ApiError.unauthorized('Session expired, please log in again');
  }
  const { sub, sid } = payload;
  const user = await User.findById(sub).select('+sessions');
  const session = sid && user?.sessions.find((x) => x.sid === sid);
  const hash = sha256(token);
  const fail = async (revoke) => {
    if (revoke) await endSession(sub, sid); // a stolen/replayed token ends that device's session
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions);
    throw ApiError.unauthorized('Session expired, please log in again');
  };
  if (!user?.isActive || !session) return fail(false);

  // FR-4: rotate atomically — only one of two racing refreshes wins.
  const next = signRefreshToken(user, sid);
  const now = new Date();
  const rotated = await User.updateOne(
    { _id: sub, sessions: { $elemMatch: { sid, tokenHash: hash } } },
    { $set: { 'sessions.$.prevTokenHash': hash, 'sessions.$.tokenHash': sha256(next), 'sessions.$.rotatedAt': now, 'sessions.$.lastUsedAt': now } },
  );
  if (rotated.modifiedCount === 1) {
    res.cookie(REFRESH_COOKIE, next, refreshCookieOptions);
    return res.json({ accessToken: signAccessToken(user, sid), user: user.toPublic() });
  }
  // Another tab rotated this token a moment ago: hand out an access token, keep the newer cookie.
  const fresh = (await User.findById(sub).select('+sessions'))?.sessions.find((x) => x.sid === sid);
  if (fresh?.prevTokenHash === hash && Date.now() - fresh.rotatedAt?.getTime() < ROTATION_GRACE_MS) {
    return res.json({ accessToken: signAccessToken(user, sid), user: user.toPublic() });
  }
  // A valid-but-superseded token: it was reused after rotation.
  return fail(true);
}

// Signs out this device only; other sessions stay signed in.
export async function logout(req, res) {
  let sid = req.user.sid;
  if (!sid) {
    try {
      sid = verifyRefreshToken(req.cookies?.[REFRESH_COOKIE] ?? '').sid;
    } catch {
      /* no usable cookie */
    }
  }
  await endSession(req.user.id, sid);
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions);
  res.status(204).end();
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user || !user.isActive) throw ApiError.unauthorized();
  res.json({ user: user.toPublic() });
}

// FR-8: always 200 so the response doesn't reveal whether the email exists.
export async function forgotPassword(req, res) {
  const user = await User.findOne({ email: req.body.email, isActive: true });
  if (user) {
    const token = randomToken();
    user.passwordResetTokenHash = sha256(token);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TTL_MS);
    await user.save();
    const link = `${env.CLIENT_URL.split(',')[0]}/reset-password/${token}`;
    await sendEmail({ to: user.email, ...passwordResetEmail(user.name, link) });
  }
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
}

export async function resetPassword(req, res) {
  const user = await User.findOne({
    passwordResetTokenHash: sha256(req.params.token),
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');
  await user.setPassword(req.body.password);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.sessions = []; // sign out every device
  await user.save();
  res.json({ message: 'Password updated. You can now log in.' });
}

// PATCH /api/auth/me — edit your own name and phone.
export async function updateMe(req, res) {
  const user = await User.findById(req.user.id);
  if (!user || !user.isActive) throw ApiError.unauthorized();
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  await user.save();
  res.json({ user: user.toPublic() });
}

// POST /api/auth/change-password — needs the current password; signs out every other device.
export async function changePassword(req, res) {
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user || !user.isActive) throw ApiError.unauthorized();
  if (!(await user.verifyPassword(req.body.currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect', { currentPassword: ['Incorrect password'] });
  }
  await user.setPassword(req.body.newPassword);
  await user.save();
  await User.updateOne({ _id: user._id }, { $pull: { sessions: { sid: { $ne: req.user.sid ?? null } } } });
  res.json({ message: 'Password changed. Other devices have been signed out.' });
}
