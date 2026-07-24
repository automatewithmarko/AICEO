import OpenAI from 'openai';
import { Readable } from 'stream';
import path from 'path';

// Use Groq for transcription (OpenAI-compatible API, much faster)
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const SUPPORTED_EXTENSIONS = ['mp4', 'mp3', 'webm', 'wav', 'm4a', 'ogg', 'mpeg', 'mpga'];
const MAX_SIZE = 25 * 1024 * 1024; // 25MB Whisper limit

export function isMediaFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

// OpenAI Whisper fallback — the Railway GROQ_API_KEY went invalid
// (401 on every call, dev AND production, observed 2026-07-24), which
// silently killed every outlier/reel transcript. OPENAI_API_KEY is
// alive (image generation uses it), and OpenAI serves the same
// audio.transcriptions API, so a dead Groq key degrades to slower
// transcription instead of no transcription.
let _openaiTranscribe = null;
function getOpenAITranscriber() {
  if (!_openaiTranscribe) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
    _openaiTranscribe = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openaiTranscribe;
}

export async function transcribe(buffer, filename) {
  if (buffer.length > MAX_SIZE) {
    throw new Error('File too large for transcription (max 25MB)');
  }

  // OpenAI expects a File-like object with a name
  const file = new File([buffer], filename, {
    type: getMimeType(filename),
  });

  // Platform policy: Mentor-first everywhere — but the gateway has no
  // audio-transcription endpoint, so Whisper stays direct by necessity.
  console.warn('[video/transcribe] ⚠️ DIRECT GROQ API (Whisper) — Mentor gateway has no audio transcription endpoint');
  let response;
  try {
    response = await groq.audio.transcriptions.create({
      model: 'whisper-large-v3',
      file,
      response_format: 'verbose_json',
    });
  } catch (err) {
    console.warn(`[video/transcribe] Groq Whisper failed (${err.status || 'n/a'}): ${err.message?.slice(0, 120)} — FALLING BACK TO DIRECT OPENAI whisper-1`);
    response = await getOpenAITranscriber().audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
    });
    console.log(`[video/transcribe] ✅ OpenAI whisper-1 fallback succeeded (${Math.round((response.text || '').length)} chars)`);
  }

  return {
    text: response.text,
    duration: response.duration,
    language: response.language,
    segments: response.segments?.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  };
}

function getMimeType(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mimeMap = {
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    webm: 'video/webm',
    wav: 'audio/wav',
    m4a: 'audio/m4a',
    ogg: 'audio/ogg',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
