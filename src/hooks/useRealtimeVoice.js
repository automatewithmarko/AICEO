// src/hooks/useRealtimeVoice.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Convert Float32 audio samples to base64-encoded PCM16
function float32ToPcm16Base64(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Convert base64-encoded PCM16 to Float32 samples
function pcm16Base64ToFloat32(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32;
}

export function useRealtimeVoice({ audioCtxRef, playbackAnalyserRef, onToolCall, onAiSpeakingChange, onTranscript }) {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const wsRef = useRef(null);
  const micProcessorRef = useRef(null);
  const micSourceRef = useRef(null);
  const isCapturingRef = useRef(false);
  const playbackTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);
  const reconnectAttemptsRef = useRef(0);
  const currentResponseIdRef = useRef(null);

  // Get auth token
  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, []);

  // Connect to OpenAI Realtime via backend ephemeral token
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      // Connect to our backend WebSocket proxy (which connects to OpenAI server-side)
      const wsProtocol = API_URL.startsWith('https') ? 'wss' : 'ws';
      const wsHost = API_URL.replace(/^https?:\/\//, '');
      const ws = new WebSocket(`${wsProtocol}://${wsHost}/ws/stagedemo?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        console.log('[voice] WebSocket connected');
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerEvent(msg);
      };

      ws.onerror = (err) => {
        console.error('[voice] WebSocket error:', err);
        setStatus('error');
      };

      ws.onclose = (event) => {
        console.log('[voice] WebSocket closed:', event.code, event.reason);
        wsRef.current = null;

        // Auto-reconnect (max 3 attempts)
        if (reconnectAttemptsRef.current < 3 && status !== 'disconnected') {
          reconnectAttemptsRef.current++;
          const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
          console.log(`[voice] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          setTimeout(() => connect(), delay);
        } else {
          setStatus('error');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[voice] Connection failed:', err);
      setStatus('error');
    }
  }, [getToken, status]);

  // Handle incoming server events
  const handleServerEvent = useCallback((msg) => {
    switch (msg.type) {
      case 'session.created':
      case 'session.updated':
        console.log('[voice] Session ready');
        break;

      case 'input_audio_buffer.speech_started':
        // User started speaking — cancel AI response for barge-in
        stopPlayback();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'response.cancel' }));
        }
        onAiSpeakingChange?.(false);
        break;

      case 'response.audio.delta':
      case 'response.output_audio.delta':
        // AI audio chunk — play it
        if (msg.delta) {
          playAudioChunk(msg.delta);
          onAiSpeakingChange?.(true);
        }
        break;

      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
      case 'response.text.delta':
      case 'response.output_text.delta':
        // AI speech transcript
        if (msg.delta) onTranscript?.('ai', msg.delta);
        break;

      case 'response.audio.done':
      case 'response.output_audio.done':
        onAiSpeakingChange?.(false);
        break;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        // GA API sends full transcript at end, not deltas — use for captions
        if (msg.transcript) onTranscript?.('ai_full', msg.transcript);
        break;

      case 'response.function_call_arguments.done':
        // Tool call complete — execute it
        console.log('[voice] Tool call:', msg.name, msg.arguments);
        if (onToolCall) {
          let args = {};
          try { args = JSON.parse(msg.arguments); } catch {}
          onToolCall(msg.name, args, msg.call_id);
        }
        break;

      case 'response.done':
        currentResponseIdRef.current = null;
        break;

      case 'error':
        if (msg.error?.code !== 'response_cancel_not_active') {
          console.error('[voice] Server error:', msg.error);
        }
        break;

      default:
        if (msg.type?.includes('transcript') && msg.delta) {
          // Catch any transcript delta event we might have missed
          onTranscript?.('ai', msg.delta);
        } else if (msg.type && !msg.type.startsWith('input_audio_buffer') && !msg.type.startsWith('response.content_part') && !msg.type.startsWith('conversation.item') && !msg.type.startsWith('rate_limits')) {
          console.log('[voice] Event:', msg.type, msg.delta ? '(has delta)' : '');
        }
        break;
    }
  }, [onToolCall, onAiSpeakingChange, onTranscript]);

  // Stop all queued/playing AI audio
  const stopPlayback = useCallback(() => {
    for (const s of activeSourcesRef.current) {
      try { s.stop(); } catch {}
    }
    activeSourcesRef.current = [];
    playbackTimeRef.current = 0;
  }, []);

  // Play an AI audio chunk through the playback analyser
  const playAudioChunk = useCallback((base64Audio) => {
    const ctx = audioCtxRef.current;
    const analyser = playbackAnalyserRef.current;
    if (!ctx || !analyser) return;

    const float32 = pcm16Base64ToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    const now = ctx.currentTime;
    if (playbackTimeRef.current < now) playbackTimeRef.current = now;
    source.start(playbackTimeRef.current);
    playbackTimeRef.current += buffer.duration;

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
    };
  }, [audioCtxRef, playbackAnalyserRef]);

  // Start capturing mic audio (push-to-talk: call on space down)
  const startCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') await ctx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    const source = ctx.createMediaStreamSource(stream);
    micSourceRef.current = { source, stream };

    // Use ScriptProcessor for mic capture (simpler than AudioWorklet, works everywhere)
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!isCapturingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const base64 = float32ToPcm16Base64(input);
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64,
      }));
    };

    source.connect(processor);
    processor.connect(ctx.destination); // ScriptProcessor needs to be connected
    micProcessorRef.current = processor;
  }, [audioCtxRef]);

  // Stop capturing mic (for cleanup/disconnect only — VAD handles turns)
  const stopCapture = useCallback(() => {
    isCapturingRef.current = false;

    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.source.disconnect();
      micSourceRef.current.stream.getTracks().forEach(t => t.stop());
      micSourceRef.current = null;
    }
  }, []);

  // Send a text message (AI will respond with voice)
  const sendText = useCallback((text) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }));

    wsRef.current.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  // Send tool result back to OpenAI so it can speak the confirmation
  const sendToolResult = useCallback((callId, result) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Add the tool result as a conversation item
    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: typeof result === 'string' ? result : JSON.stringify(result),
      },
    }));

    // Request a new response (AI will speak confirmation)
    wsRef.current.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = 999; // prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reconnectAttemptsRef.current = 999;
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return {
    status,
    connect,
    disconnect,
    startCapture,
    stopCapture,
    sendText,
    sendToolResult,
  };
}
