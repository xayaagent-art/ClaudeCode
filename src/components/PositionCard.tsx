import { useNavigate } from 'react-router-dom'
import type { PositionWithLegs } from '../lib/types'
import { calculateChainPnL, getDTE, getPositionStatus, getActionHint, formatCurrency, formatExpiration, formatPercent } from '../lib/utils'
import StatusBadge from './StatusBadge'

interface PositionCardProps {
  position: PositionWithLegs
  compact?: boolean
}

export default function PositionCard({ position, compact = false }: PositionCardProps) {
  const navigate = useNavigate()
  const pnl = calculateChainPnL(position.legs)
  const currentLeg = pnl.currentLeg
  const dte = currentLeg ? getDTE(currentLeg.expiration) : 0
  const status = getPositionStatus(pnl.pnlPercent)
  const action = getActionHint(pnl.pnlPercent, dte)

  return (
    <button
      onClick={() => navigate(`/positions/${position.id}`)}
      className="card w-full text-left active:bg-rh-surface-hover transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base">{position.ticker}</span>
              <span className="text-xs text-rh-subtext px-1.5 py-0.5 bg-rh-border/50 rounded">
                {position.type}
              </span>
            </div>
            {currentLeg && !compact && (
              <div className="text-sm text-rh-subtext mt-0.5">
                ${currentLeg.strike} {position.type === 'CSP' ? 'P' : 'C'}{' '}
                {formatExpiration(currentLeg.expiration)}
                {dte > 0 && <span className="ml-1.5 text-xs">({dte}d)</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className={`text-sm font-semibold ${pnl.netPremium >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
              {formatCurrency(pnl.netPremium)}
            </div>
            <div className={`text-xs ${pnl.pnlPercent >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
              {formatPercent(pnl.pnlPercent)}
            </div>
          </div>
          <StatusBadge status={status} action={action} />
        </div>
      </div>
    </button>
  )
}
