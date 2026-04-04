import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { isoToFlag } from '../../data/countryMeta'
import { getCities } from '../../data/cities'

function ProgressRing({ current, total, size = 60 }) {
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = total > 0 ? current / total : 0
  const offset = circumference * (1 - pct)

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--sand)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--terracotta)" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
        color: 'var(--terracotta)',
      }}>
        {current}/{total}
      </div>
    </div>
  )
}

export default function CountryDrawer({ data, unlockedCities, onCityUnlock, onClose, notes, onNoteSave }) {
  if (!data) return null

  const { iso, name, continent, date } = data
  const cities = getCities(iso)
  const citySet = unlockedCities[iso] || []
  const unlockCount = citySet.length
  const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const [noteText, setNoteText] = useState(notes?.[iso] || '')
  const [noteSaved, setNoteSaved] = useState(false)

  const handleNoteSave = () => {
    onNoteSave?.(iso, noteText)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 1500)
  }

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(26,18,8,0.2)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--cream)',
              borderRadius: '24px 24px 0 0',
              padding: '20px 24px 28px',
              maxHeight: '70dvh', overflow: 'auto',
              boxShadow: '0 -4px 24px var(--shadow)',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--sand)', margin: '0 auto 16px' }} />

            {/* Header with progress ring */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              {cities.length > 0 && (
                <ProgressRing current={unlockCount} total={cities.length} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 32 }}>{isoToFlag(iso)}</span>
                  <h2 style={{
                    fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700,
                    color: 'var(--ink)', margin: 0, lineHeight: 1.1,
                  }}>{name}</h2>
                </div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  {continent}{dateStr ? ` · visited ${dateStr}` : ''}
                </p>
              </div>
            </div>

            {/* City grid — 2 columns */}
            {cities.length > 0 && (
              <>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                  color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  Cities
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 18,
                }}>
                  {cities.map(city => {
                    const isVisited = citySet.includes(city)
                    return (
                      <button
                        key={city}
                        onClick={() => !isVisited && onCityUnlock(iso, city)}
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: 13,
                          fontWeight: isVisited ? 600 : 400,
                          color: isVisited ? 'var(--ink)' : 'var(--muted)',
                          background: isVisited ? 'rgba(193,127,74,0.12)' : 'white',
                          border: `1px solid ${isVisited ? 'var(--terracotta-light)' : 'var(--sand)'}`,
                          borderRadius: 14, padding: '10px 12px',
                          cursor: isVisited ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                          transition: 'all 150ms', textAlign: 'left',
                        }}
                      >
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: isVisited ? 'var(--terracotta)' : 'var(--sand)',
                        }} />
                        {city}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {cities.length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
                City tracking coming soon for this country!
              </p>
            )}

            {/* Notes section */}
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
              color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Travel notes
            </div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Write your memories, tips, or favorite moments..."
              style={{
                width: '100%', minHeight: 80, padding: '12px 14px',
                fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink)',
                background: 'white', border: '1px solid var(--sand)',
                borderRadius: 14, resize: 'vertical',
                lineHeight: 1.5, outline: 'none',
              }}
            />
            <button
              onClick={handleNoteSave}
              style={{
                marginTop: 8, padding: '10px 20px', borderRadius: 12,
                border: 'none', background: noteSaved ? 'var(--forest)' : 'var(--terracotta)',
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                color: 'white', cursor: 'pointer',
                transition: 'background 200ms',
              }}
            >
              {noteSaved ? 'Saved ✓' : 'Save note'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
