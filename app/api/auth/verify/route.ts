import { NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { createToken, COOKIE_NAME } from '@/lib/auth'

const SIGN_MESSAGE = 'Connexion à Carpe Diem Comptabilité'
const ALLOWED = (process.env.ALLOWED_WALLET_ADDRESS ?? '').toLowerCase()

export async function POST(req: Request) {
  const { address, signature } = await req.json()

  if (!address || !signature) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  if (address.toLowerCase() !== ALLOWED) {
    return NextResponse.json({ error: 'Adresse non autorisée' }, { status: 403 })
  }

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: SIGN_MESSAGE,
    signature: signature as `0x${string}`,
  })

  if (!valid) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  const token = await createToken(address)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 jours
    path: '/',
  })
  return response
}
