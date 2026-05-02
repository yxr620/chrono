import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorized } from '../shared/errors.js';

export interface JwtClaims {
  sub: string;   // userId
  email: string;
  iat: number;
  exp: number;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60;

export function signJwt(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email },
    config.jwtSecret,
    { expiresIn: SEVEN_DAYS },
  );
}

export function verifyJwt(token: string): JwtClaims {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtClaims;
  } catch (err: any) {
    throw unauthorized(err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token');
  }
}
