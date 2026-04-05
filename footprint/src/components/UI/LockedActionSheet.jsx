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
            background: 'oklch(0% 0 0 / 0.3)',
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
              background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
              padding: 8, margin: '0 16px',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: 'var(--color-ink-3)', textAlign: 'center', padding: '10px 0 6px',
            }}>
              {name}
            </div>

            <button
              onClick={() => { onUnlock(); onClose() }}
              style={{
                width: '100%', height: 52, borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--color-brand)',
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
                width: '100%', height: 52, borderRadius: 'var(--radius-md)',
                border: 'none', background: 'var(--color-surface-2)',
                fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500,
                color: 'var(--color-ink)', cursor: 'pointer', marginBottom: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              ♡ Add to wishlist
            </button>

            <button
              onClick={onClose}
              style={{
                width: '100%', height: 48, borderRadius: 'var(--radius-md)',
                border: 'none', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                color: 'var(--color-ink-3)', cursor: 'pointer',
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
