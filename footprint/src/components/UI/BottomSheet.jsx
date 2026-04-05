import { motion, AnimatePresence } from 'framer-motion'

export default function BottomSheet({ open, onClose, children, maxHeight = '85dvh', maxWidth = 480, zIndex = 100 }) {
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
            position: 'fixed', inset: 0, zIndex,
            background: 'oklch(0% 0 0 / 0.3)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth,
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
              maxHeight,
              display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-xl)',
              overflow: 'hidden',
            }}
          >
            {/* Drag handle */}
            <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: 'oklch(85% 0.005 60)',
              }} />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
