import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── Active workspace selection ──────────────────────────────────────
// The current user can be a member of multiple workspaces (their own
// + any they were invited to). The active workspace is stored in
// localStorage as the owner_user_id of the workspace they're acting in.
//
// The key is SCOPED PER USER (`aiceo_active_workspace_<actorId>`) so
// account-A's preference can't leak into account-B's session if they
// share a browser. This was the root cause of the early "not_a_member"
// bug — a single shared key meant a brand-new signup inherited the
// previous user's workspace pointer and 403'd every request.
const KEY_PREFIX = 'aiceo_active_workspace_';

function workspaceKey(actorId) { return `${KEY_PREFIX}${actorId}`; }

// Synchronous variants take an explicit actorId — used by getAuthHeaders
// after it has the session in hand. Returns null when actorId is falsy
// so callers don't have to special-case logged-out state.
function getActiveWorkspaceOwnerSync(actorId) {
  if (!actorId) return null;
  try { return localStorage.getItem(workspaceKey(actorId)) || null; } catch { return null; }
}
function setActiveWorkspaceOwnerSync(actorId, ownerId) {
  if (!actorId) return;
  try {
    if (ownerId) localStorage.setItem(workspaceKey(actorId), ownerId);
    else localStorage.removeItem(workspaceKey(actorId));
  } catch { /* ignore */ }
}

// Async variants resolve the actor from the current Supabase session.
// These are the public API — most callers don't have actorId at hand
// and would otherwise have to plumb it through.
export async function getActiveWorkspaceOwner() {
  const { data: { session } } = await supabase.auth.getSession();
  return getActiveWorkspaceOwnerSync(session?.user?.id);
}
export async function setActiveWorkspaceOwner(ownerId) {
  const { data: { session } } = await supabase.auth.getSession();
  setActiveWorkspaceOwnerSync(session?.user?.id, ownerId);
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  const headers = {
    Authorization: `Bearer ${session.access_token}`,
  };
  // Only attach the workspace header when it's set AND differs from the
  // actor's own id. Skipping it for the solo case keeps the request
  // identical to the pre-RBAC shape and saves the backend a DB lookup.
  const activeOwner = getActiveWorkspaceOwnerSync(session.user?.id);
  if (activeOwner && session.user?.id && activeOwner !== session.user.id) {
    headers['X-Workspace-Owner'] = activeOwner;
  }
  return headers;
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
          case 'debug_prompt':
            // Backend echoes the assembled system prompt + last user
            // message so it can be inspected from browser DevTools.
            // Grouped collapsed so it doesn't dominate the console.
            try {
              const groupLabel = `[prompt] ${event.site || ''}${event.agent ? ' / ' + event.agent : ''} (model=${event.model || '?'})`;
              console.groupCollapsed(groupLabel);
              if (event.systemPrompt) console.log('--- systemPrompt ---\n' + event.systemPrompt);
              if (event.lastUser) console.log('--- lastUser ---\n' + event.lastUser);
              if (event.editInstruction) console.log('--- editInstruction ---\n' + event.editInstruction);
              if (event.taskDescription) console.log('--- taskDescription ---\n' + event.taskDescription);
              if (event.fileHtmlLen) console.log('fileHtmlLen:', event.fileHtmlLen);
              console.groupEnd();
            } catch { /* console API quirks — ignore */ }
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
 * Upload files for Brand DNA (photos, videos, and font files).
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
 * Marketing campaign brief — single active brief per user, reused across
 * every Marketing tool so the user doesn't re-explain offer/audience/
 * tone/goal/key benefit per tab. Returns { brief: null } when the user
 * has no brief yet or the migration hasn't run.
 */
export async function getMarketingBrief() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/marketing/brief`, { headers });
  if (!res.ok) return { brief: null };
  return res.json();
}

export async function updateMarketingBrief(patch) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/marketing/brief`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save brief (${res.status})`);
  }
  return res.json();
}

export async function clearMarketingBrief() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/marketing/brief`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to clear brief (${res.status})`);
  }
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

async function postCallAction(id, action, fallbackError) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/calls/${id}/${action}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: fallbackError }));
    throw new Error(err.error || fallbackError);
  }
  return res.json();
}

export async function analyzeCallObjections(id) {
  return postCallAction(id, 'analyze-objections', 'Failed to analyze objections');
}

export async function writeCallFollowUpEmail(id) {
  return postCallAction(id, 'write-email', 'Failed to write follow-up email');
}

export async function addCallToContext(id) {
  return postCallAction(id, 'add-to-context', 'Failed to add call to context');
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

export async function getOutlookAuthUrl() {
  const headers = await getAuthHeaders();
  const origin = encodeURIComponent(window.location.origin);
  const res = await fetch(`${API_URL}/api/email-accounts/outlook/auth?origin=${origin}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to start Outlook OAuth' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function connectOutlookCallback(code, state) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/email-accounts/outlook/callback`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Outlook connection failed' }));
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
  // Throw on non-OK so callers can distinguish "verified empty inbox"
  // (200 with []) from "couldn't reach backend" (401/5xx/network).
  // Earlier silent fallback caused the inbox UI to flicker — every
  // transient auth blip overwrote the cached email list with [],
  // then the next successful poll repopulated it.
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/emails`);
  if (params.folder) url.searchParams.set('folder', params.folder);
  if (params.starred) url.searchParams.set('starred', 'true');
  if (params.accountId) url.searchParams.set('account_id', params.accountId);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.offset) url.searchParams.set('offset', String(params.offset));
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const err = new Error(`getEmails failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
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

