// src/hooks/useAudioAnalyser.js
import { useRef, useCallback } from 'react';

export function useAudioAnalyser() {
  const audioCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const playbackAnalyserRef = useRef(null);
  const micStreamRef = useRef(null);

  // Initialize AudioContext (must be called after user gesture)
  const initAudio = useCallback(async () => {
    if (audioCtxRef.current) return audioCtxRef.current;

    const ctx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = ctx;

    // Mic analyser
    const micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.8;
    micAnalyserRef.current = micAnalyser;

    // Playback analyser (AI audio goes through this)
    const playbackAnalyser = ctx.createAnalyser();
    playbackAnalyser.fftSize = 256;
    playbackAnalyser.smoothingTimeConstant = 0.85;
    playbackAnalyserRef.current = playbackAnalyser;

    // Connect playback analyser to speakers
    playbackAnalyser.connect(ctx.destination);

    return ctx;
  }, []);

  // Connect mic stream to analyser
  const connectMic = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return null;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    micStreamRef.current = stream;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(micAnalyserRef.current);

    return stream;
  }, []);

  // Get mic frequency data (0-255 per bin)
  const getMicFrequencyData = useCallback(() => {
    if (!micAnalyserRef.current) return new Uint8Array(128);
    const data = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
    micAnalyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  // Get playback frequency data
  const getPlaybackFrequencyData = useCallback(() => {
    if (!playbackAnalyserRef.current) return new Uint8Array(128);
    const data = new Uint8Array(playbackAnalyserRef.current.frequencyBinCount);
    playbackAnalyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  // Get normalized average level (0-1) from frequency data
  const getLevel = useCallback((data) => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / (data.length * 255);
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  return {
    audioCtxRef,
    playbackAnalyserRef,
    initAudio,
    connectMic,
    getMicFrequencyData,
    getPlaybackFrequencyData,
    getLevel,
    cleanup,
  };
}
