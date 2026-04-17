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

export async function transcribe(buffer, filename) {
  if (buffer.length > MAX_SIZE) {
    throw new Error('File too large for transcription (max 25MB)');
  }

  // OpenAI expects a File-like object with a name
  const file = new File([buffer], filename, {
    type: getMimeType(filename),
  });

  const response = await groq.audio.transcriptions.create({
    model: 'whisper-large-v3',
    file,
    response_format: 'verbose_json',
  });

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
