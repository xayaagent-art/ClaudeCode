import { motion, AnimatePresence } from 'framer-motion'

export default function Toast({ message, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -12, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed', top: 60, left: '50%',
            transform: 'translateX(-50%)', zIndex: 9999,
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            color: 'var(--ink)',
            background: 'white',
            border: '1px solid var(--sand)',
            borderRadius: 40, padding: '10px 22px',
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
