import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Busboy from 'busboy';
import crypto from 'crypto';
import { uploadFile, saveAnalysis, supabase } from './services/storage.js';
import { extractText } from './services/documents.js';
import { transcribe, isMediaFile } from './services/video.js';
import { extractFromUrl } from './services/social.js';
import { resolveChannel, fetchRecentVideos, calculateOutliers } from './services/youtube.js';
import * as tiktokService from './services/tiktok.js';
import * as instagramService from './services/instagram.js';
import * as linkedinService from './services/linkedin.js';
import emailRoutes from './routes/email.js';
import integrationRoutes from './routes/integrations.js';
import webhookRoutes from './routes/webhooks.js';
import salesRoutes from './routes/sales.js';
import productRoutes from './routes/products.js';
import contactRoutes from './routes/contacts.js';
import generateRoutes from './routes/generate.js';
import orchestrateRoutes from './routes/orchestrate.js';
import boosendRoutes from './routes/boosend.js';
import formRoutes from './routes/forms.js';
import dashboardRoutes from './routes/dashboard.js';
import artifactVersionRoutes from './routes/artifact-versions.js';
import calendarRoutes from './routes/calendar.js';
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';
import { startEmailSync } from './services/email-sync.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true,
}));

// Raw body for Stripe webhooks (before express.json)
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Auth middleware — verifies the Supabase JWT from the frontend
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token === 'undefined') {
    console.log('[auth] No token provided — allowing unauthenticated request');
    req.user = { id: 'anonymous' };
    return next();
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    console.log('[auth] Invalid token:', error?.message);
    req.user = { id: 'anonymous' };
    return next();
  }

  req.user = user;
  next();
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── Get saved content items for user ───
app.get('/api/content-items', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ items: [] });

  const { session_id } = req.query;

  let query = supabase
    .from('content_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // When a session is specified, return items for THIS session PLUS globally-
  // saved items (session_id IS NULL). Outlier Detector's "Add to Context"
  // saves with no session_id — so those items form a global pool that every
  // Content chat session can pull from. Without this, outlier videos never
  // reach the chatbot's context.
  if (session_id) {
    query = query.or(`session_id.eq.${session_id},session_id.is.null`);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data });
});

