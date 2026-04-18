import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

/**
 * Stream from the backend orchestrator/agent endpoint via SSE.
 * Used by AI CEO and Marketing pages.
 *
 * @param {string} endpoint - API path (e.g., '/api/orchestrate')
 * @param {object} body - Request body
 * @param {object} callbacks - Event handlers
 * @param {AbortSignal} signal - Abort signal
 */
export async function streamFromBackend(endpoint, body, callbacks = {}, signal) {
  const { onTextDelta, onStatus, onAgentChunk, onAgentResult, onAgentStart, onToolCall, onSearchStatus, onFileUpdate, onEditSummary, onFileSaved, onAskUser, onError, onDone } = callbacks;
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Request failed');
    throw new Error(errText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  // Frontend watchdog: if we don't see ANY data (including the backend's
  // 3s heartbeats) for 90s, treat the stream as dead and abort. This is the
  // last-line defense against an upstream LLM stalling past the backend's
  // 60s watchdog without properly closing the SSE connection.
  const IDLE_MS = 90_000;
  const readWithIdle = () => {
    let t;
    const idle = new Promise((_, reject) => {
      t = setTimeout(() => {
        try { reader.cancel(); } catch { /* noop */ }
        reject(new Error('Connection idle — aborted'));
      }, IDLE_MS);
    });
    return Promise.race([reader.read(), idle]).finally(() => clearTimeout(t));
  };

  while (true) {
    const { done, value } = await readWithIdle();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue; // skip heartbeats
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        if (onDone) onDone();
        continue;
      }

      try {
        const event = JSON.parse(data);

        // Log all non-text events for debugging
        if (event.type !== 'text_delta') {
          console.log(`[SSE] event: ${event.type}`, event.type === 'ask_user' ? event : '');
        }

        switch (event.type) {
          case 'text_delta':
            if (onTextDelta) onTextDelta(event.content);
            break;
          case 'status':
            if (onStatus) onStatus(event.text);
            break;
          case 'agent_start':
            if (onAgentStart) onAgentStart(event.agent);
            break;
          case 'agent_chunk':
            if (onAgentChunk) onAgentChunk(event.agent, event.content);
            break;
          case 'agent_result':
            if (onAgentResult) onAgentResult(event.agent, event.content);
            break;
          case 'tool_call':
            if (onToolCall) onToolCall(event.name, event.arguments);
            break;
          case 'search_status':
            if (onSearchStatus) onSearchStatus(event.status);
            break;
          case 'file_update':
            if (onFileUpdate) onFileUpdate(event.html);
            break;
          case 'ask_user':
            console.log('[SSE] ask_user event received:', { question: event.question, options: event.options, hasCallback: !!onAskUser });
            if (onAskUser) onAskUser(event.question, event.options);
            break;
          case 'edit_summary':
            if (onEditSummary) onEditSummary(event.text, event.editCount);
            break;
          case 'file_saved':
            if (onFileSaved) onFileSaved(event.agent);
            break;
          case 'error':
            if (onError) onError(event.error);
            break;
          case 'done':
            if (onDone) onDone(event.content);
            break;
        }
      } catch {
        // skip malformed events
      }
    }
  }
}

/**
 * Upload files for content context (documents, videos, images).
 * Files are processed on the backend — documents get text extraction,
 * videos get transcription, images are stored as-is.
 */
export async function uploadContextFiles(files, sessionId = null) {
  const headers = await getAuthHeaders();
  const formData = new FormData();

  if (sessionId) formData.append('sessionId', sessionId);
  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error);
  }

  return res.json();
}

/**
 * Upload files for Brand DNA (photos and videos only).
 */
export async function uploadBrandDnaFiles(files) {
  const headers = await getAuthHeaders();
  const formData = new FormData();

  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_URL}/api/brand-dna/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error);
  }

  return res.json();
}

/**
 * Extract content from social media URLs.
 * Backend downloads video/audio via yt-dlp, grabs captions or
 * transcribes with Whisper, and returns metadata + transcript.
 */
export async function extractSocialUrls(urls, sessionId = null) {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/api/social/extract`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, sessionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Extraction failed' }));
    throw new Error(err.error);
  }

  return res.json();
}

/**
 * Load saved content items from the database.
 */
export async function getContentItems(sessionId = null) {
  const headers = await getAuthHeaders();
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const res = await fetch(`${API_URL}/api/content-items${qs}`, { headers });
  if (!res.ok) return { items: [] };
  return res.json();
}

/**
 * Delete a content item by DB id.
 */
export async function deleteContentItem(id) {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/content-items/${id}`, {
    method: 'DELETE',
    headers,
  });
}

/**
 * Add an outlier video to content context.
 * Backend saves as content_item and fetches transcript for YouTube.
 */
export async function addOutlierToContext(video) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/content-items/from-outlier`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(video),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add to context' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── Outlier Detector ───

export async function getOutlierCreators() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/outlier/creators`, { headers });
  if (!res.ok) return { creators: [] };
  return res.json();
}

