import type { Leg, ChainPnL, StatusColor, ActionHint } from './types'

export function calculateChainPnL(legs: Leg[]): ChainPnL {
  let totalCollected = 0
  let totalPaid = 0

  for (const leg of legs) {
    totalCollected += Number(leg.premium_collected) || 0
    totalPaid += Number(leg.premium_paid) || 0
  }

  const netPremium = totalCollected - totalPaid
  const openLeg = legs.find(
    (l) => l.type === 'open' || l.type === 'roll_open'
  )
  const initialPremium = openLeg ? Number(openLeg.premium_collected) || 0 : totalCollected
  const pnlPercent = initialPremium > 0 ? (netPremium / initialPremium) * 100 : 0

  const currentLeg =
    legs.filter((l) => l.type === 'open' || l.type === 'roll_open').pop() || null

  return { totalCollected, totalPaid, netPremium, pnlPercent, currentLeg }
}

export function calculate50PctTarget(premiumCollected: number): number {
  return premiumCollected * 0.5
}

export function calculateROC(premium: number, strike: number, contracts: number = 1): number {
  const capitalAtRisk = strike * 100 * contracts
  if (capitalAtRisk === 0) return 0
  return (premium / capitalAtRisk) * 100
}

export function calculateAnnualizedROC(roc: number, dte: number): number {
  if (dte === 0) return 0
  return (roc / dte) * 365
}

export function getDTE(expiration: string): number {
  const exp = new Date(expiration)
  const now = new Date()
  const diffMs = exp.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export function getPositionStatus(pnlPercent: number): StatusColor {
  if (pnlPercent >= 25) return 'green'
  if (pnlPercent >= 0 && pnlPercent < 25) return 'yellow'
  return 'red'
}

export function getActionHint(pnlPercent: number, dte: number): ActionHint {
  if (pnlPercent >= 50) return 'CLOSE'
  if (pnlPercent >= 25) return 'HOLD'
  if (pnlPercent <= -50) return 'ROLL'
  if (pnlPercent < 0 && dte <= 14) return 'ACT'
  if (pnlPercent < 0) return 'WATCH'
  return 'HOLD'
}

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: absAmount < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(absAmount)
  return amount < 0 ? `-${formatted}` : `+${formatted}`
}

export function formatCurrencyRaw(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(0)}%`
}

export function getDaysLeftInMonth(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return lastDay.getDate() - now.getDate()
}

export function getDailyPaceNeeded(remaining: number, daysLeft: number): number {
  if (daysLeft <= 0) return remaining
  return remaining / daysLeft
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function formatExpiration(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

export function getMonthName(month: number): string {
  return new Date(2024, month - 1).toLocaleString('en-US', { month: 'long' })
}

export function getPaceStatus(collected: number, target: number, daysLeft: number, totalDays: number): StatusColor {
  const expectedPace = target * ((totalDays - daysLeft) / totalDays)
  const ratio = collected / expectedPace
  if (ratio >= 0.8) return 'green'
  if (ratio >= 0.6) return 'yellow'
  return 'red'
}
