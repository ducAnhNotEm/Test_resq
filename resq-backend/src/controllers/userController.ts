import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../prisma';

const profileSchema = z.object({
  fullName: z.union([z.string().trim().min(1).max(100), z.null()]).optional(),
  email: z.union([z.string().trim().email().max(254), z.null()]).optional(),
  avatarUrl: z.union([z.string().url().max(2048), z.null()]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật');

const toPublicUser = (user: any) => ({
  id: user.id,
  phoneNumber: user.phoneNumber,
  email: user.email,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await db.orm.public.User.where({ id: req.auth!.userId }).first();
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    return res.json({ data: toPublicUser(user) });
  } catch (error) {
    console.error('getMe failed:', error);
    return res.status(500).json({ message: 'Không thể tải hồ sơ' });
  }
};

export const updateMe = async (req: Request, res: Response) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Dữ liệu hồ sơ không hợp lệ', errors: parsed.error.flatten().fieldErrors });
  }
  try {
    const data = { ...parsed.data, ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}) };
    const user = await db.orm.public.User.where({ id: req.auth!.userId }).update(data);
    return res.json({ message: 'Đã cập nhật hồ sơ', data: toPublicUser(user) });
  } catch (error) {
    console.error('updateMe failed:', error);
    return res.status(409).json({ message: 'Email đã được tài khoản khác sử dụng hoặc dữ liệu không hợp lệ' });
  }
};

export const updatePushToken = async (req: Request, res: Response) => {
  const pushToken = req.body?.pushToken;
  if (pushToken !== null && (typeof pushToken !== 'string' || pushToken.length > 512 || pushToken.length === 0)) {
    return res.status(400).json({ message: 'Push token không hợp lệ' });
  }
  try {
    await db.orm.public.User.where({ id: req.auth!.userId }).update({ pushToken });
    return res.json({ message: pushToken ? 'Đã cập nhật push token' : 'Đã gỡ push token' });
  } catch (error) {
    console.error('updatePushToken failed:', error);
    return res.status(409).json({ message: 'Push token này đã được đăng ký trên tài khoản khác' });
  }
};
