// src/components/stagedemo/ArtifactReveal.jsx
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function ArtifactReveal({ html, title, onClose }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!iframeRef.current || !html) return;
    const doc = iframeRef.current.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed', top: 24, right: 24, bottom: 24,
        width: '55vw',
        display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden',
        background: '#111', border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 120px rgba(220,50,60,0.08)', zIndex: 50,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1 }}>
          {title || 'Generated Asset'}
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
          fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
        }}>x</button>
      </div>
      <div style={{ flex: 1, background: '#fff' }}>
        <iframe ref={iframeRef} sandbox="allow-same-origin"
          style={{ width: '100%', height: '100%', border: 'none' }} title="Artifact Preview" />
      </div>
    </motion.div>
  );
}
