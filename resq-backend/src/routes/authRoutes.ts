import { Router } from 'express';
import { logout, requestOtp, socialLogin, verifyOtp } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/social-login', socialLogin);
router.post('/logout', requireAuth, logout);

export default router;
