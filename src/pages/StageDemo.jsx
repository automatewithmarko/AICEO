// src/pages/StageDemo.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAudioAnalyser } from '../hooks/useAudioAnalyser';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { supabase } from '../lib/supabase';
import VoiceOrb from '../components/stagedemo/VoiceOrb';
import MockupRain from '../components/stagedemo/MockupRain';
import ArtifactPanel from '../components/ArtifactPanel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function StageDemo() {
  // State machine: idle | listening | speaking | generating | artifact
  const [phase, setPhase] = useState('idle');
  const [artifact, setArtifact] = useState(null);
  const artifactRef = useRef(null);
  // When true, the panel is hidden but `artifact` is kept so the user
  // can re-open the generated artifact. Previously hitting the close
  // (X) inside the panel destroyed the artifact entirely, losing the
  // generated landing page / newsletter / etc.
  const [artifactCollapsed, setArtifactCollapsed] = useState(false);
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
  // Captions on/off. Default OFF for a cleaner stage — tiny CC button
  // in the HUD turns them on if needed (audience accessibility, etc.).
  // Mirrored to a ref so the onTranscript callback can short-circuit
  // without being rebuilt on every toggle (which would tear down the
  // websocket message handler).
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const captionsEnabledRef = useRef(false);
  useEffect(() => { captionsEnabledRef.current = captionsEnabled; }, [captionsEnabled]);

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
      // Always pop the panel open on a fresh generation, even if the
      // user had collapsed a previous artifact.
      setArtifactCollapsed(false);

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
    isMuted,
    connect, disconnect,
    startCapture, stopCapture,
    toggleMute,
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
      // Bail out early if captions are off. We still receive the
      // transcript events from OpenAI (they ride the same WebSocket as
      // the audio); we just don't bother buffering or rendering them.
      if (!captionsEnabledRef.current) return;
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

  // Audio visualization loop — always active when connected.
  //
  // When the mic is muted, we deliberately feed zeros instead of mic
  // frequency data so the Three.js orb doesn't fluctuate from ambient
  // analyser noise / smoothing tail / any low-level signal leakage.
  // Playback (AI speaking) viz is unaffected — mute is mic-only.
  useEffect(() => {
    const SILENT = new Uint8Array(128);
    const loop = () => {
      const isListening = phase === 'listening' && !isMuted;
      const isSpeaking = phase === 'speaking' || phase === 'artifact' || phase === 'generating';

      const data = isListening
        ? getMicFrequencyData()
        : isSpeaking
          ? getPlaybackFrequencyData()
          : SILENT;

      setFrequencyData(data);
      setAudioLevel(getLevel(data));

      let bassSum = 0;
      for (let i = 0; i < Math.min(8, data.length); i++) bassSum += data[i];
      setBassLevel(bassSum / (8 * 255));

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, isMuted, getMicFrequencyData, getPlaybackFrequencyData, getLevel]);

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

  // Panel X button — COLLAPSE, not destroy. The artifact stays in
  // state so a "Show preview" pill (in the HUD when collapsed) can
  // bring it back. A new generation replaces it; ending the session
  // clears it entirely. Solves the "I closed the preview and lost
  // my landing page" trap.
  const handleCollapseArtifact = () => {
    setArtifactCollapsed(true);
    setPhase('listening');
    setOrbScale(1);
  };

  const handleExpandArtifact = () => {
    setArtifactCollapsed(false);
    setPhase('artifact');
  };

  const handleEndSession = () => {
    disconnect();
    cleanupAudio();
    setPhase('idle');
    setIsConnected(false);
    setArtifact(null);
    artifactRef.current = null;
    setArtifactCollapsed(false);
    setOrbScale(1);
  };

  const isActive = phase === 'listening' || phase === 'speaking' || phase === 'artifact' || phase === 'generating';
  // "Has artifact and is visible". Hidden-but-kept (collapsed) doesn't
  // count — orb returns to centre, panel is unmounted, "Show preview"
  // pill takes over until the user expands again.
  const hasArtifact = phase === 'artifact' && artifact && !artifactCollapsed;
  // Separate signal — "we still have a saved artifact the user can
  // bring back". Drives the Show-preview pill in the HUD.
  const hasCollapsedArtifact = !!artifact && artifactCollapsed;
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

      {/* HUD — hidden on mobile */}
      <div className="stagedemo-hud" style={{
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

      <div className="stagedemo-hud" style={{
        position: 'absolute', top: 20, left: '50%',
        transform: 'translateX(-50%)', zIndex: 200,
      }}>
        <span style={{
          color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace',
          fontSize: 13, letterSpacing: 6, textTransform: 'uppercase',
        }}>AI CEO</span>
      </div>

      <div className="stagedemo-hud" style={{
        position: 'absolute', top: 20, right: 24, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Show-preview pill — only when an artifact is collapsed.
            One click brings the panel back; new generations also pop
            it open automatically. */}
        {isConnected && hasCollapsedArtifact && (
          <button
            type="button"
            onClick={handleExpandArtifact}
            title="Show the artifact you just generated"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px',
              background: 'rgba(220,50,60,0.18)',
              border: '1px solid rgba(220,50,60,0.45)',
              borderRadius: 8,
              color: 'rgba(255,200,205,0.95)',
              fontFamily: 'monospace', fontSize: 11, letterSpacing: 2,
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
              maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span>Show preview{artifact?.title ? ` · ${artifact.title}` : ''}</span>
          </button>
        )}
        {/* Captions toggle — only shown while a session is live. Default
            on for audience accessibility; off when the user wants a
            cleaner stage. Clears any in-flight caption + buffer + drip
            timer on the way down so a half-rendered sentence doesn't
            stick around. */}
        {isConnected && (
          <button
            type="button"
            onClick={() => {
              const next = !captionsEnabled;
              setCaptionsEnabled(next);
              if (!next) {
                captionBufferRef.current = '';
                if (captionTimerRef.current) {
                  clearTimeout(captionTimerRef.current);
                  captionTimerRef.current = null;
                }
                setCaption('');
              }
            }}
            aria-label={captionsEnabled ? 'Turn captions off' : 'Turn captions on'}
            aria-pressed={!captionsEnabled}
            title={captionsEnabled ? 'Hide captions' : 'Show captions'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px',
              background: captionsEnabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${captionsEnabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8,
              color: captionsEnabled ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
              fontFamily: 'monospace', fontSize: 11, letterSpacing: 2,
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13 }} aria-hidden="true">
              <span style={{
                fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                letterSpacing: 0, lineHeight: 1,
                opacity: captionsEnabled ? 1 : 0.55,
              }}>CC</span>
              {!captionsEnabled && (
                <span style={{
                  position: 'absolute', left: -1, right: -1, top: '50%',
                  height: 1, background: 'currentColor', transform: 'rotate(-18deg)',
                }} />
              )}
            </span>
            <span>{captionsEnabled ? 'CC' : 'CC off'}</span>
          </button>
        )}
        {/* Mute toggle — only shown while a session is live. Honest mute:
            flips the MediaStream track so the browser mic indicator
            turns off too. See useRealtimeVoice.setMuted. */}
        {isConnected && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={isMuted}
            title={isMuted ? 'Unmute' : 'Mute'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px',
              background: isMuted ? 'rgba(220,50,60,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isMuted ? 'rgba(220,50,60,0.45)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8,
              color: isMuted ? 'rgba(255,150,160,0.95)' : 'rgba(255,255,255,0.6)',
              fontFamily: 'monospace', fontSize: 11, letterSpacing: 2,
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            {isMuted ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                <path d="M5 10v2a7 7 0 0 0 12 5" />
                <path d="M15 9.34V4a3 3 0 0 0-5.68-1.33" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            <span>{isMuted ? 'Muted' : 'Mic'}</span>
          </button>
        )}
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
        {caption && isConnected && captionsEnabled && (
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

      {/* Mockup rain (generating) — 3D cards fly in from depth */}
      <MockupRain active={showCardLoader} />

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
              onClose={handleCollapseArtifact}
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

      {/* Mobile bottom bar — mic + artifact button, only on small screens */}
      {isConnected && hasCollapsedArtifact && (
        <button
          type="button"
          onClick={handleExpandArtifact}
          className="stagedemo-mobile-mic"
          style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(calc(-50% - 44px))',
            width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(220,50,60,0.2)',
            border: '2px solid rgba(220,50,60,0.45)',
            color: 'rgba(255,200,205,0.95)',
            display: 'none',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 300,
            boxShadow: '0 0 20px rgba(220,50,60,0.3)',
            transition: 'all 0.2s',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      )}
      {isConnected && (
        <button
          type="button"
          onClick={toggleMute}
          className="stagedemo-mobile-mic"
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            width: 64, height: 64, borderRadius: '50%',
            background: isMuted ? 'rgba(220,50,60,0.25)' : 'rgba(255,255,255,0.06)',
            border: `2px solid ${isMuted ? 'rgba(220,50,60,0.5)' : 'rgba(255,255,255,0.15)'}`,
            color: isMuted ? '#ff6b7a' : 'rgba(255,255,255,0.7)',
            display: 'none', /* shown via media query */
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 300,
            boxShadow: isMuted
              ? '0 0 24px rgba(220,50,60,0.4), inset 0 0 12px rgba(220,50,60,0.15)'
              : '0 8px 32px rgba(0,0,0,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {isMuted ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M15 9.34V4a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      )}

      {/* Click handler for mobile/tap */}
      {phase === 'idle' && !isConnected && (
        <div onClick={handleActivate} style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }} />
      )}

      <style>{`
        @media (max-width: 768px) {
          .stagedemo-hud { display: none !important; }
          .stagedemo-mobile-mic { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