// ─── Delete a content item ───
app.delete('/api/content-items/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { error } = await supabase
    .from('content_items')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Add outlier video to content context ───
app.post('/api/content-items/from-outlier', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { url, title, thumbnail_url, platform, video_id, creator_name } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    // For YouTube, try to fetch transcript
    let transcript = null;
    if (platform === 'youtube' && video_id) {
      try {
        const { getSubtitles } = await import('youtube-caption-extractor');
        const captions = await getSubtitles({ videoID: video_id, lang: 'en' });
        if (captions?.length) {
          transcript = captions.map((c) => c.text).join(' ');
        }
      } catch (e) {
        console.log('[outlier-context] No captions for', video_id, e.message);
      }
    }

    const { data: saved, error: dbErr } = await supabase.from('content_items').insert({
      user_id: userId,
      type: 'social',
      url,
      transcript,
      metadata: {
        platform: platform || 'unknown',
        title: title || '',
        uploader: creator_name || '',
        thumbnail: thumbnail_url || null,
        source: 'outlier-detector',
      },
    }).select('id').single();

    if (dbErr) throw dbErr;

    res.json({
      id: saved.id,
      url,
      title,
      thumbnail: thumbnail_url,
      transcript,
      platform,
      creator_name,
    });
  } catch (err) {
    console.log('[outlier-context] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload & Process endpoint ───
// Accepts multipart/form-data with one or more files
// Returns analysis results for each file
app.post('/api/upload', requireAuth, (req, res) => {
  const userId = req.user.id;
  const results = [];
  const filePromises = [];
  let sessionId = null;

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  });

  busboy.on('field', (name, value) => {
    if (name === 'sessionId' && value) sessionId = value;
  });

  busboy.on('file', (fieldname, stream, info) => {
    const { filename, mimeType } = info;
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));

    const done = new Promise(async (resolve) => {
      stream.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const uniqueName = `${userId}/${crypto.randomUUID()}-${filename}`;

          // Determine bucket and processing type
          let bucket, type, analysis;

          if (mimeType.startsWith('image/')) {
            bucket = 'content-context';
            type = 'photo';
            const stored = await uploadFile(bucket, uniqueName, buffer, mimeType);
            analysis = { type, filename, url: stored.url };

            // Persist to DB
            if (userId !== 'anonymous') {
              const { data: saved } = await supabase.from('content_items').insert({
                user_id: userId, type: 'photo', filename,
                url: stored.url, storage_url: stored.url,
                session_id: sessionId,
              }).select('id').single();
              if (saved) analysis.dbId = saved.id;
            }
          } else if (isMediaFile(filename)) {
            bucket = 'content-context';
            type = 'video';
            const stored = await uploadFile(bucket, uniqueName, buffer, mimeType);
            const transcript = await transcribe(buffer, filename);
            analysis = {
              type, filename, url: stored.url,
              transcript: transcript.text, duration: transcript.duration,
              language: transcript.language, segments: transcript.segments,
            };

            if (userId !== 'anonymous') {
              const { data: saved } = await supabase.from('content_items').insert({
                user_id: userId, type: 'document', filename,
                url: stored.url, storage_url: stored.url,
                transcript: transcript.text,
                metadata: { duration: transcript.duration, language: transcript.language },
                session_id: sessionId,
              }).select('id').single();
              if (saved) analysis.dbId = saved.id;
            }
          } else {
            bucket = 'content-context';
            type = 'document';
            const stored = await uploadFile(bucket, uniqueName, buffer, mimeType);
            const text = await extractText(buffer, filename);
            analysis = {
              type, filename, url: stored.url,
              extractedText: text, charCount: text.length,
            };

            if (userId !== 'anonymous') {
              const { data: saved } = await supabase.from('content_items').insert({
                user_id: userId, type: 'document', filename,
                url: stored.url, storage_url: stored.url,
                extracted_text: text,
                session_id: sessionId,
              }).select('id').single();
              if (saved) analysis.dbId = saved.id;
            }
          }

          results.push(analysis);
        } catch (err) {
          results.push({
            type: 'error',
            filename,
            error: err.message,
          });
        }
        resolve();
      });
    });

    filePromises.push(done);
  });

  busboy.on('finish', async () => {
    await Promise.all(filePromises);
    res.json({ files: results });
  });

  busboy.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  req.pipe(busboy);
});

// ─── Upload for Brand DNA ───
app.post('/api/brand-dna/upload', requireAuth, (req, res) => {
  const userId = req.user.id;
  const results = [];
  const filePromises = [];

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for videos
  });

  busboy.on('file', (fieldname, stream, info) => {
    const { filename, mimeType } = info;
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));

    const done = new Promise(async (resolve) => {
      stream.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const uniqueName = `${userId}/${crypto.randomUUID()}-${filename}`;

          let bucket, type;

          if (mimeType.startsWith('image/')) {
            bucket = 'brand-dna';
            type = 'photo';
          } else if (mimeType.startsWith('video/') || isMediaFile(filename)) {
            bucket = 'brand-dna-videos';
            type = 'video';
          } else {
            results.push({ type: 'error', filename, error: 'Unsupported file type for Brand DNA' });
            resolve();
            return;
          }

          const stored = await uploadFile(bucket, uniqueName, buffer, mimeType);
          results.push({ type, filename, url: stored.url, path: stored.path });
        } catch (err) {
          results.push({ type: 'error', filename, error: err.message });
        }
        resolve();
      });
    });

    filePromises.push(done);
  });

  busboy.on('finish', async () => {
    await Promise.all(filePromises);
    res.json({ files: results });
  });

  req.pipe(busboy);
});

