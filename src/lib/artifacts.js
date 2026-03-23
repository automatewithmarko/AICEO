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
    // Plain text email: convert line breaks to paragraphs for proper rendering
    const lines = content.split(/\n\n+/);
    const html = lines.map(block => {
      const escaped = block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Preserve single line breaks within blocks
      return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return { to: '', subject: '', body_html: html };
  }
}
