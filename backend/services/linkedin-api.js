// LinkedIn OAuth 2.0 + REST API service
// Handles authorization, token exchange, user info, and posting (text + image).

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_VERSION = '202401';

/**
 * Build the LinkedIn OAuth 2.0 authorization URL.
 * @param {string} redirectUri — where LinkedIn sends the user after consent
 * @param {string} state      — opaque CSRF token
 * @returns {string} authorization URL
 */
export function getAuthUrl(redirectUri, state = '') {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile w_member_social',
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

/**
 * Exchange an authorization code for an access token.
 * @returns {{ access_token: string, expires_in: number }}
 */
export async function exchangeCode(code, redirectUri) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Fetch the authenticated user's profile via the OpenID userinfo endpoint.
 * @returns {{ sub: string, name: string, picture?: string }}
 */
export async function getUserInfo(accessToken) {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LinkedIn userinfo failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Publish a text-only post to LinkedIn.
 * @returns {{ postUrl: string, postUrn: string }}
 */
export async function postText(accessToken, linkedinUserId, text) {
  const body = {
    author: `urn:li:person:${linkedinUserId}`,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
  };

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`LinkedIn post failed (${res.status}): ${errBody.slice(0, 500)}`);
  }

  // LinkedIn returns 201 with the post URN in the x-restli-id header
  const postUrn = res.headers.get('x-restli-id') || '';
  const postUrl = postUrn
    ? `https://www.linkedin.com/feed/update/${postUrn}/`
    : 'https://www.linkedin.com/feed/';

  return { postUrl, postUrn };
}

/**
 * Publish a post with an image to LinkedIn.
 * Flow: initialize upload -> upload binary -> create post.
 * @param {string} imageUrl — public URL of the image to upload
 * @returns {{ postUrl: string, postUrn: string }}
 */
export async function postWithImage(accessToken, linkedinUserId, text, imageUrl) {
  const personUrn = `urn:li:person:${linkedinUserId}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': LINKEDIN_VERSION,
  };

  // Step 1: Initialize the upload
  const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: personUrn,
      },
    }),
  });

  if (!initRes.ok) {
    const errBody = await initRes.text().catch(() => '');
    throw new Error(`LinkedIn image init failed (${initRes.status}): ${errBody.slice(0, 500)}`);
  }

  const initData = await initRes.json();
  const uploadUrl = initData.value.uploadUrl;
  const imageUrn = initData.value.image;

  // Step 2: Download the image from the provided URL
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from ${imageUrl}: ${imgRes.status}`);
  }
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

  // Step 3: Upload the binary to LinkedIn's upload URL
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text().catch(() => '');
    throw new Error(`LinkedIn image upload failed (${uploadRes.status}): ${errBody.slice(0, 500)}`);
  }

  // Step 4: Create the post with the uploaded image
  const postBody = {
    author: personUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
    content: {
      media: {
        id: imageUrn,
      },
    },
  };

  const postRes = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers,
    body: JSON.stringify(postBody),
  });

  if (!postRes.ok) {
    const errBody = await postRes.text().catch(() => '');
    throw new Error(`LinkedIn image post failed (${postRes.status}): ${errBody.slice(0, 500)}`);
  }

  const postUrn = postRes.headers.get('x-restli-id') || '';
  const postUrl = postUrn
    ? `https://www.linkedin.com/feed/update/${postUrn}/`
    : 'https://www.linkedin.com/feed/';

  return { postUrl, postUrn };
}
