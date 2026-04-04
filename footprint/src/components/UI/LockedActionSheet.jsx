import { motion, AnimatePresence } from 'framer-motion'

export default function LockedActionSheet({ data, onUnlock, onWishlist, onClose }) {
  if (!data) return null
  const { name } = data

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 150,
            background: 'rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360,
              background: 'white', borderRadius: 20,
              padding: '8px', margin: '0 16px',
              boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: '#717171', textAlign: 'center', padding: '10px 0 6px',
            }}>
              {name}
            </div>

            <button
              onClick={() => { onUnlock(); onClose() }}
              style={{
                width: '100%', height: 52, borderRadius: 14,
                border: 'none', background: 'var(--rausch)',
                fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600,
                color: 'white', cursor: 'pointer', marginBottom: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              ✓ I have been here
            </button>

            <button
              onClick={() => { onWishlist(); onClose() }}
              style={{
                width: '100%', height: 52, borderRadius: 14,
                border: 'none', background: '#F7F7F7',
                fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500,
                color: '#222', cursor: 'pointer', marginBottom: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              ♡ Add to wishlist
            </button>

            <button
              onClick={onClose}
              style={{
                width: '100%', height: 48, borderRadius: 14,
                border: 'none', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: '#717171', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
