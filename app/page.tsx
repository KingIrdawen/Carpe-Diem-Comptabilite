'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSignMessage } from 'wagmi'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const SIGN_MESSAGE = 'Connexion à Carpe Diem Comptabilité'

export default function LoginPage() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isConnected && address) {
      handleAuth(address)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address])

  async function handleAuth(addr: string) {
    setLoading(true)
    setError(null)
    try {
      const signature = await signMessageAsync({ message: SIGN_MESSAGE })
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, signature }),
      })
      if (res.ok) {
        router.push('/dashboard')
      } else {
        const data = await res.json()
        setError(data.error ?? 'Accès refusé')
      }
    } catch {
      setError('Signature annulée')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Carpe Diem</h1>
        <p className="text-gray-400">Comptabilité on-chain</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-6">
        <p className="text-sm text-gray-400 text-center">
          Connectez votre wallet pour accéder à l&apos;application
        </p>
        <ConnectButton />
        {loading && (
          <p className="text-sm text-blue-400 animate-pulse">Signature en cours…</p>
        )}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    </main>
  )
}
