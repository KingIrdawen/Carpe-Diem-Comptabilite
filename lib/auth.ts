import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'change-me-in-production'
)
export const COOKIE_NAME = 'carpe-auth'

export async function createToken(address: string): Promise<string> {
  return new SignJWT({ address })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifyToken(
  token: string
): Promise<{ address: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return { address: payload.address as string }
  } catch {
    return null
  }
}
