import { Router } from 'express';
import { supabase } from '../middleware/auth.js';
import { createBot, leaveMeeting, deleteBot, detectPlatform, getBot } from '../services/recall.js';
import { processCompletedMeeting, extractActionItems } from '../services/ai-processor.js';
import { deleteRecording, uploadRecording, downloadFromUrl } from '../services/storage.js';

const router = Router();

// Strip internal fields from meeting objects before sending to client
function sanitizeMeeting(m) {
  if (!m) return m;
  const { recall_bot_id, ...safe } = m;
  return safe;
}

// GET /api/meetings — List meetings (paginated, filtered)
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const { platform, status, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = supabase
    .from('meetings')
    .select('id, title, meeting_url, platform, recall_bot_status, scheduled_at, started_at, ended_at, duration_seconds, bot_name, participants, summary, action_items, created_at, video_url, audio_url', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1);

  if (platform) query = query.eq('platform', platform);
  if (status) query = query.eq('recall_bot_status', status);
  if (search) {
    query = query.or(`title.ilike.%${search}%,transcript_text.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    meetings: (data || []).map(sanitizeMeeting),
    total: count,
    page: parseInt(page),
    totalPages: Math.ceil((count || 0) / parseInt(limit)),
  });
});

// GET /api/meetings/:id — Single meeting with all details
router.get('/:id', async (req, res) => {
  const userId = req.user.id;

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !meeting) return res.status(404).json({ error: 'Meeting not found' });

  // Get transcript segments
  const { data: segments } = await supabase
    .from('transcript_segments')
    .select('*')
    .eq('meeting_id', meeting.id)
    .eq('is_partial', false)
    .order('sequence_index', { ascending: true });

  // Get linked contacts
  const { data: contacts } = await supabase
    .from('meeting_contacts')
    .select('contact_id, role')
    .eq('meeting_id', meeting.id);

  res.json({ meeting: sanitizeMeeting(meeting), segments: segments || [], contacts: contacts || [] });
});

// POST /api/meetings — Create meeting + dispatch notetaker bot
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const { meeting_url, title, bot_name, template, scheduled_at } = req.body;

  if (!meeting_url) return res.status(400).json({ error: 'meeting_url is required' });

  const platform = detectPlatform(meeting_url);

  try {
    // Insert meeting row
    const { data: meeting, error: insertErr } = await supabase
      .from('meetings')
      .insert({
        user_id: userId,
        meeting_url,
        title: title || `Meeting - ${new Date().toLocaleDateString()}`,
        platform,
        bot_name: bot_name || 'PurelyPersonal Notetaker',
        summary_template: template || 'general',
        recall_bot_status: 'creating',
        scheduled_at: scheduled_at || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Dispatch notetaker bot
    const bot = await createBot(meeting_url, {
      botName: meeting.bot_name,
      userId,
      meetingId: meeting.id,
      joinAt: scheduled_at || undefined,
    });

    // Update with bot ID
    await supabase
      .from('meetings')
      .update({
        recall_bot_id: bot.id,
        recall_bot_status: bot.status?.code || 'ready',
      })
      .eq('id', meeting.id);

    res.status(201).json({
      meeting: { ...meeting, recall_bot_status: bot.status?.code || 'ready' },
    });
  } catch (err) {
    console.error('[meetings] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create meeting. Please check the meeting URL and try again.' });
  }
});

// PATCH /api/meetings/:id — Update title, template
router.patch('/:id', async (req, res) => {
  const userId = req.user.id;
  const { title, summary_template, action_items } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (summary_template !== undefined) updates.summary_template = summary_template;
  if (action_items !== undefined) updates.action_items = action_items;

  const { data, error } = await supabase
    .from('meetings')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ meeting: sanitizeMeeting(data) });
});

// DELETE /api/meetings/:id — Delete meeting + recording + data
router.delete('/:id', async (req, res) => {
  const userId = req.user.id;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, recall_bot_id, recall_bot_status')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  // Try to cancel bot if still active
  if (meeting.recall_bot_id && !['done', 'fatal', 'processed', 'error'].includes(meeting.recall_bot_status)) {
    try {
      await deleteBot(meeting.recall_bot_id);
    } catch (e) {
      console.log('[meetings] Bot already completed or deleted');
    }
  }

  // Delete recording from storage
  try {
    await deleteRecording(meeting.id);
  } catch (e) {
    console.log('[meetings] No recording to delete');
  }

  // Delete meeting (cascades to segments, contacts)
  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', meeting.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/meetings/:id/stop — Force bot to leave
router.post('/:id/stop', async (req, res) => {
  const userId = req.user.id;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('recall_bot_id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!meeting?.recall_bot_id) return res.status(404).json({ error: 'Meeting not found or no active session' });

  try {
    await leaveMeeting(meeting.recall_bot_id);
    await supabase
      .from('meetings')
      .update({ recall_bot_status: 'stopped', ended_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop meeting recording' });
  }
});

// POST /api/meetings/:id/reprocess — Re-run AI with different template
router.post('/:id/reprocess', async (req, res) => {
  const userId = req.user.id;
  const { template } = req.body;

  if (template) {
    await supabase
      .from('meetings')
      .update({ summary_template: template })
      .eq('id', req.params.id)
      .eq('user_id', userId);
  }

  try {
    await processCompletedMeeting(req.params.id);
    const { data: updated } = await supabase
      .from('meetings')
      .select('summary, action_items, chapters')
      .eq('id', req.params.id)
      .single();

    res.json({ meeting: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reprocess meeting' });
  }
});

// POST /api/meetings/:id/retry-recording — Re-fetch recording from Recall
router.post('/:id/retry-recording', async (req, res) => {
  const userId = req.user.id;

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('id, recall_bot_id, video_url, recall_bot_status')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !meeting) return res.status(404).json({ error: 'Meeting not found' });
  if (!meeting.recall_bot_id) return res.status(400).json({ error: 'No bot associated with this meeting' });
  if (meeting.video_url) return res.json({ meeting: { video_url: meeting.video_url }, message: 'Recording already exists' });

  try {
    const bot = await getBot(meeting.recall_bot_id);
    if (!bot?.recordings?.length) {
      return res.status(404).json({ error: 'No recordings found on Recall for this meeting' });
    }

    for (const rec of bot.recordings) {
      const mediaUrl = rec.media_shortcuts?.video_mixed?.data?.download_url;
      if (mediaUrl) {
        // Try uploading to Supabase storage first, fall back to direct Recall URL if too large
        try {
          console.log(`[retry-recording] Downloading recording for meeting ${meeting.id}`);
          const { buffer, contentType } = await downloadFromUrl(mediaUrl);
          const ext = contentType.includes('video') ? 'mp4' : 'mp3';
          const { path, url } = await uploadRecording(meeting.id, buffer, `recording.${ext}`, contentType);
          await supabase.from('meetings').update({ storage_path: path, video_url: url }).eq('id', meeting.id);
          console.log(`[retry-recording] Recording uploaded for meeting ${meeting.id}`);
          return res.json({ meeting: { video_url: url, storage_path: path }, message: 'Recording fetched successfully' });
        } catch (uploadErr) {
          console.warn(`[retry-recording] Upload failed (${uploadErr.message}), using direct Recall URL`);
          await supabase.from('meetings').update({ video_url: mediaUrl }).eq('id', meeting.id);
          return res.json({ meeting: { video_url: mediaUrl }, message: 'Recording linked directly from provider' });
        }
      }
    }

    return res.status(404).json({ error: 'Recording not yet available on Recall (no download URL)' });
  } catch (err) {
    console.error('[retry-recording] Error:', err.message);
    res.status(500).json({ error: `Failed to fetch recording: ${err.message}` });
  }
});

// POST /api/meetings/:id/contacts — Assign a contact to a meeting
router.post('/:id/contacts', async (req, res) => {
  const userId = req.user.id;
  const { contact_id } = req.body;

  if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

  // Verify meeting belongs to user
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { error } = await supabase
    .from('meeting_contacts')
    .upsert({ meeting_id: req.params.id, contact_id, role: 'participant' }, { onConflict: 'meeting_id,contact_id' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /api/meetings/:id/contacts/:contactId — Remove a contact from a meeting
router.delete('/:id/contacts/:contactId', async (req, res) => {
  const userId = req.user.id;

  // Verify meeting belongs to user
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { error } = await supabase
    .from('meeting_contacts')
    .delete()
    .eq('meeting_id', req.params.id)
    .eq('contact_id', req.params.contactId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/meetings/:id/generate-action-items — Generate action items from transcript using AI
router.post('/:id/generate-action-items', async (req, res) => {
  const userId = req.user.id;

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('id, transcript_text')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !meeting) return res.status(404).json({ error: 'Meeting not found' });

  if (!meeting.transcript_text) {
    // Try building from segments
    const { data: segments } = await supabase
      .from('transcript_segments')
      .select('speaker_name, text')
      .eq('meeting_id', req.params.id)
      .eq('is_partial', false)
      .order('sequence_index', { ascending: true });

    if (!segments?.length) {
      return res.status(400).json({ error: 'No transcript available for this meeting' });
    }

    meeting.transcript_text = segments
      .map(s => `${s.speaker_name || 'Speaker'}: ${s.text}`)
      .join('\n');
  }

  try {
    const actionItems = await extractActionItems(meeting.transcript_text);

    await supabase
      .from('meetings')
      .update({ action_items: actionItems, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ action_items: actionItems });
  } catch (err) {
    console.error('[meetings] Generate action items error:', err.message);
    res.status(500).json({ error: 'Failed to generate action items' });
  }
});

export default router;
