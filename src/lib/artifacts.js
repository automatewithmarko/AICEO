export const ARTIFACT_TYPES = {
  email: { label: 'Email', icon: 'Mail' },
  newsletter: { label: 'Newsletter', icon: 'Mail' },
  html_template: { label: 'Template', icon: 'FileText' },
  content_post: { label: 'Post', icon: 'PenTool' },
  code_block: { label: 'Code', icon: 'Code' },
  markdown_doc: { label: 'Document', icon: 'FileText' },
};

export function parseEmailContent(content) {
  try {
    const parsed = JSON.parse(content);
    return {
      to: parsed.to || '',
      subject: parsed.subject || '',
      body_html: parsed.body_html || parsed.body || '',
    };
  } catch {
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { to: '', subject: '', body_html: `<pre style="white-space:pre-wrap">${escaped}</pre>` };
  }
}
