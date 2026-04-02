import { motion } from 'framer-motion'

export default function ShareButton({ onClick }) {
  return (
    <motion.button
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.3 }}
      whileHover={{ scale: 1.04, boxShadow: '0 8px 24px rgba(232,133,74,0.3)' }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        background: 'var(--accent)',
        border: 'none',
        borderRadius: 40,
        padding: '14px 28px',
        cursor: 'pointer',
        letterSpacing: '0.01em',
        boxShadow: '0 4px 20px rgba(232,133,74,0.25)',
        whiteSpace: 'nowrap',
      }}
    >
      Share my Footprint &rarr;
    </motion.button>
  )
}
