import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function apiCall(path, options = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export async function listForms() {
  return apiCall('/api/forms');
}

export async function createForm(title) {
  return apiCall('/api/forms', { method: 'POST', body: JSON.stringify({ title }) });
}

export async function getForm(id) {
  return apiCall(`/api/forms/${id}`);
}

export async function updateForm(id, updates) {
  return apiCall(`/api/forms/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteForm(id) {
  return apiCall(`/api/forms/${id}`, { method: 'DELETE' });
}

export async function publishForm(id) {
  return apiCall(`/api/forms/${id}/publish`, { method: 'POST' });
}

export async function unpublishForm(id) {
  return apiCall(`/api/forms/${id}/unpublish`, { method: 'POST' });
}

export async function getPublicForm(slug) {
  const res = await fetch(`${API_URL}/api/forms/public/${slug}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Form not found' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function submitFormResponse(slug, answers) {
  const res = await fetch(`${API_URL}/api/forms/public/${slug}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Submission failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function getFormResponses(id) {
  return apiCall(`/api/forms/${id}/responses`);
}

export async function deleteFormResponse(formId, responseId) {
  return apiCall(`/api/forms/${formId}/responses/${responseId}`, { method: 'DELETE' });
}

export async function exportFormCSV(id) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/forms/${id}/responses/csv`, { headers });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'responses.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function getBranchingRules(id) {
  return apiCall(`/api/forms/${id}/branching`);
}

export async function saveBranchingRules(id, rules) {
  return apiCall(`/api/forms/${id}/branching`, { method: 'PUT', body: JSON.stringify({ rules }) });
}
