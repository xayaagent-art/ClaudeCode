import { motion, AnimatePresence } from 'framer-motion'

export default function Toast({ message, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 60, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 30, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed', bottom: 140, left: '50%',
            transform: 'translateX(-50%)', zIndex: 110,
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
            color: 'var(--ink)',
            background: 'var(--card-bg)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--sand)',
            borderRadius: 16, padding: '10px 20px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px var(--shadow)',
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
