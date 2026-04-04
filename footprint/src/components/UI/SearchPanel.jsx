import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const spring = { type: 'spring', stiffness: 280, damping: 26 }

export default function SearchPanel({ countries, isUnlocked, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const filtered = query.length > 0
    ? countries.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : []

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSelect = useCallback((country) => {
    onSelect(country)
    setQuery('')
    setOpen(false)
  }, [onSelect])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 16,
        zIndex: 60,
        width: 280,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring}
        style={{
          background: 'rgba(10,10,15,0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(26,18,0,0.2)',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 14px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(245,236,215,0.4)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Find a country..."
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '12px 10px',
              fontSize: 13,
              color: 'var(--text-primary)',
              width: '100%',
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>

        <AnimatePresence>
          {open && filtered.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring}
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}
            >
              {filtered.map(c => {
                const unlocked = isUnlocked(c.iso)
                return (
                  <motion.button
                    key={c.iso}
                    onClick={() => handleSelect(c)}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '9px 14px',
                      border: 'none',
                      background: 'transparent',
                      color: unlocked ? '#E8C97A' : 'var(--text-primary)',
                      fontSize: 13,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 200ms',
                    }}
                  >
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: unlocked ? '#C9A84C' : 'rgba(255,255,255,0.15)',
                      flexShrink: 0,
                    }} />
                    {c.name}
                    {unlocked && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5 }}>unlocked</span>
                    )}
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
