const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Resolve a YouTube username/handle to a channel ID + metadata.
 */
export async function resolveChannel(username) {
  const handle = username.replace(/^@/, '');

  // Try direct handle lookup first (most reliable)
  let channelRes = await ytFetch('/channels', {
    forHandle: handle,
    part: 'snippet,statistics,contentDetails',
  });

  // Fallback: search for channel
  if (!channelRes.items?.length) {
    const searchRes = await ytFetch('/search', {
      q: handle, type: 'channel', part: 'snippet', maxResults: 1,
    });

    if (!searchRes.items?.length) {
      throw new Error(`Channel not found: ${username}`);
    }

    const channelId = searchRes.items[0].id?.channelId || searchRes.items[0].snippet?.channelId;
    if (!channelId) throw new Error(`Could not resolve channel ID for: ${username}`);

    channelRes = await ytFetch('/channels', {
      id: channelId,
      part: 'snippet,statistics,contentDetails',
    });
  }

  if (!channelRes.items?.length) {
    throw new Error(`Channel details not found for: ${username}`);
  }

  const ch = channelRes.items[0];
  return {
    channelId: ch.id,
    displayName: ch.snippet.title,
    avatarUrl: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url,
    subscriberCount: parseInt(ch.statistics.subscriberCount || '0'),
    uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
  };
}

/**
 * Fetch recent videos from a channel's uploads playlist.
 * Returns up to `count` videos with full statistics.
 */
export async function fetchRecentVideos(uploadsPlaylistId, count = 50) {
  // Get video IDs from uploads playlist
  const videoIds = [];
  let pageToken = null;

  while (videoIds.length < count) {
    const params = {
      playlistId: uploadsPlaylistId,
      part: 'snippet',
      maxResults: Math.min(50, count - videoIds.length),
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await ytFetch('/playlistItems', params);
    if (!res.items?.length) break;

    for (const item of res.items) {
      videoIds.push({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt,
      });
    }

    pageToken = res.nextPageToken;
    if (!pageToken) break;
  }

  if (videoIds.length === 0) return [];

  // Get statistics for all videos (batch by 50)
  const videos = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const ids = batch.map((v) => v.videoId).join(',');

    const statsRes = await ytFetch('/videos', {
      id: ids,
      part: 'statistics,contentDetails',
    });

    for (const stat of statsRes.items || []) {
      const meta = batch.find((v) => v.videoId === stat.id);
      if (!meta) continue;

      videos.push({
        videoId: stat.id,
        title: meta.title,
        thumbnailUrl: meta.thumbnail,
        url: `https://www.youtube.com/watch?v=${stat.id}`,
        publishedAt: meta.publishedAt,
        views: parseInt(stat.statistics.viewCount || '0'),
        likes: parseInt(stat.statistics.likeCount || '0'),
        comments: parseInt(stat.statistics.commentCount || '0'),
        durationSeconds: parseDuration(stat.contentDetails.duration),
      });
    }
  }

  // Filter out Shorts (≤ 180 seconds / 3 min) — only long-form content
  return videos.filter((v) => v.durationSeconds > 180);
}

/**
 * Calculate outlier metrics for a set of videos.
 * Returns videos enriched with multiplier values and is_outlier flag.
 */
export function calculateOutliers(videos, threshold = 2) {
  if (videos.length === 0) return { videos: [], averages: { views: 0, likes: 0, comments: 0 } };

  const avgViews = videos.reduce((s, v) => s + v.views, 0) / videos.length;
  const avgLikes = videos.reduce((s, v) => s + v.likes, 0) / videos.length;
  const avgComments = videos.reduce((s, v) => s + v.comments, 0) / videos.length;

  const enriched = videos.map((v) => {
    const viewsMultiplier = avgViews > 0 ? Math.round((v.views / avgViews) * 10) / 10 : 0;
    const likesMultiplier = avgLikes > 0 ? Math.round((v.likes / avgLikes) * 10) / 10 : 0;
    const commentsMultiplier = avgComments > 0 ? Math.round((v.comments / avgComments) * 10) / 10 : 0;

    const isOutlier = viewsMultiplier >= threshold || likesMultiplier >= threshold || commentsMultiplier >= threshold;

    return {
      ...v,
      viewsMultiplier,
      likesMultiplier,
      commentsMultiplier,
      isOutlier,
    };
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

// ─── Helpers ───

async function ytFetch(endpoint, params) {
  if (!YT_API_KEY) throw new Error('YOUTUBE_API_KEY not set');

  const url = new URL(BASE + endpoint);
  url.searchParams.set('key', YT_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    console.log(`[youtube-api] ${endpoint} failed:`, err.slice(0, 200));
    throw new Error(`YouTube API error: ${res.status}`);
  }

  return res.json();
}

function parseDuration(iso) {
  // PT1H2M3S → seconds
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}
