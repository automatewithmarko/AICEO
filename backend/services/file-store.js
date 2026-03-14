// In-memory HTML file store for generated content
// Files are keyed by userId:agentName
// Auto-cleanup of files older than 2 hours

const store = new Map();

export function saveFile(userId, agentName, html) {
  const key = `${userId}:${agentName}`;
  store.set(key, { html, updatedAt: Date.now() });
  return key;
}

export function getFile(userId, agentName) {
  const key = `${userId}:${agentName}`;
  return store.get(key)?.html || null;
}

export function updateFile(userId, agentName, html) {
  const key = `${userId}:${agentName}`;
  store.set(key, { html, updatedAt: Date.now() });
}

export function deleteFile(userId, agentName) {
  const key = `${userId}:${agentName}`;
  store.delete(key);
}

// Clean up files older than 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now - val.updatedAt > 2 * 60 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 30 * 60 * 1000);
