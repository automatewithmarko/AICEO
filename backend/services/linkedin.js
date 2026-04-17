// LinkedIn outlier scraper — mirrors the shape of instagram.js / tiktok.js so
// the outlier endpoint can treat all platforms identically. Uses Apify since
// LinkedIn aggressively blocks direct scraping and there's no public API.
//
// Env vars (override actors if you have a preferred one):
//   APIFY_TOKEN                       — required
//   APIFY_LINKEDIN_PROFILE_ACTOR      — default: apimaestro~linkedin-profile-batch-scraper-no-cookies-required
//   APIFY_LINKEDIN_POSTS_ACTOR        — default: apimaestro~linkedin-profile-posts

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const PROFILE_ACTOR = process.env.APIFY_LINKEDIN_PROFILE_ACTOR || 'apimaestro~linkedin-profile-batch-scraper-no-cookies-required';
const POSTS_ACTOR = process.env.APIFY_LINKEDIN_POSTS_ACTOR || 'apimaestro~linkedin-profile-posts';

function extractHandle(input) {
  // Accept raw handle, @handle, or full LinkedIn URL.
  const urlMatch = input.match(/linkedin\.com\/(?:in|company|pub)\/([a-zA-Z0-9\-_.]+)/i);
  if (urlMatch) return urlMatch[1];
  return input.replace(/^@/, '').trim();
}

function profileUrl(handle) {
  return `https://www.linkedin.com/in/${handle}/`;
}

async function runActor(actor, input) {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set — LinkedIn outlier detection requires Apify.');
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Apify LinkedIn actor ${actor} returned ${res.status}: ${errText.slice(0, 200)}`);
  }
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Apify LinkedIn actor returned non-array');
  return items;
}

export async function resolveProfile(username) {
  const handle = extractHandle(username);
  const items = await runActor(PROFILE_ACTOR, {
    usernames: [handle],
    profileUrls: [profileUrl(handle)],
  });
  if (items.length === 0) throw new Error(`LinkedIn profile not found: ${username}`);
  const p = items[0];
  return {
    userId: String(p.publicIdentifier || p.profileId || p.id || handle),
    username: p.publicIdentifier || handle,
    displayName: p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || handle,
    avatarUrl: p.profilePicture || p.pictureUrl || p.profilePic || null,
    followerCount: Number(p.followersCount || p.followers || p.numConnections || 0),
  };
}

export async function fetchRecentPosts(username, count = 50) {
  const handle = extractHandle(username);
  const items = await runActor(POSTS_ACTOR, {
    username: handle,
    usernames: [handle],
    profileUrl: profileUrl(handle),
    profileUrls: [profileUrl(handle)],
    maxPosts: count,
    resultsLimit: count,
  });

  return items.slice(0, count).map((item) => {
    // Actor outputs vary: urn can be a string ("urn:li:activity:..."), an
    // object ({ id, type }), a number, or missing. Normalize to a string
    // before any split() call so we don't crash on non-string values.
    const urnRaw = item.urn ?? item.postUrn ?? item.activityUrn ?? '';
    const urn = typeof urnRaw === 'string' ? urnRaw : String(urnRaw?.id || urnRaw || '');
    const postId = item.postId || item.id || (urn ? urn.split(':').pop() : '');
    const postUrl = item.url || item.postUrl || (urn ? `https://www.linkedin.com/feed/update/${urn}/` : null);

    // LinkedIn reactions/engagement shape varies by actor.
    const likes = Number(
      item.likesCount || item.numLikes || item.reactions?.total || item.totalReactionCount || 0
    );
    const comments = Number(item.commentsCount || item.numComments || item.totalComments || 0);
    const views = Number(item.viewsCount || item.impressions || item.numViews || 0);

    // LinkedIn posts often have no explicit "views" field. Use reactions+comments
    // as a proxy so outlier scoring still works.
    const proxyViews = views || (likes + comments * 3);

    const thumbnail = item.thumbnailUrl || item.imageUrl
      || item.images?.[0]?.url
      || item.media?.[0]?.url
      || item.previewImage
      || null;

    return {
      videoId: String(postId || urn || `linkedin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      title: (item.text || item.content || item.commentary || '').slice(0, 500),
      thumbnailUrl: thumbnail,
      url: postUrl,
      publishedAt: item.postedAt || item.publishedAt || item.timestamp || item.date || null,
      views: proxyViews,
      likes,
      comments,
      durationSeconds: 0,
      isVideo: Boolean(item.videoUrl || item.videos?.length),
    };
  });
}

export function calculateOutliers(posts, threshold = 2) {
  if (posts.length === 0) return { videos: [], averages: { views: 0, likes: 0, comments: 0 } };

  const avgViews = posts.reduce((s, v) => s + v.views, 0) / posts.length;
  const avgLikes = posts.reduce((s, v) => s + v.likes, 0) / posts.length;
  const avgComments = posts.reduce((s, v) => s + v.comments, 0) / posts.length;

  const enriched = posts.map((v) => {
    const viewsMultiplier = avgViews > 0 ? Math.round((v.views / avgViews) * 10) / 10 : 0;
    const likesMultiplier = avgLikes > 0 ? Math.round((v.likes / avgLikes) * 10) / 10 : 0;
    const commentsMultiplier = avgComments > 0 ? Math.round((v.comments / avgComments) * 10) / 10 : 0;
    const isOutlier = viewsMultiplier >= threshold || likesMultiplier >= threshold || commentsMultiplier >= threshold;
    return { ...v, viewsMultiplier, likesMultiplier, commentsMultiplier, isOutlier };
  });

  return {
    videos: enriched,
    averages: {
      views: Math.round(avgViews),
      likes: Math.round(avgLikes),
      comments: Math.round(avgComments),
    },
  };
}
