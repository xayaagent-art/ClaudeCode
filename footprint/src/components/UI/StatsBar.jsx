import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { CONTINENT_TOTALS, isoToFlag } from '../../data/countryMeta'
import { CONTINENT_COLORS, getContinentColor } from '../../data/continentColors'

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.5" stroke="#484848" strokeWidth="1.5"/>
      <path d="M10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M3.4 3.4l1.8 1.8M14.8 14.8l1.8 1.8M3.4 16.6l1.8-1.8M14.8 5.2l1.8-1.8"
        stroke="#484848" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export default function StatsBar({ countryCount, continentCount, rank, nextRank, countriesUntilNextRank, continentBreakdown, wishlistCount, wishlist, onOpenSettings }) {
  const [bump, setBump] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState('visited') // 'visited' | 'wishlist'

  useEffect(() => {
    if (countryCount > 0) {
      setBump(true)
      const t = setTimeout(() => setBump(false), 400)
      return () => clearTimeout(t)
    }
  }, [countryCount])

  return (
    <>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        style={{
          position: 'fixed', top: 16, left: 16, right: 16,
          zIndex: 60, display: 'flex', alignItems: 'center',
          height: 52, padding: '0 8px 0 20px',
          background: 'white', borderRadius: 100,
          boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 22, fontWeight: 600, color: '#222',
          letterSpacing: '-0.02em', userSelect: 'none',
        }}>
          footprint
        </span>

        <div style={{ flex: 1 }} />

        <div
          onClick={() => setDrawerOpen(!drawerOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            color: '#222', cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span>🌍</span>
          <motion.span
            animate={bump ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ fontWeight: 700 }}
          >
            {countryCount}
          </motion.span>
          <span style={{ color: '#D8D8D8' }}>&middot;</span>
          <span>✈️ {continentCount}</span>
          {wishlistCount > 0 && (
            <>
              <span style={{ color: '#D8D8D8' }}>&middot;</span>
              <span>♡ {wishlistCount}</span>
            </>
          )}
          <span style={{ color: '#D8D8D8' }}>&middot;</span>
          <span>{rank.emoji} {rank.name}</span>
        </div>

        <button
          onClick={onOpenSettings}
          style={{
            marginLeft: 8, width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            borderRadius: '50%', flexShrink: 0,
          }}
        >
          <SettingsIcon />
        </button>
      </motion.div>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 58 }}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              style={{
                position: 'fixed', top: 76, left: 16, right: 16,
                maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
                zIndex: 59, fontFamily: 'var(--font-body)',
                background: 'white', border: '1px solid #EBEBEB',
                borderRadius: 20, padding: '14px 22px 18px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              }}
            >
              {/* Tabs */}
              {wishlistCount > 0 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {['visited', 'wishlist'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      flex: 1, padding: '8px', borderRadius: 10, border: 'none',
                      background: tab === t ? '#222' : '#F7F7F7',
                      color: tab === t ? 'white' : '#717171',
                      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}>
                      {t === 'visited' ? `Visited (${countryCount})` : `Wishlist (${wishlistCount})`}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'visited' && (
                <>
                  <div style={{
                    fontSize: 11, color: '#717171', marginBottom: 12,
                    letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
                  }}>
                    {rank.emoji} {rank.name}
                    {nextRank && (
                      <span style={{ marginLeft: 8, color: 'var(--rausch)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                        · {countriesUntilNextRank} to {nextRank.name}
                      </span>
                    )}
                  </div>

                  {Object.entries(CONTINENT_TOTALS).map(([cont, total]) => {
                    const visited = continentBreakdown[cont] || 0
                    const pct = Math.round((visited / total) * 100)
                    const color = CONTINENT_COLORS[cont] || '#717171'
                    return (
                      <div key={cont} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 0', borderBottom: '1px solid #F7F7F7',
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: '#222' }}>{cont}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{visited}</span>
                        <span style={{ fontSize: 12, color: '#B0B0B0' }}>/ {total}</span>
                        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#F7F7F7', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 300ms' }} />
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {tab === 'wishlist' && (
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  {(wishlist || []).map(iso => {
                    const cont = getContinentColor(null) // we need name, not just iso
                    return (
                      <div key={iso} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', borderBottom: '1px solid #F7F7F7',
                      }}>
                        <span style={{ fontSize: 20 }}>{isoToFlag(iso)}</span>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#222' }}>{iso}</span>
                        <span style={{ fontSize: 12, color: '#C44B6E' }}>♡</span>
                      </div>
                    )
                  })}
                  {(!wishlist || wishlist.length === 0) && (
                    <p style={{ fontSize: 13, color: '#717171', textAlign: 'center', padding: 16 }}>
                      No countries wishlisted yet
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
