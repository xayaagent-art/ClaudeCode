import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { CONTINENT_TOTALS, isoToFlag } from '../../data/countryMeta'
import { CONTINENT_COLORS } from '../../data/continentColors'
import ContinentBadge from './ContinentBadge'

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M3.4 3.4l1.8 1.8M14.8 14.8l1.8 1.8M3.4 16.6l1.8-1.8M14.8 5.2l1.8-1.8"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export default function StatsBar({ countryCount, continentCount, rank, nextRank, countriesUntilNextRank, continentBreakdown, wishlistCount, wishlist, onOpenSettings }) {
  const [bump, setBump] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState('visited')

  useEffect(() => {
    if (countryCount > 0) {
      setBump(true)
      const t = setTimeout(() => setBump(false), 400)
      return () => clearTimeout(t)
    }
  }, [countryCount])

  return (
    <>
      {/* Floating top pill */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        style={{
          position: 'fixed', top: 12, left: 12, right: 12,
          zIndex: 60, display: 'flex', alignItems: 'center',
          height: 50, padding: '0 16px',
          background: 'oklch(100% 0 0 / 0.88)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-full)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* LEFT: wordmark */}
        <span style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 22, fontWeight: 600, color: 'var(--color-ink)',
          letterSpacing: '-0.02em', userSelect: 'none',
        }}>
          footprint
        </span>

        <div style={{ flex: 1 }} />

        {/* CENTER: stats */}
        <div
          onClick={() => setDrawerOpen(!drawerOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
            color: 'var(--color-ink-2)', cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>🌍</span>
            <motion.span
              animate={bump ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontWeight: 700, color: 'var(--color-ink)' }}
            >
              {countryCount}
            </motion.span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>✈️</span>
            <span>{continentCount}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>🗺️</span>
            <span>{rank.name}</span>
          </span>
        </div>

        {/* RIGHT: settings */}
        <button
          onClick={onOpenSettings}
          style={{
            marginLeft: 10, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            borderRadius: '50%', flexShrink: 0,
            color: 'var(--color-ink-3)',
          }}
        >
          <SettingsIcon />
        </button>
      </motion.div>

      {/* Continent breakdown drawer */}
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
                position: 'fixed', top: 72, left: 16, right: 16,
                maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
                zIndex: 59, fontFamily: 'var(--font-body)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '14px 20px 18px',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {/* Tabs */}
              {wishlistCount > 0 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                  {['visited', 'wishlist'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', border: 'none',
                      background: tab === t ? 'var(--color-ink)' : 'var(--color-surface-2)',
                      color: tab === t ? 'white' : 'var(--color-ink-3)',
                      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textTransform: 'capitalize',
                      transition: 'all var(--duration-fast)',
                    }}>
                      {t === 'visited' ? `Visited (${countryCount})` : `Wishlist (${wishlistCount})`}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'visited' && (
                <>
                  <div style={{
                    fontSize: 11, color: 'var(--color-ink-3)', marginBottom: 12,
                    letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
                  }}>
                    {rank.emoji} {rank.name}
                    {nextRank && (
                      <span style={{ marginLeft: 8, color: 'var(--color-brand)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
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
                        padding: '7px 0', borderBottom: '1px solid var(--color-surface-2)',
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--color-ink)' }}>{cont}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{visited}</span>
                        <span style={{ fontSize: 12, color: 'var(--color-ink-3)' }}>/ {total}</span>
                        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 300ms' }} />
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {tab === 'wishlist' && (
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  {(wishlist || []).map(iso => (
                    <div key={iso} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 0', borderBottom: '1px solid var(--color-surface-2)',
                    }}>
                      <span style={{ fontSize: 20 }}>{isoToFlag(iso)}</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>{iso}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-brand)' }}>♡</span>
                    </div>
                  ))}
                  {(!wishlist || wishlist.length === 0) && (
                    <p style={{ fontSize: 13, color: 'var(--color-ink-3)', textAlign: 'center', padding: 16 }}>
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
