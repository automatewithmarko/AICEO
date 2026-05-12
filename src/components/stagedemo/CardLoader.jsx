// src/components/stagedemo/CardLoader.jsx
import { motion } from 'framer-motion';

const cards = [
  { id: 1, rotate: -12, x: -120, y: -40, scale: 0.9, delay: 0 },
  { id: 2, rotate: 6, x: 80, y: -80, scale: 0.85, delay: 0.1 },
  { id: 3, rotate: -4, x: 40, y: 60, scale: 0.95, delay: 0.2 },
];

function MockCard({ style }) {
  return (
    <div style={{
      width: 280, height: 180, borderRadius: 12,
      background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.08)', padding: 20, ...style,
    }}>
      <div style={{ width: '60%', height: 8, borderRadius: 4, background: 'rgba(220,50,60,0.3)', marginBottom: 12 }} />
      <div style={{ width: '90%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 8 }} />
      <div style={{ width: '75%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 8 }} />
      <div style={{ width: '40%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 16 }} />
      <div style={{ width: 80, height: 24, borderRadius: 6, background: 'rgba(220,50,60,0.2)' }} />
    </div>
  );
}

export default function CardLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1200 }}
    >
      {cards.map((card) => (
        <motion.div
          key={card.id}
          initial={{ x: card.x * 3, y: card.y * 3, rotate: card.rotate * 2, rotateY: 45, scale: 0.3, opacity: 0 }}
          animate={{ x: card.x, y: card.y, rotate: card.rotate, rotateY: 0, scale: card.scale, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100, delay: card.delay }}
          style={{ position: 'absolute', transformStyle: 'preserve-3d' }}
        >
          <motion.div
            animate={{ y: [0, -8, 0], rotate: [card.rotate, card.rotate + 1, card.rotate] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: card.delay }}
          >
            <MockCard />
          </motion.div>
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        style={{ position: 'absolute', bottom: 120, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}
      >
        <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}>
          Building your asset...
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
