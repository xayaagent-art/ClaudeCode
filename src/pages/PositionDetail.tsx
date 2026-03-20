import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/store'
import { calculateChainPnL, getDTE, formatCurrency, formatCurrencyRaw, formatExpiration, formatPercent, getPositionStatus, getActionHint } from '../lib/utils'
import StatusBadge from '../components/StatusBadge'

export default function PositionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const positions = useStore((s) => s.positions)
  const closePosition = useStore((s) => s.closePosition)
  const position = positions.find((p) => p.id === id)

  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closePrice, setClosePrice] = useState('')
  const [closing, setClosing] = useState(false)

  if (!position) {
    return (
      <div className="px-4 pt-12 text-center">
        <p className="text-rh-subtext">Position not found</p>
        <button onClick={() => navigate('/positions')} className="btn-secondary mt-4">
          Back to Positions
        </button>
      </div>
    )
  }

  const pnl = calculateChainPnL(position.legs)
  const currentLeg = pnl.currentLeg
  const dte = currentLeg ? getDTE(currentLeg.expiration) : 0
  const status = getPositionStatus(pnl.pnlPercent)
  const action = getActionHint(pnl.pnlPercent, dte)

  const handleClose = async () => {
    if (!closePrice) return
    setClosing(true)
    await closePosition(position.id, parseFloat(closePrice))
    setClosing(false)
    navigate('/positions')
  }

  const costBasisPerShare = currentLeg
    ? currentLeg.strike - pnl.netPremium / 100
    : 0

  return (
    <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
      {/* Back button */}
      <div className="pt-4 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="text-rh-green text-sm font-medium flex items-center gap-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">{position.ticker}</h1>
            <span className="text-xs text-rh-subtext px-2 py-0.5 bg-rh-border/50 rounded">
              {position.type}
            </span>
          </div>
          {position.thesis && (
            <p className="text-sm text-rh-subtext">{position.thesis}</p>
          )}
        </div>
        <StatusBadge status={status} action={action} />
      </div>

      {/* Conviction */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-rh-subtext">Conviction:</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
          position.conviction === 'high' ? 'bg-rh-green/15 text-rh-green' :
          position.conviction === 'medium' ? 'bg-rh-yellow/15 text-rh-yellow' :
          'bg-rh-red/15 text-rh-red'
        }`}>
          {position.conviction.toUpperCase()}
        </span>
      </div>

      {/* Leg History */}
      <div className="card mb-4">
        <h2 className="text-xs font-semibold text-rh-subtext uppercase tracking-wider mb-3">
          Leg History
        </h2>
        <div className="space-y-3">
          {position.legs.map((leg, i) => (
            <div
              key={leg.id}
              className={`flex items-center justify-between py-2 ${
                i < position.legs.length - 1 ? 'border-b border-rh-border' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    leg.type === 'open' ? 'bg-rh-green/15 text-rh-green' :
                    leg.type === 'close' ? 'bg-rh-subtext/15 text-rh-subtext' :
                    leg.type === 'roll_close' ? 'bg-rh-red/15 text-rh-red' :
                    'bg-rh-yellow/15 text-rh-yellow'
                  }`}>
                    {leg.type.replace('_', ' ')}
                  </span>
                  <span className="text-sm">
                    ${leg.strike} {formatExpiration(leg.expiration)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                {leg.premium_collected > 0 && (
                  <span className="text-sm text-rh-green">
                    +{formatCurrencyRaw(leg.premium_collected)}
                  </span>
                )}
                {leg.premium_paid > 0 && (
                  <span className="text-sm text-rh-red ml-2">
                    -{formatCurrencyRaw(leg.premium_paid)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chain Summary */}
      <div className="card mb-4">
        <h2 className="text-xs font-semibold text-rh-subtext uppercase tracking-wider mb-3">
          Chain Summary
        </h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-rh-subtext">Total collected</span>
            <span className="text-rh-green">{formatCurrency(pnl.totalCollected)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-rh-subtext">Total paid</span>
            <span className="text-rh-red">
              {pnl.totalPaid > 0 ? `-${formatCurrencyRaw(pnl.totalPaid)}` : '$0'}
            </span>
          </div>
          <div className="border-t border-rh-border pt-2 flex justify-between text-sm font-bold">
            <span>Net chain P&L</span>
            <span className={pnl.netPremium >= 0 ? 'text-rh-green' : 'text-rh-red'}>
              {formatCurrency(pnl.netPremium)} ({formatPercent(pnl.pnlPercent)})
            </span>
          </div>
        </div>
      </div>

      {/* Assignment Scenario (CSP only) */}
      {position.type === 'CSP' && currentLeg && (
        <div className="card mb-4">
          <h2 className="text-xs font-semibold text-rh-subtext uppercase tracking-wider mb-3">
            Assignment Scenario
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-rh-subtext">If assigned at ${currentLeg.strike}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-rh-subtext">True cost basis</span>
              <span className="font-semibold">{formatCurrencyRaw(costBasisPerShare)}/share</span>
            </div>
            <div className="flex justify-between">
              <span className="text-rh-subtext">Need CC at</span>
              <span className="font-semibold">${(costBasisPerShare + 1).toFixed(0)}+ to break even</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate(`/log?mode=roll&position=${position.id}`)}
          className="btn-secondary flex-1"
        >
          Roll
        </button>
        <button
          onClick={() => setShowCloseModal(true)}
          className="btn-danger flex-1"
        >
          Close Position
        </button>
      </div>

      {/* Close Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center">
          <div className="bg-rh-surface w-full max-w-lg rounded-t-2xl p-6 pb-[env(safe-area-inset-bottom)]">
            <h3 className="text-lg font-bold mb-4">Close Position</h3>
            <p className="text-sm text-rh-subtext mb-4">
              Enter the closing price (debit paid to buy back):
            </p>
            <input
              type="number"
              step="0.01"
              value={closePrice}
              onChange={(e) => setClosePrice(e.target.value)}
              placeholder="0.00"
              className="w-full mb-4"
              autoFocus
            />
            {closePrice && (
              <div className="card mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-rh-subtext">Realized P&L</span>
                  <span className={pnl.netPremium - parseFloat(closePrice) >= 0 ? 'text-rh-green' : 'text-rh-red'}>
                    {formatCurrency(pnl.netPremium - parseFloat(closePrice))}
                  </span>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowCloseModal(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={closing || !closePrice}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {closing ? 'Closing...' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
