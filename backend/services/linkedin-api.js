// LinkedIn OAuth 2.0 + REST API service
// Handles authorization, token exchange, user info, and posting (text + image).

import { PDFDocument } from 'pdf-lib';

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_VERSION = '202604';

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

/**
 * Upload one image to LinkedIn's Images API. Returns the image URN
 * that a later posts call can attach. Broken out from postWithImage so
 * postWithImages can reuse it for every slide of a carousel.
 */
async function uploadSingleImage(accessToken, personUrn, imageUrl) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': LINKEDIN_VERSION,
  };

  const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers,
    body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
  });
  if (!initRes.ok) {
    const errBody = await initRes.text().catch(() => '');
    throw new Error(`LinkedIn image init failed (${initRes.status}): ${errBody.slice(0, 500)}`);
  }
  const initData = await initRes.json();
  const { uploadUrl, image: imageUrn } = initData.value;

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from ${imageUrl}: ${imgRes.status}`);
  }
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

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

  return imageUrn;
}

/**
 * Publish a multi-image carousel post to LinkedIn. Uses LinkedIn's
 * feed multi-image content type — up to 20 images render as a
 * swipeable carousel in the LinkedIn feed on both web and mobile.
 * @param {string[]} imageUrls — public URLs of every slide, in order
 * @returns {{ postUrl: string, postUrn: string }}
 */
export async function postWithImages(accessToken, linkedinUserId, text, imageUrls) {
  const urls = (imageUrls || []).filter(Boolean);
  if (urls.length === 0) throw new Error('postWithImages requires at least one image URL');
  if (urls.length === 1) {
    // No point going through multiImage for a single slide — it
    // requires ≥2 images anyway. Fall through to the single-image
    // publish path so we don't get a schema rejection.
    return postWithImage(accessToken, linkedinUserId, text, urls[0]);
  }

  const personUrn = `urn:li:person:${linkedinUserId}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': LINKEDIN_VERSION,
  };

  // Upload every slide in parallel; LinkedIn rate-limits image uploads
  // per-app but a 7-20 slide carousel comfortably fits under it and
  // parallel cuts the perceived wall-clock roughly in half.
  const imageUrns = await Promise.all(urls.map((u) => uploadSingleImage(accessToken, personUrn, u)));

  // Multi-image content shape per LinkedIn REST /posts contract.
  const postBody = {
    author: personUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
    content: {
      multiImage: {
        images: imageUrns.map((id) => ({ id })),
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
    throw new Error(`LinkedIn carousel post failed (${postRes.status}): ${errBody.slice(0, 500)}`);
  }

  const postUrn = postRes.headers.get('x-restli-id') || '';
  const postUrl = postUrn
    ? `https://www.linkedin.com/feed/update/${postUrn}/`
    : 'https://www.linkedin.com/feed/';
  return { postUrl, postUrn };
}

/**
 * Compose a PDF from a list of image URLs — one image per page,
 * page sized to match the image so nothing is cropped or letterboxed.
 * @returns {Promise<Uint8Array>} PDF bytes
 */
async function composePdfFromImageUrls(imageUrls) {
  const pdf = await PDFDocument.create();
  for (const url of imageUrls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    // Detect PNG vs JPEG from magic bytes; pdf-lib needs the right
    // embedder. Anything else — the fetch response's Content-Type is a
    // useful hint but we trust the bytes.
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const embedded = isPng ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
    const { width, height } = embedded.size();
    const page = pdf.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }
  return pdf.save();
}

/**
 * Publish a multi-slide carousel to LinkedIn as a native document
 * post. LinkedIn renders document posts as a swipeable slide-by-slide
 * viewer on both web and mobile — closer to the "traditional carousel"
 * UX the user expects than a multiImage feed post (which shows as a
 * grid on desktop).
 *
 * Flow: compose PDF from image URLs → initializeUpload against the
 * /rest/documents endpoint → PUT the PDF binary → create post with
 * content.media referencing the document URN.
 *
 * @param {string[]} imageUrls — public URLs of every slide, in order
 * @param {string} title       — used as the document title (visible under the doc on LinkedIn)
 */
export async function postWithDocument(accessToken, linkedinUserId, text, imageUrls, title = 'Carousel') {
  const urls = (imageUrls || []).filter(Boolean);
  if (urls.length === 0) throw new Error('postWithDocument requires at least one image URL');

  const personUrn = `urn:li:person:${linkedinUserId}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': LINKEDIN_VERSION,
  };

  const pdfBytes = await composePdfFromImageUrls(urls);

  // Step 1: initialize document upload
  const initRes = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', {
    method: 'POST',
    headers,
    body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
  });
  if (!initRes.ok) {
    const errBody = await initRes.text().catch(() => '');
    throw new Error(`LinkedIn document init failed (${initRes.status}): ${errBody.slice(0, 500)}`);
  }
  const initData = await initRes.json();
  const { uploadUrl, document: documentUrn } = initData.value;

  // Step 2: PUT the PDF binary
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/pdf',
    },
    body: Buffer.from(pdfBytes),
  });
  if (!uploadRes.ok) {
    const errBody = await uploadRes.text().catch(() => '');
    throw new Error(`LinkedIn document upload failed (${uploadRes.status}): ${errBody.slice(0, 500)}`);
  }

  // Step 3: create the post referencing the document URN. LinkedIn
  // renders the document as a swipeable slide viewer inline in the
  // feed. `title` shows below the doc; keep it short.
  const postBody = {
    author: personUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
    content: {
      media: {
        id: documentUrn,
        title: (title || 'Carousel').slice(0, 100),
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
    throw new Error(`LinkedIn document post failed (${postRes.status}): ${errBody.slice(0, 500)}`);
  }

  const postUrn = postRes.headers.get('x-restli-id') || '';
  const postUrl = postUrn
    ? `https://www.linkedin.com/feed/update/${postUrn}/`
    : 'https://www.linkedin.com/feed/';
  return { postUrl, postUrn };
}
