import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { CONTINENT_TOTALS } from '../../data/countryMeta'
import { CONTINENT_COLORS } from '../../data/continentColors'

export default function StatsBar({ countryCount, continentCount, rank, nextRank, countriesUntilNextRank, continentBreakdown, onOpenSettings }) {
  const [bump, setBump] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (countryCount > 0) {
      setBump(true)
      const t = setTimeout(() => setBump(false), 400)
      return () => clearTimeout(t)
    }
  }, [countryCount])

  return (
    <>
      {/* Top bar — white pill */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        style={{
          position: 'fixed', top: 16, left: 16, right: 16,
          zIndex: 60, display: 'flex', alignItems: 'center',
          height: 52, padding: '0 20px',
          background: 'white', borderRadius: 100,
          boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
        }}
      >
        {/* Wordmark */}
        <span style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 22, fontWeight: 600, color: '#222',
          letterSpacing: '-0.02em', userSelect: 'none',
        }}>
          footprint
        </span>

        <div style={{ flex: 1 }} />

        {/* Stats */}
        <div
          onClick={() => setDrawerOpen(!drawerOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
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
          <span style={{ color: '#D8D8D8' }}>&middot;</span>
          <span>{rank.emoji} {rank.name}</span>
        </div>

        {/* Settings gear */}
        <button
          onClick={onOpenSettings}
          style={{
            marginLeft: 12, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: '#717171', borderRadius: '50%',
            flexShrink: 0,
          }}
        >
          ⚙️
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
                position: 'fixed', top: 76, left: 16, right: 16,
                maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
                zIndex: 59, fontFamily: 'var(--font-body)',
                background: 'white',
                border: '1px solid #EBEBEB',
                borderRadius: 20, padding: '18px 22px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              }}
            >
              <div style={{
                fontSize: 11, color: '#717171', marginBottom: 14,
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
                    padding: '8px 0',
                    borderBottom: '1px solid #F7F7F7',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color, flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, fontSize: 13, color: '#222' }}>{cont}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-body)' }}>
                      {visited}
                    </span>
                    <span style={{ fontSize: 12, color: '#B0B0B0' }}>/ {total}</span>
                    <div style={{
                      width: 40, height: 4, borderRadius: 2, background: '#F7F7F7', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 2,
                        background: color, transition: 'width 300ms',
                      }} />
                    </div>
                  </div>
                )
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
