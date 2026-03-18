import { supabase } from './supabase';

const PP_API_URL = import.meta.env.VITE_PP_API_URL || 'http://localhost:8080';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function ppFetch(path, options = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${PP_API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
    throw new Error(err.error);
  }

  return res.json();
}

// Normalize a sales/calls record into a meeting-like object for the grid
function normalizeExternalCall(call) {
  return {
    id: call.id,
    title: call.name || 'Untitled Recording',
    meeting_url: null,
    platform: call.platform || 'unknown',
    recall_bot_status: 'processed',
    scheduled_at: null,
    started_at: call.date || null,
    ended_at: null,
    duration_seconds: 0,
    bot_name: null,
    participants: [],
    summary: call.summary ? { overview: call.summary } : null,
    action_items: [],
    created_at: call.date || new Date().toISOString(),
    video_url: null,
    audio_url: null,
    source: call.recorder || 'unknown',
    is_external: true,
  };
}

// Fetch external recordings (Fireflies/Fathom) from main backend
async function getExternalRecordings(sourceFilter) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/calls`, { headers });
  if (!res.ok) return [];
  const { calls } = await res.json();
  if (!calls) return [];

  // Filter by source and exclude PurelyPersonal (those come from PP backend)
  return calls
    .filter(c => {
      if (c.recorder === 'purelypersonal') return false;
      if (sourceFilter === 'fireflies') return c.recorder === 'fireflies';
      if (sourceFilter === 'fathom') return c.recorder === 'fathom';
      return true; // 'all' or empty — include all external
    })
    .map(normalizeExternalCall);
}

// Meetings
export async function getMeetings(params = {}) {
  const { source } = params;
  const limit = 20;
  const page = params.page || 1;

  // Only external source — fetch from main backend only
  if (source === 'fireflies' || source === 'fathom') {
    const external = await getExternalRecordings(source);
    const offset = (page - 1) * limit;
    const paginated = external.slice(offset, offset + limit);
    return {
      meetings: paginated,
      total: external.length,
      page,
      totalPages: Math.ceil(external.length / limit),
    };
  }

  // Purely Personal only — fetch from PP backend only
  if (source === 'purelypersonal') {
    const url = new URL(`${PP_API_URL}/api/meetings`);
    if (params.page) url.searchParams.set('page', params.page);
    if (params.platform) url.searchParams.set('platform', params.platform);
    if (params.status) url.searchParams.set('status', params.status);
    if (params.search) url.searchParams.set('search', params.search);
    const headers = await getAuthHeaders();
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) return { meetings: [], total: 0, page: 1, totalPages: 0 };
    const data = await res.json();
    // Tag PP meetings with source
    data.meetings = (data.meetings || []).map(m => ({ ...m, source: 'purelypersonal', is_external: false }));
    return data;
  }

  // All Sources (default) — fetch from both and merge
  const [ppResult, external] = await Promise.all([
    (async () => {
      const url = new URL(`${PP_API_URL}/api/meetings`);
      // Only fetch PurelyPersonal meetings from PP backend; external recordings come from main backend
      url.searchParams.set('source', 'purelypersonal');
      if (params.platform) url.searchParams.set('platform', params.platform);
      if (params.status) url.searchParams.set('status', params.status);
      if (params.search) url.searchParams.set('search', params.search);
      url.searchParams.set('limit', '100');
      const headers = await getAuthHeaders();
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) return { meetings: [], total: 0 };
      const data = await res.json();
      data.meetings = (data.meetings || []).map(m => ({ ...m, source: 'purelypersonal', is_external: false }));
      return data;
    })(),
    // Skip external if platform/status filters are active (not applicable to external)
    (params.platform || params.status) ? [] : getExternalRecordings('all'),
  ]);

  // Merge and sort by date descending
  const allMeetings = [...(ppResult.meetings || []), ...external].sort((a, b) => {
    const dateA = new Date(a.started_at || a.created_at || 0);
    const dateB = new Date(b.started_at || b.created_at || 0);
    return dateB - dateA;
  });

  const totalCount = allMeetings.length;
  const offset = (page - 1) * limit;
  const paginated = allMeetings.slice(offset, offset + limit);

  return {
    meetings: paginated,
    total: totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  };
}

export async function getMeeting(id) {
  return ppFetch(`/api/meetings/${id}`);
}

// Parse "Speaker: text" transcript content into segment-like objects
function parseTranscriptContent(content) {
  if (!content) return [];
  return content.split('\n').filter(Boolean).map((line, i) => {
    const colonIdx = line.indexOf(':');
    const speaker = colonIdx > 0 ? line.slice(0, colonIdx).trim() : 'Unknown';
    const text = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line.trim();
    return { id: `seg-${i}`, speaker_name: speaker, text, start_time: null, end_time: null, is_partial: false, sequence_index: i };
  });
}

export async function getExternalRecording(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/calls/${id}`, { headers });
  if (!res.ok) return null;
  const { call } = await res.json();
  if (!call) return null;

  const segments = parseTranscriptContent(call.content);

  return {
    meeting: {
      id: call.id,
      title: call.title || 'Untitled Recording',
      platform: 'unknown',
      recall_bot_status: 'processed',
      source: call.provider,
      is_external: true,
      started_at: call.date || null,
      created_at: call.date || new Date().toISOString(),
      duration_seconds: call.duration || 0,
      participants: [],
      summary: call.summary ? { overview: call.summary } : null,
      action_items: [],
      video_url: null,
      audio_url: null,
      transcript_text: call.content || '',
    },
    segments,
  };
}

