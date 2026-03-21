import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';

function getSecret() {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function createToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifyToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.userId as string | undefined;
    if (!userId) return null;
    return { userId };
  } catch (error) {
    // jose throws JWTExpired for expired tokens
    if (error instanceof Error && error.message.includes('expired')) {
      console.warn('[Auth] Token expired');
    }
    return null;
  }
}
