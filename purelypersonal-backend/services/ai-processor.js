import OpenAI from 'openai';
import { SUMMARY_SYSTEM_PROMPT, ACTION_ITEMS_PROMPT, CHAPTERS_PROMPT, buildSummaryPrompt } from '../lib/prompts.js';
import { supabase } from '../middleware/auth.js';

const openai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

const MODEL = 'grok-3-mini-fast';

async function chatComplete(systemPrompt, userPrompt) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });
  return res.choices[0]?.message?.content || '{}';
}

export async function generateSummary(transcript, template) {
  const promptInstructions = template?.prompt_instructions || 'Provide a general meeting summary with overview, key topics, decisions, and next steps.';
  const outputFields = template?.output_fields || ['overview', 'key_topics', 'decisions', 'next_steps'];

  const userPrompt = `${buildSummaryPrompt(promptInstructions, outputFields)}\n\nTranscript:\n${transcript}`;

  try {
    const result = await chatComplete(SUMMARY_SYSTEM_PROMPT, userPrompt);
    return JSON.parse(result);
  } catch (err) {
    console.error('[ai] Summary generation failed:', err.message);
    return { overview: 'Summary generation failed. Please try reprocessing.', error: err.message };
  }
}

export async function extractActionItems(transcript) {
  try {
    // Truncate very long transcripts to avoid token limits
    const truncated = transcript.length > 30000 ? transcript.slice(0, 30000) + '\n\n[...transcript truncated]' : transcript;
    const result = await chatComplete(
      'You are an expert at extracting action items from meeting transcripts. Return valid JSON only with an "action_items" key.',
      `${ACTION_ITEMS_PROMPT}\n\nTranscript:\n${truncated}`
    );
    console.log(`[ai] Action items raw response (${result.length} chars): ${result.slice(0, 200)}...`);
    const parsed = JSON.parse(result);
    const items = Array.isArray(parsed) ? parsed : parsed.action_items || [];
    console.log(`[ai] Extracted ${items.length} action items`);
    return items;
  } catch (err) {
    console.error('[ai] Action items extraction failed:', err.message);
    return [];
  }
}

export async function generateChapters(segments) {
  const transcriptWithTimes = segments
    .map(s => `[${formatTime(s.start_time)}] ${s.speaker_name || 'Speaker'}: ${s.text}`)
    .join('\n');

  try {
    const result = await chatComplete(
      'You are an expert at analyzing meeting structure. Return valid JSON only.',
      `${CHAPTERS_PROMPT}\n\nTranscript:\n${transcriptWithTimes}`
    );
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : parsed.chapters || [];
  } catch (err) {
    console.error('[ai] Chapter generation failed:', err.message);
    return [];
  }
}

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export async function processCompletedMeeting(meetingId) {
  console.log(`[ai] Starting post-meeting processing for ${meetingId}`);

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (error || !meeting) {
    console.error('[ai] Meeting not found:', meetingId);
    return;
  }

  // Get transcript segments
  const { data: segments } = await supabase
    .from('transcript_segments')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('is_partial', false)
    .order('sequence_index', { ascending: true });

  if (!segments?.length) {
    console.log('[ai] No transcript segments found, skipping AI processing');
    return;
  }

  // Concatenate full transcript
  const fullTranscript = segments
    .map(s => `${s.speaker_name || 'Speaker'}: ${s.text}`)
    .join('\n');

  // Update transcript_text
  await supabase
    .from('meetings')
    .update({ transcript_text: fullTranscript })
    .eq('id', meetingId);

  // Get the template
  let template = null;
  if (meeting.summary_template) {
    const { data: tmpl } = await supabase
      .from('meeting_templates')
      .select('*')
      .eq('slug', meeting.summary_template)
      .single();
    template = tmpl;
  }

  // Run all 3 AI tasks in parallel
  const [summary, actionItems, chapters] = await Promise.all([
    generateSummary(fullTranscript, template),
    extractActionItems(fullTranscript),
    generateChapters(segments),
  ]);

  // Update the meeting
  await supabase
    .from('meetings')
    .update({
      summary,
      action_items: actionItems,
      chapters,
      recall_bot_status: 'processed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetingId);

  console.log(`[ai] Processing complete for ${meetingId}: ${actionItems.length} action items, ${chapters.length} chapters`);
}
