import jwt from 'jsonwebtoken';

export interface AccessTokenClaims extends jwt.JwtPayload {
  sub: string;
  sessionVersion: number;
}

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return secret;
};

export const createAccessToken = (userId: string, sessionVersion: number): string =>
  jwt.sign({ sessionVersion }, getJwtSecret(), {
    subject: userId,
    expiresIn: '7d',
    issuer: 'resq-api',
    audience: 'resq-mobile',
  });

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  const payload = jwt.verify(token, getJwtSecret(), {
    issuer: 'resq-api',
    audience: 'resq-mobile',
  });
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('Invalid access token');
  }
  return payload as AccessTokenClaims;
};