export async function sendEmailApi({ account_id, to, cc, subject, body_text, body_html, in_reply_to, references, attachments }) {
  // Primary path: our Railway backend at /api/emails/send. It already
  // does OAuth refresh + XOAUTH2 SMTP for Outlook accounts via
  // services/smtp.js, and Railway only blocks port 25 (587 / 465 are
  // allowed) so STARTTLS / SSL submission works.
  //
  // Fallback: the Supabase Edge Function. Kept as belt-and-braces in
  // case the backend is briefly down. The Edge Function only handles
  // password-based SMTP accounts (Gmail app-password), so it'll still
  // 500 for OAuth/Outlook — but if the backend is reachable that path
  // is taken first. The Edge Function does not currently support
  // attachments; if the backend is down and the user has attachments,
  // we surface a clear error instead of silently dropping them.
  const body = { account_id, to, cc, subject, body_text, body_html, in_reply_to, references, attachments };

  // 1. Try backend.
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/api/emails/send`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    // Surface 4xx (e.g. account-not-found, validation errors) directly —
    // those are not transient, so retrying via the Edge Function would
    // just produce the same error.
    if (res.status >= 400 && res.status < 500) {
      const err = await res.json().catch(() => ({ error: 'Send failed' }));
      throw new Error(err.error || 'Send failed');
    }
    // 5xx — fall through to the Edge Function fallback below.
    console.warn('[sendEmailApi] Backend returned', res.status, '— falling back to edge function');
  } catch (err) {
    if (err && err.message && !err.message.toLowerCase().includes('failed to fetch')) {
      // Validation / 4xx errors thrown above end up here. Re-throw so
      // the UI shows the real reason instead of a misleading edge-fn
      // fallback success.
      if (err.message !== 'Send failed') throw err;
    }
    console.warn('[sendEmailApi] Backend send failed — falling back to edge function:', err?.message);
  }

  // 2. Fallback: Supabase Edge Function.
  // The edge function doesn't support attachments — surface that clearly
  // so the user understands why their attachment didn't send instead of
  // getting a confusing "sent" success without it.
  if (Array.isArray(attachments) && attachments.length > 0) {
    throw new Error('Attachments require the primary backend, which is unreachable. Please retry in a moment.');
  }
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
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Send failed' }));
    throw new Error(err.error || 'Send failed');
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
  // Throw on non-OK; caller decides whether to keep stale counts. The
  // earlier `return { counts: {} }` reset every folder's badge to zero
  // on any backend blip and contributed to the inbox flicker.
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/emails/counts`);
  if (accountId) url.searchParams.set('account_id', accountId);
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const err = new Error(`getEmailCounts failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
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

export async function generateImage(prompt, platform, brandData, referenceImages, opts = {}) {
  const headers = await getAuthHeaders();
  const body = { prompt, platform, brandData };
  // Include reference images. When `opts.editUserImage` is true, the
  // backend treats them as a user-attached primary subject (skips
  // brand photos so they don't substitute the user's image). When
  // false / unset, they're treated as a previous-output regeneration.
  if (referenceImages?.length) body.referenceImages = referenceImages;
  if (opts.editUserImage) body.editUserImage = true;
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

// Server-side carousel rendering (Phase 2, docs/unified-content-backend-plan.md).
// Streams the whole slide-generation job from the backend: the server
// builds each slide's locked design-system prompt, runs the same image
// pipeline as /api/generate/image, uploads each slide to storage, and
// emits per-slide progress. Used by both /Content and AI CEO when the
// unified flag is on; the legacy frontend loops are the flag-off path.
//
// body: { platform, plan, slideIndexes?, slideOverrides?, brand?,
//         brandData?, referenceImagesBySlide?, editUserImage? }
// callbacks: { onStart(total, indexes), onSlideDone(index, url),
//              onSlideFailed(index, error), onError(error) }
// Resolves with { succeeded: [idx...], failed: [idx...] }.
export async function generateCarouselServerSide(body, callbacks = {}, signal) {
  const { onStart, onSlideDone, onSlideFailed, onError } = callbacks;
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/api/generate/carousel`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Carousel generation failed' }));
    throw new Error(err.error || 'Carousel generation failed');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';
  let outcome = { succeeded: [], failed: [] };

  // Generous idle watchdog — a single slide can take 30-90s, but the
  // backend heartbeats every 3s, so 90s of true silence means dead stream.
  const IDLE_MS = 90_000;
  const readWithIdle = () => {
    let t;
    const idle = new Promise((_, reject) => {
      t = setTimeout(() => {
        try { reader.cancel(); } catch { /* noop */ }
        reject(new Error('Carousel stream idle — aborted'));
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
      if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        if (event.type === 'carousel_start') {
          if (onStart) onStart(event.total, event.indexes);
        } else if (event.type === 'slide_done') {
          if (onSlideDone) onSlideDone(event.index, event.url);
        } else if (event.type === 'slide_failed') {
          if (onSlideFailed) onSlideFailed(event.index, event.error);
        } else if (event.type === 'error') {
          if (onError) onError(event.error);
        } else if (event.type === 'done') {
          outcome = { succeeded: event.succeeded || [], failed: event.failed || [] };
        }
      } catch { /* skip malformed events */ }
    }
  }
  return outcome;
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

export async function createBoosendAutomation({ name, instagram_account_id, nodes, edges, viewport }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/automations`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, instagram_account_id, nodes, edges, viewport }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create automation' }));
    throw new Error(err.error || err.message || 'Failed to create automation');
  }
  return res.json();
}

export async function streamBoosendAgentBuild({ message, graph, meta, targetNodes, signal, onData, onError, onDone }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/agent/build`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, graph, meta, targetNodes }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Agent error ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        if (json.error) { onError?.(json.detail || json.error); return; }
        if (json.done) { onDone?.(json); return; }
        onData?.(json);
      } catch {}
    }
  }
}

