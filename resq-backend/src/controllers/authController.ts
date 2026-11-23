import { randomInt } from 'node:crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../prisma';
import { createAccessToken } from '../utils/auth';
import { normalizeVietnamPhone } from '../utils/phone';

const publicUser = (user: any) => ({
  id: user.id,
  phoneNumber: user.phoneNumber,
  email: user.email,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const issueSession = (user: any) => ({
  accessToken: createAccessToken(user.id, user.sessionVersion),
  tokenType: 'Bearer',
  expiresIn: 604800,
  user: publicUser(user),
});

export const requestOtp = async (req: Request, res: Response) => {
  try {
    const phoneNumber = normalizeVietnamPhone(req.body?.phoneNumber);
    if (!phoneNumber) {
      return res.status(400).json({ message: 'Số điện thoại Việt Nam không hợp lệ' });
    }

    const previous = await db.orm.public.OtpCode.where({ phoneNumber }).first();
    const now = new Date();
    if (previous && now.getTime() - previous.createdAt.getTime() < 60_000) {
      const retryAfterSeconds = Math.ceil((60_000 - (now.getTime() - previous.createdAt.getTime())) / 1000);
      return res.status(429).json({ message: 'Vui lòng chờ trước khi yêu cầu mã mới', retryAfterSeconds });
    }
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ message: 'Dịch vụ gửi OTP chưa được cấu hình' });
    }

    const code = String(randomInt(100000, 1_000_000));
    const codeHash = await bcrypt.hash(code, 10);
    await db.orm.public.OtpCode.where({ phoneNumber }).deleteAll();
    await db.orm.public.OtpCode.create({
      phoneNumber,
      code: codeHash,
      attempts: 0,
      expiresAt: new Date(now.getTime() + 5 * 60_000),
    });

    // Development delivery for local/Postman testing. Production requires an SMS provider adapter.
    console.info(`[ResQ OTP] ${phoneNumber}: ${code}`);
    return res.status(200).json({ message: 'Mã OTP đã được tạo', expiresIn: 300, devOtp: code });
  } catch (error) {
    console.error('requestOtp failed:', error);
    return res.status(500).json({ message: 'Không thể tạo mã OTP' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const phoneNumber = normalizeVietnamPhone(req.body?.phoneNumber);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!phoneNumber || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Số điện thoại hoặc mã OTP không hợp lệ' });
    }

    const otpRecord = await db.orm.public.OtpCode.where({ phoneNumber }).first();
    if (!otpRecord) return res.status(400).json({ message: 'Mã OTP không đúng hoặc đã hết hạn' });
    if (otpRecord.expiresAt.getTime() <= Date.now()) {
      await db.orm.public.OtpCode.where({ id: otpRecord.id }).delete();
      return res.status(400).json({ message: 'Mã OTP đã hết hạn' });
    }
    if (otpRecord.attempts >= 5) {
      await db.orm.public.OtpCode.where({ id: otpRecord.id }).delete();
      return res.status(429).json({ message: 'Bạn đã nhập sai quá số lần cho phép. Hãy yêu cầu mã mới.' });
    }

    const matched = await bcrypt.compare(code, otpRecord.code);
    if (!matched) {
      const attempts = otpRecord.attempts + 1;
      if (attempts >= 5) await db.orm.public.OtpCode.where({ id: otpRecord.id }).delete();
      else await db.orm.public.OtpCode.where({ id: otpRecord.id }).update({ attempts });
      return res.status(400).json({ message: 'Mã OTP không đúng', attemptsRemaining: Math.max(0, 5 - attempts) });
    }

    let user = await db.orm.public.User.where({ phoneNumber }).first();
    if (user) {
      user = await db.orm.public.User.where({ id: user.id }).update({ isVerified: true });
    } else {
      try {
        user = await db.orm.public.User.create({ phoneNumber, isVerified: true });
      } catch (error) {
        // A simultaneous first login can create the same phone after our lookup.
        const dbError = error as { sqlState?: string; cause?: { code?: string } };
        if (dbError.sqlState !== '23505' && dbError.cause?.code !== '23505') throw error;
        const existing = await db.orm.public.User.where({ phoneNumber }).first();
        if (!existing) throw error;
        user = await db.orm.public.User.where({ id: existing.id }).update({ isVerified: true });
      }
    }
    await db.orm.public.OtpCode.where({ id: otpRecord.id }).delete();
    return res.status(200).json({ message: 'Đăng nhập thành công', ...issueSession(user) });
  } catch (error) {
    console.error('verifyOtp failed:', error);
    return res.status(500).json({ message: 'Không thể xác thực mã OTP' });
  }
};

export const socialLogin = async (req: Request, res: Response) => {
  try {
    const provider = req.body?.provider;
    const accessToken = typeof req.body?.providerAccessToken === 'string' ? req.body.providerAccessToken : '';
    if (!accessToken || (provider !== 'google' && provider !== 'facebook')) {
      return res.status(400).json({ message: 'Thiếu nhà cung cấp hoặc access token hợp lệ' });
    }

    const profileUrl = provider === 'google'
      ? 'https://www.googleapis.com/oauth2/v3/userinfo'
      : 'https://graph.facebook.com/me?fields=id,name,email,picture.type(large)';
    const profileResponse = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!profileResponse.ok) return res.status(401).json({ message: 'Access token mạng xã hội không hợp lệ' });
    const profile = await profileResponse.json() as Record<string, any>;
    const socialId = provider === 'google' ? profile.sub : profile.id;
    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : null;
    const fullName = typeof profile.name === 'string' ? profile.name.trim() : null;
    const avatarUrl = provider === 'google'
      ? (typeof profile.picture === 'string' ? profile.picture : null)
      : (typeof profile.picture?.data?.url === 'string' ? profile.picture.data.url : null);
    if (!socialId || (provider === 'google' && profile.email_verified !== true)) {
      return res.status(401).json({ message: 'Không xác minh được tài khoản mạng xã hội' });
    }

    const key = provider === 'google' ? 'googleId' : 'facebookId';
    let user = await db.orm.public.User.where({ [key]: socialId } as any).first();
    if (!user && email) {
      user = await db.orm.public.User.where({ email }).first();
      if (user) {
        user = await db.orm.public.User.where({ id: user.id }).update({
          [key]: socialId,
          ...(avatarUrl && !user.avatarUrl ? { avatarUrl } : {}),
        } as any);
      }
    }
    if (!user) {
      user = await db.orm.public.User.create({
        fullName,
        email,
        avatarUrl,
        googleId: provider === 'google' ? socialId : null,
        facebookId: provider === 'facebook' ? socialId : null,
      });
    }
    return res.status(200).json({ message: 'Đăng nhập thành công', ...issueSession(user) });
  } catch (error) {
    console.error('socialLogin failed:', error);
    return res.status(500).json({ message: 'Không thể đăng nhập mạng xã hội' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const user = await db.orm.public.User.where({ id: req.auth!.userId }).first();
    if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại' });
    await db.orm.public.User.where({ id: user.id }).update({ sessionVersion: user.sessionVersion + 1 });
    return res.status(200).json({ message: 'Đã đăng xuất khỏi các phiên ResQ' });
  } catch (error) {
    console.error('logout failed:', error);
    return res.status(500).json({ message: 'Không thể đăng xuất' });
  }
};
