import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { changePasswordSchema, forgotSchema, loginSchema, registerSchema, resetSchema, updateMeSchema } from '../validators/auth.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), h(auth.register));
router.post('/login', authLimiter, validate(loginSchema), h(auth.login));
router.post('/refresh', h(auth.refresh));
router.post('/logout', requireAuth, h(auth.logout));
router.post('/forgot-password', authLimiter, validate(forgotSchema), h(auth.forgotPassword));
router.post('/reset-password/:token', authLimiter, validate(resetSchema), h(auth.resetPassword));
router.get('/me', requireAuth, h(auth.me));
router.patch('/me', requireAuth, validate(updateMeSchema), h(auth.updateMe));
router.post('/change-password', requireAuth, authLimiter, validate(changePasswordSchema), h(auth.changePassword));

export default router;
