import { supabase } from './supabase';

const PP_API_URL = import.meta.env.VITE_PP_API_URL || 'http://localhost:8080';

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

// Meetings
export async function getMeetings(params = {}) {
  const url = new URL(`${PP_API_URL}/api/meetings`);
  if (params.page) url.searchParams.set('page', params.page);
  if (params.platform) url.searchParams.set('platform', params.platform);
  if (params.status) url.searchParams.set('status', params.status);
  if (params.search) url.searchParams.set('search', params.search);
  const headers = await getAuthHeaders();
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { meetings: [], total: 0, page: 1, totalPages: 0 };
  return res.json();
}

export async function getMeeting(id) {
  return ppFetch(`/api/meetings/${id}`);
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

export async function removeContactFromMeeting(meetingId, contactId) {
  return ppFetch(`/api/meetings/${meetingId}/contacts/${contactId}`, { method: 'DELETE' });
}

export async function generateActionItems(id) {
  return ppFetch(`/api/meetings/${id}/generate-action-items`, { method: 'POST' });
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
