import { motion } from 'framer-motion'

const variants = {
  primary: {
    background: 'var(--color-brand)',
    color: 'white',
    border: 'none',
    boxShadow: 'var(--shadow-md)',
  },
  secondary: {
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    border: '1.5px solid var(--color-border)',
    boxShadow: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-brand)',
    border: 'none',
    boxShadow: 'none',
  },
}

export default function PillButton({ variant = 'primary', onClick, children, style: extraStyle, ...props }) {
  const v = variants[variant] || variants.primary
  return (
    <motion.button
      whileHover={{ filter: 'brightness(1.05)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      style={{
        height: 52,
        borderRadius: 'var(--radius-full)',
        fontFamily: 'var(--font-body)',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'filter var(--duration-fast)',
        ...v,
        ...extraStyle,
      }}
      {...props}
    >
      {children}
    </motion.button>
  )
}
