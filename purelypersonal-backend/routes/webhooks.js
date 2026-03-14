import { Router } from 'express';
import { Webhook } from 'svix';
import { supabase } from '../middleware/auth.js';
import { processCompletedMeeting } from '../services/ai-processor.js';
import { getTranscript, getBot } from '../services/recall.js';
import { uploadRecording, downloadFromUrl } from '../services/storage.js';
import { linkParticipantsToContacts } from '../services/contact-linker.js';

const router = Router();

// Svix webhook verification helper
function verifySvixWebhook(req) {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  const bodyStr = typeof req.body === 'string' ? req.body : req.body.toString();

  // Log headers for debugging
  const svixHeaders = {
    'svix-id': req.headers['svix-id'],
    'svix-timestamp': req.headers['svix-timestamp'],
    'svix-signature': req.headers['svix-signature'],
    'webhook-id': req.headers['webhook-id'],
    'webhook-timestamp': req.headers['webhook-timestamp'],
    'webhook-signature': req.headers['webhook-signature'],
  };
  console.log('[webhook] Headers:', JSON.stringify(svixHeaders));

  if (!secret) {
    console.warn('[webhook] No RECALL_WEBHOOK_SECRET set, skipping verification');
    return JSON.parse(bodyStr);
  }

  // Svix can send headers as svix-* or webhook-*
  const headerId = req.headers['svix-id'] || req.headers['webhook-id'];
  const headerTs = req.headers['svix-timestamp'] || req.headers['webhook-timestamp'];
  const headerSig = req.headers['svix-signature'] || req.headers['webhook-signature'];

  if (!headerId || !headerTs || !headerSig) {
    console.warn('[webhook] No Svix/webhook signature headers found, accepting without verification');
    return JSON.parse(bodyStr);
  }

  try {
    const wh = new Webhook(secret);
    const payload = wh.verify(bodyStr, {
      'svix-id': headerId,
      'svix-timestamp': headerTs,
      'svix-signature': headerSig,
    });
    return payload;
  } catch (err) {
    console.warn('[webhook] Svix verification failed, accepting payload:', err.message);
    return JSON.parse(bodyStr);
  }
}

// Helper: find meeting by bot ID from webhook data
async function findMeetingByBot(data) {
  // Bot ID is in data.bot.id (nested object)
  const botId = data?.bot?.id || data?.bot_id || data?.data?.bot_id;
  if (!botId) return { botId: null, meeting: null };

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, user_id')
    .eq('recall_bot_id', botId)
    .single();

  return { botId, meeting };
}

// Helper: find meeting by recording's bot
async function findMeetingByRecording(data) {
  const botId = data?.bot?.id || data?.bot_id;
  if (!botId) return { botId: null, meeting: null };

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, user_id')
    .eq('recall_bot_id', botId)
    .single();

  return { botId, meeting };
}

