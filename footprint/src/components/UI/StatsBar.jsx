import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'

export default function StatsBar({ countryCount, continentCount, percentage }) {
  const [bump, setBump] = useState(false)

  useEffect(() => {
    if (countryCount > 0) {
      setBump(true)
      const t = setTimeout(() => setBump(false), 400)
      return () => clearTimeout(t)
    }
  }, [countryCount])

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text-primary)',
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 40,
        padding: '10px 20px',
        letterSpacing: '0.01em',
      }}
    >
      <motion.span
        animate={bump ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ color: '#E8C97A', fontWeight: 600 }}
      >
        {countryCount}
      </motion.span>
      <span style={{ opacity: 0.6 }}>{countryCount === 1 ? 'country' : 'countries'}</span>
      <span style={{ opacity: 0.3, margin: '0 4px' }}>&middot;</span>
      <span style={{ color: '#E8C97A', fontWeight: 600 }}>{continentCount}</span>
      <span style={{ opacity: 0.6 }}>{continentCount === 1 ? 'continent' : 'continents'}</span>
      <span style={{ opacity: 0.3, margin: '0 4px' }}>&middot;</span>
      <span style={{ color: '#E8C97A', fontWeight: 600 }}>{percentage}%</span>
      <span style={{ opacity: 0.6 }}>of the world</span>
    </div>
  )
}
