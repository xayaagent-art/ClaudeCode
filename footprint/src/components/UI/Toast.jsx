import { motion, AnimatePresence } from 'framer-motion'

export default function Toast({ message, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
          }}
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontSize: 18,
            color: '#E8C97A',
            background: 'rgba(10, 10, 15, 0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(201, 168, 76, 0.3)',
            borderRadius: 40,
            padding: '12px 28px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(201, 168, 76, 0.1)',
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
