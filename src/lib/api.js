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
 * Upload files for content context (documents, videos, images).
 * Files are processed on the backend — documents get text extraction,
 * videos get transcription, images are stored as-is.
 */
export async function uploadContextFiles(files) {
  const headers = await getAuthHeaders();
  const formData = new FormData();

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
export async function extractSocialUrls(urls) {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}/api/social/extract`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
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
export async function getContentItems() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/content-items`, { headers });
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
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return { videos: [] };
  return res.json();
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

export async function getSalesRevenue(view = 'Month') {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/sales/revenue?view=${view}`, { headers });
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

// ─── Products ───

export async function getProducts() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/products`, { headers });
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

export async function connectIntegration(provider, apiKey) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/integrations/${provider}/connect`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
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
  // Sync via Supabase Edge Function (bypasses Railway IMAP blocking)
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/sync-email`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ account_id: id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getEmails(params = {}) {
  const headers = await getAuthHeaders();
  const url = new URL(`${API_URL}/api/emails`);
  if (params.folder) url.searchParams.set('folder', params.folder);
  if (params.starred) url.searchParams.set('starred', 'true');
  if (params.accountId) url.searchParams.set('account_id', params.accountId);
  if (params.search) url.searchParams.set('search', params.search);
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

export async function sendEmailApi({ account_id, to, cc, subject, body_text, body_html, in_reply_to, references }) {
  // Send via Supabase Edge Function (bypasses Railway SMTP blocking)
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