export async function getBoosendAutomations({ instagram_account_id } = {}) {
  const headers = await getAuthHeaders();
  let url = `${API_URL}/api/boosend/automations`;
  if (instagram_account_id) url += `?instagram_account_id=${instagram_account_id}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return { automations: [] };
  return res.json();
}

export async function getBoosendAutomation(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/automations/${id}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch automation');
  return res.json();
}

export async function updateBoosendAutomation(id, { nodes, edges, viewport }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/automations/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges, viewport }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update automation' }));
    throw new Error(err.error || 'Failed to update automation');
  }
  return res.json();
}

export async function activateBoosendAutomation(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/automations/${id}/activate`, { method: 'POST', headers });
  if (!res.ok) throw new Error('Failed to activate automation');
  return res.json();
}

export async function deactivateBoosendAutomation(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/automations/${id}/deactivate`, { method: 'POST', headers });
  if (!res.ok) throw new Error('Failed to deactivate automation');
  return res.json();
}

// ─── Instagram Posting (via BooSend) ───

export async function getInstagramAccounts() {
  const headers = await getAuthHeaders();
  console.log('[API] Fetching Instagram accounts from:', `${API_URL}/api/boosend/instagram-accounts`);
  const res = await fetch(`${API_URL}/api/boosend/instagram-accounts`, { headers });
  console.log('[API] Instagram accounts response status:', res.status);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[API] Instagram accounts error:', res.status, errText);
    return { accounts: [] };
  }
  const data = await res.json();
  console.log('[API] Instagram accounts data:', data);
  return data;
}

export async function postToInstagram({ caption, media_items, post_type, instagram_account_id }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/boosend/instagram/publish`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption, media_items, post_type, instagram_account_id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to post to Instagram' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── LinkedIn Posting ───

// Publish a text / single-image / multi-image (carousel) post to
// LinkedIn. Second arg is polymorphic: pass a string for a single
// image, or a string[] for a carousel. The backend routes to the right
// LinkedIn REST content type based on length.
export async function postToLinkedIn(text, imageOrImages) {
  const imageUrls = Array.isArray(imageOrImages)
    ? imageOrImages.filter(Boolean)
    : (imageOrImages ? [imageOrImages] : []);
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/linkedin/post`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      // Send imageUrl for the single-image case so older backend
      // versions still work during rollout; send imageUrls whenever
      // there are 2+ slides.
      imageUrl: imageUrls[0] || null,
      imageUrls: imageUrls.length > 1 ? imageUrls : undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Post to LinkedIn failed (${res.status})`);
  }
  return res.json();
}

