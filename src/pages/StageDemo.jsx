// src/pages/StageDemo.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAudioAnalyser } from '../hooks/useAudioAnalyser';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { supabase } from '../lib/supabase';
import VoiceOrb from '../components/stagedemo/VoiceOrb';
import VoiceBar from '../components/stagedemo/VoiceBar';
import CardLoader from '../components/stagedemo/CardLoader';
import ArtifactReveal from '../components/stagedemo/ArtifactReveal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function StageDemo() {
  // State machine: idle | listening | speaking | generating | artifact
  const [phase, setPhase] = useState('idle');
  const [artifactHtml, setArtifactHtml] = useState(null);
  const [artifactTitle, setArtifactTitle] = useState('');
  const [artifactAgent, setArtifactAgent] = useState('');
  const [orbScale, setOrbScale] = useState(1);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Audio data for visualizations
  const [audioLevel, setAudioLevel] = useState(0);
  const [bassLevel, setBassLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState(null);
  const [textInput, setTextInput] = useState('');

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
          currentHtml: artifactHtml || undefined,
        }),
      });

      if (!res.ok) throw new Error(`Generation failed: ${res.status}`);
      const data = await res.json();

      clearTimeout(generateTimeoutRef.current);

      setArtifactHtml(data.html);
      setArtifactTitle(data.title || toolName.replace('generate_', ''));
      setArtifactAgent(data.agent);

      sendToolResult(callId, `Successfully generated ${data.agent}. The user can now see it on screen.`);

      // Show artifact after card animation
      setTimeout(() => setPhase('artifact'), 2500);
    } catch (err) {
      console.error('[stagedemo] Generation error:', err);
      clearTimeout(generateTimeoutRef.current);
      sendToolResult(callId, `Generation failed: ${err.message}. Let the user know and offer to try again.`);
      setPhase('speaking');
      setOrbScale(1);
    }
  }, [artifactHtml]);

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
      if (speaking && phase !== 'generating' && phase !== 'artifact') {
        setPhase('speaking');
      }
    },
    onTranscript: () => {},
  });

  // Audio visualization loop
  useEffect(() => {
    const loop = () => {
      const isListening = phase === 'listening';
      const isSpeaking = phase === 'speaking';

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

  // Connect voice on first interaction
  const handleActivate = useCallback(async () => {
    if (isConnected) return;
    try {
      await initAudio();
      try { await connectMic(); } catch { /* mic not required for text mode */ }
      await connect();
      setIsConnected(true);
    } catch (err) {
      console.error('[stagedemo] Activation failed:', err);
      setError(err.message);
    }
  }, [isConnected, initAudio, connectMic, connect]);

  // Keyboard handler (space = push-to-talk)
  useEffect(() => {
    const handleKeyDown = async (e) => {
      // Don't capture space when typing in the text input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      spaceDownRef.current = true;

      if (!isConnected) {
        await handleActivate();
      }

      setPhase('listening');
      startCapture();
    };

    const handleKeyUp = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!spaceDownRef.current) return;
      spaceDownRef.current = false;

      stopCapture();
      setPhase('speaking');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isConnected, handleActivate, startCapture, stopCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      cleanupAudio();
      clearTimeout(generateTimeoutRef.current);
    };
  }, [disconnect, cleanupAudio]);

  const handleCloseArtifact = () => {
    setPhase('idle');
    setOrbScale(1);
  };

  const handleEndSession = () => {
    disconnect();
    cleanupAudio();
    setPhase('idle');
    setIsConnected(false);
    setArtifactHtml(null);
    setOrbScale(1);
  };

  const isActive = phase === 'listening' || phase === 'speaking';
  const showOrb = phase !== 'artifact';
  const showArtifact = phase === 'artifact' && artifactHtml;
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

      {/* Orb */}
      <AnimatePresence>
        {showOrb && (
          <motion.div
            key="orb"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: orbScale }}
            exit={{ opacity: 0, scale: 0.2 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>
              {/* Glow rings — centered via absolute positioning */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 700, height: 700, transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `1px solid rgba(220,50,60,${isActive ? 0.2 : 0.06})`,
                transition: 'all 0.5s', pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 800, height: 800, transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `1px solid rgba(220,50,60,${isActive ? 0.12 : 0.03})`,
                transition: 'all 0.5s', pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 940, height: 940, transform: 'translate(-50%, -50%)',
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
        )}
      </AnimatePresence>

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
              padding: '4px 10px', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4, color: 'rgba(255,255,255,0.4)',
              fontFamily: 'monospace', fontSize: 12,
            }}>SPACE</span>
            <span style={{
              color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace',
              fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
            }}>or tap to brief your CEO</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Done speaking button */}
      <AnimatePresence>
        {phase === 'listening' && (
          <motion.button
            key="done-btn"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            onClick={() => {
              spaceDownRef.current = false;
              stopCapture();
              setPhase('speaking');
            }}
            style={{
              position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 24px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24,
              color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace',
              fontSize: 12, cursor: 'pointer', zIndex: 100,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#dc323c' }} />
            Done speaking
          </motion.button>
        )}
      </AnimatePresence>

      {/* Card loader (generating) */}
      <AnimatePresence>
        {showCardLoader && <CardLoader key="card-loader" />}
      </AnimatePresence>

      {/* Artifact panel */}
      <AnimatePresence>
        {showArtifact && (
          <ArtifactReveal key="artifact" html={artifactHtml} title={artifactTitle} onClose={handleCloseArtifact} />
        )}
      </AnimatePresence>

      {/* Voice bar (during artifact view) */}
      <AnimatePresence>
        {phase === 'artifact' && (
          <VoiceBar key="voice-bar" frequencyData={frequencyData} isListening={spaceDownRef.current} onEndSession={handleEndSession} />
        )}
      </AnimatePresence>

      {/* Text input (for testing without mic) */}
      {isConnected && phase !== 'artifact' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!textInput.trim()) return;
            sendText(textInput.trim());
            setTextInput('');
            setPhase('speaking');
          }}
          style={{
            position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 8, zIndex: 100, width: 480,
          }}
        >
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type a message..."
            style={{
              flex: 1, padding: '10px 16px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 24, color: '#fff', fontSize: 13, fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '10px 20px', background: 'rgba(220,50,60,0.2)',
            border: '1px solid rgba(220,50,60,0.3)', borderRadius: 24,
            color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'monospace',
            cursor: 'pointer', letterSpacing: 1,
          }}>Send</button>
        </form>
      )}

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
