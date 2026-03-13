export interface User {
  id: string
  email: string
  name: string
  portfolio_size: number
  monthly_target: number
  created_at: string
}

export type PositionType = 'CSP' | 'CC' | 'shares'
export type ConvictionLevel = 'high' | 'medium' | 'low'
export type PositionStatus = 'open' | 'assigned' | 'closed'
export type LegType = 'open' | 'roll_close' | 'roll_open' | 'close'

export interface Position {
  id: string
  user_id: string
  ticker: string
  type: PositionType
  thesis: string | null
  conviction: ConvictionLevel
  status: PositionStatus
  created_at: string
  closed_at: string | null
}

export interface Leg {
  id: string
  position_id: string
  type: LegType
  strike: number
  expiration: string
  premium_collected: number
  premium_paid: number
  delta: number | null
  iv_rank: number | null
  filled_at: string
  notes: string | null
}

export interface PositionWithLegs extends Position {
  legs: Leg[]
}

export interface MonthlySummary {
  id: string
  user_id: string
  month: number
  year: number
  total_collected: number
  total_losses: number
  net_premium: number
  target: number
  trades_count: number
  win_count: number
}

export interface ChainPnL {
  totalCollected: number
  totalPaid: number
  netPremium: number
  pnlPercent: number
  currentLeg: Leg | null
}

export type StatusColor = 'green' | 'yellow' | 'red'
export type ActionHint = 'CLOSE' | 'HOLD' | 'WATCH' | 'ACT' | 'ROLL'