// ─── Social Post Scheduling ───
// Routes through the real calendar endpoint so scheduled rows land in
// social_posts with status='scheduled' and the calendar dispatcher can
// pick them up. The old /api/social-posts/schedule route never existed
// and every schedule attempt silently 404'd.

export async function schedulePost({ platform, caption, scheduledAt, thumbnailUrl, images, contentType }) {
  const headers = await getAuthHeaders();
  const media = Array.isArray(images) && images.length
    ? images.map((im) => ({ type: 'image', url: im.src || im.url }))
    : thumbnailUrl
      ? [{ type: 'image', url: thumbnailUrl }]
      : [];
  const res = await fetch(`${API_URL}/api/calendar/posts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform,
      caption,
      content_type: contentType || (media.length > 1 ? 'carousel' : media.length === 1 ? 'image' : 'text'),
      scheduled_at: scheduledAt,
      media,
      status: 'scheduled',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to schedule post' }));
    throw new Error(err?.error || `Schedule failed (${res.status})`);
  }
  return res.json();
}

// ─── Calendar Posts ───

export async function getCalendarPosts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/calendar/posts`, { headers });
  if (!res.ok) throw new Error('Failed to fetch calendar posts');
  return res.json();
}

export async function createCalendarPost({ platform, caption, content_type, scheduled_at, media, status }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/calendar/posts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, caption, content_type, scheduled_at, media, status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create post' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function updateCalendarPost(id, updates) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/calendar/posts/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update post' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteCalendarPost(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/calendar/posts/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete post');
  return res.json();
}

export async function publishCalendarPost(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/calendar/posts/${id}/publish`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Publishing failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ─── Carousel Templates (saved design systems) ───

export async function getCarouselTemplates() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/carousel-templates`, { headers });
  if (!res.ok) return { templates: [] };
  return res.json();
}

export async function createCarouselTemplate({ name, design_system, preview_url }) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/carousel-templates`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, design_system, preview_url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to save template' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteCarouselTemplate(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/carousel-templates/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete template');
  return res.json();
}

// ─── Billing ───

export async function getBillingPlan() {
  // Throw on non-OK so callers can distinguish "verified no plan" (200 with
  // empty body) from "couldn't reach billing API" (401/5xx/network). The
  // earlier silent fallback caused paying users to see the onboarding/Plans
  // overlay whenever the backend transiently returned 401, because their
  // real subscription was reduced to null.
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/billing/plan`, { headers });
  if (!res.ok) {
    const err = new Error(`getBillingPlan failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function getBillingCredits() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/billing/credits`, { headers });
  if (!res.ok) return { balance: 0, transactions: [] };
  return res.json();
}

export async function getAvailablePlans() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/billing/plans`, { headers });
  if (!res.ok) return { plans: [] };
  return res.json();
}

export async function getCreditCosts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/billing/costs`, { headers });
  if (!res.ok) return { costs: [] };
  return res.json();
}

