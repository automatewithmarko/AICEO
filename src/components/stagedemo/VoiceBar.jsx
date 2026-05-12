// src/components/stagedemo/VoiceBar.jsx
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function VoiceBar({ frequencyData, isListening, onEndSession }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frequencyData) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const barCount = 48;
    const barWidth = 3;
    const gap = (w - barCount * barWidth) / (barCount + 1);
    const step = Math.floor(frequencyData.length / barCount);
    for (let i = 0; i < barCount; i++) {
      const value = frequencyData[i * step] / 255;
      const barHeight = Math.max(2, value * h * 0.8);
      const x = gap + i * (barWidth + gap);
      const y = (h - barHeight) / 2;
      ctx.fillStyle = `rgba(220, 50, 60, ${0.4 + value * 0.6})`;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }, [frequencyData]);

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px',
        background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 50, zIndex: 100,
      }}
    >
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: isListening ? '#dc323c' : 'rgba(220,50,60,0.4)',
        boxShadow: isListening ? '0 0 12px rgba(220,50,60,0.6)' : 'none',
        transition: 'all 0.2s',
      }} />
      <canvas ref={canvasRef} width={280} height={32} style={{ display: 'block' }} />
      <button onClick={onEndSession} style={{
        background: 'none', border: '1px solid rgba(255,255,255,0.15)',
        color: 'rgba(255,255,255,0.5)', borderRadius: 20, padding: '4px 14px',
        fontSize: 11, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase',
      }}>End</button>
    </motion.div>
  );
}
