import { motion, AnimatePresence } from 'framer-motion'
import { useMemo } from 'react'

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
      }
    })
  }, [active])

  return (
    <AnimatePresence>
      {active && (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: y,
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          {particles.map(p => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: p.dx,
                y: p.dy,
                opacity: 0,
                scale: 0.3,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.2,
                delay: p.delay,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                position: 'absolute',
                width: p.size,
                height: p.size,
                borderRadius: '50%',
                background: `radial-gradient(circle, #E8C97A, #C9A84C)`,
                boxShadow: '0 0 6px 2px rgba(201, 168, 76, 0.4)',
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