// ─── Extract content from social media URLs ───
// Accepts { urls: ["https://..."] }
// Downloads audio via yt-dlp, grabs captions or transcribes with Whisper
app.post('/api/social/extract', requireAuth, async (req, res) => {
  const { urls, sessionId } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array required' });
  }

  if (urls.length > 5) {
    return res.status(400).json({ error: 'Max 5 URLs at a time' });
  }

  const userId = req.user.id;
  const extracted = await Promise.allSettled(
    urls.map((url) => extractFromUrl(url))
  );

  const results = await Promise.all(extracted.map(async (r, i) => {
    if (r.status !== 'fulfilled') {
      return { url: urls[i], error: r.reason?.message || 'Extraction failed' };
    }
    const item = r.value;
    // Persist to DB
    console.log(`[social] userId=${userId}, saving=${userId !== 'anonymous'}, title=${item.title?.slice(0, 40)}`);
    if (userId !== 'anonymous') {
      try {
        const { data: saved, error: dbErr } = await supabase.from('content_items').insert({
          user_id: userId, type: 'social',
          url: item.url,
          transcript: item.transcript || null,
          metadata: {
            platform: item.platform, title: item.title,
            description: item.description, uploader: item.uploader,
            duration: item.duration, thumbnail: item.thumbnail,
            source: item.source, language: item.language,
          },
          session_id: sessionId || null,
        }).select('id').single();
        if (dbErr) console.log('[db] Save error:', dbErr.message);
        if (saved) item.dbId = saved.id;
      } catch (e) {
        console.log('[db] Failed to save social item:', e.message);
      }
    }
    return item;
  }));

  res.json({ results });
});

// ─── Outlier Detector endpoints ───

// Get all followed creators for user
app.get('/api/outlier/creators', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ creators: [] });

  const { data, error } = await supabase
    .from('outlier_creators')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ creators: data });
});

