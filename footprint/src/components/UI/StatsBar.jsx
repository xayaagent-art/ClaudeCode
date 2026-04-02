import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { CONTINENT_TOTALS } from '../../data/countryMeta'

export default function StatsBar({ countryCount, continentCount, percentage, rank, nextRank, countriesUntilNextRank, continentBreakdown }) {
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
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={() => setDrawerOpen(!drawerOpen)}
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 60,
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13, fontWeight: 500,
          color: 'var(--text-primary)',
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 40, padding: '10px 18px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 12 }}>{rank.emoji}</span>
        <span style={{ opacity: 0.5 }}>🌍</span>
        <motion.span
          animate={bump ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ color: '#E8C97A', fontWeight: 600 }}
        >
          {countryCount}
        </motion.span>
        <span style={{ opacity: 0.5 }}>countries</span>
        <span style={{ opacity: 0.2 }}>&middot;</span>
        <span style={{ color: '#E8C97A', fontWeight: 600 }}>{continentCount}</span>
        <span style={{ opacity: 0.5 }}>continents</span>
        <span style={{ opacity: 0.2 }}>&middot;</span>
        <span style={{ color: '#E8C97A', fontWeight: 600 }}>{percentage}%</span>
        <span style={{ opacity: 0.5 }}>explored</span>
      </motion.div>

      {/* Continent drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={{
              position: 'fixed', top: 60, right: 16, zIndex: 59,
              fontFamily: "'DM Sans', sans-serif",
              background: 'rgba(10,10,15,0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '16px 20px',
              minWidth: 220,
            }}
          >
            <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {rank.emoji} {rank.name}
              {nextRank && (
                <span style={{ marginLeft: 8, color: 'rgba(201,168,76,0.6)' }}>
                  · {countriesUntilNextRank} to {nextRank.name}
                </span>
              )}
            </div>

            {Object.entries(CONTINENT_TOTALS).map(([continent, total]) => {
              const visited = continentBreakdown[continent] || 0
              const pct = Math.round((visited / total) * 100)
              return (
                <div key={continent} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 0', fontSize: 13,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ color: 'rgba(245,236,215,0.7)' }}>{continent}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#E8C97A', fontWeight: 600 }}>{visited}</span>
                    <span style={{ color: 'rgba(245,236,215,0.3)' }}>/ {total}</span>
                    <span style={{
                      fontSize: 10, color: 'rgba(201,168,76,0.5)',
                      minWidth: 30, textAlign: 'right',
                    }}>{pct}%</span>
                  </span>
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
