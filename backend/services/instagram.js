const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const HOST = 'instagram120.p.rapidapi.com';

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
 * Tries /api/instagram/userInfo first, falls back to extracting from posts.
 */
export async function resolveProfile(username) {
  const handle = extractUsername(username);

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

  // Fallback: fetch first page of posts and extract user from first post
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

  throw new Error(`Instagram user not found: ${username}`);
}

/**
 * Fetch recent posts/reels from an Instagram user.
 * Returns up to `count` items with engagement stats.
 */
export async function fetchRecentPosts(username, count = 50) {
  const handle = extractUsername(username);
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

// ─── Helper ───

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
