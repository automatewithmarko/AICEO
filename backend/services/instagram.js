const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const HOST = 'instagram120.p.rapidapi.com';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_INSTAGRAM_ACTOR = process.env.APIFY_INSTAGRAM_ACTOR || 'apify~instagram-reel-scraper';

/**
 * Extract username from an Instagram URL or clean up input.
 */
function extractUsername(input) {
  const urlMatch = input.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
  if (urlMatch && !['p', 'reel', 'reels', 'stories', 'explore'].includes(urlMatch[1])) return urlMatch[1];
  return input.replace(/^@/, '').trim();
}

/**
 * Resolve an Instagram username to profile info.
 * RapidAPI (instagram120) primary, Apify fallback when it fails or returns nothing.
 */
export async function resolveProfile(username) {
  const handle = extractUsername(username);

  // Primary: RapidAPI userInfo
  try {
    const data = await igFetch('/api/instagram/userInfo', { username: handle });
    // instagram120 may nest user data in various ways — try common paths
    const user = data?.result?.user || data?.result || data?.user || data;
    if (user?.username || user?.pk || user?.id) {
      return {
        userId: user.id || user.pk || String(user.pk),
        username: user.username || handle,
        displayName: user.full_name || user.username || handle,
        avatarUrl: user.hd_profile_pic_url_info?.url || user.profile_pic_url_hd || user.profile_pic_url || null,
        followerCount: user.follower_count || user.edge_followed_by?.count || 0,
      };
    }
  } catch (err) {
    console.log(`[instagram] userInfo failed for ${handle}, falling back to posts:`, err.message);
  }

  // Secondary: RapidAPI posts endpoint (grab owner from first edge)
  try {
    const postsData = await igFetch('/api/instagram/posts', { username: handle, maxId: '' });
    const firstNode = postsData?.result?.edges?.[0]?.node;
    const user = firstNode?.user || firstNode?.owner;
    if (user) {
      return {
        userId: user.id || user.pk || String(user.pk),
        username: user.username || handle,
        displayName: user.full_name || user.username || handle,
        avatarUrl: user.hd_profile_pic_url_info?.url || user.profile_pic_url || null,
        followerCount: user.follower_count || 0,
      };
    }
  } catch (err2) {
    console.log(`[instagram] posts fallback also failed for ${handle}:`, err2.message);
  }

  // Tertiary: Apify fallback (derives profile from the first reel's owner fields)
  if (APIFY_TOKEN) {
    try {
      console.log(`[instagram] RapidAPI exhausted, trying Apify for @${handle}`);
      const items = await apifyFetchReels(handle, 1);
      if (items.length > 0) {
        const owner = items[0].__raw || items[0];
        return {
          userId: String(owner.ownerId || owner.owner?.id || owner.owner?.pk || handle),
          username: owner.ownerUsername || owner.owner?.username || handle,
          displayName: owner.ownerFullName || owner.owner?.full_name || owner.ownerUsername || handle,
          avatarUrl: owner.ownerProfilePicUrl || owner.owner?.profile_pic_url || null,
          followerCount: Number(owner.ownerFollowerCount || owner.owner?.follower_count || 0),
        };
      }
    } catch (err3) {
      console.log(`[instagram] Apify fallback also failed for ${handle}:`, err3.message);
    }
  }

  throw new Error(`Instagram user not found: ${username}`);
}

/**
 * Fetch recent posts/reels from an Instagram user.
 * RapidAPI primary, Apify fallback if RapidAPI fails or returns nothing.
 */
export async function fetchRecentPosts(username, count = 50) {
  const handle = extractUsername(username);

  // Primary: RapidAPI reels endpoint with cursor-based pagination
  try {
    const posts = await rapidFetchReels(handle, count);
    if (posts.length > 0) return posts;
    console.log(`[instagram] RapidAPI returned 0 posts for @${handle}, trying Apify`);
  } catch (err) {
    console.log(`[instagram] RapidAPI fetchRecentPosts failed for ${handle}:`, err.message);
  }

  // Fallback: Apify
  if (APIFY_TOKEN) {
    try {
      const items = await apifyFetchReels(handle, count);
      return items.map(stripRaw);
    } catch (err2) {
      console.log(`[instagram] Apify fetchRecentPosts also failed for ${handle}:`, err2.message);
      throw err2;
    }
  }

  throw new Error(`Instagram posts unavailable for ${username}`);
}

