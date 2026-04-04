import { motion, AnimatePresence } from 'framer-motion'

export default function Toast({ message, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -8, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -8, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed', top: 80, left: '50%',
            transform: 'translateX(-50%)', zIndex: 9999,
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            color: '#222', background: 'white',
            border: '1px solid #EBEBEB',
            borderRadius: 100, padding: '10px 22px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
