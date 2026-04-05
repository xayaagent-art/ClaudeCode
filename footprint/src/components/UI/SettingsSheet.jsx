import { useState } from 'react'
import BottomSheet from './BottomSheet'
import PillButton from './PillButton'

export default function SettingsSheet({ open, onClose, countryCount, cityCount }) {
  const [confirmReset, setConfirmReset] = useState(false)

  const handleReset = () => {
    localStorage.removeItem('footprint_unlocked')
    localStorage.removeItem('footprint_cities')
    localStorage.removeItem('footprint_notes')
    localStorage.removeItem('footprint_wishlist')
    window.location.reload()
  }

  const handleClose = () => {
    onClose()
    setConfirmReset(false)
  }

  return (
    <BottomSheet open={open} onClose={handleClose} maxWidth={400} zIndex={300}>
      <div style={{ padding: '0 24px 32px' }}>
        {!confirmReset ? (
          <>
            <button onClick={() => setConfirmReset(true)} style={{
              width: '100%', padding: '14px 16px', borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'color-mix(in oklch, var(--color-brand) 8%, transparent)',
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
              color: 'var(--color-brand)', cursor: 'pointer', textAlign: 'center',
              marginBottom: 10,
            }}>
              Reset all travels
            </button>
            <div style={{
              padding: '14px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-2)', marginBottom: 10,
            }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>
                About Footprint
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-3)', lineHeight: 1.5 }}>
                Your personal travel map. Tap countries to unlock them, track cities, and share your journey. v3.0
              </div>
            </div>
            <PillButton variant="secondary" onClick={handleClose} style={{ width: '100%' }}>
              Cancel
            </PillButton>
          </>
        ) : (
          <>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)',
              textAlign: 'center', marginBottom: 16, lineHeight: 1.5,
            }}>
              Remove <strong>{countryCount} countries</strong> and <strong>{cityCount} cities</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <PillButton variant="primary" onClick={handleReset} style={{ flex: 1 }}>
                Yes, reset
              </PillButton>
              <PillButton variant="secondary" onClick={() => setConfirmReset(false)} style={{ flex: 1 }}>
                Keep my travels
              </PillButton>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
