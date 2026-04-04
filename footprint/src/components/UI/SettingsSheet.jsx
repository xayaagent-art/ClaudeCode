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
            background: 'rgba(0,0,0,0.25)',
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
              background: 'white', borderRadius: '24px 24px 0 0',
              padding: '16px 24px 32px',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E0E0E0', margin: '0 auto 20px' }} />

            {!confirmReset ? (
              <>
                <button onClick={() => setConfirmReset(true)} style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  border: 'none', background: 'rgba(255,90,95,0.08)',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  color: 'var(--rausch)', cursor: 'pointer', textAlign: 'center',
                  marginBottom: 10,
                }}>
                  Reset all travels
                </button>
                <div style={{
                  padding: '14px 16px', borderRadius: 14, background: '#F7F7F7',
                  marginBottom: 10,
                }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: '#222', marginBottom: 4 }}>
                    About Footprint
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#717171', lineHeight: 1.5 }}>
                    Your personal travel map. Tap countries to unlock them, track cities, and share your journey. v2.0
                  </div>
                </div>
                <button onClick={onClose} style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  border: '1.5px solid #EBEBEB', background: 'white',
                  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  color: '#222', cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 15, color: '#222',
                  textAlign: 'center', marginBottom: 16, lineHeight: 1.5,
                }}>
                  Remove <strong>{countryCount} countries</strong> and <strong>{cityCount} cities</strong>?
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleReset} style={{
                    flex: 1, padding: '14px 16px', borderRadius: 14, border: 'none',
                    background: 'var(--rausch)', fontFamily: 'var(--font-body)',
                    fontSize: 14, fontWeight: 600, color: 'white', cursor: 'pointer',
                  }}>
                    Yes, reset
                  </button>
                  <button onClick={() => setConfirmReset(false)} style={{
                    flex: 1, padding: '14px 16px', borderRadius: 14,
                    border: '1.5px solid #EBEBEB', background: 'white',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                    color: '#222', cursor: 'pointer',
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