export async function addOutlierCreator(platform, username) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/outlier/creators`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add creator' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteOutlierCreator(id) {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/outlier/creators/${id}`, {
    method: 'DELETE',
    headers,
  });
}

export async function getOutlierVideos(params = {}) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/outlier/videos`);
  if (params.outliersOnly) url.searchParams.set('outliers_only', 'true');
  if (params.creatorId) url.searchParams.set('creator_id', params.creatorId);
  if (params.platform) url.searchParams.set('platform', params.platform);
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.offset) url.searchParams.set('offset', String(params.offset));
  if (params.sort) url.searchParams.set('sort', params.sort);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { videos: [] };
  return res.json();
}

// URL to the backend thumbnail proxy — works as a direct <img src="...">.
// The backend route is unauthenticated (see server.js) because <img> tags
// can't send Authorization headers; thumbnails are public social-media
// content anyway and the video id is a UUID.
export function getOutlierThumbnailUrl(videoId) {
  return `${API_URL}/api/outlier/videos/${videoId}/thumbnail`;
}

export async function scanOutlierCreator(creatorId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/outlier/scan/${creatorId}`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Scan failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── Sales ───

export async function getSalesRevenue(view = 'Month', productName) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/sales/revenue`);
  url.searchParams.set('view', view);
  if (productName && productName !== 'all') url.searchParams.set('product', productName);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { data: [], totals: {} };
  return res.json();
}

export async function getSalesStats() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/stats`, { headers });
  if (!res.ok) return { stats: {} };
  return res.json();
}

export async function getSalesCalls() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/calls`, { headers });
  if (!res.ok) return { calls: [] };
  return res.json();
}

export async function updateCallMetadata(id, data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/calls/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getSalesProducts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/products`, { headers });
  if (!res.ok) return { products: [] };
  return res.json();
}

export async function addManualSale(data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add sale' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function syncSalesData() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/sync`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) return { results: {} };
  return res.json();
}

// ─── Contacts / CRM ───

export async function getContacts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/contacts`, { headers });
  if (!res.ok) return { contacts: [] };
  return res.json();
}

export async function createContact(data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/contacts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create contact' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function updateContact(id, data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/contacts/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteContact(id) {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/contacts/${id}`, {
    method: 'DELETE',
    headers,
  });
}

export async function getContactDetail(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/contacts/${id}/detail`, { headers });
  if (!res.ok) return { recordings: [], emails: [], products: [] };
  return res.json();
}

export async function syncContacts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/contacts/sync`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) return { synced: 0 };
  return res.json();
}

export async function syncContactToGHL(contactId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/contacts/${contactId}/sync-ghl`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'GHL sync failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── Products ───

export async function getProducts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/products`, { headers });
  if (!res.ok) return { products: [] };
  return res.json();
}

export async function getImportedProducts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/products/imported`, { headers });
  if (!res.ok) return { products: [] };
  return res.json();
}

export async function createProduct(data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/products`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create product' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function updateProduct(id, data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/products/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteProduct(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/products/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function uploadProductPhotos(productId, files) {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  files.forEach((file) => formData.append('photos', file));
  const res = await fetch(`${API_URL}/api/products/${productId}/photos`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function regeneratePaymentLink(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/products/${id}/payment-link`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to generate link' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── Integrations ───

export async function getIntegrations() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations`, { headers });
  if (!res.ok) return { integrations: [] };
  return res.json();
}

export async function connectIntegration(provider, apiKey, metadata) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/${provider}/connect`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, metadata }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Connection failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function disconnectIntegration(provider) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/${provider}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Disconnect failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getLinkedInAuthUrl() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/linkedin/auth`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to get LinkedIn auth URL' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function disconnectLinkedIn() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/linkedin`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Disconnect failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function syncIntegration(provider) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/${provider}/sync`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getIntegrationContext() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integration-context`, { headers });
  if (!res.ok) return { context: '' };
  return res.json();
}

export async function deployToNetlify(html, siteName) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/netlify/deploy`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, siteName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Deploy failed' }));
    const e = new Error(err.error || 'Deploy failed');
    if (err.code) e.code = err.code;
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function checkNetlifyName(name) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/netlify/check-name`);
  url.searchParams.set('name', name);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { available: false, reason: 'error' };
  return res.json();
}

// ── Artifact version history ──
export async function listArtifactVersions({ sessionId, agent } = {}) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/artifact-versions`);
  if (sessionId) url.searchParams.set('session_id', sessionId);
  if (agent) url.searchParams.set('agent', agent);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { versions: [] };
  return res.json();
}

export async function getArtifactVersion(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/artifact-versions/${id}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

export async function restoreArtifactVersion(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/artifact-versions/${id}/restore`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Restore failed' }));
    throw new Error(err.error || 'Restore failed');
  }
  return res.json();
}

