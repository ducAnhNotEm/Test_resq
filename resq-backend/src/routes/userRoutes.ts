import { Router } from 'express';
import { getMe, updateMe, updatePushToken } from '../controllers/userController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);
router.get('/me', getMe);
router.patch('/me', updateMe);
router.put('/me/push-token', updatePushToken);

export default router;
