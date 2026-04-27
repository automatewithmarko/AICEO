// Microsoft OAuth2 service for Outlook IMAP/SMTP (XOAUTH2)
// Uses Microsoft Identity Platform v2.0 endpoints

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

// Scopes needed for IMAP + SMTP access
const SCOPES = [
  'https://outlook.office365.com/IMAP.AccessAsUser.All',
  'https://outlook.office365.com/SMTP.Send',
  'offline_access',       // needed for refresh_token
  'openid',
  'email',
  'profile',
];

function getClientId() {
  return process.env.MICROSOFT_CLIENT_ID;
}

function getClientSecret() {
  return process.env.MICROSOFT_CLIENT_SECRET;
}

function getRedirectUri() {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/settings/outlook/callback`;
}

/**
 * Build the Microsoft OAuth authorization URL.
 * `state` should be a signed/opaque token tying the request to the user session.
 */
export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent', // always show consent so we get refresh_token
  });
  return `${MICROSOFT_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
    scope: SCOPES.join(' '),
  });

  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || `Token exchange failed (${res.status})`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,                    // seconds
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    id_token: data.id_token,
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES.join(' '),
  });

  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || `Token refresh failed (${res.status})`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // MS may or may not rotate
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Decode a JWT id_token to extract email + name (no verification — we trust Microsoft's TLS).
 */
export function decodeIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    return {
      email: payload.preferred_username || payload.email || payload.upn || '',
      name: payload.name || '',
    };
  } catch {
    return { email: '', name: '' };
  }
}

/**
 * Build an XOAUTH2 token string for IMAP/SMTP authentication.
 * Format: base64("user=" + email + "\x01auth=Bearer " + accessToken + "\x01\x01")
 */
export function buildXOAuth2Token(email, accessToken) {
  const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authString).toString('base64');
}
