// src/components/stagedemo/CardLoader.jsx
//
// Soft cinematic "generating" loader for the stagedemo. The visual brief
// (from the user, after rejecting MockupRain's high-contrast cards):
//   - Faded / low-transparency cards (4% white fill, 8% borders).
//   - Cards must keep "coming through" — continuous flow, not a one-shot
//     entry+idle floats. Gives the page a sense of active generation
//     for the entire duration of the tool call.
//
// Implementation: a small fleet of cards, each on its own infinite
// loop animating from "deep + small + invisible" → "at-camera, visible"
// → "past-camera + tilted away + invisible". Staggered start delays so
// at any moment cards are at different stages of the journey and the
// flow looks unbroken.
import { motion } from 'framer-motion';

// Tuned so 3 cards always overlap on screen with the others
// approaching from depth. Each card cycles every CYCLE_MS, staggered.
const CYCLE_MS = 3600;
const CARDS = [
  { id: 1, lane: { startX: -160, midX: -110, endX: -80,  rotate: -10 }, delay: 0.0 },
  { id: 2, lane: { startX:   60, midX:   90, endX:  130, rotate:   8 }, delay: 1.2 },
  { id: 3, lane: { startX:  -20, midX:   30, endX:   70, rotate:  -3 }, delay: 2.4 },
  { id: 4, lane: { startX:  120, midX:  -60, endX: -120, rotate:   5 }, delay: 0.6 },
  { id: 5, lane: { startX: -100, midX:    0, endX:   60, rotate:  -6 }, delay: 1.8 },
];

function MockCard() {
  return (
    <div
      style={{
        width: 280,
        height: 180,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 20,
      }}
    >
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: 1400,
        pointerEvents: 'none',
      }}
    >
      {CARDS.map((card) => (
        <motion.div
          key={card.id}
          // Continuous loop: card emerges from depth + low opacity,
          // arrives at the foreground full-opacity (still soft, just
          // less hidden), then drifts past + tilts away + fades out.
          // Repeat forever with per-card delay so the stream feels
          // unbroken. The "low/high opacity" range stays well under 1
          // so the cards never feel solid — same faded aesthetic the
          // user liked, just with momentum.
          animate={{
            x:       [card.lane.startX, card.lane.midX,  card.lane.endX],
            y:       [80, -10, -110],
            z:       [-380, 0, 220],
            rotate:  [card.lane.rotate * 1.6, card.lane.rotate, card.lane.rotate * 0.4],
            rotateY: [38, 0, -28],
            scale:   [0.55, 0.95, 1.05],
            opacity: [0, 0.85, 0],
          }}
          transition={{
            duration: CYCLE_MS / 1000,
            ease: 'linear',
            times: [0, 0.45, 1],
            repeat: Infinity,
            delay: card.delay,
          }}
          style={{
            position: 'absolute',
            transformStyle: 'preserve-3d',
            willChange: 'transform, opacity',
          }}
        >
          <MockCard />
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.3 }}
        style={{
          position: 'absolute',
          bottom: 120,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Building your asset…
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
