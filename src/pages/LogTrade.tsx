import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/store'
import { calculateROC, calculateAnnualizedROC, getDTE, calculate50PctTarget, formatCurrencyRaw } from '../lib/utils'
import type { PositionType, ConvictionLevel } from '../lib/types'

type Mode = 'select' | 'open' | 'roll' | 'close'
type OpenStep = 'type' | 'details' | 'optional' | 'review'
type RollStep = 'close_leg' | 'new_leg' | 'review'
type CloseStep = 'price' | 'review'

export default function LogTrade() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const positions = useStore((s) => s.positions)
  const addPosition = useStore((s) => s.addPosition)
  const closePosition = useStore((s) => s.closePosition)
  const logRoll = useStore((s) => s.logRoll)

  const paramMode = searchParams.get('mode') as Mode | null
  const paramPosition = searchParams.get('position')

  const [mode, setMode] = useState<Mode>(paramMode || 'select')
  const [submitting, setSubmitting] = useState(false)

  // Open trade state
  const [openStep, setOpenStep] = useState<OpenStep>('type')
  const [posType, setPosType] = useState<PositionType>('CSP')
  const [ticker, setTicker] = useState('')
  const [strike, setStrike] = useState('')
  const [expiration, setExpiration] = useState('')
  const [premium, setPremium] = useState('')
  const [delta, setDelta] = useState('')
  const [ivRank, setIvRank] = useState('')
  const [thesis, setThesis] = useState('')
  const [conviction, setConviction] = useState<ConvictionLevel>('medium')

  // Roll state
  const [rollStep, setRollStep] = useState<RollStep>('close_leg')
  const [rollCloseDebit, setRollCloseDebit] = useState('')
  const [rollNewStrike, setRollNewStrike] = useState('')
  const [rollNewExpiration, setRollNewExpiration] = useState('')
  const [rollNewCredit, setRollNewCredit] = useState('')
  const [rollNotes, setRollNotes] = useState('')

  // Close state
  const [closeStep, setCloseStep] = useState<CloseStep>('price')
  const [closePrice, setClosePrice] = useState('')

  const selectedPosition = paramPosition
    ? positions.find((p) => p.id === paramPosition)
    : null

  useEffect(() => {
    if (paramMode === 'roll' && selectedPosition) {
      setMode('roll')
    } else if (paramMode === 'close' && selectedPosition) {
      setMode('close')
    }
  }, [paramMode, selectedPosition])

  // Computed values for open review
  const strikeNum = parseFloat(strike) || 0
  const premiumNum = parseFloat(premium) || 0
  const dte = expiration ? getDTE(expiration) : 0
  const roc = calculateROC(premiumNum, strikeNum)
  const annualized = calculateAnnualizedROC(roc, dte)
  const fiftyPctTarget = calculate50PctTarget(premiumNum)

  const handleOpenSubmit = async () => {
    if (!ticker || !strike || !expiration || !premium) return
    setSubmitting(true)
    await addPosition({
      ticker: ticker.toUpperCase(),
      type: posType,
      thesis: thesis || undefined,
      conviction,
      strike: strikeNum,
      expiration,
      premium: premiumNum,
      delta: delta ? parseFloat(delta) : undefined,
      ivRank: ivRank ? parseFloat(ivRank) : undefined,
    })
    setSubmitting(false)
    navigate('/')
  }

  const handleRollSubmit = async () => {
    if (!selectedPosition || !rollCloseDebit || !rollNewStrike || !rollNewExpiration || !rollNewCredit) return
    setSubmitting(true)
    await logRoll(selectedPosition.id, {
      closeDebit: parseFloat(rollCloseDebit),
      newStrike: parseFloat(rollNewStrike),
      newExpiration: rollNewExpiration,
      newCredit: parseFloat(rollNewCredit),
      notes: rollNotes || undefined,
    })
    setSubmitting(false)
    navigate(`/positions/${selectedPosition.id}`)
  }

  const handleCloseSubmit = async () => {
    if (!selectedPosition || !closePrice) return
    setSubmitting(true)
    await closePosition(selectedPosition.id, parseFloat(closePrice))
    setSubmitting(false)
    navigate('/positions')
  }

  // --- Mode Selection ---
  if (mode === 'select') {
    return (
      <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
        <div className="pt-6 pb-4">
          <h1 className="text-xl font-bold">Log Trade</h1>
          <p className="text-sm text-rh-subtext mt-1">What would you like to do?</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => { setMode('open'); setOpenStep('type') }}
            className="card w-full text-left active:bg-rh-surface-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rh-green/15 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00C805" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div>
                <div className="font-semibold">Open New Position</div>
                <div className="text-sm text-rh-subtext">Sell a new CSP or CC</div>
              </div>
            </div>
          </button>

          {positions.filter((p) => p.status === 'open').length > 0 && (
            <>
              <button
                onClick={() => setMode('roll')}
                className="card w-full text-left active:bg-rh-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rh-yellow/15 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F6C86A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold">Roll Position</div>
                    <div className="text-sm text-rh-subtext">Close and reopen at new strike/expiry</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('close')}
                className="card w-full text-left active:bg-rh-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rh-red/15 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EB5D2A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold">Close Position</div>
                    <div className="text-sm text-rh-subtext">Buy back to close</div>
                  </div>
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // --- Open New Position ---
  if (mode === 'open') {
    return (
      <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
        <div className="pt-4 pb-2">
          <button
            onClick={() => {
              if (openStep === 'type') setMode('select')
              else if (openStep === 'details') setOpenStep('type')
              else if (openStep === 'optional') setOpenStep('details')
              else setOpenStep('optional')
            }}
            className="text-rh-green text-sm font-medium flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        </div>

        {openStep === 'type' && (
          <div>
            <h2 className="text-xl font-bold mb-1">What are you selling?</h2>
            <p className="text-sm text-rh-subtext mb-6">Select the position type</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setPosType('CSP'); setOpenStep('details') }}
                className={`card text-center py-6 active:bg-rh-surface-hover transition-colors ${posType === 'CSP' ? 'border-rh-green' : ''}`}
              >
                <div className="text-2xl mb-2">📉</div>
                <div className="font-bold">Cash-Secured Put</div>
                <div className="text-xs text-rh-subtext mt-1">Bullish / Neutral</div>
              </button>
              <button
                onClick={() => { setPosType('CC'); setOpenStep('details') }}
                className={`card text-center py-6 active:bg-rh-surface-hover transition-colors ${posType === 'CC' ? 'border-rh-green' : ''}`}
              >
                <div className="text-2xl mb-2">📈</div>
                <div className="font-bold">Covered Call</div>
                <div className="text-xs text-rh-subtext mt-1">Neutral / Bearish</div>
              </button>
            </div>
          </div>
        )}

        {openStep === 'details' && (
          <div>
            <h2 className="text-xl font-bold mb-1">Trade Details</h2>
            <p className="text-sm text-rh-subtext mb-6">Enter the key parameters</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Ticker</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="w-full uppercase"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Strike Price</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={strike}
                  onChange={(e) => setStrike(e.target.value)}
                  placeholder="150.00"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Expiration Date</label>
                <input
                  type="date"
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Premium Collected ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  placeholder="2.50"
                  className="w-full"
                />
              </div>
              <button
                onClick={() => setOpenStep('optional')}
                disabled={!ticker || !strike || !expiration || !premium}
                className="btn-primary w-full disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {openStep === 'optional' && (
          <div>
            <h2 className="text-xl font-bold mb-1">Additional Info</h2>
            <p className="text-sm text-rh-subtext mb-6">Optional but recommended</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Delta</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="0.30"
                  step="0.01"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">IV Rank (%)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={ivRank}
                  onChange={(e) => setIvRank(e.target.value)}
                  placeholder="45"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Thesis</label>
                <textarea
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  placeholder="Why this trade?"
                  rows={2}
                  className="w-full resize-none"
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-2 block">Conviction</label>
                <div className="flex gap-2">
                  {(['high', 'medium', 'low'] as ConvictionLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setConviction(level)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        conviction === level
                          ? level === 'high' ? 'bg-rh-green/15 text-rh-green border border-rh-green/30'
                          : level === 'medium' ? 'bg-rh-yellow/15 text-rh-yellow border border-rh-yellow/30'
                          : 'bg-rh-red/15 text-rh-red border border-rh-red/30'
                          : 'bg-rh-surface border border-rh-border text-rh-subtext'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setOpenStep('review')}
                className="btn-primary w-full"
              >
                Review Trade
              </button>
              <button
                onClick={() => setOpenStep('review')}
                className="text-center w-full text-sm text-rh-subtext"
              >
                Skip, go to review
              </button>
            </div>
          </div>
        )}

        {openStep === 'review' && (
          <div>
            <h2 className="text-xl font-bold mb-4">Review Trade</h2>
            <div className="card mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold">{ticker || '---'}</span>
                <span className="text-xs text-rh-subtext px-2 py-0.5 bg-rh-border/50 rounded">{posType}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Strike</span>
                  <span>${strike || '---'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Expiration</span>
                  <span>{expiration || '---'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Premium</span>
                  <span className="text-rh-green">{formatCurrencyRaw(premiumNum)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">DTE</span>
                  <span>{dte} days</span>
                </div>
                {delta && (
                  <div className="flex justify-between">
                    <span className="text-rh-subtext">Delta</span>
                    <span>{delta}</span>
                  </div>
                )}
                {ivRank && (
                  <div className="flex justify-between">
                    <span className="text-rh-subtext">IV Rank</span>
                    <span>{ivRank}%</span>
                  </div>
                )}
                {conviction && (
                  <div className="flex justify-between">
                    <span className="text-rh-subtext">Conviction</span>
                    <span className="capitalize">{conviction}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="card mb-4">
              <h3 className="text-xs font-semibold text-rh-subtext uppercase tracking-wider mb-3">
                Auto Calculations
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Return on Capital</span>
                  <span className="font-semibold">{roc.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Annualized ROC</span>
                  <span className="font-semibold">{annualized.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">50% Profit Target</span>
                  <span className="text-rh-green">{formatCurrencyRaw(fiftyPctTarget)}</span>
                </div>
              </div>
            </div>

            {thesis && (
              <div className="card mb-4">
                <h3 className="text-xs font-semibold text-rh-subtext uppercase tracking-wider mb-2">Thesis</h3>
                <p className="text-sm">{thesis}</p>
              </div>
            )}

            <button
              onClick={handleOpenSubmit}
              disabled={submitting}
              className="btn-primary w-full disabled:opacity-50"
            >
              {submitting ? 'Opening...' : 'Open Position'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // --- Roll Position ---
  if (mode === 'roll') {
    const openPositions = positions.filter((p) => p.status === 'open')

    if (!selectedPosition && !paramPosition) {
      return (
        <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
          <div className="pt-4 pb-2">
            <button onClick={() => setMode('select')} className="text-rh-green text-sm font-medium flex items-center gap-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
          </div>
          <h2 className="text-xl font-bold mb-1">Roll Position</h2>
          <p className="text-sm text-rh-subtext mb-4">Select a position to roll</p>
          <div className="space-y-2">
            {openPositions.map((pos) => (
              <button
                key={pos.id}
                onClick={() => navigate(`/log?mode=roll&position=${pos.id}`)}
                className="card w-full text-left active:bg-rh-surface-hover"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{pos.ticker}</span>
                    <span className="text-xs text-rh-subtext px-1.5 py-0.5 bg-rh-border/50 rounded">{pos.type}</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (!selectedPosition) {
      return (
        <div className="px-4 pt-12 text-center">
          <p className="text-rh-subtext">Position not found</p>
          <button onClick={() => navigate('/log')} className="btn-secondary mt-4">Back</button>
        </div>
      )
    }

    const currentLeg = selectedPosition.legs.filter((l) => l.type === 'open' || l.type === 'roll_open').pop()

    return (
      <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
        <div className="pt-4 pb-2">
          <button
            onClick={() => {
              if (rollStep === 'close_leg') navigate('/log')
              else if (rollStep === 'new_leg') setRollStep('close_leg')
              else setRollStep('new_leg')
            }}
            className="text-rh-green text-sm font-medium flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-bold">Roll {selectedPosition.ticker}</h2>
          <span className="text-xs text-rh-subtext px-2 py-0.5 bg-rh-border/50 rounded">{selectedPosition.type}</span>
        </div>

        {rollStep === 'close_leg' && (
          <div>
            <h3 className="text-base font-semibold mb-1">Close Current Leg</h3>
            {currentLeg && (
              <p className="text-sm text-rh-subtext mb-4">
                Current: ${currentLeg.strike} exp {currentLeg.expiration}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Closing Debit ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={rollCloseDebit}
                  onChange={(e) => setRollCloseDebit(e.target.value)}
                  placeholder="1.50"
                  className="w-full"
                  autoFocus
                />
              </div>
              <button
                onClick={() => setRollStep('new_leg')}
                disabled={!rollCloseDebit}
                className="btn-primary w-full disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {rollStep === 'new_leg' && (
          <div>
            <h3 className="text-base font-semibold mb-4">New Leg Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">New Strike</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={rollNewStrike}
                  onChange={(e) => setRollNewStrike(e.target.value)}
                  placeholder="145.00"
                  className="w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">New Expiration</label>
                <input
                  type="date"
                  value={rollNewExpiration}
                  onChange={(e) => setRollNewExpiration(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">New Credit ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={rollNewCredit}
                  onChange={(e) => setRollNewCredit(e.target.value)}
                  placeholder="2.00"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Notes (optional)</label>
                <input
                  type="text"
                  value={rollNotes}
                  onChange={(e) => setRollNotes(e.target.value)}
                  placeholder="Rolling down and out..."
                  className="w-full"
                />
              </div>
              <button
                onClick={() => setRollStep('review')}
                disabled={!rollNewStrike || !rollNewExpiration || !rollNewCredit}
                className="btn-primary w-full disabled:opacity-50"
              >
                Review Roll
              </button>
            </div>
          </div>
        )}

        {rollStep === 'review' && (
          <div>
            <h3 className="text-base font-semibold mb-4">Review Roll</h3>
            <div className="card mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Close debit</span>
                  <span className="text-rh-red">-{formatCurrencyRaw(parseFloat(rollCloseDebit) || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">New credit</span>
                  <span className="text-rh-green">+{formatCurrencyRaw(parseFloat(rollNewCredit) || 0)}</span>
                </div>
                <div className="border-t border-rh-border pt-2 flex justify-between font-bold">
                  <span>Net</span>
                  {(() => {
                    const net = (parseFloat(rollNewCredit) || 0) - (parseFloat(rollCloseDebit) || 0)
                    return (
                      <span className={net >= 0 ? 'text-rh-green' : 'text-rh-red'}>
                        {net >= 0 ? '+' : ''}{formatCurrencyRaw(net)}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>
            <div className="card mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-rh-subtext">New strike</span>
                  <span>${rollNewStrike}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">New expiration</span>
                  <span>{rollNewExpiration}</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleRollSubmit}
              disabled={submitting}
              className="btn-primary w-full disabled:opacity-50"
            >
              {submitting ? 'Rolling...' : 'Confirm Roll'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // --- Close Position ---
  if (mode === 'close') {
    const openPositions = positions.filter((p) => p.status === 'open')

    if (!selectedPosition && !paramPosition) {
      return (
        <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
          <div className="pt-4 pb-2">
            <button onClick={() => setMode('select')} className="text-rh-green text-sm font-medium flex items-center gap-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
          </div>
          <h2 className="text-xl font-bold mb-1">Close Position</h2>
          <p className="text-sm text-rh-subtext mb-4">Select a position to close</p>
          <div className="space-y-2">
            {openPositions.map((pos) => (
              <button
                key={pos.id}
                onClick={() => navigate(`/log?mode=close&position=${pos.id}`)}
                className="card w-full text-left active:bg-rh-surface-hover"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{pos.ticker}</span>
                    <span className="text-xs text-rh-subtext px-1.5 py-0.5 bg-rh-border/50 rounded">{pos.type}</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (!selectedPosition) {
      return (
        <div className="px-4 pt-12 text-center">
          <p className="text-rh-subtext">Position not found</p>
          <button onClick={() => navigate('/log')} className="btn-secondary mt-4">Back</button>
        </div>
      )
    }

    const pnl = selectedPosition.legs.reduce((acc, l) => acc + (Number(l.premium_collected) || 0) - (Number(l.premium_paid) || 0), 0)
    const closePriceNum = parseFloat(closePrice) || 0
    const finalPnl = pnl - closePriceNum

    return (
      <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
        <div className="pt-4 pb-2">
          <button
            onClick={() => {
              if (closeStep === 'price') navigate('/log')
              else setCloseStep('price')
            }}
            className="text-rh-green text-sm font-medium flex items-center gap-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-bold">Close {selectedPosition.ticker}</h2>
          <span className="text-xs text-rh-subtext px-2 py-0.5 bg-rh-border/50 rounded">{selectedPosition.type}</span>
        </div>

        {closeStep === 'price' && (
          <div>
            <p className="text-sm text-rh-subtext mb-4">How much are you paying to buy back?</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-rh-subtext mb-1 block">Closing Price ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={closePrice}
                  onChange={(e) => setClosePrice(e.target.value)}
                  placeholder="0.50"
                  className="w-full"
                  autoFocus
                />
              </div>
              {closePrice && (
                <div className="card">
                  <div className="flex justify-between text-sm">
                    <span className="text-rh-subtext">Realized P&L</span>
                    <span className={`font-bold ${finalPnl >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                      {finalPnl >= 0 ? '+' : ''}{formatCurrencyRaw(finalPnl)}
                    </span>
                  </div>
                </div>
              )}
              <button
                onClick={() => setCloseStep('review')}
                disabled={!closePrice}
                className="btn-primary w-full disabled:opacity-50"
              >
                Review Close
              </button>
            </div>
          </div>
        )}

        {closeStep === 'review' && (
          <div>
            <h3 className="text-base font-semibold mb-4">Confirm Close</h3>
            <div className="card mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Chain premium</span>
                  <span>{formatCurrencyRaw(pnl)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rh-subtext">Closing cost</span>
                  <span className="text-rh-red">-{formatCurrencyRaw(closePriceNum)}</span>
                </div>
                <div className="border-t border-rh-border pt-2 flex justify-between font-bold">
                  <span>Final P&L</span>
                  <span className={finalPnl >= 0 ? 'text-rh-green' : 'text-rh-red'}>
                    {finalPnl >= 0 ? '+' : ''}{formatCurrencyRaw(finalPnl)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleCloseSubmit}
              disabled={submitting}
              className="btn-danger w-full disabled:opacity-50"
            >
              {submitting ? 'Closing...' : 'Close Position'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return null
}