// Follow a new creator — resolves channel, fetches videos, calculates outliers
app.post('/api/outlier/creators', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { platform, username } = req.body;
  if (!platform || !username) return res.status(400).json({ error: 'platform and username required' });

  try {
    if (platform === 'youtube') {
      // Resolve channel
      console.log(`[outlier] Resolving YouTube channel: ${username}`);
      const channel = await resolveChannel(username);

      // Insert creator
      const { data: creator, error: insertErr } = await supabase
        .from('outlier_creators')
        .upsert({
          user_id: userId,
          platform: 'youtube',
          username: username.startsWith('@') ? username : '@' + username,
          platform_id: channel.channelId,
          display_name: channel.displayName,
          avatar_url: channel.avatarUrl,
          subscriber_count: channel.subscriberCount,
          last_scanned_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform,username' })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Fetch videos and calculate outliers
      console.log(`[outlier] Fetching videos for ${channel.displayName}`);
      const videos = await fetchRecentVideos(channel.uploadsPlaylistId, 200);
      const { videos: enriched, averages } = calculateOutliers(videos);

      // Update creator averages
      await supabase.from('outlier_creators').update({
        avg_views: averages.views,
        avg_likes: averages.likes,
        avg_comments: averages.comments,
      }).eq('id', creator.id);

      // Upsert videos
      if (enriched.length > 0) {
        const videoRows = enriched.map((v) => ({
          creator_id: creator.id,
          user_id: userId,
          platform: 'youtube',
          video_id: v.videoId,
          title: v.title,
          thumbnail_url: v.thumbnailUrl,
          url: v.url,
          published_at: v.publishedAt,
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          duration_seconds: v.durationSeconds,
          views_multiplier: v.viewsMultiplier,
          likes_multiplier: v.likesMultiplier,
          comments_multiplier: v.commentsMultiplier,
          is_outlier: v.isOutlier,
        }));

        const { error: vidErr } = await supabase
          .from('outlier_videos')
          .upsert(videoRows, { onConflict: 'creator_id,video_id' });

        if (vidErr) console.log('[outlier] Video upsert error:', vidErr.message);
      }

      console.log(`[outlier] Done: ${enriched.length} videos, ${enriched.filter(v => v.isOutlier).length} outliers`);

      res.json({
        creator: { ...creator, avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments },
        videoCount: enriched.length,
        outlierCount: enriched.filter((v) => v.isOutlier).length,
      });
    } else if (platform === 'tiktok') {
      console.log(`[outlier] Resolving TikTok profile: ${username}`);
      const profile = await tiktokService.resolveProfile(username);

      const { data: creator, error: insertErr } = await supabase
        .from('outlier_creators')
        .upsert({
          user_id: userId,
          platform: 'tiktok',
          username: username.startsWith('@') ? username : '@' + username,
          platform_id: profile.userId,
          display_name: profile.displayName,
          avatar_url: profile.avatarUrl,
          subscriber_count: profile.followerCount,
          last_scanned_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform,username' })
        .select()
        .single();

      if (insertErr) throw insertErr;

      console.log(`[outlier] Fetching TikTok videos for ${profile.displayName}`);
      const videos = await tiktokService.fetchRecentVideos(username, 100);
      const { videos: enriched, averages } = tiktokService.calculateOutliers(videos);

      await supabase.from('outlier_creators').update({
        avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments,
      }).eq('id', creator.id);

      if (enriched.length > 0) {
        const videoRows = enriched.map((v) => ({
          creator_id: creator.id, user_id: userId, platform: 'tiktok',
          video_id: v.videoId, title: v.title, thumbnail_url: v.thumbnailUrl,
          url: v.url, published_at: v.publishedAt,
          views: v.views, likes: v.likes, comments: v.comments,
          duration_seconds: v.durationSeconds,
          views_multiplier: v.viewsMultiplier, likes_multiplier: v.likesMultiplier,
          comments_multiplier: v.commentsMultiplier, is_outlier: v.isOutlier,
        }));
        const { error: vidErr } = await supabase.from('outlier_videos').upsert(videoRows, { onConflict: 'creator_id,video_id' });
        if (vidErr) console.log('[outlier] TikTok video upsert error:', vidErr.message);
      }

      console.log(`[outlier] TikTok done: ${enriched.length} videos, ${enriched.filter(v => v.isOutlier).length} outliers`);
      res.json({
        creator: { ...creator, avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments },
        videoCount: enriched.length,
        outlierCount: enriched.filter((v) => v.isOutlier).length,
      });

    } else if (platform === 'instagram') {
      console.log(`[outlier] Resolving Instagram profile: ${username}`);
      const profile = await instagramService.resolveProfile(username);

      const { data: creator, error: insertErr } = await supabase
        .from('outlier_creators')
        .upsert({
          user_id: userId,
          platform: 'instagram',
          username: username.startsWith('@') ? username : '@' + username,
          platform_id: profile.userId,
          display_name: profile.displayName,
          avatar_url: profile.avatarUrl,
          subscriber_count: profile.followerCount,
          last_scanned_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform,username' })
        .select()
        .single();

      if (insertErr) throw insertErr;

      console.log(`[outlier] Fetching Instagram posts for ${profile.displayName}`);
      const posts = await instagramService.fetchRecentPosts(username, 100);
      const { videos: enriched, averages } = instagramService.calculateOutliers(posts);

      await supabase.from('outlier_creators').update({
        avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments,
      }).eq('id', creator.id);

      if (enriched.length > 0) {
        const videoRows = enriched.map((v) => ({
          creator_id: creator.id, user_id: userId, platform: 'instagram',
          video_id: v.videoId, title: v.title, thumbnail_url: v.thumbnailUrl,
          url: v.url, published_at: v.publishedAt,
          views: v.views, likes: v.likes, comments: v.comments,
          duration_seconds: v.durationSeconds,
          views_multiplier: v.viewsMultiplier, likes_multiplier: v.likesMultiplier,
          comments_multiplier: v.commentsMultiplier, is_outlier: v.isOutlier,
        }));
        const { error: vidErr } = await supabase.from('outlier_videos').upsert(videoRows, { onConflict: 'creator_id,video_id' });
        if (vidErr) console.log('[outlier] Instagram video upsert error:', vidErr.message);
      }

      console.log(`[outlier] Instagram done: ${enriched.length} posts, ${enriched.filter(v => v.isOutlier).length} outliers`);
      res.json({
        creator: { ...creator, avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments },
        videoCount: enriched.length,
        outlierCount: enriched.filter((v) => v.isOutlier).length,
      });

    } else if (platform === 'linkedin') {
      console.log(`[outlier] Resolving LinkedIn profile: ${username}`);
      const profile = await linkedinService.resolveProfile(username);

      const { data: creator, error: insertErr } = await supabase
        .from('outlier_creators')
        .upsert({
          user_id: userId,
          platform: 'linkedin',
          username: username.startsWith('@') ? username : '@' + username,
          platform_id: profile.userId,
          display_name: profile.displayName,
          avatar_url: profile.avatarUrl,
          subscriber_count: profile.followerCount,
          last_scanned_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform,username' })
        .select()
        .single();

      if (insertErr) throw insertErr;

      console.log(`[outlier] Fetching LinkedIn posts for ${profile.displayName}`);
      const posts = await linkedinService.fetchRecentPosts(username, 100);
      const { videos: enriched, averages } = linkedinService.calculateOutliers(posts);

      await supabase.from('outlier_creators').update({
        avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments,
      }).eq('id', creator.id);

      if (enriched.length > 0) {
        const videoRows = enriched.map((v) => ({
          creator_id: creator.id, user_id: userId, platform: 'linkedin',
          video_id: v.videoId, title: v.title, thumbnail_url: v.thumbnailUrl,
          url: v.url, published_at: v.publishedAt,
          views: v.views, likes: v.likes, comments: v.comments,
          duration_seconds: v.durationSeconds,
          views_multiplier: v.viewsMultiplier, likes_multiplier: v.likesMultiplier,
          comments_multiplier: v.commentsMultiplier, is_outlier: v.isOutlier,
        }));
        const { error: vidErr } = await supabase.from('outlier_videos').upsert(videoRows, { onConflict: 'creator_id,video_id' });
        if (vidErr) console.log('[outlier] LinkedIn post upsert error:', vidErr.message);
      }

      console.log(`[outlier] LinkedIn done: ${enriched.length} posts, ${enriched.filter(v => v.isOutlier).length} outliers`);
      res.json({
        creator: { ...creator, avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments },
        videoCount: enriched.length,
        outlierCount: enriched.filter((v) => v.isOutlier).length,
      });

    } else {
      res.status(400).json({ error: `${platform} not supported` });
    }
  } catch (err) {
    console.log('[outlier] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete a followed creator
app.delete('/api/outlier/creators/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { error } = await supabase
    .from('outlier_creators')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Get outlier videos for user (optionally filtered)
app.get('/api/outlier/videos', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ videos: [] });

  const { limit = 50, offset = 0 } = req.query;

  const sort = req.query.sort === 'recent' ? 'recent' : 'multiplier';

  let query = supabase
    .from('outlier_videos')
    .select('*, outlier_creators!inner(username, display_name, avatar_url, platform, avg_views, avg_likes, avg_comments)')
    .eq('user_id', userId);

  if (sort === 'recent') {
    query = query.order('published_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('views_multiplier', { ascending: false });
  }

  if (req.query.outliers_only === 'true') {
    query = query.eq('is_outlier', true);
  }
  if (req.query.creator_id) {
    query = query.eq('creator_id', req.query.creator_id);
  }
  if (req.query.platform) {
    query = query.eq('platform', req.query.platform);
  }

  // Exclude YouTube Shorts (≤ 180s) — only apply to YouTube videos
  // Instagram/TikTok reels have duration_seconds=0, so we can't filter them the same way
  if (req.query.platform === 'youtube') {
    query = query.gt('duration_seconds', 180);
  } else if (!req.query.platform) {
    // No platform filter: exclude YouTube shorts but keep all Instagram/TikTok
    query = query.or('duration_seconds.gt.180,platform.neq.youtube');
  }

  query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ videos: data || [] });
});

// Thumbnail proxy — Instagram/TikTok thumbnail URLs are signed + expire,
// and their CDNs don't send CORS headers, so direct <img> loads fail in
// the browser. Stream the bytes through the backend with a cache header.
// No auth: <img> tags can't send Authorization headers. Video IDs are
// UUIDs and the thumbnails are already public social-media content, so
// leaking the URL is not a meaningful information disclosure.
app.get('/api/outlier/videos/:id/thumbnail', async (req, res) => {
  const { data: video, error } = await supabase
    .from('outlier_videos')
    .select('thumbnail_url, platform')
    .eq('id', req.params.id)
    .single();

  if (error || !video?.thumbnail_url) return res.status(404).end();

  // Instagram CDN (fbcdn.net, cdninstagram.com) gates some images by Referer;
  // other platforms don't care but accept it. TikTok (tiktokcdn) wants a
  // browser-ish UA but no specific referer.
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const host = (() => { try { return new URL(video.thumbnail_url).hostname; } catch { return ''; } })();
  if (host.includes('fbcdn') || host.includes('cdninstagram') || video.platform === 'instagram') {
    headers['Referer'] = 'https://www.instagram.com/';
  } else if (host.includes('tiktok') || video.platform === 'tiktok') {
    headers['Referer'] = 'https://www.tiktok.com/';
  } else if (host.includes('licdn') || video.platform === 'linkedin') {
    headers['Referer'] = 'https://www.linkedin.com/';
  }

  try {
    const upstream = await fetch(video.thumbnail_url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok || !upstream.body) {
      console.log(`[thumbnail-proxy] ${req.params.id} upstream ${upstream.status} (host=${host})`);
      return res.status(404).end();
    }

    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    // Be explicit about CORS + cross-origin policy so <img> loads aren't
    // blocked by COEP or stricter client policies.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.log(`[thumbnail-proxy] ${req.params.id} threw: ${err.message}`);
    res.status(502).end();
  }
});

// Re-scan a creator (refresh videos)
app.post('/api/outlier/scan/:creatorId', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: creator, error: fetchErr } = await supabase
    .from('outlier_creators')
    .select('*')
    .eq('id', req.params.creatorId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !creator) return res.status(404).json({ error: 'Creator not found' });

  try {
    let videos, enriched, averages;

    if (creator.platform === 'youtube') {
      const channel = await resolveChannel(creator.username);
      videos = await fetchRecentVideos(channel.uploadsPlaylistId, 50);
      ({ videos: enriched, averages } = calculateOutliers(videos));
    } else if (creator.platform === 'tiktok') {
      videos = await tiktokService.fetchRecentVideos(creator.username, 100);
      ({ videos: enriched, averages } = tiktokService.calculateOutliers(videos));
    } else if (creator.platform === 'instagram') {
      videos = await instagramService.fetchRecentPosts(creator.username, 100);
      ({ videos: enriched, averages } = instagramService.calculateOutliers(videos));
    } else {
      return res.status(400).json({ error: `${creator.platform} not supported` });
    }

    await supabase.from('outlier_creators').update({
      avg_views: averages.views, avg_likes: averages.likes, avg_comments: averages.comments,
      last_scanned_at: new Date().toISOString(),
    }).eq('id', creator.id);

    if (enriched.length > 0) {
      const videoRows = enriched.map((v) => ({
        creator_id: creator.id, user_id: userId, platform: creator.platform,
        video_id: v.videoId, title: v.title, thumbnail_url: v.thumbnailUrl,
        url: v.url, published_at: v.publishedAt,
        views: v.views, likes: v.likes, comments: v.comments,
        duration_seconds: v.durationSeconds,
        views_multiplier: v.viewsMultiplier, likes_multiplier: v.likesMultiplier,
        comments_multiplier: v.commentsMultiplier, is_outlier: v.isOutlier,
      }));
      await supabase.from('outlier_videos').upsert(videoRows, { onConflict: 'creator_id,video_id' });
    }

    res.json({ videoCount: enriched.length, outlierCount: enriched.filter((v) => v.isOutlier).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Email routes (auth applied per-route inside) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/email')) {
    return requireAuth(req, res, next);
  }
  next();
});
app.use(emailRoutes);

// ─── Integration routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/integrations') || req.path.startsWith('/api/integration-context') || req.path.startsWith('/api/netlify')) {
    return requireAuth(req, res, next);
  }
  next();
});
app.use(integrationRoutes);

// ─── Sales routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/sales')) return requireAuth(req, res, next);
  next();
});
app.use(salesRoutes);

// ─── Products routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/products')) return requireAuth(req, res, next);
  next();
});
app.use(productRoutes);

// ─── Contacts/CRM routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/contacts')) return requireAuth(req, res, next);
  next();
});
app.use(contactRoutes);

