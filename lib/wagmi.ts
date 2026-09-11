import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Carpe Diem Comptabilité',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [base],
  ssr: true,
})

export const ALLOWED_ADDRESS = (
  process.env.NEXT_PUBLIC_ALLOWED_WALLET_ADDRESS ?? ''
).toLowerCase()
