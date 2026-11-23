import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { db } from '../prisma';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionVersion: number };
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập' });

  let claims: ReturnType<typeof verifyAccessToken>;
  try {
    claims = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof Error && error.message.includes('JWT_SECRET')) {
      console.error(error.message);
      return res.status(500).json({ message: 'Máy chủ chưa cấu hình xác thực' });
    }
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }

  try {
    const user = await db.orm.public.User.where({ id: claims.sub }).first();
    if (!user || user.sessionVersion !== claims.sessionVersion) {
      return res.status(401).json({ message: 'Phiên đăng nhập không còn hợp lệ' });
    }
    req.auth = { userId: user.id, sessionVersion: user.sessionVersion };
    return next();
  } catch (error) {
    console.error('Authentication database lookup failed:', error);
    return res.status(503).json({ message: 'Dịch vụ xác thực tạm thời không khả dụng' });
  }
};