// ─── Generate routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/generate')) return requireAuth(req, res, next);
  next();
});
app.use(generateRoutes);

// ─── Orchestrate / Agent routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/orchestrate')) return requireAuth(req, res, next);
  next();
});
app.use(orchestrateRoutes);

// ─── BooSend automation routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/boosend')) return requireAuth(req, res, next);
  next();
});
app.use(boosendRoutes);

// ─── CEO Notifications ───
app.get('/api/notifications', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ notifications: [] });

  const { data, error } = await supabase
    .from('ceo_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ notifications: data || [] });
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  await supabase
    .from('ceo_notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', userId);

  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  const userId = req.user.id;

  await supabase
    .from('ceo_notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  res.json({ ok: true });
});

// ─── Marketing Templates ───
app.get('/api/templates', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ templates: [] });
  const tool = req.query.tool || null;

  let query = supabase
    .from('marketing_templates')
    .select('id, name, description, tool, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (tool) query = query.eq('tool', tool);

  const { data, error } = await query.limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ templates: data || [] });
});

app.get('/api/templates/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { data, error } = await supabase
    .from('marketing_templates')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Template not found' });
  res.json({ template: data });
});

app.post('/api/templates', requireAuth, async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { name, description, tool, html } = req.body;
  if (!name || !tool || !html) return res.status(400).json({ error: 'name, tool, and html required' });

  const { data, error } = await supabase
    .from('marketing_templates')
    .insert({ user_id: userId, name, description: description || '', tool, html })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ template: data });
});

app.delete('/api/templates/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  await supabase
    .from('marketing_templates')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);
  res.json({ ok: true });
});

// ─── Forms routes (auth required for management, public for player) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/forms') && !req.path.startsWith('/api/forms/public')) {
    return requireAuth(req, res, next);
  }
  next();
});
app.use(formRoutes);

// ─── Dashboard stats route (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/dashboard-stats')) return requireAuth(req, res, next);
  next();
});
app.use(dashboardRoutes);

// ─── Artifact version history (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/artifact-versions')) return requireAuth(req, res, next);
  next();
});
app.use(artifactVersionRoutes);

// ─── Calendar routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/calendar')) return requireAuth(req, res, next);
  next();
});
app.use(calendarRoutes);

// ─── Billing routes (auth required, except /plans and /costs which are public-ish) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/billing')) return requireAuth(req, res, next);
  next();
});
app.use(billingRoutes);

// ─── Admin routes (auth + admin check required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin')) return requireAuth(req, res, next);
  next();
});
app.use(adminRoutes);

// ─── Webhook routes (no auth — external services) ───
app.use(webhookRoutes);

app.listen(PORT, () => {
  console.log(`AICEO backend running on port ${PORT}`);
  startEmailSync();
});
