import crypto from 'crypto';

const NETLIFY_API = 'https://api.netlify.com/api/v1';

async function netlifyFetch(path, token, options = {}) {
  const res = await fetch(`${NETLIFY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Netlify API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function validate(apiKey) {
  const accounts = await netlifyFetch('/accounts', apiKey);
  if (!accounts?.length) throw new Error('Invalid Netlify token or no accounts found');
  return { account_name: accounts[0].name, account_slug: accounts[0].slug };
}

// Netlify site names: 1-63 chars, lowercase letters + digits + hyphens, no
// leading/trailing hyphen.
const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function validateName(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return { ok: false, reason: 'empty' };
  if (n.length > 63) return { ok: false, reason: 'too_long' };
  if (!NAME_RE.test(n)) return { ok: false, reason: 'invalid_chars' };
  return { ok: true, name: n };
}

// Check if a site name is available. Returns { available, owned, reason }.
// Uses two probes:
//   1. GET /sites?name=<name> — if the authenticated user already owns a site
//      by that name we can redeploy to it directly (owned=true).
//   2. HEAD https://<name>.netlify.app — if ANY response other than 404 comes
//      back the name is taken by someone else (owned=false, available=false).
// Note: the final source of truth is POST /sites at deploy time; this is a
// best-effort pre-check to keep the UX snappy.
export async function checkNameAvailable(apiKey, rawName) {
  const v = validateName(rawName);
  if (!v.ok) return { available: false, owned: false, reason: v.reason };
  const name = v.name;

  // 1. Does the user already own this name?
  try {
    const owned = await netlifyFetch(`/sites?name=${encodeURIComponent(name)}&filter=all`, apiKey);
    const ownedSite = Array.isArray(owned) ? owned.find((s) => s.name === name) : null;
    if (ownedSite) {
      return { available: true, owned: true, site_id: ownedSite.id, url: ownedSite.ssl_url || ownedSite.url || `https://${name}.netlify.app` };
    }
  } catch (err) {
    console.log(`[netlify] check-name /sites probe failed for "${name}":`, err.message);
    // If even our own API is unreachable the token is likely bad — bubble up.
    if (/\b401\b|\b403\b|Unauthorized|Forbidden/i.test(err.message)) {
      return { available: false, owned: false, reason: 'unauthorized' };
    }
  }

  // 2. Is the subdomain taken by someone else?
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://${name}.netlify.app`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // 404 from Netlify's edge means the subdomain isn't claimed.
    if (res.status === 404) {
      return { available: true, owned: false };
    }
    // Any other code (200, 301, 401, 403, etc.) means something responded.
    return { available: false, owned: false, reason: 'taken' };
  } catch {
    // Timeout or network error — don't block the user, let deploy be the real check.
    return { available: true, owned: false, reason: 'unverified' };
  }
}

// Deploy a single HTML file as a Netlify site
export async function deploy(token, html, { siteName, siteId } = {}) {
  // 1. Create or find existing site
  let site;
  if (siteId) {
    site = await netlifyFetch(`/sites/${siteId}`, token);
  } else {
    // Try to find an existing site with our naming pattern
    const sites = await netlifyFetch('/sites?per_page=100', token);
    site = sites?.find(s => s.name === siteName);
    if (!site) {
      site = await netlifyFetch('/sites', token, {
        method: 'POST',
        body: JSON.stringify({ name: siteName || undefined }),
      });
    }
  }

  // 2. Compute SHA1 of the index.html content
  const htmlBuffer = Buffer.from(html, 'utf-8');
  const sha1 = crypto.createHash('sha1').update(htmlBuffer).digest('hex');

  // 3. Create deploy with file digest
  const deployResult = await netlifyFetch(`/sites/${site.id}/deploys`, token, {
    method: 'POST',
    body: JSON.stringify({
      files: { '/index.html': sha1 },
    }),
  });

  // 4. Upload the file content
  await fetch(`${NETLIFY_API}/deploys/${deployResult.id}/files/index.html`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: htmlBuffer,
  });

  return {
    site_id: site.id,
    site_name: site.name,
    deploy_id: deployResult.id,
    url: site.ssl_url || site.url || `https://${site.name}.netlify.app`,
  };
}
