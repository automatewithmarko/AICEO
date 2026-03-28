// BooSend integration — stores API key for DM automation
// BooSend doesn't have a public validation endpoint, so we just store the key

export async function validate(apiKey) {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('Invalid BooSend API key');
  }
  return { ok: true };
}

export async function sync() {
  // BooSend sync is handled externally — no pull-based sync needed
  return { synced: 0, total: 0 };
}