// Start a Stripe Checkout session for a plan. Returns { url } which the
// caller should redirect the browser to (window.location.href = url).
export async function createCheckoutSession({ plan, boost = false }) {
  const headers = await getAuthHeaders();
  // If the user has no auth token at all, fail fast with a clear message
  // instead of letting the backend reject with the generic "Auth required".
  if (!headers.Authorization) {
    throw new Error('Your session expired. Please sign in again.');
  }
  const res = await fetch(`${API_URL}/api/billing/checkout`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, boost }),
  });
  if (!res.ok) {
    // Surface the real backend error rather than the generic fallback so
    // the UI can show useful messages like "No Stripe price configured…"
    // or "Your session expired".
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    const message = body?.error
      || (res.status === 401 ? 'Your session expired. Please sign in again.'
        : res.status === 502 ? 'Server is restarting. Try again in a moment.'
        : `Checkout failed (HTTP ${res.status}).`);
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

// ─── New 4-step signup funnel ───
// Each call surfaces real backend errors (e.g., "setup fee already paid")
// so the UI can route the user to the correct next step instead of
// showing a generic failure.

async function postJsonOrThrow(path, body = {}) {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) {
    throw new Error('Your session expired. Please sign in again.');
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (res.ok) return res.json();
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON */ }
  const message = parsed?.error
    || (res.status === 401 ? 'Your session expired. Please sign in again.'
      : res.status === 502 ? 'Server is restarting. Try again in a moment.'
      : `Request failed (HTTP ${res.status}).`);
  const err = new Error(message);
  err.status = res.status;
  err.body = parsed;
  throw err;
}

// Pay the one-time setup fee for a plan. Body: { plan: 'complete'|'diamond' }.
// Returns { url } — frontend redirects via window.location.assign().
export async function createSetupCheckoutSession({ plan }) {
  return postJsonOrThrow('/api/billing/checkout/setup', { plan });
}

// Pay the setup fee in instalments. Body: { plan, installment: '2x'|'3x'|'6x' }.
// Returns { url } — Stripe Checkout for a recurring price the merchant
// configured at STRIPE_PRICE_<PLAN>_INSTALL_<KEY>.
export async function createInstallmentCheckoutSession({ plan, installment }) {
  return postJsonOrThrow('/api/billing/checkout/installment', { plan, installment });
}

// Confirm the user picked a meeting time on Calendly. Idempotent — calling
// it twice is a no-op success.
export async function confirmMeetingBooked() {
  return postJsonOrThrow('/api/billing/meeting/booked', {});
}

// Start the recurring monthly subscription. Plan is locked server-side
// from the user's setup payment; client doesn't pass it.
export async function createMonthlyCheckoutSession() {
  return postJsonOrThrow('/api/billing/checkout/monthly', {});
}

// Open the Stripe Customer Portal for the signed-in user. Returns { url }.
export async function createBillingPortalSession() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/billing/portal`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Portal failed' }));
    throw new Error(err.error || 'Portal failed');
  }
  return res.json();
}

// ─── Workspace / RBAC ────────────────────────────────────────────────

async function jsonRequest(method, path, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(parsed?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

export const getWorkspaceMe         = ()                  => jsonRequest('GET',    '/api/workspace/me');
export const getWorkspaceMembers    = ()                  => jsonRequest('GET',    '/api/workspace/members');
export const updateWorkspaceMember  = (id, patch)         => jsonRequest('PATCH',  `/api/workspace/members/${id}`, patch);
export const removeWorkspaceMember  = (id)                => jsonRequest('DELETE', `/api/workspace/members/${id}`);
export const getWorkspaceRoles      = ()                  => jsonRequest('GET',    '/api/workspace/roles');
export const updateWorkspaceRole    = (key, patch)        => jsonRequest('PUT',    `/api/workspace/roles/${key}`, patch);
export const createWorkspaceRole    = (payload)           => jsonRequest('POST',   '/api/workspace/roles', payload);
export const deleteWorkspaceRole    = (key)               => jsonRequest('DELETE', `/api/workspace/roles/${key}`);
export const getWorkspaceInvites    = ()                  => jsonRequest('GET',    '/api/workspace/invites');
export const createWorkspaceInvite  = (email, role_key)   => jsonRequest('POST',   '/api/workspace/invites', { email, role_key });
export const revokeWorkspaceInvite  = (id)                => jsonRequest('DELETE', `/api/workspace/invites/${id}`);
export const resendWorkspaceInvite  = (id)                => jsonRequest('POST',   `/api/workspace/invites/${id}/resend`);
export const lookupWorkspaceInvite  = (token)             => jsonRequest('GET',    `/api/workspace/invites/lookup/${token}`);
export const acceptWorkspaceInvite  = (token)             => jsonRequest('POST',   '/api/workspace/invites/accept', { token });
export const leaveWorkspace         = (ownerId)           => jsonRequest('DELETE', `/api/workspace/leave/${ownerId}`);
