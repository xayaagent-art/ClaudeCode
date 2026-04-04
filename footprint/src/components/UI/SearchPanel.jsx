import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function SearchModal({ countries, isUnlocked, onSelect, open, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = query.length > 0
    ? countries.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : countries.slice(0, 10)

  const handleSelect = useCallback((country) => {
    onSelect(country)
    onClose()
  }, [onSelect, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(26,18,8,0.25)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
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
              padding: '20px 20px 24px',
              maxHeight: '70dvh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 -4px 24px var(--shadow)',
            }}
          >
            {/* Handle */}
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              background: 'var(--sand)', margin: '0 auto 16px',
            }} />

            {/* Search input */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'white', borderRadius: 14,
              border: '1px solid var(--sand)', padding: '0 14px',
              marginBottom: 12,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search countries..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  padding: '14px 0', fontSize: 15, color: 'var(--ink)',
                  width: '100%', fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            {/* Results */}
            <div style={{ overflow: 'auto', flex: 1 }}>
              {filtered.map(c => {
                const unlocked = isUnlocked(c.iso)
                return (
                  <button
                    key={c.iso}
                    onClick={() => handleSelect(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '12px 8px',
                      border: 'none', background: 'transparent',
                      fontFamily: 'var(--font-body)', fontSize: 15,
                      color: 'var(--ink)', cursor: 'pointer',
                      textAlign: 'left', borderRadius: 10,
                      transition: 'background 150ms',
                      minHeight: 44,
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(232,220,200,0.4)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize: 22 }}>{isoToFlag(c.iso)}</span>
                    <span style={{ flex: 1, fontWeight: unlocked ? 600 : 400 }}>{c.name}</span>
                    {unlocked && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--earth)',
                        background: 'rgba(212,168,67,0.15)', padding: '3px 8px',
                        borderRadius: 8,
                      }}>
                        visited
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function isoToFlag(iso) {
  if (!iso || iso.length !== 2) return '\u{1F3F3}\uFE0F'
  const codePoints = [...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...codePoints)
}