export async function getNetlifyStatus() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/netlify/status`, { headers });
  if (!res.ok) return { connected: false };
  return res.json();
}

// ─── Email ───

export async function getEmailAccounts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/email-accounts`, { headers });
  if (!res.ok) return { accounts: [] };
  return res.json();
}

export async function addEmailAccount(data) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/email-accounts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add account' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteEmailAccount(id) {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/email-accounts/${id}`, {
    method: 'DELETE',
    headers,
  });
}

export async function syncEmailAccount(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/email-accounts/${id}/sync`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getDashboardStats(timeframe = 'week', { from, to } = {}) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/dashboard-stats`);
  url.searchParams.set('timeframe', timeframe);
  if (timeframe === 'custom') {
    if (from) url.searchParams.set('from', from);
    if (to) url.searchParams.set('to', to);
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  return res.json();
}

export async function getEmails(params = {}) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/emails`);
  if (params.folder) url.searchParams.set('folder', params.folder);
  if (params.starred) url.searchParams.set('starred', 'true');
  if (params.accountId) url.searchParams.set('account_id', params.accountId);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.offset) url.searchParams.set('offset', String(params.offset));
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { emails: [] };
  return res.json();
}

export async function getEmail(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/emails/${id}`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email;
}

export async function updateEmail(id, updates) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/emails/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function generateEmailDraft({ prompt, mode, original, context_emails, context_calls, useBrandTemplate = false }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/emails/ai-draft`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode, original, context_emails, context_calls, useBrandTemplate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Draft generation failed' }));
    throw new Error(err.error || 'Draft generation failed');
  }
  return res.json();
}

export async function sendEmailApi({ account_id, to, cc, subject, body_text, body_html, in_reply_to, references }) {
  // Send via Supabase Edge Function (bypasses Railway SMTP port blocking)
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ account_id, to, cc, subject, body_text, body_html, in_reply_to, references }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Send failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function saveDraft({ account_id, to, cc, subject, body_text, body_html, draft_id }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/emails/draft`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id, to, cc, subject, body_text, body_html, draft_id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Save draft failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getEmailCounts(accountId) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/emails/counts`);
  if (accountId) url.searchParams.set('account_id', accountId);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { counts: {} };
  return res.json();
}

export async function deleteEmail(id) {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/emails/${id}`, {
    method: 'DELETE',
    headers,
  });
}

// ─── Image Generation (Nano Banana 2) ───

export async function generateImage(prompt, platform, brandData, referenceImages) {
  const headers = await getAuthHeaders();
  const body = { prompt, platform, brandData };
  // Include previous images as reference when regenerating
  if (referenceImages?.length) body.referenceImages = referenceImages;
  const res = await fetch(`${API_URL}/api/generate/image`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 120s client-side timeout
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Image generation failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function uploadImageToStorage(base64, mimeType) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/generate/upload-image`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── Marketing Templates ───

export async function getTemplates(tool) {
  const headers = await getAuthHeaders();
  const url = tool ? `${API_URL}/api/templates?tool=${tool}` : `${API_URL}/api/templates`;
  const res = await fetch(url, { headers });
  if (!res.ok) return { templates: [] };
  return res.json();
}

export async function getTemplate(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/templates/${id}`, { headers });
  if (!res.ok) throw new Error('Template not found');
  return res.json();
}

export async function saveTemplate({ name, description, tool, html }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/templates`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, tool, html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Save failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteTemplate(id) {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/templates/${id}`, { method: 'DELETE', headers });
}

// ─── CEO Notifications ───

export async function getNotifications() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/notifications`, { headers });
  if (!res.ok) return { notifications: [] };
  return res.json();
}

export async function markNotificationRead(id) {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/notifications/${id}/read`, {
    method: 'PATCH',
    headers,
  });
}

export async function markAllNotificationsRead() {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/notifications/read-all`, {
    method: 'POST',
    headers,
  });
}

// ─── BooSend ───

export async function getBoosendTemplates() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/templates`, { headers });
  if (!res.ok) return { templates: [] };
  return res.json();
}

export async function getBoosendTemplate(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/templates/${id}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch template');
  return res.json();
}

export async function useBoosendTemplate(templateId, { name, instagram_account_id } = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/templates/${templateId}/use`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, instagram_account_id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create automation' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

export async function getBoosendAutomations() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/automations`, { headers });
  if (!res.ok) return { automations: [] };
  return res.json();
}

export async function getBoosendAutomation(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/automations/${id}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch automation');
  return res.json();
}

// ─── LinkedIn Posting ───

export async function postToLinkedIn(text, imageUrl) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/linkedin/post`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, imageUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to post to LinkedIn' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── Social Post Scheduling ───

export async function schedulePost({ platform, caption, scheduledAt, thumbnailUrl, contentSessionId }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/social-posts/schedule`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, caption, scheduled_at: scheduledAt, thumbnail_url: thumbnailUrl, content_session_id: contentSessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to schedule post' }));
    throw new Error(err.error);
  }
  return res.json();
}
