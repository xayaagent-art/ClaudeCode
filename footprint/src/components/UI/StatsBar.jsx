import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { CONTINENT_TOTALS } from '../../data/countryMeta'

export default function StatsBar({ countryCount, continentCount, rank, nextRank, countriesUntilNextRank, continentBreakdown }) {
  const [bump, setBump] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [narrow, setNarrow] = useState(window.innerWidth < 390)

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 390)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
        onClick={() => setDrawerOpen(!drawerOpen)}
        style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 60, display: 'flex', alignItems: 'center', gap: narrow ? 6 : 8,
          fontFamily: 'var(--font-body)', fontSize: narrow ? 12 : 13, fontWeight: 600,
          color: 'var(--ink)',
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--sand)',
          borderRadius: 40, padding: narrow ? '8px 14px' : '10px 20px',
          boxShadow: '0 2px 12px var(--shadow)',
          cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        }}
      >
        <span>🌍</span>
        <motion.span
          animate={bump ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontFamily: 'var(--font-display)', fontSize: narrow ? 14 : 16, fontWeight: 700, color: 'var(--terracotta)' }}
        >
          {countryCount}
        </motion.span>
        <span style={{ opacity: 0.4 }}>&middot;</span>
        {narrow ? (
          <span>✈️ {continentCount}</span>
        ) : (
          <>
            <span>✈️ {continentCount}</span>
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span>{rank.emoji} {rank.name}</span>
          </>
        )}
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
                position: 'fixed', top: 62, left: '50%', transform: 'translateX(-50%)',
                zIndex: 59, fontFamily: 'var(--font-body)',
                background: 'var(--white-card)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--sand)',
                borderRadius: 20, padding: '18px 22px',
                minWidth: 260, boxShadow: '0 8px 32px var(--shadow)',
              }}
            >
              <div style={{
                fontSize: 11, color: 'var(--muted)', marginBottom: 14,
                letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
              }}>
                {rank.emoji} {rank.name}
                {nextRank && (
                  <span style={{ marginLeft: 8, color: 'var(--terracotta)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                    · {countriesUntilNextRank} to {nextRank.name}
                  </span>
                )}
              </div>

              {Object.entries(CONTINENT_TOTALS).map(([cont, total]) => {
                const visited = continentBreakdown[cont] || 0
                const pct = Math.round((visited / total) * 100)
                return (
                  <div key={cont} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(221,216,206,0.5)',
                  }}>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{cont}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--terracotta)', fontFamily: 'var(--font-display)' }}>
                      {visited}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>/ {total}</span>
                    <div style={{
                      width: 40, height: 4, borderRadius: 2, background: 'var(--sand)', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 2,
                        background: 'var(--terracotta)', transition: 'width 300ms',
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