// ══════════════════════════════════════════════════
// Webhook endpoint for bot/recording/transcript events
// ══════════════════════════════════════════════════
router.post('/api/webhooks/recall', async (req, res) => {
  let payload;
  try {
    payload = verifySvixWebhook(req);
  } catch (err) {
    console.error('[webhook] Svix verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const eventType = payload.event;
  const data = payload.data;

  console.log(`[webhook] Event: ${eventType}`, JSON.stringify(data).slice(0, 300));

  try {
    // ─── BOT EVENTS ───
    if (eventType.startsWith('bot.')) {
      const { botId, meeting } = await findMeetingByBot(data);
      if (!meeting) {
        console.warn(`[webhook] No meeting found for bot ${botId}`);
        return res.json({ ok: true });
      }

      // Extract the status from the event type: "bot.in_call_recording" -> "in_call_recording"
      const status = eventType.replace('bot.', '');

      const statusUpdates = {
        recall_bot_status: status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'in_call_recording') {
        statusUpdates.started_at = new Date().toISOString();
      }

      if (status === 'call_ended') {
        statusUpdates.ended_at = new Date().toISOString();
      }

      await supabase
        .from('meetings')
        .update(statusUpdates)
        .eq('id', meeting.id);

      console.log(`[webhook] Bot ${botId} → ${status} (meeting ${meeting.id})`);

      // On "done", trigger the full post-meeting processing pipeline
      if (status === 'done') {
        handleMeetingDone(meeting.id, meeting.user_id, botId).catch(err => {
          console.error('[webhook] Post-meeting processing failed:', err.message);
        });
      }
    }

    // ─── RECORDING EVENTS ───
    else if (eventType.startsWith('recording.')) {
      const { botId, meeting } = await findMeetingByRecording(data);
      if (!meeting) {
        return res.json({ ok: true });
      }

      if (eventType === 'recording.done') {
        console.log(`[webhook] Recording done for meeting ${meeting.id}, will fetch via bot API`);
        try {
          const bot = await getBot(botId);
          console.log(`[webhook] Bot recordings:`, JSON.stringify(bot?.recordings?.map(r => ({ id: r.id, status: r.status, media_shortcuts: r.media_shortcuts })), null, 2));
          if (bot?.recordings?.length) {
            for (const rec of bot.recordings) {
              const mediaUrl = rec.media_shortcuts?.video_mixed?.data?.download_url;
              if (mediaUrl) {
                try {
                  console.log(`[webhook] Downloading recording for meeting ${meeting.id}`);
                  const { buffer, contentType } = await downloadFromUrl(mediaUrl);
                  const ext = contentType.includes('video') ? 'mp4' : 'mp3';
                  const { path, url } = await uploadRecording(meeting.id, buffer, `recording.${ext}`, contentType);
                  await supabase.from('meetings').update({ storage_path: path, video_url: url }).eq('id', meeting.id);
                  console.log(`[webhook] Recording uploaded for meeting ${meeting.id}`);
                } catch (uploadErr) {
                  console.warn(`[webhook] Upload failed (${uploadErr.message}), using direct Recall URL`);
                  await supabase.from('meetings').update({ video_url: mediaUrl }).eq('id', meeting.id);
                }
              } else {
                console.warn(`[webhook] No download_url in recording. Status: ${rec.status}, has media_shortcuts: ${!!rec.media_shortcuts}`);
              }
            }
          }
        } catch (dlErr) {
          console.error('[webhook] Recording download failed:', dlErr.message);
        }
      }
    }

    // ─── TRANSCRIPT EVENTS (async transcript, not real-time) ───
    else if (eventType.startsWith('transcript.')) {
      if (eventType === 'transcript.done') {
        // The async transcript is ready — fetch it and store
        const botId = data?.bot?.id || data?.bot_id;
        const recordingId = data?.recording?.id;
        if (!botId || !recordingId) return res.json({ ok: true });

        const { data: meeting } = await supabase
          .from('meetings')
          .select('id, user_id, recall_bot_status')
          .eq('recall_bot_id', botId)
          .single();

        if (!meeting) return res.json({ ok: true });

        console.log(`[webhook] Transcript done for meeting ${meeting.id}, recording ${recordingId}, fetching...`);

        try {
          const transcript = await getTranscript(recordingId);
          if (transcript?.length) {
            // Get existing max sequence
            const { data: maxSeq } = await supabase
              .from('transcript_segments')
              .select('sequence_index')
              .eq('meeting_id', meeting.id)
              .order('sequence_index', { ascending: false })
              .limit(1)
              .single();

            let seqIndex = (maxSeq?.sequence_index || 0) + 1;

            for (const entry of transcript) {
              await supabase.from('transcript_segments').upsert({
                meeting_id: meeting.id,
                speaker_name: entry.speaker || 'Unknown',
                speaker_id: entry.speaker_id || null,
                text: entry.words?.map(w => w.text).join(' ') || entry.text || '',
                start_time: entry.start_time || entry.words?.[0]?.start_time || null,
                end_time: entry.end_time || entry.words?.[entry.words?.length - 1]?.end_time || null,
                words: entry.words || null,
                is_partial: false,
                sequence_index: seqIndex++,
              }, { onConflict: 'meeting_id,sequence_index' });
            }

            // Build full transcript text
            const fullText = transcript
              .map(e => `${e.speaker || 'Speaker'}: ${e.words?.map(w => w.text).join(' ') || e.text || ''}`)
              .join('\n');

            await supabase
              .from('meetings')
              .update({ transcript_text: fullText })
              .eq('id', meeting.id);

            console.log(`[webhook] Stored ${transcript.length} transcript segments for meeting ${meeting.id}`);
          }

          // If the meeting was already "done" but AI processing hasn't run yet, trigger it now
          if (['done', 'call_ended'].includes(meeting.recall_bot_status)) {
            processCompletedMeeting(meeting.id).catch(err => {
              console.error('[webhook] AI processing after transcript.done failed:', err.message);
            });
          }
        } catch (tErr) {
          console.error('[webhook] Transcript fetch failed:', tErr.message);
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] Handler error:', err.message);
    res.json({ ok: true }); // Always 200 to prevent Svix retries
  }
});

// Real-time transcript endpoint
router.post('/api/webhooks/recall/transcript', async (req, res) => {
  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  try {
    const botId = payload.data?.bot?.id || payload.data?.bot_id || payload.bot_id;
    const transcript = payload.data?.transcript || payload.transcript;

    if (!botId || !transcript) {
      return res.json({ ok: true });
    }

    const { data: meeting } = await supabase
      .from('meetings')
      .select('id')
      .eq('recall_bot_id', botId)
      .single();

    if (!meeting) return res.json({ ok: true });

    const isPartial = payload.event === 'transcript.partial_data';

    const { data: maxSeq } = await supabase
      .from('transcript_segments')
      .select('sequence_index')
      .eq('meeting_id', meeting.id)
      .order('sequence_index', { ascending: false })
      .limit(1)
      .single();

    let seqIndex = (maxSeq?.sequence_index || 0) + 1;
    const entries = Array.isArray(transcript) ? transcript : [transcript];

    for (const entry of entries) {
      if (isPartial) {
        await supabase
          .from('transcript_segments')
          .upsert({
            meeting_id: meeting.id,
            speaker_name: entry.speaker || entry.speaker_name || 'Unknown',
            speaker_id: entry.speaker_id || null,
            text: entry.words?.map(w => w.text).join(' ') || entry.text || '',
            start_time: entry.start_time || entry.words?.[0]?.start_time || null,
            end_time: entry.end_time || entry.words?.[entry.words?.length - 1]?.end_time || null,
            words: entry.words || null,
            is_partial: true,
            sequence_index: seqIndex,
          }, { onConflict: 'meeting_id,sequence_index' });
      } else {
        await supabase
          .from('transcript_segments')
          .insert({
            meeting_id: meeting.id,
            speaker_name: entry.speaker || entry.speaker_name || 'Unknown',
            speaker_id: entry.speaker_id || null,
            text: entry.words?.map(w => w.text).join(' ') || entry.text || '',
            start_time: entry.start_time || entry.words?.[0]?.start_time || null,
            end_time: entry.end_time || entry.words?.[entry.words?.length - 1]?.end_time || null,
            words: entry.words || null,
            is_partial: false,
            sequence_index: seqIndex,
          });
        seqIndex++;
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] Real-time transcript error:', err.message);
    res.json({ ok: true });
  }
});

// Post-meeting processing pipeline (triggered by bot.done)
async function handleMeetingDone(meetingId, userId, botId) {
  console.log(`[pipeline] Processing completed meeting ${meetingId}`);

  try {
    // 1. Fetch bot details for participants and recording
    const bot = await getBot(botId);

    // 2. Fetch final transcript using recording ID
    const recordingId = bot?.recordings?.[0]?.id;
    if (recordingId) {
      try {
        const transcript = await getTranscript(recordingId);
        if (transcript?.length) {
          const { data: maxSeq } = await supabase
            .from('transcript_segments')
            .select('sequence_index')
            .eq('meeting_id', meetingId)
            .order('sequence_index', { ascending: false })
            .limit(1)
            .single();

          let seqIndex = (maxSeq?.sequence_index || 0) + 1;

          for (const entry of transcript) {
            await supabase.from('transcript_segments').upsert({
              meeting_id: meetingId,
              speaker_name: entry.speaker || 'Unknown',
              speaker_id: entry.speaker_id || null,
              text: entry.words?.map(w => w.text).join(' ') || entry.text || '',
              start_time: entry.start_time || entry.words?.[0]?.start_time || null,
              end_time: entry.end_time || entry.words?.[entry.words?.length - 1]?.end_time || null,
              words: entry.words || null,
              is_partial: false,
              sequence_index: seqIndex++,
            }, { onConflict: 'meeting_id,sequence_index' });
          }

          // Build full transcript text
          const fullText = transcript
            .map(e => `${e.speaker || 'Speaker'}: ${e.words?.map(w => w.text).join(' ') || e.text || ''}`)
            .join('\n');

          await supabase
            .from('meetings')
            .update({ transcript_text: fullText })
            .eq('id', meetingId);

          console.log(`[pipeline] Stored ${transcript.length} transcript segments`);
        }
      } catch (tErr) {
        console.warn(`[pipeline] Transcript fetch failed (will retry via transcript.done webhook): ${tErr.message}`);
      }
    }

    if (bot?.meeting_participants?.length) {
      const participants = bot.meeting_participants.map(p => ({
        name: p.name,
        id: p.id,
        is_host: p.is_host || false,
      }));

      await supabase
        .from('meetings')
        .update({ participants })
        .eq('id', meetingId);

      await linkParticipantsToContacts(meetingId, userId, participants);
    }

    // Calculate duration
    const { data: meeting } = await supabase
      .from('meetings')
      .select('started_at, ended_at')
      .eq('id', meetingId)
      .single();

    if (meeting?.started_at && meeting?.ended_at) {
      const duration = Math.round(
        (new Date(meeting.ended_at) - new Date(meeting.started_at)) / 1000
      );
      await supabase
        .from('meetings')
        .update({ duration_seconds: duration })
        .eq('id', meetingId);
    }

    // 3. Download and store recording if available
    if (bot?.recordings?.length) {
      for (const rec of bot.recordings) {
        const mediaUrl = rec.media_shortcuts?.video_mixed?.data?.download_url;
        if (mediaUrl) {
          try {
            console.log(`[pipeline] Downloading recording for meeting ${meetingId}`);
            const { buffer, contentType } = await downloadFromUrl(mediaUrl);
            const ext = contentType.includes('video') ? 'mp4' : 'mp3';
            const { path, url } = await uploadRecording(meetingId, buffer, `recording.${ext}`, contentType);
            await supabase.from('meetings').update({ storage_path: path, video_url: url }).eq('id', meetingId);
            console.log(`[pipeline] Recording uploaded for meeting ${meetingId}`);
          } catch (e) {
            console.warn(`[pipeline] Upload failed (${e.message}), using direct Recall URL`);
            await supabase.from('meetings').update({ video_url: mediaUrl }).eq('id', meetingId);
          }
        } else {
          console.warn(`[pipeline] No download_url in recording. Status: ${rec.status}, has media_shortcuts: ${!!rec.media_shortcuts}`);
        }
      }
    }

    // 4. Run AI processing pipeline
    await processCompletedMeeting(meetingId);

    console.log(`[pipeline] Completed processing for meeting ${meetingId}`);
  } catch (err) {
    console.error('[pipeline] Error:', err.message);
    await supabase
      .from('meetings')
      .update({ recall_bot_status: 'error', metadata: { error: err.message } })
      .eq('id', meetingId);
  }
}

export default router;
