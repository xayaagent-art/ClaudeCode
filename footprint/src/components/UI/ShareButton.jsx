import { motion } from 'framer-motion'

const spring = { type: 'spring', stiffness: 280, damping: 26 }

export default function ShareButton({ onClick }) {
  return (
    <motion.button
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...spring, delay: 0.2 }}
      whileHover={{ scale: 1.04, boxShadow: '0 8px 24px rgba(255,107,53,0.3)' }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 16,
        zIndex: 60,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
        background: 'var(--accent)',
        border: 'none',
        borderRadius: 40,
        padding: '12px 22px',
        cursor: 'pointer',
        letterSpacing: '0.01em',
        boxShadow: '0 4px 16px rgba(255,107,53,0.2)',
        transition: 'box-shadow 200ms',
      }}
    >
      Share my Footprint &rarr;
    </motion.button>
  )
}
