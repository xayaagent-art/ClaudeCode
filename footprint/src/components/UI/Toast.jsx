import { motion, AnimatePresence } from 'framer-motion'

export default function Toast({ message, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -12, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -12, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed', top: 76, left: '50%',
            transform: 'translateX(-50%)', zIndex: 9999,
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            color: 'var(--color-ink)', background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-full)', padding: '10px 22px',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
