import { motion, AnimatePresence } from 'framer-motion'
import { useMemo } from 'react'

const colors = ['oklch(52% 0.18 0)', 'oklch(52% 0.12 180)', 'oklch(62% 0.15 50)', 'oklch(58% 0.16 40)', 'oklch(52% 0.12 240)']

export default function ParticleBurst({ x, y, active }) {
  const particles = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.5
      const distance = 40 + Math.random() * 80
      const size = 3 + Math.random() * 3
      return {
        id: i,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        size,
        delay: 0.4 + Math.random() * 0.2,
        color: colors[i % colors.length],
      }
    })
  }, [active])

  return (
    <AnimatePresence>
      {active && (
        <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none', zIndex: 50 }}>
          {particles.map(p => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute',
                width: p.size, height: p.size,
                borderRadius: '50%',
                background: p.color,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