export async function createMeeting(data) {
  return ppFetch('/api/meetings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMeeting(id, data) {
  return ppFetch(`/api/meetings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteMeeting(id) {
  return ppFetch(`/api/meetings/${id}`, { method: 'DELETE' });
}

export async function assignContactToMeeting(meetingId, contactId) {
  return ppFetch(`/api/meetings/${meetingId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({ contact_id: contactId }),
  });
}

export async function assignExternalRecordingToContact(integrationDataId, contactId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/contacts/${contactId}/external-recordings`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ integration_data_id: integrationDataId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function removeContactFromMeeting(meetingId, contactId) {
  return ppFetch(`/api/meetings/${meetingId}/contacts/${contactId}`, { method: 'DELETE' });
}

export async function generateActionItems(id) {
  return ppFetch(`/api/meetings/${id}/generate-action-items`, { method: 'POST' });
}

export async function generateExternalActionItems(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/calls/${id}/generate-action-items`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function stopMeeting(id) {
  return ppFetch(`/api/meetings/${id}/stop`, { method: 'POST' });
}

export async function reprocessMeeting(id, template) {
  return ppFetch(`/api/meetings/${id}/reprocess`, {
    method: 'POST',
    body: JSON.stringify({ template }),
  });
}

export async function retryRecording(id) {
  return ppFetch(`/api/meetings/${id}/retry-recording`, {
    method: 'POST',
  });
}

// Bots
export async function getActiveBots() {
  return ppFetch('/api/bots/active');
}

export async function getBotStatus(meetingId) {
  return ppFetch(`/api/bots/${meetingId}/status`);
}

// Transcripts
export async function getTranscript(meetingId) {
  return ppFetch(`/api/meetings/${meetingId}/transcript`);
}

export function subscribeLiveTranscript(meetingId, onSegment, onEnd) {
  const url = `${PP_API_URL}/api/meetings/${meetingId}/transcript/live`;

  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'segment') {
        onSegment(data.segment);
      } else if (data.type === 'meeting_ended') {
        onEnd?.(data.status);
        eventSource.close();
      }
    } catch (e) {
      console.error('[sse] Parse error:', e);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onEnd?.('error');
  };

  return () => eventSource.close();
}

// Templates
export async function getTemplates() {
  return ppFetch('/api/templates');
}

export async function createTemplate(data) {
  return ppFetch('/api/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteTemplate(id) {
  return ppFetch(`/api/templates/${id}`, { method: 'DELETE' });
}

// Sharing
export async function shareMeeting(id) {
  return ppFetch(`/api/meetings/${id}/share`, { method: 'POST' });
}

export async function unshareMeeting(id) {
  return ppFetch(`/api/meetings/${id}/share`, { method: 'DELETE' });
}

export async function getSharedMeeting(token) {
  const res = await fetch(`${PP_API_URL}/api/shared/${token}`);
  if (!res.ok) return null;
  return res.json();
}

// Search
export async function searchMeetings(query) {
  return ppFetch(`/api/search?q=${encodeURIComponent(query)}`);
}

// Calendar
export async function connectGoogleCalendar() {
  return ppFetch('/api/calendar/connect/google', { method: 'POST' });
}

export async function getCalendarConnections() {
  return ppFetch('/api/calendar/connections');
}

export async function updateCalendarConnection(id, data) {
  return ppFetch(`/api/calendar/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCalendarConnection(id) {
  return ppFetch(`/api/calendar/${id}`, { method: 'DELETE' });
}

// Helpers
export function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimestamp(seconds) {
  if (!seconds && seconds !== 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getPlatformInfo(platform) {
  const platforms = {
    zoom: { name: 'Zoom', color: '#2D8CFF', icon: '/icon-zoom.png' },
    google_meet: { name: 'Google Meet', color: '#00897B', icon: '/icon-google-meet.png' },
    microsoft_teams: { name: 'Teams', color: '#6264A7', icon: '/icon-teams.png' },
    webex: { name: 'Webex', color: '#07C160', icon: null },
    unknown: { name: 'Meeting', color: '#666', icon: null },
  };
  return platforms[platform] || platforms.unknown;
}

export function getSourceInfo(source) {
  const sources = {
    purelypersonal: { name: 'Purely Personal', icon: '/our-square-logo.png' },
    fireflies: { name: 'Fireflies', icon: '/fireflies-square-logo.png' },
    fathom: { name: 'Fathom', icon: '/fathom-square-logo.png' },
  };
  return sources[source] || sources.purelypersonal;
}

export function getStatusInfo(status) {
  const statuses = {
    pending: { label: 'Pending', color: '#999' },
    creating: { label: 'Creating', color: '#f59e0b' },
    ready: { label: 'Ready', color: '#3b82f6' },
    joining_call: { label: 'Joining...', color: '#f59e0b' },
    in_waiting_room: { label: 'Waiting Room', color: '#f59e0b' },
    in_call_not_recording: { label: 'In Call', color: '#10b981' },
    in_call_recording: { label: 'Recording', color: '#ef4444' },
    recording_done: { label: 'Processing', color: '#8b5cf6' },
    call_ended: { label: 'Processing', color: '#8b5cf6' },
    done: { label: 'Processing AI', color: '#8b5cf6' },
    processed: { label: 'Complete', color: '#10b981' },
    fatal: { label: 'Failed', color: '#ef4444' },
    error: { label: 'Error', color: '#ef4444' },
    stopped: { label: 'Stopped', color: '#999' },
  };
  return statuses[status] || { label: status, color: '#999' };
}
