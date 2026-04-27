import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECALL_BASE = `https://${process.env.RECALL_REGION || 'us-west-2'}.recall.ai`;
const API_KEY = process.env.RECALL_API_KEY;

// Load bot avatar image as base64 once at startup
let botAvatarB64 = null;
try {
  const imgPath = join(__dirname, '..', 'assets', 'bot-avatar.jpg');
  botAvatarB64 = readFileSync(imgPath).toString('base64');
  console.log('[recall] Bot avatar loaded');
} catch (e) {
  console.warn('[recall] Bot avatar not found, bot will use default image');
}

async function recallFetch(path, options = {}) {
  const res = await fetch(`${RECALL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Token ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[recall] ${options.method || 'GET'} ${path} → ${res.status}: ${text}`);
    throw new Error(`Meeting service error: unable to complete request`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function createBot(meetingUrl, { botName, userId, meetingId, joinAt, botAvatar } = {}) {
  const body = {
    meeting_url: meetingUrl,
    bot_name: botName || 'PurelyPersonal Notetaker',
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {
            language_code: 'en',
          }
        },
        diarization: {
          use_separate_streams_when_available: true,
        },
      },
      audio_separate_raw: {},
    },
    automatic_leave: {
      waiting_room_timeout: 600,
      noone_joined_timeout: 600,
      everyone_left_timeout: 5,
    },
    metadata: {
      user_id: userId || '',
      meeting_id: meetingId || '',
    },
  };

  // Set bot display image — user-provided avatar takes priority over default
  let avatarB64 = null;
  let avatarKind = 'jpeg';
  if (botAvatar?.b64) {
    avatarB64 = botAvatar.b64;
    avatarKind = (botAvatar.mime || '').toLowerCase().includes('png') ? 'png' : 'jpeg';
  } else if (botAvatarB64) {
    avatarB64 = botAvatarB64;
  }

  if (avatarB64) {
    body.automatic_video_output = {
      in_call_recording: {
        kind: avatarKind,
        b64_data: avatarB64,
      },
    };
  }

  if (joinAt) {
    body.join_at = joinAt;
  }

  // Add real-time transcript webhook if API_BASE_URL is configured
  if (process.env.API_BASE_URL) {
    body.real_time_endpoints = [
      {
        type: 'webhook',
        url: `${process.env.API_BASE_URL}/api/webhooks/recall/transcript`,
        events: ['transcript.data', 'transcript.partial_data'],
      },
    ];
  }

  return recallFetch('/api/v1/bot/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getBot(botId) {
  return recallFetch(`/api/v1/bot/${botId}/`);
}

export async function deleteBot(botId) {
  return recallFetch(`/api/v1/bot/${botId}/`, { method: 'DELETE' });
}

export async function leaveMeeting(botId) {
  return recallFetch(`/api/v1/bot/${botId}/leave_call/`, { method: 'POST' });
}

export async function getTranscript(recordingId) {
  // New API: list transcripts by recording ID, then fetch download URL
  const list = await recallFetch(`/api/v1/transcript/?recording_id=${recordingId}`);
  const artifact = list?.results?.[0];
  if (!artifact?.data?.download_url) {
    console.log(`[recall] No transcript download_url for recording ${recordingId}`);
    return [];
  }

  // Fetch the actual transcript JSON from the download URL
  const res = await fetch(artifact.data.download_url);
  if (!res.ok) {
    throw new Error(`Failed to download transcript: ${res.status}`);
  }
  return res.json();
}

export async function getRecording(botId) {
  const bot = await getBot(botId);
  // Recordings are in bot.recordings array
  return bot?.recordings || [];
}

// Fetch participant list from a recording's participants_download_url
export async function getRecordingParticipants(recording) {
  const url = recording?.media_shortcuts?.participant_events?.data?.participants_download_url;
  if (!url) {
    console.log('[recall] No participants_download_url in recording');
    return [];
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[recall] Failed to fetch participants: ${res.status}`);
    return [];
  }
  return res.json();
}

// Fetch speaker timeline from a recording's speaker_timeline_download_url
export async function getSpeakerTimeline(recording) {
  const url = recording?.media_shortcuts?.participant_events?.data?.speaker_timeline_download_url;
  if (!url) {
    console.log('[recall] No speaker_timeline_download_url in recording');
    return [];
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[recall] Failed to fetch speaker timeline: ${res.status}`);
    return [];
  }
  return res.json();
}

export async function listBots({ status, meetingUrl, metadata } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (meetingUrl) params.set('meeting_url', meetingUrl);
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      params.set(`metadata__${key}`, value);
    }
  }
  const query = params.toString();
  return recallFetch(`/api/v1/bot/${query ? `?${query}` : ''}`);
}

export function detectPlatform(url) {
  if (/zoom\.us/i.test(url)) return 'zoom';
  if (/meet\.google\.com/i.test(url)) return 'google_meet';
  if (/teams\.microsoft\.com|teams\.live\.com/i.test(url)) return 'microsoft_teams';
  if (/webex\.com/i.test(url)) return 'webex';
  return 'unknown';
}
