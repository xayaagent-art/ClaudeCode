import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

export default function SettingsSheet({ open, onClose, countryCount, cityCount }) {
  const [confirmReset, setConfirmReset] = useState(false)

  const handleReset = () => {
    localStorage.removeItem('footprint_unlocked')
    localStorage.removeItem('footprint_cities')
    localStorage.removeItem('footprint_notes')
    window.location.reload()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => { onClose(); setConfirmReset(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(26,18,8,0.25)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--cream)', borderRadius: '24px 24px 0 0',
              padding: '20px 24px 32px',
              boxShadow: '0 -4px 24px var(--shadow)',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--sand)', margin: '0 auto 20px' }} />

            {!confirmReset ? (
              <>
                <button onClick={() => setConfirmReset(true)} style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  border: 'none', background: 'rgba(232,96,58,0.08)',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  color: '#C0392B', cursor: 'pointer', textAlign: 'center',
                  marginBottom: 10,
                }}>
                  Reset all travels
                </button>
                <div style={{
                  padding: '14px 16px', borderRadius: 14, background: 'white',
                  border: '1px solid var(--sand)', marginBottom: 10,
                }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                    About Footprint
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Your personal travel map. Tap countries to unlock them, track cities, and share your journey. v1.0
                  </div>
                </div>
                <button onClick={onClose} style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  border: '1px solid var(--sand)', background: 'white',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  color: 'var(--ink)', cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--ink)',
                  textAlign: 'center', marginBottom: 16, lineHeight: 1.5,
                }}>
                  Are you sure? This will remove all <strong>{countryCount} countries</strong> and <strong>{cityCount} cities</strong>.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleReset} style={{
                    flex: 1, padding: '14px 16px', borderRadius: 14, border: 'none',
                    background: '#C0392B', fontFamily: 'var(--font-body)',
                    fontSize: 14, fontWeight: 600, color: 'white', cursor: 'pointer',
                  }}>
                    Yes, reset
                  </button>
                  <button onClick={() => setConfirmReset(false)} style={{
                    flex: 1, padding: '14px 16px', borderRadius: 14,
                    border: '1px solid var(--sand)', background: 'white',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                    color: 'var(--ink)', cursor: 'pointer',
                  }}>
                    Keep my travels
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
