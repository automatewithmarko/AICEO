export const SUMMARY_SYSTEM_PROMPT = `You are an expert meeting analyst. Analyze the provided meeting transcript and generate a structured summary. Be concise but comprehensive. Use the specific template instructions to guide your output format.

Always return valid JSON matching the requested structure.`;

export const ACTION_ITEMS_PROMPT = `Analyze this meeting transcript and extract ALL action items, to-dos, commitments, and follow-ups. Be thorough — even implicit commitments like "I'll send that over" or "let's circle back on that" count as action items.

For each action item, identify:
- text: a short, clear title of what needs to be done (1 sentence max)
- description: a brief explanation with context about why this task matters or how to approach it (1-2 sentences)
- assignee: who is responsible (use the speaker name if mentioned, otherwise "Unassigned")
- due_date: any mentioned deadline (null if none)
- completed: always false

Return a JSON object with an "action_items" key containing the array.

Format: {"action_items": [{"text": "...", "description": "...", "assignee": "...", "due_date": null, "completed": false}]}

If genuinely no action items exist, return: {"action_items": []}`;

export const CHAPTERS_PROMPT = `Analyze this meeting transcript with timestamps and break it into logical chapters/sections. Each chapter should represent a distinct topic or phase of the meeting.

For each chapter, provide:
- title: a concise descriptive title
- start_time: the start timestamp in seconds
- end_time: the end timestamp in seconds
- summary: a 1-2 sentence summary of what was discussed

Return a JSON array of chapters ordered by start_time.

Format: [{"title": "...", "start_time": 0, "end_time": 120, "summary": "..."}]`;

export function buildSummaryPrompt(templateInstructions, outputFields) {
  let prompt = templateInstructions;
  if (outputFields?.length) {
    prompt += `\n\nReturn your response as a JSON object with these fields: ${outputFields.join(', ')}. Each field should contain either a string or an array of strings as appropriate.`;
  }
  return prompt;
}
