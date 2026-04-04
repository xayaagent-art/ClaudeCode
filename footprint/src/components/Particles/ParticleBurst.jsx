import { motion, AnimatePresence } from 'framer-motion'
import { useMemo } from 'react'

const colors = ['#D4A843', '#F0C866', '#E8603A', '#2D5016', '#C8E6F5']

export default function ParticleBurst({ x, y, active }) {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 20 + (Math.random() - 0.5) * 0.4
      const distance = 50 + Math.random() * 100
      const size = 4 + Math.random() * 5
      return {
        id: i, size,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        delay: Math.random() * 0.15,
        color: colors[i % colors.length],
        isCircle: Math.random() > 0.4,
      }
    })
  }, [active])

  return (
    <AnimatePresence>
      {active && (
        <div style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none', zIndex: 150 }}>
          {particles.map(p => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.2, rotate: 360 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute',
                width: p.size, height: p.isCircle ? p.size : p.size * 1.5,
                borderRadius: p.isCircle ? '50%' : 2,
                background: p.color,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
