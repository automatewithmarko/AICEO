// src/pages/StageDemo.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAudioAnalyser } from '../hooks/useAudioAnalyser';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { supabase } from '../lib/supabase';
import VoiceOrb from '../components/stagedemo/VoiceOrb';
import CardLoader from '../components/stagedemo/CardLoader';
import ArtifactPanel from '../components/ArtifactPanel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function StageDemo() {
  // State machine: idle | listening | speaking | generating | artifact
  const [phase, setPhase] = useState('idle');
  const [artifact, setArtifact] = useState(null);
  const artifactRef = useRef(null);
  const [orbScale, setOrbScale] = useState(1);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Audio data for visualizations
  const [audioLevel, setAudioLevel] = useState(0);
  const [bassLevel, setBassLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState(null);
  // const [textInput, setTextInput] = useState(''); // removed — voice only
  const [caption, setCaption] = useState('');
  const captionBufferRef = useRef('');
  const captionTimerRef = useRef(null);

  const animFrameRef = useRef(null);
  const spaceDownRef = useRef(false);
  const generateTimeoutRef = useRef(null);

  // Audio analyser
  const {
    audioCtxRef, playbackAnalyserRef,
    initAudio, connectMic,
    getMicFrequencyData, getPlaybackFrequencyData, getLevel,
    cleanup: cleanupAudio,
  } = useAudioAnalyser();

  // Tool call handler
  const handleToolCall = useCallback(async (toolName, args, callId) => {
    console.log('[stagedemo] Tool call:', toolName, args);
    setPhase('generating');
    setOrbScale(0.3);

    generateTimeoutRef.current = setTimeout(() => {}, 15000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${API_URL}/api/stagedemo/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: toolName,
          args,
          currentHtml: artifactRef.current?.content || undefined,
        }),
      });

      if (!res.ok) throw new Error(`Generation failed: ${res.status}`);
      const data = await res.json();

      clearTimeout(generateTimeoutRef.current);

      // Build artifact object matching ArtifactPanel's expected shape
      const agentName = data.agent || toolName.replace('generate_', '');
      const isNewsletter = agentName === 'newsletter';
      const isLanding = agentName === 'landing-page' || agentName === 'squeeze-page';
      const isStory = agentName === 'story-sequence';
      const newArtifact = {
        type: isNewsletter ? 'newsletter' : isStory ? 'story_sequence' : 'html_template',
        title: data.title || agentName,
        content: data.html,
        agentSource: agentName,
        frames: data.frames || [],
      };
      artifactRef.current = newArtifact;
      setArtifact(newArtifact);

      sendToolResult(callId, `Successfully generated ${data.agent}. The user can now see it on screen. Tell them what you built and ask if they want any changes.`);

      setPhase('artifact');
    } catch (err) {
      console.error('[stagedemo] Generation error:', err);
      clearTimeout(generateTimeoutRef.current);
      sendToolResult(callId, `Generation failed: ${err.message}. Let the user know and offer to try again.`);
      setPhase('speaking');
      setOrbScale(1);
    }
  }, [artifact]);

  // Voice hook
  const {
    status: voiceStatus,
    connect, disconnect,
    startCapture, stopCapture,
    sendText, sendToolResult,
  } = useRealtimeVoice({
    audioCtxRef,
    playbackAnalyserRef,
    onToolCall: handleToolCall,
    onAiSpeakingChange: (speaking) => {
      if (speaking) {
        setCaption('');
        captionBufferRef.current = '';
        if (captionTimerRef.current) { clearTimeout(captionTimerRef.current); captionTimerRef.current = null; }
      }
    },
    onTranscript: (role, data) => {
      if (role === 'ai') {
        // Incremental delta — buffer and drip
        captionBufferRef.current += data;
        if (!captionTimerRef.current) {
          const drip = () => {
            const buf = captionBufferRef.current;
            if (!buf) { captionTimerRef.current = null; return; }
            const sentenceEnd = buf.search(/[.!?]\s/);
            if (sentenceEnd >= 0) {
              const chunk = buf.slice(0, sentenceEnd + 2);
              captionBufferRef.current = buf.slice(sentenceEnd + 2);
              setCaption(chunk.trim());
              captionTimerRef.current = setTimeout(drip, 3000);
            } else if (buf.length > 120) {
              const spaceIdx = buf.lastIndexOf(' ', 120);
              const chunk = buf.slice(0, spaceIdx > 0 ? spaceIdx : 120);
              captionBufferRef.current = buf.slice(chunk.length);
              setCaption(chunk.trim());
              captionTimerRef.current = setTimeout(drip, 3000);
            } else {
              captionTimerRef.current = setTimeout(drip, 200);
            }
          };
          drip();
        }
      } else if (role === 'ai_full') {
        // Full transcript from GA API — show as sentences cycling through
        captionBufferRef.current = '';
        if (captionTimerRef.current) { clearTimeout(captionTimerRef.current); captionTimerRef.current = null; }
        // Split into sentences and cycle
        const sentences = data.match(/[^.!?]+[.!?]+/g) || [data];
        let i = 0;
        const show = () => {
          if (i >= sentences.length) { setCaption(''); captionTimerRef.current = null; return; }
          setCaption(sentences[i].trim());
          i++;
          captionTimerRef.current = setTimeout(show, 3000);
        };
        show();
      }
    },
  });

  // Audio visualization loop — always active when connected
  useEffect(() => {
    const loop = () => {
      const isListening = phase === 'listening';
      const isSpeaking = phase === 'speaking' || phase === 'artifact' || phase === 'generating';

      const data = isListening
        ? getMicFrequencyData()
        : isSpeaking
          ? getPlaybackFrequencyData()
          : new Uint8Array(128);

      setFrequencyData(data);
      setAudioLevel(getLevel(data));

      let bassSum = 0;
      for (let i = 0; i < Math.min(8, data.length); i++) bassSum += data[i];
      setBassLevel(bassSum / (8 * 255));

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, getMicFrequencyData, getPlaybackFrequencyData, getLevel]);

  // Connect voice and start always-on mic (semantic VAD handles turn detection)
  const handleActivate = useCallback(async () => {
    if (isConnected) return;
    try {
      await initAudio();
      try { await connectMic(); } catch { /* mic not required for text mode */ }
      await connect();
      startCapture(); // mic stays on — semantic VAD handles turns
      setIsConnected(true);
      setPhase('listening');
    } catch (err) {
      console.error('[stagedemo] Activation failed:', err);
      setError(err.message);
    }
  }, [isConnected, initAudio, connectMic, connect, startCapture]);

  // Debug: M key opens artifact panel with sample HTML
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'KeyM') {
        setArtifact({
          type: 'newsletter',
          title: 'Sample Newsletter',
          content: `<!DOCTYPE html><html><head><style>
            body{font-family:system-ui;margin:0;padding:40px;background:#fff}
            h1{font-size:36px;margin-bottom:16px}
            p{font-size:18px;color:#444;line-height:1.6;max-width:600px}
            .cta{display:inline-block;margin-top:24px;padding:14px 32px;background:#dc323c;color:#fff;border-radius:8px;font-size:16px;text-decoration:none}
          </style></head><body>
            <h1>Your Weekly Growth Newsletter</h1>
            <p>Hey there! This is a sample newsletter preview to test the artifact panel layout.</p>
            <p>This panel should stay open while the voice orb remains active on the left side.</p>
            <a class="cta" href="#">Subscribe Now</a>
          </body></html>`,
          agentSource: 'newsletter',
        });
        setPhase('artifact');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Fresh session on every mount — reset everything
  useEffect(() => {
    setPhase('idle');
    setIsConnected(false);
    setArtifact(null);
    artifactRef.current = null;
    setCaption('');
    setError(null);
    setOrbScale(1);

    return () => {
      disconnect();
      cleanupAudio();
      clearTimeout(generateTimeoutRef.current);
      if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
    };
  }, []);

  const handleCloseArtifact = () => {
    artifactRef.current = null;
    setArtifact(null);
    setPhase('listening');
    setOrbScale(1);
  };

  const handleEndSession = () => {
    disconnect();
    cleanupAudio();
    setPhase('idle');
    setIsConnected(false);
    setArtifact(null);
    setOrbScale(1);
  };

  const isActive = phase === 'listening' || phase === 'speaking' || phase === 'artifact' || phase === 'generating';
  const hasArtifact = phase === 'artifact' && artifact;
  const showCardLoader = phase === 'generating';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      overflow: 'hidden', userSelect: 'none', cursor: 'default',
    }}>
      {/* Pulsing red gradient background */}
      <motion.div
        animate={{
          opacity: isActive ? [0.15, 0.3, 0.15] : 0,
          scale: isActive ? [1, 1.05, 1] : 1,
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          position: 'absolute',
          inset: '-20%',
          background: 'radial-gradient(ellipse at center, rgba(180,30,40,0.4) 0%, rgba(80,10,20,0.15) 40%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* HUD */}
      <div style={{
        position: 'absolute', top: 20, left: 24,
        display: 'flex', alignItems: 'center', gap: 8, zIndex: 200,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isConnected ? '#dc323c' : 'rgba(220,50,60,0.3)',
          boxShadow: isConnected ? '0 0 8px rgba(220,50,60,0.5)' : 'none',
        }} />
        <span style={{
          color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace',
          fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
        }}>
          Session {isConnected ? '· Live' : '· Standby'}
        </span>
      </div>

      <div style={{
        position: 'absolute', top: 20, left: '50%',
        transform: 'translateX(-50%)', zIndex: 200,
      }}>
        <span style={{
          color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace',
          fontSize: 13, letterSpacing: 6, textTransform: 'uppercase',
        }}>AI CEO</span>
      </div>

      <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 200 }}>
        <span style={{
          color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace',
          fontSize: 11, letterSpacing: 2,
        }}>V1.0 | CONFIDENTIAL</span>
      </div>

      {/* Orb — always visible, shifts left when artifact shows */}
      <motion.div
        animate={{
          x: hasArtifact ? '-25vw' : 0,
          scale: hasArtifact ? 0.6 : orbScale,
        }}
        transition={{ type: 'spring', damping: 22, stiffness: 120 }}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
            <div style={{ width: 500, height: 500, position: 'relative', overflow: 'visible' }}>
              {/* Glow rings */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 600, height: 600, transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `1px solid rgba(220,50,60,${isActive ? 0.2 : 0.06})`,
                transition: 'all 0.5s', pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 700, height: 700, transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `1px solid rgba(220,50,60,${isActive ? 0.12 : 0.03})`,
                transition: 'all 0.5s', pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 840, height: 840, transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `1px solid rgba(220,50,60,${isActive ? 0.06 : 0.01})`,
                transition: 'all 0.5s', pointerEvents: 'none',
              }} />

              <VoiceOrb audioLevel={audioLevel} bassLevel={bassLevel} isActive={isActive} />

              {/* Mic icon (idle only) */}
              {phase === 'idle' && !isConnected && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)', zIndex: 10,
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </motion.div>
              )}
            </div>
      </motion.div>

      {/* Listening badge */}
      <AnimatePresence>
        {phase === 'listening' && (
          <motion.div
            key="listening-badge"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 20px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, zIndex: 100,
            }}
          >
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc323c' }}
            />
            <span style={{
              color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace',
              fontSize: 12, letterSpacing: 3, textTransform: 'uppercase',
            }}>Listening</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live captions */}
      <AnimatePresence>
        {caption && isConnected && (
          <motion.div
            key="caption"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              bottom: hasArtifact ? 60 : 100,
              left: hasArtifact ? 24 : '50%',
              transform: hasArtifact ? 'none' : 'translateX(-50%)',
              maxWidth: hasArtifact ? '40vw' : '60vw',
              textAlign: 'center',
              zIndex: 100,
              pointerEvents: 'none',
            }}
          >
            <span style={{
              color: '#fff',
              fontSize: 28,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: 700,
              lineHeight: 1.4,
              textShadow: '0 2px 20px rgba(0,0,0,0.9), 0 4px 40px rgba(0,0,0,0.5)',
              letterSpacing: -0.3,
            }}>
              {caption}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle prompt */}
      <AnimatePresence>
        {phase === 'idle' && !isConnected && (
          <motion.div
            key="idle-prompt"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 10, zIndex: 100,
            }}
          >
            <span style={{
              color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace',
              fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
            }}>Tap to brief your CEO</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card loader (generating) */}
      <AnimatePresence>
        {showCardLoader && <CardLoader key="card-loader" />}
      </AnimatePresence>

      {/* Artifact panel — slides in from right */}
      <AnimatePresence>
        {hasArtifact && (
          <motion.div
            key="artifact-panel"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: '55vw',
              zIndex: 50,
              background: '#111',
            }}
          >
            <ArtifactPanel
              artifact={artifact}
              onClose={handleCloseArtifact}
              onContentChange={(newContent) => {
                setArtifact(prev => {
                  const updated = prev ? { ...prev, content: newContent } : null;
                  artifactRef.current = updated;
                  return updated;
                });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
            padding: '12px 24px', background: 'rgba(220,50,60,0.15)',
            border: '1px solid rgba(220,50,60,0.3)', borderRadius: 8,
            color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', fontSize: 12,
            zIndex: 300, cursor: 'pointer',
          }}
          onClick={() => { setError(null); handleActivate(); }}
        >
          {error} — tap to retry
        </div>
      )}

      {/* Click handler for mobile/tap */}
      {phase === 'idle' && !isConnected && (
        <div onClick={handleActivate} style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }} />
      )}
    </div>
  );
}
