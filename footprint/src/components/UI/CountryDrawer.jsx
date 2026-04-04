import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { isoToFlag } from '../../data/countryMeta'
import { getCities } from '../../data/cities'
import { getContinentColor } from '../../data/continentColors'
import { isFullyExplored } from '../../data/cityProgress'

function ProgressRing({ current, total, color, size = 64 }) {
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = total > 0 ? current / total : 0
  const offset = circumference * (1 - pct)

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#F0F0F0" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700,
        color: '#222',
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
  const contColor = getContinentColor(continent)
  const fullyExplored = isFullyExplored(iso, unlockedCities)
  const [noteText, setNoteText] = useState(notes?.[iso] || '')
  const [noteSaved, setNoteSaved] = useState(false)
  const [editingNote, setEditingNote] = useState(false)

  // Sort: visited cities first, then locked
  const sortedCities = [...cities].sort((a, b) => {
    const aVisited = citySet.includes(a)
    const bVisited = citySet.includes(b)
    if (aVisited && !bVisited) return -1
    if (!aVisited && bVisited) return 1
    return 0
  })

  const handleNoteSave = () => {
    onNoteSave?.(iso, noteText)
    setNoteSaved(true)
    setEditingNote(false)
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
            background: 'rgba(0,0,0,0.25)',
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
              background: 'white', borderRadius: '24px 24px 0 0',
              padding: '16px 24px 28px',
              maxHeight: '70dvh', overflow: 'auto',
              boxShadow: '0 -4px 24px var(--shadow)',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E0E0E0', margin: '0 auto 16px' }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>{isoToFlag(iso)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{
                    fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
                    color: '#222', margin: 0, lineHeight: 1.1,
                  }}>{name}</h2>
                  {fullyExplored && (
                    <span title="Fully explored" style={{ fontSize: 20 }}>⭐</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                    color: contColor, background: `${contColor}15`,
                    borderRadius: 100, padding: '2px 10px',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {continent}
                  </span>
                  {dateStr && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#717171' }}>
                      visited {dateStr}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Cities section */}
            {cities.length > 0 && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 12,
                }}>
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                    color: '#717171', textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    Cities explored
                  </div>
                  <ProgressRing current={unlockCount} total={cities.length} color={contColor} />
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: 8, marginBottom: 20,
                }}>
                  {sortedCities.map(city => {
                    const isVisited = citySet.includes(city)
                    return (
                      <button
                        key={city}
                        onClick={() => !isVisited && onCityUnlock(iso, city)}
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                          color: isVisited ? 'white' : '#717171',
                          background: isVisited ? contColor : '#F7F7F7',
                          border: isVisited ? 'none' : '1px solid #EBEBEB',
                          borderRadius: 100, padding: '10px 14px', height: 44,
                          cursor: isVisited ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                          transition: 'all 150ms', textAlign: 'left',
                        }}
                      >
                        {isVisited && <span style={{ fontSize: 12 }}>✓</span>}
                        {city}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {cities.length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#717171', textAlign: 'center', padding: '12px 0' }}>
                City tracking coming soon for this country!
              </p>
            )}

            {/* Notes section */}
            <div style={{ borderTop: '1px solid #EBEBEB', paddingTop: 16 }}>
              {!editingNote && !noteText ? (
                <button
                  onClick={() => setEditingNote(true)}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                    color: 'var(--rausch)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  + Add a memory
                </button>
              ) : !editingNote && noteText ? (
                <div onClick={() => setEditingNote(true)} style={{ cursor: 'pointer' }}>
                  <p style={{
                    fontFamily: 'var(--font-display)', fontStyle: 'italic',
                    fontSize: 15, color: '#484848', lineHeight: 1.5,
                  }}>
                    {noteText}
                  </p>
                </div>
              ) : (
                <>
                  <textarea
                    autoFocus
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Write a memory, tip, or favorite moment..."
                    style={{
                      width: '100%', minHeight: 80, padding: '12px 14px',
                      fontFamily: 'var(--font-body)', fontSize: 15, color: '#222',
                      background: '#F7F7F7', border: '1px solid #EBEBEB',
                      borderRadius: 14, resize: 'vertical',
                      lineHeight: 1.5, outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={handleNoteSave} style={{
                      padding: '10px 20px', borderRadius: 12,
                      border: 'none', background: 'var(--rausch)',
                      fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                      color: 'white', cursor: 'pointer',
                    }}>
                      {noteSaved ? 'Saved ✓' : 'Save'}
                    </button>
                    <button onClick={() => setEditingNote(false)} style={{
                      padding: '10px 16px', borderRadius: 12,
                      border: '1px solid #EBEBEB', background: 'white',
                      fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                      color: '#717171', cursor: 'pointer',
                    }}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