/**
 * Calculate outlier metrics for Instagram posts.
 */
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

// ─── RapidAPI helpers ───

async function rapidFetchReels(handle, count) {
  const posts = [];
  let maxId = '';

  while (posts.length < count) {
    const data = await igFetch('/api/instagram/reels', { username: handle, maxId });
    const edges = data?.result?.edges || data?.result?.items || data?.edges || data?.items || [];
    if (edges.length === 0) break;

    for (const edge of edges) {
      // Try multiple nesting patterns: edge.node.media, edge.node, edge.media, or edge itself
      const media = edge.node?.media || edge.node || edge.media || edge;
      if (!media) continue;

      const code = media.code || media.shortcode;
      const thumbnail = media.image_versions2?.candidates?.[0]?.url
        || media.thumbnail_url
        || media.display_url
        || null;

      posts.push({
        videoId: code || media.pk || media.id,
        title: media.caption?.text || '',
        thumbnailUrl: thumbnail,
        url: `https://www.instagram.com/reel/${code || media.pk}/`,
        publishedAt: media.taken_at ? new Date(media.taken_at * 1000).toISOString() : null,
        views: parseInt(media.play_count || media.view_count || 0),
        likes: parseInt(media.like_count || 0),
        comments: parseInt(media.comment_count || 0),
        durationSeconds: Math.round(media.video_duration || 0),
        isVideo: true,
      });
    }

    const pageInfo = data?.result?.page_info || data?.page_info;
    const nextMaxId = pageInfo?.end_cursor || data?.result?.end_cursor || data?.end_cursor;
    if ((pageInfo?.has_next_page || data?.result?.has_next_page) && nextMaxId) {
      maxId = nextMaxId;
    } else {
      break;
    }
  }

  return posts.slice(0, count);
}

async function igFetch(endpoint, body) {
  if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY not set');

  const res = await fetch(`https://${HOST}${endpoint}`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': HOST,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.log(`[instagram-api] ${endpoint} failed:`, err.slice(0, 200));
    throw new Error(`Instagram API error: ${res.status}`);
  }

  return res.json();
}

// ─── Apify fallback helpers ───

/**
 * Fetch reels from Apify actor apify/instagram-reel-scraper.
 * Returns items in the same shape as rapidFetchReels, with a __raw attachment
 * used by resolveProfile to read owner fields.
 */
async function apifyFetchReels(handle, count) {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set');

  const url = `https://api.apify.com/v2/acts/${APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const profileUrl = `https://www.instagram.com/${handle}/`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Multiple accepted input keys across actor variants.
      username: [profileUrl],
      usernames: [handle],
      directUrls: [profileUrl],
      resultsLimit: count,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.log(`[apify-instagram] ${APIFY_INSTAGRAM_ACTOR} error ${res.status}: ${errText.slice(0, 200)}`);
    throw new Error(`Apify Instagram actor ${res.status}`);
  }

  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Apify Instagram actor returned no items');
  }

  return items.slice(0, count).map((item) => {
    const code = item.shortCode || item.shortcode || item.code;
    const views = Number(item.videoViewCount || item.videoPlayCount || item.viewCount || 0);
    const likes = Number(item.likesCount || item.likeCount || 0);
    const comments = Number(item.commentsCount || item.commentCount || 0);
    const duration = Number(item.videoDuration || item.duration || 0);
    const thumbnail = item.displayUrl || item.thumbnailUrl || item.thumbnail || null;
    const published = item.timestamp ? new Date(item.timestamp).toISOString() : null;

    return {
      videoId: code || item.id || item.pk,
      title: item.caption || '',
      thumbnailUrl: thumbnail,
      url: item.url || (code ? `https://www.instagram.com/reel/${code}/` : null),
      publishedAt: published,
      views,
      likes,
      comments,
      durationSeconds: Math.round(duration),
      isVideo: Boolean(item.videoUrl || item.type === 'Video' || duration > 0),
      __raw: item,
    };
  });
}

function stripRaw({ __raw, ...rest }) {
  return rest;
}
