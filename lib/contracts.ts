export const CARPE_ESCROW_ADDRESS =
  '0x15917768b31CB1DC61d9d858f2419BF45044005d' as const

export const REWARD_SPLITTER_FACTORY =
  '0xb5743b26408D076C5dA04b99B1DE9abb5Cd5809D' as const

export const CARPE_ROUTER_SPLITTER =
  '0x9F32dEFA57d281D63c0D440e6065A31Cb4475326' as const

export const TREASURY_SAFE =
  '0x5E2D1Df284786b260198F111A01e343d1149F310' as const

export const FLOAT_WALLET =
  '0xd26aB1b62769924F81F4D7204147864b63a06406' as const

export const USDC_ADDRESS =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

export const DIEM_ADDRESS =
  '0xF4d97F2da56e8c3098f3a8D538DB630A2606a024' as const

export const CARPE_ESCROW_ABI = [
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'X402Pull',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'Charge',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'providerShare', type: 'uint256', indexed: false },
      { name: 'fees', type: 'uint256', indexed: false },
      { name: 'diemReceived', type: 'uint256', indexed: false },
      { name: 'surcharge', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BatchCharge',
    inputs: [
      { name: 'entryCount', type: 'uint256', indexed: false },
      { name: 'totalUsdc', type: 'uint256', indexed: false },
      { name: 'diemReceived', type: 'uint256', indexed: false },
      { name: 'surcharge', type: 'uint256', indexed: false },
      { name: 'fees', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BatchProviderCredited',
    inputs: [
      { name: 'provider', type: 'address', indexed: true },
      { name: 'diemShare', type: 'uint256', indexed: false },
      { name: 'pendingUsdcWeight', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ExternalRouteSettled',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'toFloat', type: 'uint256', indexed: false },
      { name: 'toTreasury', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ProviderWithdrawal',
    inputs: [
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'IdleRebateCredited',
    inputs: [
      { name: 'provider', type: 'address', indexed: true },
      { name: 'diemAmount', type: 'uint256', indexed: false },
      { name: 'day', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RebateDistributed',
    inputs: [
      { name: 'usdcIn', type: 'uint256', indexed: false },
      { name: 'diemOut', type: 'uint256', indexed: false },
      { name: 'providerCount', type: 'uint256', indexed: false },
      { name: 'day', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'TreasuryFunded',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'source', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'CreditsMigrated',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'FeesCollected',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const

export const REWARD_SPLITTER_ABI = [
  {
    type: 'event',
    name: 'DiemSplit',
    inputs: [
      { name: 'gross', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'toProvider', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'UsdcSplit',
    inputs: [
      { name: 'gross', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'toProvider', type: 'uint256', indexed: false },
    ],
  },
] as const
