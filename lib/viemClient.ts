import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? 'https://mainnet.base.org'),
})

export function formatUsdc(raw: bigint): number {
  return Number(raw) / 1_000_000
}

export function formatDiem(raw: bigint): number {
  return Number(raw) / 1e18
}

// Sur Base, les blocs sont produits toutes les 2 s exactement depuis la genèse :
// le timestamp d'un bloc se déduit de son numéro, sans appel RPC
export const BASE_GENESIS_TS = 1686789347

export function blockTimestamp(blockNumber: bigint | string | number): number {
  return BASE_GENESIS_TS + 2 * Number(blockNumber)
}
